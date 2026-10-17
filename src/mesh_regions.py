"""All 13 region boxes from MediaPipe FaceLandmarker, for real-world footage.

Why this exists
---------------
The shipped YOLO detector was trained on SAMM: 960x650 grayscale frames of a
tightly-cropped, studio-lit, frontal face filling most of the image. On an
ordinary interview recording — a head-and-shoulders webcam shot where the face
spans ~18% of the frame width, compressed — it finds the large low-frequency
regions (chin, cheeks, brow) at high confidence and **never finds an iris at
all**, at any confidence floor. Measured on a real clip: 0 usable eye+iris
pairs in 200 frames, and 0 iris detections in 60 frames even at conf=0.01.

That left the pipeline on the Haar fallback in `features.boxes_from_classical`,
whose darkest-blob iris estimate has a deviation median of 0.1173 against a
`dev_thr` of 0.0175 fitted on YOLO geometry — so 95% of frames read as
`Gaze_Averted` and the session sat on `Suspicious` forever, regardless of where
the person was actually looking.

The fix is to produce boxes in the SAME geometric convention the calibration
was fitted on, rather than to retune the calibration for a cruder estimator.
The polygons below are ported verbatim from the prep pipelines that generated
the training labels — `prep_v2/au_map.py` for the 9 face regions and
`prep_v2.1/eye_regions.py` for the 4 eye/iris regions — so a box from here and
a box from the detector mean the same thing, and one calibration serves both.

Landmark index sets
-------------------
The prep modules derive several contours from `mp.solutions.face_mesh`'s
FACEMESH_* connection graphs. MediaPipe >=0.10.35 dropped the `solutions`
package, so those rings were resolved once against mediapipe 0.10.21 (the
version the datasets were built with) and are inlined here as literals. They
are topological constants of the canonical face mesh, not tunables.

L/R are SUBJECT-relative throughout, matching FACS, the prep pipelines and
`config.LATERAL_PAIRS`: the subject's left sits at LARGER image x on a frontal
face. `assert_lateral_orientation` re-checks this at runtime.
"""

import numpy as np

import config as C

# --- contours resolved from mediapipe 0.10.21's FACEMESH_* graphs ----------
L_EYE_RING = [249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386,
              387, 388, 466, 263]
R_EYE_RING = [7, 33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153,
              145, 144, 163]
L_BROW_UPPER = [300, 293, 334, 296, 336]
L_BROW_LOWER = [276, 283, 282, 295, 285]
R_BROW_UPPER = [46, 53, 52, 65, 55]
R_BROW_LOWER = [70, 63, 105, 66, 107]
LIP_L = [0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17]
LIP_R = [17, 84, 181, 91, 146, 61, 185, 40, 39, 37, 0]
CHIN_ARC = [379, 378, 400, 377, 152, 148, 176, 149, 150]

# --- literal sets, copied from prep_v2/au_map.py ---------------------------
LIP_LOWER = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]
FOREHEAD_ARC = [21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251]
NOSE_IDX = [6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327,
            278, 344, 440, 275, 45, 220, 115, 48, 64, 294]
CHEEK_R = [123, 116, 117, 118, 119, 100, 142, 129, 209, 49,
           205, 206, 216, 212, 214, 192, 213, 147]
CHEEK_L = [352, 345, 346, 347, 348, 329, 371, 358, 429, 279,
           425, 426, 436, 432, 434, 416, 433, 376]

# refine_landmarks / the Tasks model append the iris blocks at 468-477.
R_IRIS_CENTRE, R_IRIS_RING = 468, [469, 470, 471, 472]
L_IRIS_CENTRE, L_IRIS_RING = 473, [474, 475, 476, 477]

EYE_DILATE_FRAC = 0.04       # prep_v2.1
BROW_DILATE_FRAC = 0.02      # prep_v2
_EYE_CORNER_R, _EYE_CORNER_L = 33, 263

MODEL = C.MODELS / "face_landmarker.task"
_LANDMARKER = None


def _landmarker():
    """Lazy singleton. The .task file is vendored so this stays offline."""
    global _LANDMARKER
    if _LANDMARKER is None:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
        if not MODEL.exists():
            raise FileNotFoundError(
                f"{MODEL} missing — the MediaPipe fallback needs it. See "
                "docs/CODE.md#mesh_regionspy for the download command.")
        _LANDMARKER = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(
                    model_asset_path=str(MODEL)),
                running_mode=vision.RunningMode.IMAGE,
                num_faces=1,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False))
    return _LANDMARKER


def available():
    """True if the fallback can actually run, without raising."""
    try:
        _landmarker()
        return True
    except Exception:
        return False


