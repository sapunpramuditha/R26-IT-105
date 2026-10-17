"""The deployable pipeline: camera or video file in, behavioural log out.

    python interview_ai/pipeline.py --source 0                  # webcam
    python interview_ai/pipeline.py --source clip.mp4 --save out.mp4
    python interview_ai/pipeline.py --replay-subject 009        # corpus replay

This is the architecture diagram as one runnable object:

    frame -> detector -> +-- eye geometry  -> GazeStream  -> GazePattern --+
                         |                                                 |
                         +-- face geometry -> Spotter -> StressIndicator --+
                                                                           |
                                                    FusionLayer -> BehaviouralLog

Frame drops are handled honestly. If the camera delivers 30 fps but the
pipeline can only process 22, the engines must not be fed as though no time
passed — every temporal quantity here is expressed per SECOND against the real
wall-clock timestamp of each frame, so a dropped frame slows the analysis
rather than corrupting it. `--stride` makes that explicit for offline video.
"""

import argparse
import json
import time

import numpy as np

import config as C
import features as F
import fusion as FU
import gaze_engine as G
import mesh_regions as MR
import micro_engine as M


DEFAULT_MODEL = "yolo26n_640"          # the champion; see select_champion.py
_YOLO_MISS_SWITCH = 12                 # empty YOLO frames before the fallback
_YOLO_REPROBE = 150                    # ~5 s: re-check YOLO instead of latching


def resolve_runtime(model=None, device="auto", imgsz=640):
    """Pick the weights and device that actually meet the fps budget here.

    Two things this exists to prevent:

    * `device=0` hard-fails on a machine without CUDA, which is the more
      likely interview deployment, not the less likely one.
    * On CPU the PyTorch graph runs at ~20 fps while the OpenVINO export of the
      same weights runs at ~34 fps with identical mAP50. Benchmarking one and
      shipping the other is how a validated number stops being true, so CPU
      runs prefer the exported model when it is present.
    """
    import torch

    if device == "auto":
        device = 0 if torch.cuda.is_available() else "cpu"

    if model is None:
        base = C.MODELS / DEFAULT_MODEL
        ov = C.MODELS / f"{DEFAULT_MODEL}_openvino_model"
        if device == "cpu" and ov.exists():
            model = str(ov)
        else:
            model = str(base.with_suffix(".pt"))
    return model, device


