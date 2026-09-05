"""
routes.py  —  Component 1
=========================
Blueprint: /profile
Handles resume parsing, GitHub analysis, skill graph inference and scoring.

Endpoints
---------
POST /profile/analyze             Full pipeline (resume + github → competency score)
POST /profile/parse-resume        Resume parsing only (Step 1)
POST /profile/analyze-from-resume GitHub + skill graph + scoring, from parsed resume_data (Steps 2–4)
GET  /profile/health              Component 1 status
"""

import logging

from flask import Blueprint, jsonify, request
import json

from app.component1.pipeline import AnalysisPipeline

logger   = logging.getLogger(__name__)
profile_bp = Blueprint("profile", __name__, url_prefix="/profile")

# Initialised once when the blueprint is registered (see main.py)
_pipeline: AnalysisPipeline = None


def init_pipeline(pipeline: AnalysisPipeline):
    """Called from main.py after the pipeline is created."""
    global _pipeline
    _pipeline = pipeline


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@profile_bp.route("/health", methods=["GET"])
def health():
    """
    GET /profile/health
    Component 1 status — resume parser, GitHub analyzer, skill graph, scoring engine.
    """
    return jsonify({
        "status": "ready",
        "component": "profile_analysis",
        "sub_components": {
            "resume_parser":   "hf_endpoint (https://vihaga1-Study-Instruction.hf.space/analyze)",
            "github_analyzer": "ready" if (_pipeline and _pipeline.github_analyzer) else "disabled (no GITHUB_TOKEN)",
            "skill_graph":     "ready",
            "scoring_engine":  "ready",
        },
    }), 200


@profile_bp.route("/analyze", methods=["POST"])
def analyze():
    """
    POST /profile/analyze
    ---------------------
    Run the full profile analysis pipeline for a candidate.

    Accepts multipart/form-data OR application/json.

    Multipart fields
    ----------------
    resume          : file    PDF resume (optional but recommended)
    resume_text     : str     Plain-text resume (alternative to PDF)
    github_username : str     GitHub username (optional)
    job_requirements: str     JSON string of job spec (optional)

    JSON body (alternative)
    -----------------------
    {
        "resume_text":     "...",
        "github_username": "octocat",
        "job_requirements": {
            "required_skills":      ["Python", "Machine Learning"],
            "preferred_skills":     ["Docker", "TensorFlow"],
            "min_experience_years": 3,
            "domain":               "Data Science"
        }
    }

    Response 200  —  Full scoring result with skill graph and GitHub signals.
    Response 400  —  Validation error.
    Response 500  —  Pipeline error.
    """
    try:
        pdf_bytes        = None
        resume_text      = None
        github_username  = None
        job_requirements = None

        content_type = request.content_type or ""

        if "multipart/form-data" in content_type:
            if "resume" in request.files:
                f = request.files["resume"]
                if f.filename and not f.filename.lower().endswith(".pdf"):
                    return _error(400, "Only PDF resumes are supported.")
                pdf_bytes = f.read() or None

            resume_text     = request.form.get("resume_text", "").strip() or None
            github_username = request.form.get("github_username", "").strip() or None

            raw_job = request.form.get("job_requirements", "")
            if raw_job:
                try:
                    job_requirements = json.loads(raw_job)
                except json.JSONDecodeError:
                    return _error(400, "job_requirements must be valid JSON.")
        else:
            body            = request.get_json(silent=True) or {}
            resume_text     = body.get("resume_text", "").strip() or None
            github_username = body.get("github_username", "").strip() or None
            job_requirements = body.get("job_requirements")

        if not pdf_bytes and not resume_text and not github_username:
            return _error(
                400,
                "Provide at least one of: resume (PDF), resume_text, or github_username.",
            )

        logger.info(
            "[Component1] /profile/analyze  github=%s  has_pdf=%s  has_text=%s",
            github_username, pdf_bytes is not None, resume_text is not None,
        )

        result = _pipeline.run(
            pdf_bytes        = pdf_bytes,
            resume_text      = resume_text,
            github_username  = github_username,
            job_requirements = job_requirements,
        )
        return jsonify(result), 200

    except Exception as e:
        logger.exception("[Component1] Unhandled error in /profile/analyze")
        return _error(500, f"Pipeline error: {str(e)}")


