"""Loaders for the source CSVs, with the corpus's known traps handled once.

Three traps live in this data. Each one is silent — nothing downstream crashes
if you get it wrong, the numbers just quietly become meaningless.

1. `annotations.csv` carries BOTH `region` and `class_id`, and `class_id` is
   the FRAME's behaviour class, not the region's identity. Every one of a
   frame's boxes shares it. Training a detector on `class_id` would ask it to
   predict a frame-global label from a local patch, and localisation would
   carry no information at all. Region labels must come from `region`.

2. Both CSVs carry a `split` column, and the two files disagree: they were
   stratified separately, so one file's test subjects are largely the other's
   train subjects. Mixing them corrupts any joint evaluation. Both columns are
   ignored here; splits come from our own frozen splits.json.

3. Frame stems are shared across the two datasets but the image paths are
   relative to the repo root, so they are resolved against ROOT rather than the
   current working directory.
"""

import csv

import config as C


def _read(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_frames():
    """(eye_frames, face_frames) keyed by stem. One row per image in each."""
    eye = {r["stem"]: r for r in _read(C.DS_EYE / "frames.csv")}
    face = {r["stem"]: r for r in _read(C.DS_FACE / "frames.csv")}
    assert len(eye) == len(face) == 11475, f"{len(eye)} / {len(face)} frames"
    assert set(eye) == set(face), "the two datasets index different frames"
    return eye, face


def load_boxes():
    """Merged region boxes per stem: {stem: {region: (xc, yc, w, h)}}.

    Eye/iris geometry comes from dataset_v2.1, the 9 face regions from
    dataset_v2. Values are YOLO-normalised (fractions of image width/height).
    """
    boxes = {}

    def take(path, wanted):
        for r in _read(path):
            reg = r["region"]
            if reg not in wanted:
                continue
            b = boxes.setdefault(r["stem"], {})
            v = (float(r["bbox_xc"]), float(r["bbox_yc"]),
                 float(r["bbox_w"]), float(r["bbox_h"]))
            for x in v:
                assert 0.0 <= x <= 1.0, f"{r['stem']} {reg}: {x} out of range"
            b[reg] = v

    take(C.DS_EYE / "annotations.csv", set(C.EYE_REGIONS))
    take(C.DS_FACE / "annotations.csv", set(C.FACE_REGIONS))

    assert len(boxes) == 11475, f"{len(boxes)} stems with boxes"
    for stem, b in boxes.items():
        assert len(b) == C.N_CLASSES, \
            f"{stem}: {len(b)} regions, expected {C.N_CLASSES}"
    return boxes


def image_path(frames_row):
    """Absolute path to a frame's JPEG. Paths in the CSVs are repo-relative."""
    return C.ROOT / frames_row["image_path"]


def assert_lateral_orientation(boxes):
    """Guard trap: subject-left must sit at LARGER image x on these frontal
    faces. A mirrored label set still trains to high mAP — against the wrong
    side of the face — and nothing downstream would notice."""
    import statistics as st
    med = {}
    for reg in C.REGIONS:
        med[reg] = st.median(b[reg][0] for b in boxes.values())
    for left, right in C.LATERAL_PAIRS:
        assert med[left] > med[right], \
            f"L/R inverted for {left}/{right}: {med[left]:.3f} <= {med[right]:.3f}"
    return med
