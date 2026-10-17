"""Shared configuration for the interview behavioural-analysis pipeline.

Architecture implemented (see image.png):

    Candidate on camera (live video stream)
        |
        +--> Eye tracking      --> Gaze patterns    ("suspicious looking away?")
        +--> Micro-expressions --> Stress indicators ("nervousness spikes?")
                                        |
                                   Fusion layer
                                        |
                              Deception indicator (time-stamped behavioural log)

Design decision: ONE detector serves BOTH branches.
---------------------------------------------------
The diagram forks a single video stream into two analysis branches. Rather than
run a separate model per branch, a single YOLO detector emits all 13 facial
regions in one forward pass; the eye/iris boxes drive the gaze branch and the
9 face-parcellation boxes drive the micro-expression branch. One inference per
frame keeps the whole pipeline inside a 30 fps budget with room to spare.

Design decision: the detector predicts REGIONS, never behaviour classes.
-----------------------------------------------------------------------
`Gaze_Averted` is meaningful only relative to a person's own habitual gaze:
across this corpus the median horizontal iris offset is +0.157 rather than 0,
and per-subject mean displacement spans a 6.5x range. A single-frame detector
cannot know where THIS candidate usually looks, so training it to emit the
behaviour class directly would brand whole individuals as permanently evasive.
The detector's job is geometry. Behaviour is inferred downstream, after a
per-session baseline has been observed.

The same reasoning applies to micro-expressions: a micro-expression is a
*motion* lasting under 0.5 s, so it cannot be read off one frame at all. The
stress branch consumes a temporal window of region geometry, never a still.
"""

from pathlib import Path

# PKG is the delivery folder (this file lives in PKG/src/). DATA_ROOT is
# wherever the source corpus lives, found by walking up rather than hard-coded,
# so the delivery folder can be moved or renamed without editing anything.
PKG = Path(__file__).resolve().parents[1]


def _find_data_root(start: Path) -> Path:
    """Walk upward for the directory holding the source datasets."""
    for d in [start, *start.parents]:
        if (d / "dataset_v2" / "frames.csv").exists():
            return d
    return start.parent          # nothing found; the self-test reports it


DATA_ROOT = _find_data_root(PKG)
ROOT = DATA_ROOT                 # kept as an alias: CSV image paths are
                                 # relative to the data root

# --- source data (read-only; produced by the repo's prep_* pipelines) --------
ARCHIVE = DATA_ROOT / "archive (2)"
DS_FACE = DATA_ROOT / "dataset_v2"    # 11 face regions + stress labels
DS_EYE = DATA_ROOT / "dataset_v2.1"   # 4 eye/iris regions + gaze labels

# --- what this pipeline produces -------------------------------------------
# Deliverables sit at the top of the package where a client will look for them;
# bulky regenerable intermediates stay under artifacts/.
MODELS = PKG / "models"            # deployable weights + frozen calibration
REPORTS = PKG / "reports"          # metrics JSON, the report, demo video
ARTIFACTS = PKG / "artifacts"      # regenerable intermediates
DATASET = ARTIFACTS / "dataset"    # unified YOLO detection dataset
RUNS = ARTIFACTS / "runs"          # detector training runs
CACHE = ARTIFACTS / "cache"        # per-frame detector output
LOGS = ARTIFACTS / "logs"          # stdout of long-running jobs

SPLIT_JSON = ARTIFACTS / "splits.json"

# --- detector classes -------------------------------------------------------
# 0-3 feed the eye-tracking branch, 4-12 feed the micro-expression branch.
# Eye/iris geometry comes from dataset_v2.1 (the gaze branch's own polygons);
# the 9 face regions come from dataset_v2. v2's own L_eye/R_eye are dropped so
# the same anatomy is not represented twice with two different dilations.
EYE_REGIONS = ["L_eye", "R_eye", "L_iris", "R_iris"]
FACE_REGIONS = ["forehead", "L_brow", "R_brow", "nose",
                "L_cheek", "R_cheek", "L_mouth", "R_mouth", "chin"]
