"""Fusion layer -> Deception indicator (bottom of the architecture).

  Fusion layer         combines the gaze-pattern read and the stress-indicator
                       read into one behavioural state, once per second.
  Deception indicator  a time-stamped behavioural log — every state change,
                       with the evidence that caused it.

What this layer is allowed to claim, and what it is not
--------------------------------------------------------
It emits a BEHAVIOURAL OBSERVATION, never a determination of truthfulness.
Gaze aversion and facial tension are correlates of cognitive load, discomfort,
shyness, cultural norms around eye contact, and thinking hard about a difficult
question — all far more common in an interview than deception. The output is
therefore framed as "these moments are worth a human reviewing", and the log is
built so a reviewer can jump to the timestamp and judge for themselves. Nothing
in this module outputs a probability of lying, and it should not be extended to.

Weighting reflects what each branch has actually been shown to measure
----------------------------------------------------------------------
The two inputs are not equally trustworthy on this data, so they are not
weighted equally:

  * The gaze branch is validated: its classes are checked against independently
    derived labels, and it drives the verdict.
  * The micro-expression branch's *spotter* is geometric and trustworthy, but a
    supervised stress class on this corpus is confounded with subject identity.
    So the stress read may only ESCALATE a state that gaze has already raised —
    it can never create one alone. `require_gaze` enforces this in code rather
    than leaving it to convention.

Raising `stress_weight` above 0 is the single documented knob to turn once a
stress model has been validated on real interview footage.

Hysteresis, and why entering is fast but leaving is slow
--------------------------------------------------------
Entering a flagged state is immediate; leaving it requires several seconds of
calm. In a live monitoring UI a flag that flickers on and off is worse than one
that lingers — it trains the reviewer to ignore it.
"""

import json
import time
from collections import deque

import config as C

VERDICTS = C.VERDICT_STATES        # single source of truth lives in config


class FusionLayer:
    """Combines both branches into a verdict + a reviewable flag."""

    def __init__(self, fps=C.TARGET_FPS, verdict_hz=C.VERDICT_HZ,
                 away_thr=0.45, contact_thr=0.80,
                 require_gaze=True, stress_weight=0.0,
                 hold_s=5.0, co_occur_s=1.5):
        self.fps = fps
        self.every = max(1, int(round(fps / verdict_hz)))
        self.away_thr, self.contact_thr = away_thr, contact_thr
        self.require_gaze = require_gaze
        self.stress_weight = stress_weight
        self.hold = hold_s
        self.co_occur = co_occur_s

        self.state = "Calibrating"
        self._pending, self._pending_n = None, 0
        self._last_elevated = -1e9
        self._last_stress_spike = -1e9
        self._last_gaze_away = -1e9
        self.flag_until = -1e9
        self.step = 0

    def update(self, t, gaze_pattern, stress_state, calibrating=False):
        """Call every frame. Returns a verdict dict on verdict ticks, else None."""
        self.step += 1

        if stress_state and stress_state.get("spike"):
            self._last_stress_spike = t
        if gaze_pattern and gaze_pattern.get("looking_away"):
            self._last_gaze_away = t

        # 'Worth a look': a nervousness spike CO-OCCURRING with gaze aversion.
        # Either alone is ordinary; the conjunction is the weaker-but-real
        # signal, and requiring gaze keeps the unvalidated branch from firing
        # the flag on its own.
        if (t - self._last_stress_spike) <= self.co_occur:
            gaze_ok = (t - self._last_gaze_away) <= self.co_occur
            if gaze_ok or (not self.require_gaze and self.stress_weight > 0):
                self.flag_until = t + self.hold

        if self.step % self.every:
            return None

        if calibrating or gaze_pattern is None:
            self.state = "Calibrating"
            return self._emit(t, gaze_pattern, stress_state)

        away = gaze_pattern["frac_away"]
        contact = gaze_pattern["frac_contact"]

        if away >= self.away_thr:
            target = "Suspicious"
            self._last_elevated = t
        elif (t - self._last_elevated) <= self.hold:
            target = "Suspicious"                      # hysteresis: leave slowly
        elif contact >= self.contact_thr and away <= 0.20:
            target = "Engaged"
        else:
            target = "Neutral"

        if target == "Suspicious" or self.state in ("Calibrating",):
            self.state = target                      # enter immediately
        elif target != self.state:
            # non-escalating changes need two consecutive ticks to commit
            if self._pending == target:
                self._pending_n += 1
                if self._pending_n >= 2:
                    self.state, self._pending, self._pending_n = target, None, 0
            else:
                self._pending, self._pending_n = target, 1
        else:
            self._pending, self._pending_n = None, 0

        return self._emit(t, gaze_pattern, stress_state)

    def _emit(self, t, gp, ss):
        return {
            "t": round(t, 2),
            "state": self.state,
            "review_flag": t <= self.flag_until,
            "gaze": None if gp is None else {
                "frac_contact": round(gp["frac_contact"], 3),
                "frac_averted": round(gp["frac_averted"], 3),
                "frac_closed": round(gp["frac_closed"], 3),
                "aversion_run_s": round(gp["aversion_run_s"], 2),
            },
            "stress": None if ss is None else {
                "events_per_min": ss["events_per_min"],
                "baseline_per_min": ss["baseline_per_min"],
                "spike": ss["spike"],
                "regions": ss["regions"],
            },
        }


