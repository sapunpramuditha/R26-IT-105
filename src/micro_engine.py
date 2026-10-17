"""Micro-expressions -> Stress indicators (right branch of the architecture).

  Micro-expressions  "facial cues under 0.5 seconds" — spot brief bursts of
                     facial motion in the region-geometry stream.
  Stress indicators  "nervousness spikes detected?" — how often those bursts
                     fire, how strong they are, and which regions drive them.

Why this branch is a SPOTTER first and a classifier second
-----------------------------------------------------------
A micro-expression is a *motion*, not an appearance. A single frame near the
onset of one is pixel-for-pixel a neutral face, so no per-frame classifier can
see it even in principle — it has to be found in the time axis. The primary
output here is therefore a detected *event* (onset, apex, duration, which
regions moved), which is a geometric measurement rather than a learned label
and needs no training data at all.

The 0.5 s cap is not a tuning knob: it is the definition. A facial movement
lasting longer than that is an ordinary expression, and this branch explicitly
stops calling it a micro-expression.

Per-candidate baselining, again
-------------------------------
Some people are simply more animated. The spike score is a *ratio* against this
candidate's own recent stillness, so "moving more than usual for this person"
is what fires — not "moving more than the average person". The trailing baseline
also skips the most recent ~0.33 s so a spike can never inflate the baseline it
is being measured against and suppress itself.

The blink veto
--------------
Blinks are the largest, most frequent motion on any face, and they are not
expressions. An event whose motion is dominated by the eye regions while the
lid aperture dips is rejected. Without this the branch mostly counts blinking.

On the supervised stress label — read `evaluate_stress.py` before trusting it
-------------------------------------------------------------------------------
This corpus's stress labels are severely confounded with subject identity: 9 of
29 people carry exactly one stress class across every frame they contribute. A
classifier trained on them can score well by recognising the person. The event
statistics below are geometric and do not depend on those labels; the learned
classifier is kept separate, and is reported with an explicit subject-disjoint
control rather than presented as a working stress detector.
"""

import math
from collections import deque

import numpy as np

import config as C

# Regions whose motion is expression rather than gaze. Eye regions still get
# measured, but only to decide whether an event is a blink.
EXPRESSION_REGIONS = [r for r in C.FACE_REGIONS]
EYE_MOTION_REGIONS = ["L_eye", "R_eye", "L_iris", "R_iris"]