class InterviewPipeline:
    """One instance per candidate session."""

    def __init__(self, model=None, calib=None, fps=C.TARGET_FPS, conf=0.25,
                 imgsz=640, device="auto", session_id=None):
        from ultralytics import YOLO
        if isinstance(model, str) or model is None:
            model, device = resolve_runtime(model, device, imgsz)
            self.model = YOLO(model, task="detect")
        else:
            self.model = model
        self.model_path = model
        self.imgsz, self.device, self.conf = imgsz, device, conf
        calib = calib or G.load_calib()
        self._calib = calib
        self._calib_for = None
        self._last_verdict = None
        self.gaze = G.GazeStream(calib, fps=fps)
        self.pattern = G.GazePattern(fps=fps)
        self.spotter = M.MicroExpressionSpotter(fps=fps)
        self.stress = M.StressIndicator(fps=fps)
        self.fusion = FU.FusionLayer(fps=fps)
        self.log = FU.BehaviouralLog(session_id)
        self.last = {}
        self._yolo_misses = 0
        self._fallback = False
        self._since_probe = 0
        self.source = "yolo"
        # MediaPipe reproduces the prep pipelines' own polygons, so its boxes
        # land in the same geometry the calibration was fitted on. The Haar
        # estimator does not, and is only a last resort if mediapipe is absent.
        self._mesh_ok = MR.available()

    def _fallback_boxes(self, frame):
        """Best available non-YOLO geometry, and the name of what produced it.

        When the mesh is available it is the ONLY fallback: if it finds no
        face, the honest answer is no boxes. Dropping through to the Haar
        estimator would feed a second, incompatible geometry into the same
        adaptive baseline — its deviation median is 0.1076 against the mesh's
        0.0189 — which corrupts the reference every later frame is judged
        against.
        """
        if self._mesh_ok:
            boxes, conf = MR.boxes_from_mesh(frame)
            return boxes, conf, "mesh"
        return (*F.boxes_from_classical(frame), "haar")

    def _apply_calib_for(self, source):
        """Swap in the profile matching whatever produced this frame's boxes.

        `dev_thr` transfers between the detector and the mesh — the mesh
        reproduces prep_v2.1's polygons, so the displacement is in the same
        units. `ear_thr` does not: see models/gaze_calib.json.
        """
        if source == self._calib_for:
            return
        prof = self._calib.get(source) or self._calib
        self.gaze.ear_thr = prof.get("ear_thr", self._calib["ear_thr"])
        self.gaze.dev_thr = prof.get("dev_thr", self._calib["dev_thr"])
        self._calib_for = source

    def step(self, frame, t):
        # The fallback is NOT a one-way latch. A candidate who leans out of
        # shot for half a second used to strand the session on the fallback for
        # its entire remainder; instead YOLO is re-probed every _YOLO_REPROBE
        # frames, so the pipeline recovers as soon as the face comes back.
        use_yolo = not self._fallback
        if self._fallback:
            self._since_probe += 1
            if self._since_probe >= _YOLO_REPROBE:
                self._since_probe = 0
                use_yolo = True

        if use_yolo:
            infer = F.gray3(frame)
            res = self.model.predict(infer, imgsz=self.imgsz, device=self.device,
                                     conf=self.conf, verbose=False)[0]
            boxes, conf = F.boxes_from_result(res, self.conf)
            if F.has_eye_iris(boxes):
                self._yolo_misses = 0
                self._fallback = False
                self.source = "yolo"
            else:
                boxes, conf, self.source = self._fallback_boxes(frame)
                self._yolo_misses += 1
                if self._yolo_misses >= _YOLO_MISS_SWITCH:
                    self._fallback = True
        else:
            boxes, conf, self.source = self._fallback_boxes(frame)
        self._apply_calib_for(self.source)
        H, W = frame.shape[:2]
        ff = F.frame_features(boxes, W, H)

        label = dev = ear_ratio = None
        if ff["eye"] is not None:
            label, dev, ear_ratio = self.gaze.update(
                ff["eye"]["gaze_h"], ff["eye"]["gaze_v"], ff["eye"]["ear"])
        pattern = self.pattern.update(label) if label else None

        event = self.spotter.update(
            ff["face"]["regions"] if ff["face"] else None,
            ff["eye"]["ear"] if ff["eye"] else None, t)
        stress = self.stress.update(t, event)

        verdict = self.fusion.update(t, pattern, stress,
                                     calibrating=(label is None))
        entry = self.log.observe(verdict)

        # The fusion layer only emits on verdict ticks (1 Hz), so `verdict` is
        # None on ~29 of every 30 frames. Carrying the last one forward is what
        # a display needs: without it every intermediate frame fell back to
        # "Calibrating", so the banner read Calibrating while the gaze line
        # beside it showed a live classification.
        if verdict is not None:
            self._last_verdict = verdict

        self.last = {"t": t, "boxes": boxes, "conf": conf, "gaze": label,
                     "source": self.source,
                     "deviation": dev, "ear_ratio": ear_ratio,
                     "pattern": pattern, "event": event, "stress": stress,
                     "verdict": verdict,
                     "display_verdict": getattr(self, "_last_verdict", None),
                     "log_entry": entry,
                     "calibrating": label is None}
        return self.last


# --------------------------------------------------------------------------
PALETTE = {"L_eye": (0, 255, 0), "R_eye": (0, 200, 255),
           "L_iris": (255, 0, 255), "R_iris": (255, 128, 0)}
STATE_COL = {"Calibrating": (160, 160, 160), "Neutral": (200, 200, 200),
             "Engaged": (0, 200, 0), "Suspicious": (0, 140, 255)}