class BehaviouralLog:
    """The 'time-stamped behavioural log' the architecture terminates in.

    Records STATE CHANGES and flagged moments rather than every tick — an
    hour-long interview at 1 Hz is 3,600 rows of mostly nothing, which nobody
    reads. What lands here is what a reviewer would scrub to.
    """

    def __init__(self, session_id=None):
        self.session_id = session_id or time.strftime("%Y%m%d-%H%M%S")
        self.entries = []
        self._state = None
        self._flag = False
        self.ticks = 0
        # Per-tick accumulators. The entries list holds only CHANGES, so
        # durations cannot be recovered from it after the fact — a session that
        # enters Suspicious once and stays there for a minute logs one entry.
        # The session summary needs time, so it is counted as it happens.
        self._state_ticks = {}
        self._flag_ticks = 0
        self._susp_run = 0
        self._susp_run_max = 0
        self._aversion_run_max = 0.0
        self._closed_sum = 0.0
        self._gaze_ticks = 0
        self._t_first = None
        self._t_last = None

    def observe(self, verdict):
        if verdict is None:
            return None
        self.ticks += 1
        entries = []

        st = verdict["state"]
        self._state_ticks[st] = self._state_ticks.get(st, 0) + 1
        self._flag_ticks += bool(verdict["review_flag"])
        self._susp_run = self._susp_run + 1 if st == "Suspicious" else 0
        self._susp_run_max = max(self._susp_run_max, self._susp_run)
        if verdict.get("gaze"):
            self._gaze_ticks += 1
            self._closed_sum += verdict["gaze"]["frac_closed"]
            self._aversion_run_max = max(self._aversion_run_max,
                                         verdict["gaze"]["aversion_run_s"])
        if self._t_first is None:
            self._t_first = verdict["t"]
        self._t_last = verdict["t"]

        # A flag raised on the same tick as a state change used to be swallowed
        # by the elif below, so the summary could report zero flags while an
        # entry plainly showed REVIEW. Both are recorded independently now:
        # they are different facts and a reviewer needs both.
        if verdict["state"] != self._state:
            entries.append({**verdict, "event": "state_change",
                            "from": self._state, "to": verdict["state"]})
            self._state = verdict["state"]
        if verdict["review_flag"] and not self._flag:
            entries.append({**verdict, "event": "review_flag_raised"})

        self._flag = verdict["review_flag"]
        self.entries.extend(entries)
        return entries[0] if entries else None

    def session(self):
        """Whole-session aggregate plus a review priority.

        `Calibrating` ticks are excluded from every denominator. They are dead
        time in which the engine refuses to judge anyone, and on short clips
        they are 20-30% of the session — leaving them in would dilute a genuine
        signal exactly when there is least footage to find it in.

        The priority is a REPORTING CONVENTION, not a measurement: see the note
        on `config.REVIEW_BANDS`. It says how much of this footage deserves a
        reviewer's attention, never whether the person did anything.
        """
        n_flags = sum(1 for e in self.entries
                      if e["event"] == "review_flag_raised")
        judged = self.ticks - self._state_ticks.get("Calibrating", 0)
        elapsed_s = 0.0 if self._t_first is None else self._t_last - self._t_first

        # Seconds per tick is MEASURED, not assumed to be 1/VERDICT_HZ. The
        # fusion layer emits every round(fps / verdict_hz) frames using the
        # configured TARGET_FPS (30), so on 24 fps footage a tick is really
        # 1.25 s. Assuming 1 Hz under-reported every duration by 20% and
        # inflated flags/min by the same factor.
        per_s = (elapsed_s / (self.ticks - 1)) if self.ticks > 1 \
            else 1.0 / C.VERDICT_HZ
        analysed_s = judged * per_s

        out = {
            "analysed_s": round(analysed_s, 1),
            "elapsed_s": round(elapsed_s, 1),
            "calibrating_s": round(self._state_ticks.get("Calibrating", 0) * per_s, 1),
            "state_fractions": {k: round(v / judged, 3)
                                for k, v in sorted(self._state_ticks.items())
                                if k != "Calibrating"} if judged else {},
            "longest_suspicious_span_s": round(self._susp_run_max * per_s, 1),
            "longest_aversion_run_s": round(self._aversion_run_max, 1),
            "mean_frac_closed": round(self._closed_sum / self._gaze_ticks, 3)
                                if self._gaze_ticks else 0.0,
            "n_flags": n_flags,
            "flags_per_min": round(60.0 * n_flags / analysed_s, 2) if analysed_s else 0.0,
            "review_moments_s": [e["t"] for e in self.entries
                                 if e["event"] == "review_flag_raised"],
        }

        # Too little judged footage to say anything. Reporting Low here would
        # read as "nothing found" when the truth is "nothing was looked at".
        if analysed_s < C.REVIEW_MIN_ANALYSED_S:
            out["review_priority"] = "Insufficient"
            out["priority_reasons"] = [
                f"only {analysed_s:.0f}s of judged footage "
                f"(need {C.REVIEW_MIN_ANALYSED_S:.0f}s)"]
            return out

        susp_frac = out["state_fractions"].get("Suspicious", 0.0)
        band, reasons = C.REVIEW_DEFAULT_BAND, []
        for name, span_thr, rate_thr, frac_thr in C.REVIEW_BANDS:
            hits = []
            if out["longest_suspicious_span_s"] >= span_thr:
                hits.append(f"sustained aversion {out['longest_suspicious_span_s']:.0f}s "
                            f"(>= {span_thr:.0f}s)")
            if out["flags_per_min"] >= rate_thr:
                hits.append(f"{out['flags_per_min']:.1f} flags/min (>= {rate_thr})")
            if susp_frac >= frac_thr:
                hits.append(f"Suspicious {100*susp_frac:.0f}% of analysed time "
                            f"(>= {100*frac_thr:.0f}%)")
            if hits:                       # bands are ordered high to low
                band, reasons = name, hits
                break
        out["review_priority"] = band
        out["priority_reasons"] = reasons or ["no threshold met"]
        return out

    def summary(self):
        states = [e["to"] for e in self.entries if e["event"] == "state_change"]
        return {
            "session_id": self.session_id,
            "ticks": self.ticks,
            "n_entries": len(self.entries),
            "n_flags": sum(1 for e in self.entries
                           if e["event"] == "review_flag_raised"),
            "state_sequence": states,
            "session": self.session(),
            "disclaimer": (
                "Behavioural observations only. Gaze aversion and facial "
                "tension indicate cognitive load or discomfort, not deception. "
                "Flags mark moments for human review; they are not findings. "
                "The review priority ranks footage for attention; it is not a "
                "judgement about the person and was not validated against any "
                "ground truth."
            ),
        }

    def save(self, path=None):
        path = path or (C.REPORTS / f"behavioural_log_{self.session_id}.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(
            {"summary": self.summary(), "entries": self.entries}, indent=2),
            encoding="utf-8")
        return path