class MicroExpressionSpotter:
    """Causal spotter over the region-geometry stream. No learned parameters.

    Feed `update(geom, ear, t)` once per 30 Hz step, where `geom` is the
    {region: (xc, yc, w, h)} dict from features.face_geometry (already
    inter-ocular normalised). Returns an event dict on the step an event ends,
    otherwise None.
    """

    def __init__(self, fps=C.TARGET_FPS, on_ratio=2.0, off_ratio=1.3,
                 baseline_s=2.0, gap_s=0.33, min_steps=2,
                 max_dur_s=C.MICRO_WINDOW_S, refractory_s=0.3,
                 blink_share=0.60):
        self.fps = fps
        self.dt = 1.0 / fps
        self.on_ratio, self.off_ratio = on_ratio, off_ratio
        self.min_steps = min_steps
        self.max_steps = max(1, int(round(max_dur_s * fps)))
        self.refractory = max(1, int(round(refractory_s * fps)))
        self.blink_share = blink_share

        self.gap = max(1, int(round(gap_s * fps)))
        self.hist = deque(maxlen=int(round(baseline_s * fps)) + self.gap)
        self.ear_hist = deque(maxlen=self.gap * 2 + 1)

        self._prev = None
        self._active = None
        self._cool = 0
        self.t = 0.0
        self.step = 0

    # -- motion -------------------------------------------------------------
    def _velocities(self, geom):
        """Per-region speed in inter-ocular-distances per second.

        The median displacement across all regions is subtracted first: that
        component is rigid head movement, which is pose, not expression. On a
        held-still corpus it is near zero, but on real interview footage where
        the candidate shifts in their chair it is most of the raw signal.
        """
        if self._prev is None:
            return None
        common = [r for r in geom if r in self._prev]
        if len(common) < 3:
            return None
        d = {r: (geom[r][0] - self._prev[r][0], geom[r][1] - self._prev[r][1])
             for r in common}
        mdx = float(np.median([v[0] for v in d.values()]))
        mdy = float(np.median([v[1] for v in d.values()]))
        return {r: math.hypot(v[0] - mdx, v[1] - mdy) / self.dt
                for r, v in d.items()}

    def update(self, geom, ear=None, t=None):
        self.step += 1
        self.t = self.step * self.dt if t is None else t
        if ear is not None:
            self.ear_hist.append(ear)

        vel = self._velocities(geom) if geom else None
        self._prev = dict(geom) if geom else self._prev
        if vel is None:
            return None

        expr = sorted((vel[r] for r in EXPRESSION_REGIONS if r in vel),
                      reverse=True)
        if not expr:
            return None
        # top-3 mean: a micro-expression engages a few adjacent regions, so this
        # is sensitive to a localised movement while ignoring one jittery box
        m = float(np.mean(expr[:3]))
        eye_vals = [vel[r] for r in EYE_MOTION_REGIONS if r in vel]
        eye_m = float(np.mean(eye_vals)) if eye_vals else 0.0

        self.hist.append((m, eye_m))
        if self._cool > 0:
            self._cool -= 1
            return None

        # baseline over the trailing window, excluding the most recent `gap`
        # steps so the present spike is not part of its own reference
        if len(self.hist) <= self.gap + 4:
            return None
        base = float(np.median([x[0] for x in list(self.hist)[:-self.gap]]))
        s = m / (base + 1e-9)

        if self._active is None:
            if s >= self.on_ratio:
                self._active = {"t_onset": self.t, "n": 1, "peak": m,
                                "t_apex": self.t, "sum_eye": eye_m, "sum_m": m,
                                "peak_s": s, "regions": {}}
                self._accumulate(vel)
            return None

        ev = self._active
        ev["n"] += 1
        ev["sum_eye"] += eye_m
        ev["sum_m"] += m
        ev["peak_s"] = max(ev["peak_s"], s)
        self._accumulate(vel)
        if m > ev["peak"]:
            ev["peak"], ev["t_apex"] = m, self.t

        ended = s <= self.off_ratio or ev["n"] >= self.max_steps
        if not ended:
            return None

        self._active = None
        self._cool = self.refractory
        if ev["n"] < self.min_steps:
            return None
        return self._finalise(ev)

    def _accumulate(self, vel):
        for r in EXPRESSION_REGIONS:
            if r in vel:
                self._active["regions"][r] = \
                    self._active["regions"].get(r, 0.0) + vel[r]

    def _finalise(self, ev):
        dur = ev["n"] / self.fps
        eye_share = ev["sum_eye"] / (ev["sum_eye"] + ev["sum_m"] + 1e-9)

        # blink veto: eye-dominated motion with a lid dip in the same moment
        ear_dip = False
        if len(self.ear_hist) >= 3:
            e = list(self.ear_hist)
            ear_dip = min(e) < 0.8 * float(np.median(e))
        if eye_share > self.blink_share and ear_dip:
            return None

        top = sorted(ev["regions"].items(), key=lambda kv: -kv[1])[:3]
        return {
            "t_onset": round(ev["t_onset"], 3),
            "t_apex": round(ev["t_apex"], 3),
            "duration_s": round(dur, 3),
            "amplitude": round(ev["peak"], 5),
            "spike_ratio": round(ev["peak_s"], 3),
            "regions": [r for r, _ in top],
            "is_micro": dur <= C.MICRO_WINDOW_S,   # the definitional gate
        }


class StressIndicator:
    """'Stress indicators — nervousness spikes detected?'

    Turns the event stream into a rolling arousal read: how frequently brief
    facial bursts are firing right now, relative to how often this candidate
    fires them at rest. Rate is the signal — an isolated twitch is noise, a
    cluster is what 'nervousness spike' actually describes.
    """

    def __init__(self, fps=C.TARGET_FPS, window_s=C.FUSION_WINDOW_S,
                 rate_thr=1.2):
        self.window_s = window_s
        self.events = deque()
        self.rate_thr = rate_thr
        self.t = 0.0
        self._rates = deque(maxlen=int(round(60 * 1.0)))   # ~1 min of history

    def update(self, t, event=None):
        self.t = t
        if event is not None and event.get("is_micro"):
            self.events.append(event)
        while self.events and t - self.events[0]["t_onset"] > self.window_s:
            self.events.popleft()

        rate = len(self.events) / self.window_s * 60.0     # events per minute
        self._rates.append(rate)
        rest = float(np.median(self._rates)) if len(self._rates) > 10 else 0.0
        amp = float(np.mean([e["amplitude"] for e in self.events])) \
            if self.events else 0.0

        return {
            "n_events_window": len(self.events),
            "events_per_min": round(rate, 2),
            "baseline_per_min": round(rest, 2),
            "mean_amplitude": round(amp, 5),
            "spike": rate > max(self.rate_thr * rest, 1e-9) and len(self.events) >= 2,
            "regions": sorted({r for e in self.events for r in e["regions"]}),
        }
