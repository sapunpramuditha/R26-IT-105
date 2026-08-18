"""
main.py
=======
Smart Recruiter — Unified Flask API
====================================
Single Flask application hosting all research components on one port.

Endpoints
---------
GET  /health                  Overall app health (all components)

Component 1 — Profile Analysis (Resume + GitHub + Skill Graph)
POST /profile/analyze         Resume PDF + GitHub username → competency score
GET  /profile/health          Component 1 status

Component 3 — Audio Analysis (Emotion Classification)
POST /audio/analyze           Audio file → anxiety/confident/hesitant/nervous scores
GET  /audio/health            Component 3 status

Component 4 — Eye Gaze & Focus Analysis
POST /gaze/analyze            Base64 image frame → gaze ratio, EAR, focus score
POST /gaze/session/reset      Clear session buffers (call before each candidate)
GET  /gaze/session/summary    Aggregated focus stats for the current session
GET  /gaze/health             Component 4 status
"""

import logging
import os

from flask import Flask, jsonify
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024   # 50 MB max upload

# ---------------------------------------------------------------------------
# Component 1 — Profile Analysis
# ---------------------------------------------------------------------------

logger.info("=" * 60)
logger.info("Smart Recruiter — Unified API starting …")
logger.info("=" * 60)

logger.info("[Component 1] Initialising profile analysis pipeline …")

from app.component1.pipeline import AnalysisPipeline
from app.component1.routes   import profile_bp, init_pipeline

pipeline = AnalysisPipeline()
init_pipeline(pipeline)

app.register_blueprint(profile_bp)
logger.info("[Component 1] Ready  →  /profile/analyze")

# ---------------------------------------------------------------------------
# Component 3 — Audio Analysis
# ---------------------------------------------------------------------------
# Model directory produced by trainer.save_model() in the training notebook.
# Download the folder from Google Drive and place it at:
#   models/wav2vec2_smart_recruiter/
# Required files inside that folder:
#   config.json  |  model.safetensors  |  preprocessor_config.json
# ---------------------------------------------------------------------------

logger.info("[Component 3] Loading audio models …")

from app.component3.routes import audio_bp, init_bundle

# Default: models/wav2vec2_smart_recruiter/ relative to this file.
# Override with env var AUDIO_MODEL_DIR if you want a different path.
AUDIO_MODEL_DIR = os.getenv(
    "AUDIO_MODEL_DIR",
    os.path.join(os.path.dirname(__file__), "models", "wav2vec2_smart_recruiter"),
)

audio_bundle = None
audio_error  = None

try:
    from app.component3.loader import load_models
    audio_bundle = load_models(AUDIO_MODEL_DIR)
    logger.info("[Component 3] Ready  →  /audio/analyze")
except FileNotFoundError as e:
    audio_error = str(e)
    logger.error("[Component 3] Model directory missing — /audio/analyze will return 503")
    logger.error("  → %s", audio_error)
except Exception as e:
    audio_error = str(e)
    logger.exception("[Component 3] Failed to load models: %s", e)

init_bundle(audio_bundle, audio_error)
app.register_blueprint(audio_bp)

# ---------------------------------------------------------------------------
# Component 4 — Eye Gaze & Focus Analysis
# ---------------------------------------------------------------------------

logger.info("[Component 4] Initialising eye gaze / focus analysis …")

gaze_error = None

try:
    from app.component4.routes import gaze_bp
    app.register_blueprint(gaze_bp)
    logger.info("[Component 4] Ready  →  /gaze/analyze | /gaze/session/* | /gaze/health")
except Exception as e:
    gaze_error = str(e)
    logger.exception("[Component 4] Failed to initialise: %s", e)

# ---------------------------------------------------------------------------
# Component 5 — Interview Audio Transcription
# ---------------------------------------------------------------------------

logger.info("[Component 5] Initialising interview transcription …")

try:
    from app.interview.routes import interview_bp
    app.register_blueprint(interview_bp)
    logger.info("[Component 5] Ready  →  /interview/process")
except Exception as e:
    logger.exception("[Component 5] Failed to initialise: %s", e)

# ---------------------------------------------------------------------------
# Component 6 — Keystroke behaviour analysis
# ---------------------------------------------------------------------------

logger.info("[Component 6] Loading keystroke behaviour model …")
keystroke_bundle = None
keystroke_error = None
try:
    from app.keystroke_component.loader import load_keystroke_bundle
    keystroke_bundle = load_keystroke_bundle()
except Exception as e:
    keystroke_error = str(e)
    logger.exception("[Component 6] Failed to load keystroke model: %s", e)

from app.keystroke_component.routes import keystroke_bp, init_keystroke
init_keystroke(keystroke_bundle, keystroke_error)
app.register_blueprint(keystroke_bp)

# ---------------------------------------------------------------------------
# Root health — overview of all components
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """
    GET /health
    Overall status of all components. Always returns HTTP 200.
    """
    audio_ready   = audio_bundle is not None
    gaze_ready    = gaze_error is None
    overall_ready = audio_ready and gaze_ready

    return jsonify({
        "status": "ready" if overall_ready else "degraded",
        "components": {
            "profile_analysis": "ready",
            "audio_analysis":   "ready" if audio_ready else f"degraded — {audio_error}",
            "gaze_analysis":    "ready" if gaze_ready  else f"degraded — {gaze_error}",
            "keystroke_analysis": "ready" if keystroke_bundle is not None else f"degraded — {keystroke_error}",
        },
        "endpoints": {
            "profile_analyze":      "POST /profile/analyze",
            "profile_health":       "GET  /profile/health",
            "audio_analyze":        "POST /audio/analyze",
            "audio_health":         "GET  /audio/health",
            "gaze_analyze":         "POST /gaze/analyze",
            "gaze_session_reset":   "POST /gaze/session/reset",
            "gaze_session_summary": "GET  /gaze/session/summary",
            "gaze_health":          "GET  /gaze/health",
            "keystroke_analyze":    "POST /keystroke/analyze",
            "keystroke_health":     "GET  /keystroke/health",
        },
    }), 200

# ---------------------------------------------------------------------------
# Dev server
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Listening on http://0.0.0.0:%d  (debug=%s, threaded=True)", port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