# --------------------------------------------------------------------------
def _selftest():
    """Behavioural checks on the logic itself — these do not need a model."""
    fl = FusionLayer(fps=30, verdict_hz=1.0)
    gp_away = {"frac_away": 0.9, "frac_contact": 0.05, "frac_averted": 0.9,
               "frac_closed": 0.0, "aversion_run_s": 2.0, "looking_away": True}
    gp_calm = {"frac_away": 0.0, "frac_contact": 1.0, "frac_averted": 0.0,
               "frac_closed": 0.0, "aversion_run_s": 0.0, "looking_away": False}
    quiet = {"events_per_min": 0, "baseline_per_min": 0, "spike": False,
             "regions": [], "n_events_window": 0, "mean_amplitude": 0}
    spike = {**quiet, "spike": True, "events_per_min": 8}

    # aversion escalates immediately
    v = None
    for i in range(30):
        v = fl.update(i / 30, gp_away, quiet) or v
    assert v["state"] == "Suspicious", v

    # and does NOT drop the moment gaze returns (hysteresis)
    for i in range(30, 90):
        v = fl.update(i / 30, gp_calm, quiet) or v
    assert v["state"] == "Suspicious", f"left Suspicious too fast: {v}"

    # after the hold expires it settles back down
    for i in range(90, 400):
        v = fl.update(i / 30, gp_calm, quiet) or v
    assert v["state"] == "Engaged", v

    # stress alone must NOT raise the review flag
    fl2 = FusionLayer(fps=30, verdict_hz=1.0)
    v2 = None
    for i in range(120):
        v2 = fl2.update(i / 30, gp_calm, spike) or v2
    assert not v2["review_flag"], "stress fired the flag without gaze support"

    # stress CO-OCCURRING with aversion does raise it
    fl3 = FusionLayer(fps=30, verdict_hz=1.0)
    v3 = None
    for i in range(120):
        v3 = fl3.update(i / 30, gp_away, spike) or v3
    assert v3["review_flag"], "co-occurrence failed to raise the flag"

    # the log records changes, not every tick
    log = BehaviouralLog("selftest")
    fl4 = FusionLayer(fps=30, verdict_hz=1.0)
    for i in range(600):
        gp = gp_away if 150 <= i < 300 else gp_calm
        log.observe(fl4.update(i / 30, gp, quiet))
    assert log.ticks == 20, log.ticks
    assert 0 < len(log.entries) < 10, log.entries

    # --- session aggregate ------------------------------------------------
    sess = log.session()
    assert sess["longest_suspicious_span_s"] > 0, sess

    # under REVIEW_MIN_ANALYSED_S it must refuse to band rather than report
    # Low — "nothing was looked at" is not "nothing was found".
    short = BehaviouralLog("short")
    fl_s = FusionLayer(fps=30, verdict_hz=1.0)
    for i in range(30 * 10):
        short.observe(fl_s.update(i / 30, gp_calm, quiet))
    s_short = short.session()
    assert s_short["review_priority"] == "Insufficient", s_short
    assert s_short["analysed_s"] < C.REVIEW_MIN_ANALYSED_S, s_short

    # a long calm session bands Low, and Calibrating is out of the denominator
    calm = BehaviouralLog("calm")
    fl5 = FusionLayer(fps=30, verdict_hz=1.0)
    for i in range(30 * 120):
        calm.observe(fl5.update(i / 30, gp_calm, quiet))
    s5 = calm.session()
    assert s5["review_priority"] == "Low", s5
    assert s5["n_flags"] == 0 and s5["longest_suspicious_span_s"] == 0.0, s5
    assert "Calibrating" not in s5["state_fractions"], s5
    assert abs(sum(s5["state_fractions"].values()) - 1.0) < 1e-6, s5
    # durations must account for the whole session, whatever the tick spacing
    assert abs(s5["analysed_s"] + s5["calibrating_s"] - s5["elapsed_s"]) \
        <= 2 * s5["elapsed_s"] / max(calm.ticks - 1, 1), s5

    # sustained aversion across a long session bands High
    hot = BehaviouralLog("hot")
    fl6 = FusionLayer(fps=30, verdict_hz=1.0)
    for i in range(30 * 120):
        hot.observe(fl6.update(i / 30, gp_away, spike))
    s6 = hot.session()
    assert s6["review_priority"] == "High", s6
    assert s6["priority_reasons"], s6
    assert s6["longest_suspicious_span_s"] >= 15.0, s6
    # every flagged moment must be recoverable as a timestamp to scrub to
    assert len(s6["review_moments_s"]) == s6["n_flags"], s6

    print(f"fusion self-test: OK ({len(log.entries)} log entries from "
          f"{log.ticks} ticks)")
    print("  states:", " -> ".join(log.summary()["state_sequence"]))
    print(f"  session bands: calm={s5['review_priority']} "
          f"hot={s6['review_priority']} short={s_short['review_priority']}")


if __name__ == "__main__":
    _selftest()
