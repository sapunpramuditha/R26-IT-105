"""Streamlit interface — live camera or a video file, in a browser.

    streamlit run app.py

Two sources, one analysis path
------------------------------
The camera and the file mode feed the same `InterviewPipeline`, so what you see
here is what `main.py` produces; this is a front end, not a second
implementation.

On the camera mode
------------------
It reads the camera attached to the machine running this script. That is the
right model for a laptop, and the wrong one for a shared server — there, the
"camera" would be the server's, not the viewer's. For remote use, deploy with
`streamlit-webrtc`, which streams the browser's camera to the server instead.
This is stated rather than silently assumed, because the failure looks like a
bug ("it shows someone else's webcam") when it is really a deployment choice.
"""

import json
import tempfile
import time
from pathlib import Path

import numpy as np
import streamlit as st

import config as C

st.set_page_config(page_title="interview_ai", page_icon="🎥", layout="wide")

STATE_STYLE = {
    "Calibrating": ("#9aa0a6", "learning this person's normal"),
    "Engaged":     ("#1e8e3e", "steady eye contact"),
    "Neutral":     ("#5f6368", "neither engaged nor looking away"),
    "Suspicious":  ("#e8710a", "substantial time looking away"),
}


@st.cache_resource(show_spinner="Loading detector…")
def load_pipeline_class():
    """Import once; Ultralytics is slow to import and heavy to reload."""
    from pipeline import InterviewPipeline, annotate, resolve_runtime
    import features as _features  # cached with pipeline so fallback edits reload
    return InterviewPipeline, annotate, resolve_runtime


def draw_header():
    st.title("Interview behaviour analysis")
    st.caption(
        "Watches where a candidate looks and how their face moves, and logs "
        "moments a human may want to rewatch."
    )
    st.warning(
        "**This does not detect deception.** It measures gaze direction and "
        "facial motion — both driven far more often by concentration, ordinary "
        "interview nerves, shyness, neurotype, or cultural norms around eye "
        "contact than by dishonesty. In the data this was built on, people "
        "looking away were **no more likely** to be under stress than people "
        "making eye contact. Use it to help a person find moments worth "
        "reviewing; never to judge truthfulness or to decide about a candidate.",
        icon="⚠️",
    )


def sidebar():
    st.sidebar.header("Source")
    mode = st.sidebar.radio(
        "Analyse", ["Video file", "Live camera"], key="mode",
        captions=["Upload a recording, or give a path",
                  "The camera on the machine running this app"])

    src = {"mode": mode}
    if mode == "Video file":
        up = st.sidebar.file_uploader("Upload a video",
                                      type=["mp4", "mov", "avi", "mkv", "webm"])
        st.sidebar.caption("or give a path on this machine")
        path = st.sidebar.text_input("Video path", placeholder="/path/to/interview.mp4")
        src["upload"], src["path"] = up, path.strip()
    else:
        src["camera"] = st.sidebar.number_input("Camera index", 0, 8, 0, step=1)
        src["seconds"] = st.sidebar.slider("Record for (seconds)", 5, 300, 30, 5)

    st.sidebar.header("Settings")
    src["device"] = st.sidebar.selectbox(
        "Hardware", ["auto", "cpu", "0"],
        help="auto uses the GPU when present, otherwise the OpenVINO CPU build")
    src["imgsz"] = st.sidebar.select_slider(
        "Detail", [512, 576, 640], value=640,
        help="Below 512 accuracy falls sharply, so it is not offered.")
    src["show_every"] = st.sidebar.slider(
        "Refresh preview every N frames", 1, 10, 2,
        help="Higher is faster: drawing to the browser is the slow part.")
    return src