@profile_bp.route("/parse-resume", methods=["POST"])
def parse_resume():
    """
    POST /profile/parse-resume
    ---------------------------
    Run Step 1 only — parse a resume into structured data, without running
    GitHub analysis, skill graph inference, or scoring.

    Accepts multipart/form-data OR application/json.

    Multipart fields
    ----------------
    resume          : file    PDF resume (optional but recommended)
    resume_text     : str     Plain-text resume (alternative to PDF)

    JSON body (alternative)
    -----------------------
    {
        "resume_text": "..."
    }

    Response 200  —  Parsed resume_data dict.
    Response 400  —  Validation error.
    Response 500  —  Pipeline error.
    """
    try:
        pdf_bytes   = None
        resume_text = None

        content_type = request.content_type or ""

        if "multipart/form-data" in content_type:
            if "resume" in request.files:
                f = request.files["resume"]
                if f.filename and not f.filename.lower().endswith(".pdf"):
                    return _error(400, "Only PDF resumes are supported.")
                pdf_bytes = f.read() or None

            resume_text = request.form.get("resume_text", "").strip() or None
        else:
            body        = request.get_json(silent=True) or {}
            resume_text = body.get("resume_text", "").strip() or None

        if not pdf_bytes and not resume_text:
            return _error(400, "Provide either a resume (PDF) or resume_text.")

        logger.info(
            "[Component1] /profile/parse-resume  has_pdf=%s  has_text=%s",
            pdf_bytes is not None, resume_text is not None,
        )

        resume_data = _pipeline.parse_resume(
            pdf_bytes   = pdf_bytes,
            resume_text = resume_text,
        )
        return jsonify(resume_data), 200

    except Exception as e:
        logger.exception("[Component1] Unhandled error in /profile/parse-resume")
        return _error(500, f"Pipeline error: {str(e)}")


@profile_bp.route("/analyze-from-resume", methods=["POST"])
def analyze_from_resume():
    """
    POST /profile/analyze-from-resume
    ----------------------------------
    Run Steps 2–4 — GitHub analysis, skill graph inference, and scoring —
    starting from an already-parsed resume_data dict (e.g. returned by
    /profile/parse-resume).

    JSON body (required)
    ---------------------
    {
        "resume_data": {
            "name": "Karan Pratap Singh",
            "skills": ["Python", "Machine Learning", "Docker"],
            "programming_languages": ["Python", "JavaScript"],
            "total_experience_years": 3.5,
            "experience": [
                {
                    "title": "Software Engineer",
                    "company": "Acme Corp",
                    "start_date": "01/2022",
                    "end_date": "Present"
                }
            ],
            "education": [
                {
                    "degree": "BSc",
                    "field": "Computer Science",
                    "institution": "SLIIT",
                    "year": "2022"
                }
            ],
            "certifications": ["AWS Certified Developer"],
            "projects": ["Smart Recruiter", "Garment ML Pipeline"],
            "publications": [],
            "achievements": []
        },
        "github_username": "octocat",    // optional
        "job_requirements": {            // optional
            "required_skills":      ["Python", "Machine Learning"],
            "preferred_skills":     ["Docker", "TensorFlow"],
            "min_experience_years": 3,
            "domain":               "Data Science"
        }
    }

    Notes on resume_data
    --------------------
    This is the exact shape returned by /profile/parse-resume — the simplest
    way to build this payload is to call that endpoint first and pass its
    response straight through here.

    No individual field is strictly required — ScoringEngine reads every
    field with .get(key, default), so missing keys degrade to 0 / [] rather
    than erroring. In practice though, "skills" and "total_experience_years"
    are the two fields that drive most of the scoring logic, so a resume_data
    payload with only those two populated will still produce a meaningful
    (if less complete) score. "education", "certifications", and "projects"
    contribute smaller, more isolated adjustments.

    Response 200  —  Full scoring result with skill graph and GitHub signals.
    Response 400  —  Validation error.
    Response 500  —  Pipeline error.
    """
    try:
        body = request.get_json(silent=True) or {}

        resume_data      = body.get("resume_data")
        github_username  = (body.get("github_username") or "").strip() or None
        job_requirements = body.get("job_requirements")

        if not resume_data or not isinstance(resume_data, dict):
            return _error(400, "resume_data (object) is required.")

        logger.info(
            "[Component1] /profile/analyze-from-resume  github=%s",
            github_username,
        )

        result = _pipeline.run_from_resume_data(
            resume_data      = resume_data,
            github_username  = github_username,
            job_requirements = job_requirements,
        )
        return jsonify(result), 200

    except Exception as e:
        logger.exception("[Component1] Unhandled error in /profile/analyze-from-resume")
        return _error(500, f"Pipeline error: {str(e)}")


def _error(status: int, message: str):
    return jsonify({"error": message}), status