def landmarks(frame):
    """(478, 2) pixel-space landmarks for the largest face, or None."""
    import mediapipe as mp
    import cv2
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if frame.ndim == 3 else \
        cv2.cvtColor(frame, cv2.COLOR_GRAY2RGB)
    res = _landmarker().detect(
        mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    if not res.face_landmarks:
        return None
    H, W = frame.shape[:2]
    return np.array([[p.x * W, p.y * H] for p in res.face_landmarks[0]],
                    dtype=np.float32)


def interocular_distance(pts):
    return float(np.linalg.norm(pts[_EYE_CORNER_R] - pts[_EYE_CORNER_L]))


def _dilate(hull, px):
    """Push every hull vertex radially outward by `px`. Ported from the prep."""
    centroid = hull.mean(axis=0)
    vecs = hull - centroid
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms < 1e-6] = 1e-6
    return hull + vecs / norms * px


def _polygons(pts):
    """The 13 region polygons, matching prep_v2 + prep_v2.1 exactly."""
    import cv2
    P = lambda idx: pts[idx].astype(np.float32)
    hull = lambda a: cv2.convexHull(a).reshape(-1, 2)
    iod = interocular_distance(pts)

    polys = {
        # --- eye branch: prep_v2.1's convention, NOT prep_v2's -------------
        "L_eye": _dilate(hull(P(L_EYE_RING)), EYE_DILATE_FRAC * iod),
        "R_eye": _dilate(hull(P(R_EYE_RING)), EYE_DILATE_FRAC * iod),
        # --- micro-expression branch: prep_v2 ------------------------------
        "forehead": hull(np.vstack([P(FOREHEAD_ARC), P(L_BROW_UPPER),
                                    P(R_BROW_UPPER)])),
        "L_brow": _dilate(hull(np.vstack([P(L_BROW_UPPER), P(L_BROW_LOWER)])),
                          BROW_DILATE_FRAC * iod),
        "R_brow": _dilate(hull(np.vstack([P(R_BROW_UPPER), P(R_BROW_LOWER)])),
                          BROW_DILATE_FRAC * iod),
        "nose": hull(P(NOSE_IDX)),
        "L_cheek": hull(P(CHEEK_L)),
        "R_cheek": hull(P(CHEEK_R)),
        "L_mouth": P(LIP_L),
        "R_mouth": P(LIP_R),
        "chin": np.vstack([P(LIP_LOWER), P(CHIN_ARC)[::-1]]),
    }
    # The iris disc is an axis-aligned ellipse about the centre landmark, so
    # its bounding box follows from the ring extents directly — no need to
    # sample the ellipse only to re-bound it.
    for side, centre, ring in (("L", L_IRIS_CENTRE, L_IRIS_RING),
                               ("R", R_IRIS_CENTRE, R_IRIS_RING)):
        r = P(ring)
        cx, cy = pts[centre]
        rx = max((r[:, 0].max() - r[:, 0].min()) / 2.0, 1e-3)
        ry = max((r[:, 1].max() - r[:, 1].min()) / 2.0, 1e-3)
        polys[f"{side}_iris"] = np.array(
            [[cx - rx, cy - ry], [cx + rx, cy - ry],
             [cx + rx, cy + ry], [cx - rx, cy + ry]], dtype=np.float32)
    return polys


def boxes_from_mesh(frame):
    """({region: (xc, yc, w, h)}, {region: conf}) — same contract as YOLO.

    Boxes are the axis-aligned bounds of the prep pipelines' own polygons, so
    the geometry `features.eye_features` sees is drawn from the same
    distribution the calibration was fitted on.
    """
    pts = landmarks(frame)
    if pts is None:
        return {}, {}
    H, W = frame.shape[:2]
    boxes, conf = {}, {}
    for reg, poly in _polygons(pts).items():
        x0, y0 = poly[:, 0].min(), poly[:, 1].min()
        x1, y1 = poly[:, 0].max(), poly[:, 1].max()
        w, h = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
        boxes[reg] = ((x0 + x1) / 2.0 / W, (y0 + y1) / 2.0 / H, w / W, h / H)
        conf[reg] = 0.90        # the mesh is landmark-exact, not a detection
    return boxes, conf


if __name__ == "__main__":
    import sys
    import cv2
    src = sys.argv[1] if len(sys.argv) > 1 else "0"
    cap = cv2.VideoCapture(int(src) if src.isdigit() else src)
    # Scan for the first frame that actually holds a face: real recordings
    # routinely open on a title card or an empty chair.
    pts = frame = None
    for _ in range(120):
        ok, f = cap.read()
        if not ok:
            break
        pts = landmarks(f)
        if pts is not None:
            frame = f
            break
    cap.release()
    assert pts is not None, f"no face in the first 120 frames of {src}"
    print(f"landmarks: {pts.shape}")
    b, _ = boxes_from_mesh(frame)
    missing = [r for r in C.REGIONS if r not in b]
    assert not missing, f"missing regions: {missing}"
    print(f"regions   : {len(b)}/{C.N_CLASSES}")
    for a, z in C.LATERAL_PAIRS:
        assert b[a][0] > b[z][0], f"lateral inversion: {a} !> {z}"
    print("lateral orientation OK (subject-left at larger image x)")