def metrics_row(state, holders):
    v = state.get("display_verdict") or {}
    name = v.get("state", "Calibrating")
    colour, meaning = STATE_STYLE.get(name, ("#5f6368", ""))

    holders["state"].markdown(
        f"<div style='padding:14px;border-radius:10px;background:{colour};"
        f"color:white'><div style='font-size:0.8rem;opacity:.85'>STATE</div>"
        f"<div style='font-size:1.6rem;font-weight:600'>{name}</div>"
        f"<div style='font-size:0.8rem;opacity:.85'>{meaning}</div></div>",
        unsafe_allow_html=True)

    gaze = state.get("gaze") or "—"
    holders["gaze"].metric("Gaze", gaze.replace("_", " ") if gaze != "—" else "calibrating")

    ss = state.get("stress") or {}
    # The delta appears only while the spotter is firing above this person's
    # own resting rate. It reports movement, never a stress class.
    holders["events"].metric(
        "Facial events / min", f"{ss.get('events_per_min', 0):.0f}",
        delta=(f"spike — rest {ss.get('baseline_per_min', 0):.0f}"
               if ss.get("spike") else None),
        delta_color="inverse")
    holders["flag"].metric("Review flag", "YES" if v.get("review_flag") else "no")


def run_session(frames_iter, total, fps, session_id, cfg):
    """Shared runner for both sources. `frames_iter` yields BGR frames."""
    import cv2
    InterviewPipeline, annotate, _resolve = load_pipeline_class()

    pipe = InterviewPipeline(imgsz=cfg["imgsz"], device=cfg["device"],
                             session_id=session_id)

    left, right = st.columns([3, 2], gap="large")
    with left:
        st.subheader("Preview")
        img_holder = st.empty()
        prog = st.progress(0.0) if total else None
    with right:
        st.subheader("Live readings")
        holders = {"state": st.empty()}
        c1, c2 = st.columns(2)
        holders["gaze"], holders["events"] = c1.empty(), c2.empty()
        c3, c4 = st.columns(2)
        holders["flag"], holders["fps"] = c3.empty(), c4.empty()
        st.subheader("Timeline")
        table_holder = st.empty()

    rows, n, t0 = [], 0, time.perf_counter()
    live = total == 0

    for frame in frames_iter:
        if frame is None:
            break
        t = (n / fps) if not live else (time.perf_counter() - t0)
        state = pipe.step(frame, t)
        n += 1

        if state["log_entry"]:
            e = state["log_entry"]
            rows.append({"time (s)": round(e["t"], 2), "state": e["state"],
                         "event": e["event"].replace("_", " "),
                         "review": "yes" if e["review_flag"] else ""})

        if n % cfg["show_every"] == 0 or state["log_entry"]:
            vis = annotate(frame, state)
            img_holder.image(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB),
                             width="stretch")
            metrics_row(state, holders)
            holders["fps"].metric("Speed", f"{n / max(time.perf_counter()-t0,1e-9):.0f} fps")
            if rows:
                table_holder.dataframe(rows[::-1], width="stretch",
                                       hide_index=True, height=240)
            if prog and total:
                prog.progress(min(n / total, 1.0))

        if st.session_state.get("stop"):
            break

    if prog:
        prog.progress(1.0)
    return pipe, n, time.perf_counter() - t0, rows


def frames_from_file(path):
    import cv2
    cap = cv2.VideoCapture(str(path))
    try:
        while True:
            ok, f = cap.read()
            if not ok:
                break
            yield f
    finally:
        cap.release()


def frames_from_camera(index, seconds):
    import cv2
    cap = cv2.VideoCapture(int(index))
    if not cap.isOpened():
        st.error(f"Could not open camera {index}. Close any app already using "
                 f"it (Zoom, Teams…), or try another index.")
        return
    deadline = time.perf_counter() + seconds
    try:
        while time.perf_counter() < deadline:
            ok, f = cap.read()
            if not ok:
                break
            yield f
    finally:
        cap.release()