def annotate(frame, st):
    import cv2
    img = frame.copy()
    H, W = img.shape[:2]
    for reg, (xc, yc, w, h) in st["boxes"].items():
        x0, y0 = int((xc - w / 2) * W), int((yc - h / 2) * H)
        x1, y1 = int((xc + w / 2) * W), int((yc + h / 2) * H)
        cv2.rectangle(img, (x0, y0), (x1, y1), PALETTE.get(reg, (120, 120, 120)),
                      2 if reg in PALETTE else 1)

    v = (st.get("display_verdict") or st["verdict"]
         or {"state": "Calibrating", "review_flag": False})
    col = STATE_COL.get(v["state"], (200, 200, 200))
    cv2.rectangle(img, (0, 0), (W, 74), (25, 25, 25), -1)
    cv2.putText(img, f"{v['state']}", (12, 30), cv2.FONT_HERSHEY_SIMPLEX,
                0.8, col, 2)
    g = st["gaze"] or ("calibrating" if st["calibrating"] else "-")
    cv2.putText(img, f"gaze: {g}", (12, 58), cv2.FONT_HERSHEY_SIMPLEX,
                0.55, (230, 230, 230), 1)
    if not st["boxes"]:
        cv2.putText(img, "no face detected — sit closer, face the camera",
                    (12, H - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 180, 255), 1)
    if st["stress"]:
        ss = st["stress"]
        # Amber marks the spotter firing above THIS person's own resting rate.
        # It is not a stress classification: that classifier is not shipped
        # (docs/RESULTS.md section 5), so nothing here names a stress class.
        spiking = ss["spike"]
        col_s = (0, 190, 255) if spiking else (230, 230, 230)
        cv2.putText(img, f"micro-events/min: {ss['events_per_min']:.1f}"
                         f" (rest {ss['baseline_per_min']:.1f})",
                    (250, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col_s, 1)
        if spiking:
            cv2.putText(img, "SPIKE", (250, 30), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, col_s, 2)
            if ss["regions"]:
                cv2.putText(img, "moving: " + " ".join(ss["regions"][:4]),
                            (12, 96), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col_s, 1)
    if v.get("review_flag"):
        cv2.putText(img, "REVIEW", (W - 130, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (0, 100, 255), 2)
        cv2.rectangle(img, (0, 0), (W - 1, H - 1), (0, 100, 255), 3)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=None,
                    help="default: the champion, OpenVINO build when on CPU")
    ap.add_argument("--source", default=None,
                    help="webcam index or video path")
    ap.add_argument("--replay-subject", default=None,
                    help="replay one corpus subject's frames as a pseudo-video")
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--device", default="auto",
                    help="auto | 0 | cpu")
    # SAMM was filmed at 200 fps but every engine here reasons on a 30 Hz
    # timeline in per-second units, matching a webcam. Replaying raw 200 fps
    # frames would advance the clock 6.7x too slowly against engines stepping
    # at 30 Hz, so corpus replay resamples by default. Live sources are already
    # near 30 fps and need no stride.
    ap.add_argument("--stride", type=int, default=0,
                    help="0 = auto (resample corpus replay 200->30 Hz)")
    ap.add_argument("--max-frames", type=int, default=0)
    ap.add_argument("--save", default=None, help="write an annotated video")
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()

    import cv2
    C.ensure_dirs()

    if a.stride <= 0:
        a.stride = (max(1, int(round(C.SOURCE_FPS / C.TARGET_FPS)))
                    if a.replay_subject else 1)

    if a.replay_subject:
        import data_io as io
        eye, _ = io.load_frames()
        rows = sorted((r for r in eye.values()
                       if r["subject"] == a.replay_subject),
                      key=lambda r: int(r["frame"]))
        assert rows, f"no frames for subject {a.replay_subject}"
        paths = [str(io.image_path(r)) for r in rows][::a.stride]
        reader = ((cv2.imread(p), i) for i, p in enumerate(paths))
        total = len(paths)
        sid = f"subject{a.replay_subject}"
    else:
        src = int(a.source) if str(a.source).isdigit() else a.source
        cap = cv2.VideoCapture(src)
        assert cap.isOpened(), f"cannot open source {a.source}"
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

        def gen():
            i = 0
            while True:
                ok, fr = cap.read()
                if not ok:
                    break
                if i % a.stride == 0:
                    yield fr, i
                i += 1
        reader = gen()
        sid = f"live-{time.strftime('%H%M%S')}"

    pipe = InterviewPipeline(a.model, imgsz=a.imgsz, device=a.device,
                             session_id=sid)
    writer = None
    n, t0 = 0, time.perf_counter()

    for frame, i in reader:
        if frame is None:
            continue
        t = i / C.SOURCE_FPS if a.replay_subject else n / C.TARGET_FPS
        st = pipe.step(frame, t)
        n += 1

        if st["log_entry"]:
            e = st["log_entry"]
            print(f"  [{e['t']:>7.2f}s] {e['event']:<20} {e['state']}"
                  + ("  REVIEW" if e["review_flag"] else ""))

        if a.save or a.show:
            vis = annotate(frame, st)
            if a.save:
                if writer is None:
                    h, w = vis.shape[:2]
                    writer = cv2.VideoWriter(
                        a.save, cv2.VideoWriter_fourcc(*"mp4v"),
                        C.TARGET_FPS, (w, h))
                writer.write(vis)
            if a.show:
                cv2.imshow("interview", vis)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        if a.max_frames and n >= a.max_frames:
            break

    el = time.perf_counter() - t0
    if writer:
        writer.release()
    if a.show:
        cv2.destroyAllWindows()

    path = pipe.log.save()
    s = pipe.log.summary()
    print(f"\nprocessed {n} frames in {el:.1f}s "
          f"({n/max(el,1e-9):.1f} fps processing rate)")
    print(f"log: {s['n_entries']} entries, {s['n_flags']} review flags "
          f"over {s['ticks']} verdict ticks")
    print("states:", " -> ".join(s["state_sequence"]) or "(none)")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
