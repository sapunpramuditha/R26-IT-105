"""Main entry point — run the analysis on a live camera or a video file.

    python main.py                              # default webcam
    python main.py --camera 1                   # a specific camera
    python main.py --video /path/to/interview.mp4
    python main.py --video interview.mp4 --save annotated.mp4
    python main.py --video interview.mp4 --show  # live preview window

Exactly one source is used. `--video` wins if both are given, because naming a
file is the more specific instruction.

What it writes
--------------
A time-stamped behavioural log under ../reports/, and optionally an annotated
video. The log records state CHANGES rather than every second: an hour at 1 Hz
would be 3,600 near-identical rows, and the point of the log is to give a
reviewer timestamps worth jumping to.

Timing is taken from the source, not assumed
--------------------------------------------
For a video file, timestamps come from the file's own frame rate, so a 25 fps
or 60 fps recording is analysed on its true timeline. For a live camera the
wall clock is used, so if the machine cannot keep up the analysis slows down
honestly instead of pretending no time passed between frames.
"""

import argparse
import signal
import sys
import time
from pathlib import Path

import config as C
from pipeline import InterviewPipeline, annotate, resolve_runtime

_STOP = False


def _on_sigint(_sig, _frm):
    """Ctrl-C should finish the session and save the log, not lose it."""
    global _STOP
    if _STOP:                       # second Ctrl-C: give up immediately
        sys.exit(1)
    _STOP = True
    print("\n  stopping… (Ctrl-C again to abort without saving)", flush=True)


def open_source(args):
    """Returns (capture, total_frames, fps, label)."""
    import cv2

    if args.video:
        path = Path(args.video).expanduser()
        if not path.exists():
            sys.exit(f"error: no such video file: {path}")
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            sys.exit(f"error: could not open video: {path}\n"
                     "       the file may be corrupt or use an unsupported codec")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        fps = cap.get(cv2.CAP_PROP_FPS) or C.TARGET_FPS
        return cap, total, fps, path.name

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        sys.exit(f"error: could not open camera {args.camera}\n"
                 "       close any app already using it (Zoom, Teams, …), or\n"
                 "       try a different index: --camera 1")
    return cap, 0, cap.get(cv2.CAP_PROP_FPS) or C.TARGET_FPS, f"camera {args.camera}"


def main():
    ap = argparse.ArgumentParser(
        description="Analyse interview footage from a camera or a video file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("What it writes")[0].split("\n", 2)[2])
    src = ap.add_argument_group("source (pick one)")
    src.add_argument("--video", metavar="PATH", help="path to a video file")
    src.add_argument("--camera", type=int, default=0, metavar="N",
                     help="camera index (default: 0)")

    out = ap.add_argument_group("output")
    out.add_argument("--save", metavar="PATH", help="write an annotated video")
    out.add_argument("--show", action="store_true", help="live preview window")
    out.add_argument("--session", metavar="ID", help="name for the log file")
    out.add_argument("--quiet", action="store_true", help="only print the summary")

    cfg = ap.add_argument_group("runtime")
    cfg.add_argument("--model", default=None, help="override the detector")
    cfg.add_argument("--device", default="auto", help="auto | 0 | cpu")
    cfg.add_argument("--imgsz", type=int, default=640,
                     help="inference size; below 512 accuracy drops sharply")
    cfg.add_argument("--max-frames", type=int, default=0, metavar="N",
                     help="stop after N frames")
    args = ap.parse_args()

    import cv2
    signal.signal(signal.SIGINT, _on_sigint)

    if args.imgsz < 512:
        print(f"  warning: imgsz={args.imgsz} is below 512, where detection "
              f"accuracy falls sharply (mAP50 0.99 -> 0.58 at 320).")

    cap, total, src_fps, label = open_source(args)
    model_path, device = resolve_runtime(args.model, args.device, args.imgsz)
    live = args.video is None

    session = args.session or (Path(args.video).stem if args.video
                               else time.strftime("live-%Y%m%d-%H%M%S"))
    pipe = InterviewPipeline(model=args.model, imgsz=args.imgsz,
                             device=args.device, session_id=session)

    print(f"  source   : {label}" + (f"  ({total} frames @ {src_fps:.0f} fps)"
                                     if total else ""))
    print(f"  detector : {Path(model_path).name}  on {device}")
    print(f"  session  : {session}")
    print(f"\n  Calibrating for the first ~{C.GAZE_CALIB_S:.0f}s — the system "
          f"learns this person's\n  normal before judging anything.\n")

    writer, n, t_start = None, 0, time.perf_counter()
    try:
        while not _STOP:
            ok, frame = cap.read()
            if not ok:
                break

            # file: the recording's own timeline. camera: the wall clock, so
            # dropped frames slow the analysis rather than corrupting it.
            t = (n / src_fps) if not live else (time.perf_counter() - t_start)
            st = pipe.step(frame, t)
            n += 1

            if st["log_entry"] and not args.quiet:
                e = st["log_entry"]
                flag = "  ** REVIEW **" if e["review_flag"] else ""
                print(f"  [{e['t']:>8.2f}s]  {e['state']:<12}{flag}")

            if args.save or args.show:
                vis = annotate(frame, st)
                if args.save:
                    if writer is None:
                        h, w = vis.shape[:2]
                        writer = cv2.VideoWriter(
                            args.save, cv2.VideoWriter_fourcc(*"mp4v"),
                            src_fps if not live else C.TARGET_FPS, (w, h))
                    writer.write(vis)
                if args.show:
                    cv2.imshow("interview_ai  —  press q to stop", vis)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

            if not args.quiet and total and n % 200 == 0:
                print(f"    … {n}/{total} frames ({n/total:.0%})", flush=True)
            if args.max_frames and n >= args.max_frames:
                break
    finally:
        cap.release()
        if writer:
            writer.release()
        if args.show:
            cv2.destroyAllWindows()

    elapsed = time.perf_counter() - t_start
    log_path = pipe.log.save()
    s = pipe.log.summary()

    ss = s["session"]
    print(f"\n  {'-' * 58}")
    print(f"  processed      {n} frames in {elapsed:.1f}s "
          f"({n / max(elapsed, 1e-9):.1f} fps)")
    print(f"  REVIEW PRIORITY  {ss['review_priority'].upper()}")
    for why in ss["priority_reasons"]:
        print(f"                   - {why}")
    print(f"  analysed       {ss['analysed_s']:.0f}s of {ss['elapsed_s']:.0f}s "
          f"({ss['calibrating_s']:.0f}s calibrating)")
    if ss["state_fractions"]:
        print("  time in state  " + "  ".join(
            f"{k} {100*v:.0f}%" for k, v in ss["state_fractions"].items()))
    print(f"  longest span   {ss['longest_suspicious_span_s']:.0f}s sustained")
    print(f"  review flags   {ss['n_flags']} ({ss['flags_per_min']:.1f}/min)")
    if ss["review_moments_s"]:
        print("  moments        " + ", ".join(
            f"{t:.0f}s" for t in ss["review_moments_s"][:12]))
    print(f"  log            {log_path}")
    if args.save:
        print(f"  video          {args.save}")
    print(f"  {'-' * 58}")
    print("  Behavioural observations only — these are cues for a human to\n"
          "  review, not evidence about truthfulness.")


if __name__ == "__main__":
    main()
