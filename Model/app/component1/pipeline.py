"""
pipeline.py
===========
Component 1 — Full Analysis Pipeline Orchestrator
Smart Recruiter API

Wires together:
    Step 1  ResumeParserClient  → structured resume data  (HuggingFace)
    Step 2  GitHubAnalyzer      → GitHub activity data
    Step 3  SkillGraph          → inferred skill competencies
    Step 4  ScoringEngine       → final competency score (0–10)
"""

import logging
import os
import time

from app.component1.resume_parser  import ResumeParserClient
from app.component1.github_analyzer import GitHubAnalyzer
from app.component1.gnn_skill_graph import SkillGraph
from app.component1.scoring_engine import ScoringEngine
from app.component1.skill_consistency import calculate_consistency

logger = logging.getLogger(__name__)


class AnalysisPipeline:
    """
    Singleton-friendly orchestrator.  Initialise once at app startup
    to avoid rebuilding the SkillGraph on every request.
    """

    def __init__(self):
        github_token = os.getenv("GITHUB_TOKEN", "")
        if not github_token:
            logger.warning(
                "[Pipeline] GITHUB_TOKEN not set — GitHub analysis will be skipped."
            )

        self.resume_parser  = ResumeParserClient()
        self.github_analyzer = GitHubAnalyzer(token=github_token) if github_token else None
        self.skill_graph    = SkillGraph(min_confidence=0.5, max_hops=2)
        self.scoring_engine = ScoringEngine()

        logger.info("[Pipeline] All components initialised.")

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def parse_resume(
        self,
        pdf_bytes:   bytes = None,
        resume_text: str   = None,
    ) -> dict:
        """
        Execute Step 1 only — Resume Parsing.

        Parameters
        ----------
        pdf_bytes        : bytes   Raw PDF bytes (from multipart upload)
        resume_text      : str     Plain-text resume (alternative to PDF)

        Returns
        -------
        dict  Parsed resume data (name, skills, experience, education, etc.)
        """
        logger.info("[Pipeline] Step 1 — Resume parsing …")
        t1 = time.perf_counter()

        if pdf_bytes:
            resume_data = self.resume_parser.parse_from_file(pdf_bytes)
        elif resume_text:
            resume_data = self.resume_parser.parse_from_text(resume_text)
        else:
            logger.warning("[Pipeline] No resume provided — using empty resume data.")
            resume_data = {
                "name": "", "skills": [], "programming_languages": [],
                "total_experience_years": 0, "education": [],
                "certifications": [], "projects": [],
                "parser_error": "no_resume_provided",
            }

        parse_ms = round((time.perf_counter() - t1) * 1000)
        resume_data["_parse_ms"] = parse_ms

        logger.info(
            "[Pipeline] Resume parsed. Name: %s | Skills: %s",
            resume_data.get("name") or "Unknown",
            resume_data.get("skills", []),
        )
        return resume_data

    def run_from_resume_data(
        self,
        resume_data:      dict,
        github_username:  str  = None,
        job_requirements: dict = None,
    ) -> dict:
        """
        Execute Steps 2–4 — GitHub Analysis, Skill Graph Inference, and Scoring —
        starting from an already-parsed resume_data dict (e.g. from parse_resume()
        or a previous /parse-resume API call).

        Parameters
        ----------
        resume_data      : dict    Parsed resume data (as returned by parse_resume())
        github_username  : str     GitHub username to analyse
        job_requirements : dict    Optional job spec for match scoring

        Returns
        -------
        dict  Full scoring result from ScoringEngine
        """
        timings = {}
        t0 = time.perf_counter()

        candidate_name = resume_data.get("name") or github_username or "Candidate"

        # ── Step 2: GitHub Analysis ─────────────────────────────────────
        logger.info("[Pipeline] Step 2 — GitHub analysis …")
        t2 = time.perf_counter()
        github_data = None

        if github_username and self.github_analyzer:
            try:
                github_data = self.github_analyzer.analyze(github_username)
                if github_data.get("error"):
                    logger.warning(
                        "[Pipeline] GitHub analysis returned error: %s",
                        github_data["error"],
                    )
            except Exception as e:
                logger.error("[Pipeline] GitHub analysis failed: %s", e)
                github_data = None
        elif not self.github_analyzer:
            logger.warning("[Pipeline] GitHub analyzer unavailable (no token).")

        timings["github_ms"] = round((time.perf_counter() - t2) * 1000)

        # Cross-platform consistency compares direct CV claims with direct
        # repository evidence. GNN-inferred skills are intentionally excluded.
        consistency_data = calculate_consistency(
            resume_data.get("skills", []),
            github_data,
        )

        # ── Step 3: Skill Graph Inference ───────────────────────────────
        logger.info("[Pipeline] Step 3 — Skill graph inference …")
        t3 = time.perf_counter()

        # Combine resume skills + GitHub language names as seed skills
        seed_skills = list(resume_data.get("skills", []))
        if github_data and not github_data.get("error"):
            github_langs = list(github_data.get("languages", {}).keys())
            # Deduplicate while preserving order
            for lang in github_langs:
                if lang not in seed_skills:
                    seed_skills.append(lang)

        graph_data = None
        if seed_skills:
            graph_data = self.skill_graph.infer(
                candidate_name=candidate_name,
                known_skills=seed_skills,
            )
        else:
            logger.warning("[Pipeline] No skills to infer from — skipping graph step.")

        timings["graph_ms"] = round((time.perf_counter() - t3) * 1000)

        # ── Step 4: Final Scoring ───────────────────────────────────────
        logger.info("[Pipeline] Step 4 — Scoring …")
        t4 = time.perf_counter()

        result = self.scoring_engine.score(
            candidate_name   = candidate_name,
            resume_data      = resume_data,
            github_data      = github_data,
            graph_data       = graph_data,
            consistency_data = consistency_data,
            job_requirements = job_requirements,
        )

        timings["scoring_ms"] = round((time.perf_counter() - t4) * 1000)
        timings["total_ms"]   = round((time.perf_counter() - t0) * 1000)

        # ── Attach parsed resume data ───────────────────────────────────
        result["resume_data"] = resume_data

        # ── Attach pipeline metadata ────────────────────────────────────
        result["pipeline_meta"] = {
            "github_analyzed":   github_data is not None and not github_data.get("error"),
            "graph_ran":         graph_data  is not None,
            "resume_parsed":     not resume_data.get("parser_error"),
            "resume_error":      resume_data.get("parser_error"),
            "seed_skills_count": len(seed_skills),
            "timings_ms":        timings,
        }

        logger.info(
            "[Pipeline] Complete. Score: %s/10 | Total: %dms",
            result["final_score"],
            timings["total_ms"],
        )
        return result

    # ------------------------------------------------------------------
    # Convenience wrapper — full pipeline in one call
    # ------------------------------------------------------------------

    def run(
        self,
        pdf_bytes:        bytes  = None,
        resume_text:      str    = None,
        github_username:  str    = None,
        job_requirements: dict   = None,
    ) -> dict:
        """
        Execute the full analysis pipeline (Steps 1–4) in one call.
        Thin wrapper around parse_resume() + run_from_resume_data(),
        kept for backward compatibility with existing callers of /run.

        Parameters
        ----------
        pdf_bytes        : bytes   Raw PDF bytes (from multipart upload)
        resume_text      : str     Plain-text resume (alternative to PDF)
        github_username  : str     GitHub username to analyse
        job_requirements : dict    Optional job spec for match scoring

        Returns
        -------
        dict  Full scoring result from ScoringEngine
        """
        resume_data = self.parse_resume(pdf_bytes=pdf_bytes, resume_text=resume_text)
        return self.run_from_resume_data(
            resume_data      = resume_data,
            github_username  = github_username,
            job_requirements = job_requirements,
        )
