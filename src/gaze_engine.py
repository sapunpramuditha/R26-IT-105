"""Eye tracking -> Gaze patterns (left branch of the architecture).

Two stages, matching the two boxes in the diagram:

  Eye tracking   per frame: iris-in-eye geometry -> Gaze_Contact / Gaze_Averted
                 / Eyes_Closed, judged against THIS candidate's own baseline.
  Gaze patterns  over a rolling window: how much of the recent past was spent
                 looking away, and is that a pattern worth flagging?

Why a per-candidate baseline is mandatory, not a refinement
-----------------------------------------------------------
"Averted" only means anything relative to where a person normally looks. On
this corpus the median horizontal iris offset is +0.157 rather than 0 — an
artifact of eye shape and camera placement, not of anyone looking away — and
per-subject mean displacement spans a 6.5x range. Thresholding the raw value
labels entire individuals as permanently evasive while missing genuine aversion
in others. So the first seconds of every session are spent measuring the
person, and every later frame is scored as a deviation from that.

The consequence is a deliberate "calibrating" state: until enough baseline
frames exist, this engine reports None rather than guessing. A monitoring tool
that fabricates a verdict before it can possibly know one is worse than a tool
that says "not yet".

Why the lid gate is consulted before displacement
-------------------------------------------------
A closed eye still has an iris box somewhere, and its position is meaningless.
Checking aperture first stops blinks from being scored as gaze aversion.

The GMM subtlety that decides threshold placement
-------------------------------------------------
Thresholds come from 2-component Gaussian mixtures fitted on the training split.
The boundary is located by explicitly scanning the posterior over a fine grid
rather than taking argmax: with full covariance the low-mean component can be
wide enough to also win at the far tail, which would classify a WIDER-than-usual
eye as closed. Scanning for the first crossing keeps each class on the side of
the boundary its name implies.
"""

import json
from collections import deque

import numpy as np

import config as C


# --------------------------------------------------------------------------
# threshold fitting (offline, training split only)
# --------------------------------------------------------------------------
def _gmm_boundary(values, lo_is_first=True, grid=4001):
    """Fit 2 components to a 1-D sample and return the decision boundary.

    Returns the value where the posterior of the low-mean component crosses
    0.5, scanned low->high so the boundary sits between the modes rather than
    out in a tail.
    """
    from sklearn.mixture import GaussianMixture

    v = np.asarray(values, dtype=float).reshape(-1, 1)
    v = v[np.isfinite(v).ravel()]
    gm = GaussianMixture(n_components=2, covariance_type="full",
                         random_state=C.SEED, n_init=5).fit(v)
    lo = int(np.argmin(gm.means_.ravel()))

    xs = np.linspace(float(v.min()), float(v.max()), grid).reshape(-1, 1)
    post_lo = gm.predict_proba(xs)[:, lo]
    below = post_lo >= 0.5
    idx = np.where(below[:-1] & ~below[1:])[0]      # first high->low crossing
    if len(idx) == 0:
        return float(np.median(v))
    return float(xs[idx[0], 0])


def fit_thresholds_unsupervised(ear_ratios, deviations):
    """Label-free starting point: one 2-component mixture per quantity.

    Kept because it is the only option when deploying into a domain with no
    reference labels at all. It is NOT the estimator used for the shipped
    thresholds — see `select_thresholds` and the note below.
    """
    return {"ear_thr": round(_gmm_boundary(ear_ratios), 6),
            "dev_thr": round(_gmm_boundary(deviations), 6)}


