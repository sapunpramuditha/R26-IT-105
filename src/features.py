"""Turn one frame's detected region boxes into the scalars both branches need.

Everything here is per-frame and stateless. All time-dependent reasoning —
baselines, spikes, smoothing — lives in the branch engines, because those are
the parts that need to behave identically online and offline.

The one trap: DENORMALISE BEFORE COMPUTING RATIOS
-------------------------------------------------
YOLO returns boxes normalised as fractions of image width and height
*separately*. So a normalised `w/h` is the true aspect ratio scaled by H/W, and
that factor changes with the camera: 960x650 here, 1280x720 on a webcam. Any
ratio built from normalised values (an eye-aspect ratio, an iris offset divided
by eye width) therefore silently changes meaning when the resolution changes,
and a threshold fitted at one resolution quietly misfires at another. Convert
to pixels first, always.
"""

import math

import numpy as np

import config as C

_FACE_CASCADE = None


def _px(box, W, H):
    xc, yc, w, h = box
    return xc * W, yc * H, w * W, h * H


def eye_features(boxes, W, H):
    """Gaze geometry, averaged over whichever eyes were detected.

    boxes: {region: (xc, yc, w, h)} normalised. Returns None if neither side
    yields a usable eye+iris pair — a dropped frame is honest, a guessed one is
    not.

    gaze_h/gaze_v are the iris centre's offset from the eye centre, expressed
    in units of that eye's own width/height, so eye size and camera distance
    divide out. Both sides use image-space x, so looking to the candidate's
    left moves both irises in the same direction.
    """
    out, ears = [], []
    for side in ("L", "R"):
        e, i = boxes.get(f"{side}_eye"), boxes.get(f"{side}_iris")
        if e is None or i is None:
            continue
        exc, eyc, ew, eh = _px(e, W, H)
        ixc, iyc, _, _ = _px(i, W, H)
        if ew <= 1 or eh <= 1:
            continue
        out.append(((ixc - exc) / ew, (iyc - eyc) / eh))
        ears.append(eh / ew)          # lid aperture proxy: tall eye = open eye
    if not out:
        return None
    return {
        "gaze_h": sum(o[0] for o in out) / len(out),
        "gaze_v": sum(o[1] for o in out) / len(out),
        "ear": sum(ears) / len(ears),
        "n_sides": len(out),
    }


def face_geometry(boxes, W, H):
    """Face-region centres and sizes in pixels, scale-normalised.

    Normalising by inter-ocular distance makes every downstream motion figure
    invariant to how close the candidate sits to the camera — without it, a
    person leaning in registers as a face full of micro-expressions.
    """
    le, re = boxes.get("L_eye"), boxes.get("R_eye")
    if le is None or re is None:
        return None
    lx, ly, _, _ = _px(le, W, H)
    rx, ry, _, _ = _px(re, W, H)
    iod = math.hypot(lx - rx, ly - ry)
    if iod < 1e-6:
        return None

    geom = {}
    for reg in C.FACE_REGIONS:
        b = boxes.get(reg)
        if b is None:
            continue
        xc, yc, w, h = _px(b, W, H)
        geom[reg] = (xc / iod, yc / iod, w / iod, h / iod)
    return {"iod": iod, "regions": geom}


def frame_features(boxes, W, H):
    """Both branches' per-frame inputs in one call."""
    return {"eye": eye_features(boxes, W, H),
            "face": face_geometry(boxes, W, H)}


def boxes_from_result(result, conf=0.25):
    """Best box per region class from an Ultralytics Results object.

    Exactly one of each region exists on a face, so per-class argmax-confidence
    is the right reduction — and it means a spurious second 'mouth' can never
    drag the geometry sideways.
    """
    best = {}
    b = result.boxes
    if b is None or len(b) == 0:
        return {}, {}
    xywhn = b.xywhn.tolist()
    cls = b.cls.tolist()
    cf = b.conf.tolist()
    for (xc, yc, w, h), c, p in zip(xywhn, cls, cf):
        if p < conf:
            continue
        reg = C.REGIONS[int(c)]
        if reg not in best or p > best[reg][1]:
            best[reg] = ((xc, yc, w, h), p)
    return {r: v[0] for r, v in best.items()}, {r: v[1] for r, v in best.items()}


def gray3(frame):
    """3-channel grayscale — the detector was trained on SAMM, which is gray."""
    import cv2
    if frame.ndim == 2:
        return cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def has_eye_iris(boxes):
    """True if at least one side has both the eye and the iris box."""
    for side in ("L", "R"):
        if f"{side}_eye" in boxes and f"{side}_iris" in boxes:
            return True
    return False


def _face_cascade():
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        import cv2
        _FACE_CASCADE = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
    return _FACE_CASCADE


def _xywhn(x, y, w, h, W, H):
    return ((x + w / 2) / W, (y + h / 2) / H, w / W, h / H)


def boxes_from_classical(frame):
    """Eye/iris boxes from OpenCV when the SAMM detector finds nothing.

    That detector saw tightly-cropped studio faces. A typical webcam frame is
    colour, noisy, and head-and-shoulders, so YOLO returns empty and
    calibration never finishes. A frontal-face cascade plus a darkest-blob
    iris inside each eye ROI recovers the four boxes the gaze branch needs.

    L/R stay subject-relative (L = larger image x), same as FACS / MediaPipe.
    """
    import cv2
    H, W = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    cas = _face_cascade()
    faces = cas.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4,
                                 minSize=(60, 60))
    if len(faces) == 0:
        faces = cas.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3,
                                     minSize=(40, 40))
    if len(faces) == 0:
        return {}, {}

    x, y, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    boxes, conf = {}, {}
    # Subject-left is image-right. Eye band ~32% down the face box.
    for side, xfrac in (("R", 0.12), ("L", 0.55)):
        ew = max(10, int(0.22 * fw))
        eh = max(8, int(0.18 * fh))
        ex = int(np.clip(x + xfrac * fw, 0, max(0, W - ew)))
        ey = int(np.clip(y + 0.32 * fh, 0, max(0, H - eh)))
        boxes[f"{side}_eye"] = _xywhn(ex, ey, ew, eh, W, H)
        conf[f"{side}_eye"] = 0.45

        roi = gray[ey:ey + eh, ex:ex + ew]
        if roi.size == 0:
            continue
        blur = cv2.GaussianBlur(roi.astype(np.float32), (5, 5), 0)
        cap = float(np.percentile(blur, 40))
        ys, xs = np.where(blur <= cap)
        if len(xs) == 0:
            ixc, iyc = ex + ew / 2.0, ey + eh / 2.0
        else:
            wts = (cap - blur[ys, xs]) + 1e-3
            ixc = ex + float(np.average(xs, weights=wts))
            iyc = ey + float(np.average(ys, weights=wts))
        iw, ih = max(4.0, 0.35 * ew), max(4.0, 0.45 * eh)
        boxes[f"{side}_iris"] = (ixc / W, iyc / H, iw / W, ih / H)
        conf[f"{side}_iris"] = 0.45
    return boxes, conf