def show_results(pipe, n, elapsed, rows):
    s = pipe.log.summary()
    path = pipe.log.save()

    st.success(f"Analysed {n} frames in {elapsed:.1f}s "
               f"({n/max(elapsed,1e-9):.1f} fps).")

    ss = s["session"]
    # Colour tracks attention required, not culpability — the band says how
    # much footage is worth watching, never anything about the person.
    band_col = {"High": "#e8710a", "Medium": "#f9ab00",
                "Low": "#1e8e3e", "Insufficient": "#5f6368"}
    st.markdown(
        f"<div style='padding:16px;border-radius:10px;"
        f"background:{band_col.get(ss['review_priority'], '#5f6368')};color:white'>"
        f"<div style='font-size:0.8rem;opacity:.85'>REVIEW PRIORITY</div>"
        f"<div style='font-size:1.8rem;font-weight:600'>{ss['review_priority']}</div>"
        f"<div style='font-size:0.85rem;opacity:.9'>"
        + "; ".join(ss["priority_reasons"]) + "</div></div>",
        unsafe_allow_html=True)
    st.caption("How much of this footage a person may want to watch. "
               "Not a judgement about the candidate.")

    a, b, c = st.columns(3)
    a.metric("Analysed", f"{ss['analysed_s']:.0f}s",
             delta=f"{ss['calibrating_s']:.0f}s calibrating", delta_color="off")
    b.metric("Longest sustained", f"{ss['longest_suspicious_span_s']:.0f}s")
    c.metric("Review flags", f"{ss['n_flags']}",
             delta=f"{ss['flags_per_min']:.1f}/min", delta_color="off")

    if ss["review_moments_s"]:
        st.write("**Moments to review:** " + " · ".join(
            f"`{t:.0f}s`" for t in ss["review_moments_s"][:12]))

    if s["n_flags"]:
        st.info("A review flag marks a moment where a brief facial movement "
                "coincided with looking away. It means **a person might want to "
                "watch this timestamp** — nothing more.", icon="🔎")

    if rows:
        st.subheader("Full timeline")
        st.dataframe(rows, width="stretch", hide_index=True)

    payload = json.dumps({"summary": s, "entries": pipe.log.entries}, indent=2)
    st.download_button("Download behavioural log (JSON)", payload,
                       file_name=Path(path).name, mime="application/json")
    with st.expander("What is in this log?"):
        st.markdown(
            "- `t` — seconds from the start; use it to jump to that moment\n"
            "- `state` — Calibrating / Engaged / Neutral / Suspicious\n"
            "- `review_flag` — a moment worth a human watching\n"
            "- `gaze` — fraction of the recent window spent in each gaze class\n"
            "- `stress` — rate of brief facial movements vs this person's own rest\n\n"
            "Only *changes* are recorded, not every second."
        )


def main():
    draw_header()
    cfg = sidebar()
    st.session_state.setdefault("stop", False)

    if cfg["mode"] == "Video file":
        path = None
        if cfg.get("upload") is not None:
            tmp = Path(tempfile.gettempdir()) / f"upload_{cfg['upload'].name}"
            tmp.write_bytes(cfg["upload"].getbuffer())
            path = tmp
        elif cfg.get("path"):
            path = Path(cfg["path"]).expanduser()
            if not path.exists():
                st.error(f"No such file: {path}")
                path = None

        if path is None:
            st.info("Upload a video, or type a path, to begin.", icon="⬆️")
            return

        import cv2
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            st.error("Could not open that video — it may be corrupt or use an "
                     "unsupported codec.")
            return
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        fps = cap.get(cv2.CAP_PROP_FPS) or C.TARGET_FPS
        cap.release()

        st.caption(f"**{path.name}** — {total} frames at {fps:.0f} fps "
                   f"({total/max(fps,1):.0f}s)")
        if st.button("Analyse video", type="primary"):
            st.session_state["stop"] = False
            pipe, n, el, rows = run_session(frames_from_file(path), total, fps,
                                            path.stem, cfg)
            show_results(pipe, n, el, rows)

    else:
        st.caption(f"Reads camera {cfg['camera']} **on the machine running this "
                   f"app**. For remote use, deploy with `streamlit-webrtc`.")
        st.info(f"The first ~{C.GAZE_CALIB_S:.0f} seconds report *Calibrating* "
                f"while the system learns this person's normal. Sit facing the "
                f"camera during that time.", icon="ℹ️")
        c1, c2 = st.columns([1, 4])
        start = c1.button("Start", type="primary")
        if c2.button("Stop"):
            st.session_state["stop"] = True
        if start:
            st.session_state["stop"] = False
            sid = time.strftime("live-%Y%m%d-%H%M%S")
            pipe, n, el, rows = run_session(
                frames_from_camera(cfg["camera"], cfg["seconds"]),
                0, C.TARGET_FPS, sid, cfg)
            show_results(pipe, n, el, rows)

    with st.sidebar:
        st.divider()
        st.caption("Docs: `docs/GUIDE.md` (beginners) · `docs/CODE.md` "
                   "(developers) · `docs/RESULTS.md` (metrics)")


if __name__ == "__main__":
    main()