REGIONS = EYE_REGIONS + FACE_REGIONS
REGION_ID = {r: i for i, r in enumerate(REGIONS)}
N_CLASSES = len(REGIONS)

# 'L'/'R' are SUBJECT-relative, matching FACS and MediaPipe's FACEMESH_LEFT_*.
# On a frontal face the subject's left sits at LARGER image x. Every builder
# asserts this numerically: if it ever inverts, every lateral box is mirrored
# and the detector would happily learn the wrong side at high confidence.
LATERAL_PAIRS = [("L_eye", "R_eye"), ("L_iris", "R_iris"),
                 ("L_brow", "R_brow"), ("L_cheek", "R_cheek"),
                 ("L_mouth", "R_mouth")]

# --- behaviour classes ------------------------------------------------------
GAZE_CLASSES = ["Gaze_Contact", "Gaze_Averted", "Eyes_Closed"]
STRESS_CLASSES = ["Stress", "No_Stress", "Neutral"]

# --- timing -----------------------------------------------------------------
# SAMM was filmed at 200 fps; a webcam runs ~30 fps. Every temporal quantity is
# expressed on a 30 Hz virtual timeline in per-second units so that a model
# trained here sees the same input distribution it will see at deployment.
SOURCE_FPS = 200.0
TARGET_FPS = 30.0

# "Facial cues under 0.5 seconds" (per the architecture diagram) -> a 0.5 s
# causal window is the micro-expression unit; 15 steps at 30 Hz.
MICRO_WINDOW_S = 0.5
MICRO_WINDOW_STEPS = int(round(MICRO_WINDOW_S * TARGET_FPS))

# The gaze branch needs to observe a person before it can call them evasive.
GAZE_CALIB_S = 2.0
FUSION_WINDOW_S = 3.0
VERDICT_HZ = 1.0

SEED = 0

# The fusion layer's states, in escalation order. `fusion.VERDICTS` re-exports
# this rather than keeping a second copy, and the API's OpenAPI enum reads it,
# so the published contract cannot drift from what the code emits.
VERDICT_STATES = ["Calibrating", "Neutral", "Engaged", "Suspicious"]

# --- session review priority ------------------------------------------------
# Maps a whole session to how much reviewer attention it deserves.
#
# These are a REPORTING CONVENTION, not a validated classifier. Fusion accuracy
# could not be established on this corpus at all (docs/RESULTS.md: gaze and
# stress are statistically independent here, Cramer's V 0.035, and every SAMM
# session is shorter than the fusion window). So the bands answer "how much of
# this footage is worth a human's time", never "did this person do something".
#
# A band fires when ANY of its three conditions is met, because the behaviours
# are not interchangeable: one long stare away, many short flagged moments, and
# a persistently high aversion fraction are each independently worth surfacing.
# Duration leads deliberately — a single sustained span is the signal the gaze
# branch supports best (GazePattern's own docstring makes the same argument).
REVIEW_MIN_ANALYSED_S = 15.0     # below this, report Insufficient rather than guess

#                    longest Suspicious span (s), flags/min, Suspicious fraction
REVIEW_BANDS = [
    ("High",   15.0, 3.0, 0.35),
    ("Medium",  5.0, 0.5, 0.10),
]
REVIEW_DEFAULT_BAND = "Low"


def ensure_dirs():
    for d in (ARTIFACTS, DATASET, RUNS, MODELS, REPORTS, CACHE, LOGS):
        d.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    ensure_dirs()
    print(f"package   : {PKG}")
    print(f"data root : {DATA_ROOT}")
    assert ARCHIVE.exists(), f"missing {ARCHIVE}"
    for d in (DS_FACE, DS_EYE):
        assert (d / "frames.csv").exists(), f"missing {d}/frames.csv"
        assert (d / "annotations.csv").exists(), f"missing {d}/annotations.csv"
    print(f"config OK — {N_CLASSES} regions: {', '.join(REGIONS)}")
    print(f"micro-expression window: {MICRO_WINDOW_S}s = {MICRO_WINDOW_STEPS} steps @ {TARGET_FPS:g}Hz")