def _uf1(rows, ear_thr, dev_thr, labels=C.GAZE_CLASSES):
    """Macro-F1 of the two-threshold rule over (ear_ratio, deviation, ref)."""
    idx = {c: i for i, c in enumerate(labels)}
    cm = np.zeros((3, 3), dtype=int)
    for earr, dev, ref in rows:
        if earr <= ear_thr:
            p = "Eyes_Closed"
        elif dev >= dev_thr:
            p = "Gaze_Averted"
        else:
            p = "Gaze_Contact"
        cm[idx[ref], idx[p]] += 1
    f1 = []
    for i in range(3):
        tp = cm[i, i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1.append(2 * pr * rc / (pr + rc) if pr + rc else 0.0)
    return float(np.mean(f1))


def select_thresholds(val_rows, ear_grid=None, dev_grid=None):
    """Choose both thresholds JOINTLY by maximising macro-F1 on validation.

    Why this replaced the mixture fit
    ---------------------------------
    The deviation distribution is dominated by a large eye-contact mass with a
    long tail, and a 2-component mixture fitted to it puts its boundary out in
    that tail rather than between contact and aversion — landing at 0.047 when
    the averted class has a median of 0.026. The effect is that almost every
    averted frame is read as contact: macro-F1 0.589 unsupervised versus 0.820
    selected here. The mixture is describing "typical vs extreme", which is not
    the question being asked.

    The two thresholds are searched jointly rather than one after the other,
    because they interact: the lid gate is consulted first, so raising it moves
    frames out of the pool the displacement threshold ever sees.

    Selection happens on VALIDATION and the test split is not consulted. That
    ordering is what keeps the reported test number an estimate of performance
    on unseen people rather than a description of the data it was tuned on.
    """
    ear_grid = np.arange(0.70, 0.99, 0.01) if ear_grid is None else ear_grid
    dev_grid = np.arange(0.005, 0.081, 0.0025) if dev_grid is None else dev_grid

    best, best_s = None, -1.0
    for et in ear_grid:
        for dt in dev_grid:
            s = _uf1(val_rows, float(et), float(dt))
            if s > best_s:
                best, best_s = (float(et), float(dt)), s
    return {"ear_thr": round(best[0], 6), "dev_thr": round(best[1], 6),
            "val_macro_f1": round(best_s, 4),
            "selected_on": "validation split (test never consulted)"}


# --------------------------------------------------------------------------
# online engine
# --------------------------------------------------------------------------
class GazeStream:
    """Causal per-session gaze state. One instance per candidate.

    Feed it `update(gaze_h, gaze_v, ear)` per frame; it returns the gaze label
    or None while still calibrating.
    """

    def __init__(self, calib, fps=C.TARGET_FPS, calib_s=C.GAZE_CALIB_S,
                 smooth=5, adaptive=True, memory_s=60.0, refresh=15):
        self.ear_thr = calib["ear_thr"]
        self.dev_thr = calib["dev_thr"]
        self.need = max(1, int(round(calib_s * fps)))
        self._recent = deque(maxlen=smooth)  # causal median filter
        self.n_seen = 0

        # The baseline keeps improving as the session runs.
        #
        # Freezing the reference after the first two seconds costs real
        # accuracy: measured against a full-session baseline the same rule
        # scores 0.87 macro-F1 on test, versus 0.75 when frozen at 2 s. Two
        # seconds is simply a poor estimate of where a person habitually looks
        # — if they happen to glance away during it, every later frame is
        # judged against a displaced origin for the rest of the interview.
        #
        # So the baseline is recomputed from a trailing window of everything
        # seen so far, capped at `memory_s`. This stays strictly causal — only
        # past frames are ever used — while converging toward the full-session
        # estimate the longer the candidate is on camera. The cap keeps it
        # responsive if someone changes posture or the camera is moved.
        self.adaptive = adaptive
        self._hist = deque(maxlen=max(self.need, int(round(memory_s * fps))))
        self._refresh = max(1, refresh)      # recompute cadence, not per-frame
        self.base = None

    @property
    def calibrating(self):
        return self.base is None

    def _recompute(self):
        a = np.asarray(self._hist, dtype=float)
        # median, not mean: a few blinks or glances must not drag the reference
        # point that every later frame is judged against
        self.base = {"gh": float(np.median(a[:, 0])),
                     "gv": float(np.median(a[:, 1])),
                     "ear": float(np.median(a[:, 2]))}

    def update(self, gaze_h, gaze_v, ear):
        """Returns (label|None, deviation|None, ear_ratio|None)."""
        self.n_seen += 1
        self._hist.append((gaze_h, gaze_v, ear))

        if self.base is None:
            if len(self._hist) < self.need:
                return None, None, None
            self._recompute()
        elif self.adaptive and self.n_seen % self._refresh == 0:
            self._recompute()

        dev = float(np.hypot(gaze_h - self.base["gh"], gaze_v - self.base["gv"]))
        ear_ratio = ear / self.base["ear"] if self.base["ear"] > 1e-9 else 1.0

        if ear_ratio <= self.ear_thr:            # lid gate FIRST
            raw = "Eyes_Closed"
        elif dev >= self.dev_thr:
            raw = "Gaze_Averted"
        else:
            raw = "Gaze_Contact"

        self._recent.append(raw)
        # causal majority over ~166 ms kills single-frame detector flicker
        # without hiding a real half-second glance
        label = max(set(self._recent), key=list(self._recent).count)
        return label, dev, ear_ratio


class GazePattern:
    """'Gaze patterns — suspicious looking away?'

    Aggregates the label stream over a rolling window into the fraction of
    recent time spent not making eye contact, plus the length of the current
    unbroken aversion. Both matter: many brief glances and one long stare away
    are different behaviours, and only the second is usually worth a flag.
    """

    def __init__(self, fps=C.TARGET_FPS, window_s=C.FUSION_WINDOW_S,
                 avert_frac_thr=0.45):
        self.buf = deque(maxlen=max(1, int(round(window_s * fps))))
        self.thr = avert_frac_thr
        self.fps = fps
        self._run = 0

    def update(self, label):
        # Eyes_Closed is NOT aversion. A blink is not looking away, and on real
        # footage lowering the gaze lowers the lid — a candidate reading notes
        # registered 34% Eyes_Closed, which alone pushed `frac_away` past the
        # trigger and pinned the session on Suspicious. Closed time is still
        # reported (`frac_closed`) and still logged; it just no longer counts
        # as looking away.
        #
        # For the same reason a closure neither extends nor breaks an aversion
        # run: blinking halfway through a long glance away should not reset it.
        self.buf.append(label)
        if label == "Gaze_Averted":
            self._run += 1
        elif label != "Eyes_Closed":
            self._run = 0

        n = len(self.buf) or 1
        frac_avert = sum(1 for x in self.buf if x == "Gaze_Averted") / n
        frac_closed = sum(1 for x in self.buf if x == "Eyes_Closed") / n
        frac_contact = sum(1 for x in self.buf if x == "Gaze_Contact") / n
        away = frac_avert
        return {
            "frac_contact": frac_contact,
            "frac_averted": frac_avert,
            "frac_closed": frac_closed,
            "frac_away": away,
            "aversion_run_s": self._run / self.fps,
            "looking_away": away >= self.thr,
        }


def load_calib(path=None):
    path = path or (C.MODELS / "gaze_calib.json")
    return json.loads(path.read_text())


def save_calib(calib, path=None):
    path = path or (C.MODELS / "gaze_calib.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(calib, indent=2), encoding="utf-8")
    return path
