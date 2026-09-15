"""
scoring_engine.py
=================
Phase 4 — Multi-Signal Competency Scoring Engine
Intelligent Recruitment Analysis System

Combines outputs from:
  - Phase 1: Resume Parser     (Gemma 4 E2B fine-tuned)
  - Phase 2: GitHub Analyzer   (github_analyzer.py)
  - Phase 3: Skill Graph       (skill_graph.py)

Into a single normalized competency score (0-10) with full explainability.

Usage:
    from scoring_engine import ScoringEngine

    engine = ScoringEngine()
    result = engine.score(
        candidate_name = "Kavinda Perera",
        resume_data    = { ... },   # from Phase 1
        github_data    = { ... },   # from Phase 2
        graph_data     = { ... },   # from Phase 3
        job_requirements = { ... }, # optional job spec
    )
    print(result)
"""

import math
from datetime import datetime


# ---------------------------------------------------------------------------
# Scoring weights (must sum to 1.0)
# ---------------------------------------------------------------------------

WEIGHTS = {
    "resume":      0.35,  # Resume evidence, including experience and education
    "github":      0.20,  # GitHub activity and repository quality
    "graph":       0.25,  # Skill graph / GNN evidence
    "consistency": 0.20,  # CV skills corroborated by GitHub repository evidence
}

assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "Weights must sum to 1.0"


def _safe_str_list(lst: list) -> list:
    """Convert a list of strings or dicts to a flat list of strings."""
    result = []
    for item in lst:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            result.append(
                item.get("name") or item.get("title") or 
                item.get("certification") or item.get("project") or
                str(next(iter(item.values()), ""))
            )
    return result


# ---------------------------------------------------------------------------
# ScoringEngine
# ---------------------------------------------------------------------------

class ScoringEngine:
    """
    Combines resume, GitHub, and skill graph signals into a
    normalized competency score (0-10) with explainability.

    Parameters
    ----------
    weights : dict, optional
        Override default signal weights.
        Must have keys: resume, github, graph. Must sum to 1.0.
    """

    def __init__(self, weights: dict = None):
        self.weights = weights or WEIGHTS

    # -----------------------------------------------------------------------
    # Public entry point
    # -----------------------------------------------------------------------

    def score(
        self,
        candidate_name:   str,
        resume_data:      dict,
        github_data:      dict = None,
        graph_data:       dict = None,
        consistency_data: dict = None,
        job_requirements: dict = None,
    ) -> dict:
        """
        Compute the final competency score for a candidate.

        Parameters
        ----------
        candidate_name : str
        resume_data : dict
            Output from Phase 1 resume parser.
        github_data : dict, optional
            Output from Phase 2 GitHub analyzer.
            If None, GitHub signal weight is redistributed to resume.
        graph_data : dict, optional
            Output from Phase 3 skill graph.
            If None, graph signal weight is redistributed to resume.
        job_requirements : dict, optional
            Job spec to compute skill match score.
            Keys: required_skills, preferred_skills, min_experience_years, domain

        Returns
        -------
        dict with full score breakdown and explanation.
        """
        print(f"\n[Scoring] Computing score for: {candidate_name}")

        # --- Handle missing signals ---
        weights = self._adjust_weights(github_data, graph_data, consistency_data)

        # --- Score each signal ---
        resume_score, resume_breakdown = self._score_resume(resume_data)
        github_score, github_breakdown = self._score_github(github_data)
        graph_score,  graph_breakdown  = self._score_graph(graph_data)
        consistency_score = (
            float(consistency_data.get("score", 0.0))
            if consistency_data and consistency_data.get("available")
            else 0.0
        )

        # --- Job match (optional) ---
        job_match = None
        if job_requirements:
            job_match = self._score_job_match(
                resume_data, graph_data, job_requirements
            )

        # --- Weighted final score ---
        raw_score = (
            resume_score * weights["resume"] +
            github_score * weights["github"] +
            graph_score  * weights["graph"] +
            consistency_score * weights["consistency"]
        )

        # --- Bonus / penalty modifiers ---
        raw_score, modifiers = self._apply_modifiers(
            raw_score, resume_data, github_data, graph_data
        )

        final_score = round(min(10.0, max(0.0, raw_score)), 2)

        # --- Seniority classification ---
        seniority = self._classify_seniority(resume_data, final_score)

        # --- Strengths and weaknesses ---
        strengths  = self._find_strengths(
            resume_score, github_score, graph_score,
            resume_data, github_data, graph_data
        )
        weaknesses = self._find_weaknesses(
            resume_score, github_score, graph_score,
            resume_data, github_data, graph_data
        )

        # --- Build full result ---
        result = {
            "candidate_name":  candidate_name,
            "final_score":     final_score,
            "grade":           self._grade(final_score),
            "seniority":       seniority,
            "scored_at":       datetime.utcnow().isoformat() + "Z",

            "signal_scores": {
                "resume": {
                    "score":     round(resume_score, 2),
                    "weight":    weights["resume"],
                    "contribution": round(resume_score * weights["resume"], 2),
                    "breakdown": resume_breakdown,
                },
                "github": {
                    "score":     round(github_score, 2),
                    "weight":    weights["github"],
                    "contribution": round(github_score * weights["github"], 2),
                    "breakdown": github_breakdown,
                },
                "graph": {
                    "score":     round(graph_score, 2),
                    "weight":    weights["graph"],
                    "contribution": round(graph_score * weights["graph"], 2),
                    "breakdown": graph_breakdown,
                },
                "consistency": {
                    "score": round(consistency_score, 2) if consistency_data and consistency_data.get("available") else None,
                    "weight": weights["consistency"],
                    "contribution": round(consistency_score * weights["consistency"], 2),
                    "breakdown": consistency_data or {
                        "available": False,
                        "reason": "Consistency was not calculated",
                    },
                },
            },

            "modifiers":       modifiers,
            "job_match":       job_match,
            "strengths":       strengths,
            "weaknesses":      weaknesses,

            "evidence": {
                "skills_confirmed":   resume_data.get("skills", []),
                "skills_inferred":    [s["skill"] for s in (graph_data or {}).get("inferred_skills", [])],
                "domains":            [d["domain"] for d in (graph_data or {}).get("domains", [])],
                "github_languages":   list((github_data or {}).get("languages", {}).keys()),
                "experience_years":   resume_data.get("total_experience_years", 0),
                "education":          resume_data.get("education", []),
                "github_activity":    round(github_score, 2) if github_data else None,
                "cross_platform_consistency": consistency_data,
            },
        }

        print(f"[Scoring] Final score: {final_score}/10 ({result['grade']})")
        return result

    # -----------------------------------------------------------------------
    # Signal 1 — Resume score (0-10)
    # -----------------------------------------------------------------------

    def _score_resume(self, resume_data: dict) -> tuple[float, dict]:
        if not resume_data:
            return 0.0, {"error": "no resume data"}

        scores = {}

        # Skills breadth (0-10): more skills = higher score, cap at 20
        skill_count    = len(resume_data.get("skills", []))
        scores["skills_breadth"] = min(10.0, skill_count * 0.6)

        # Experience (0-10)
        exp_years = resume_data.get("total_experience_years", 0) or 0
        if exp_years >= 10:
            scores["experience"] = 10.0
        elif exp_years >= 5:
            scores["experience"] = 7.0 + (exp_years - 5) * 0.6
        elif exp_years >= 2:
            scores["experience"] = 4.0 + (exp_years - 2) * 1.0
        elif exp_years >= 1:
            scores["experience"] = 2.5
        else:
            scores["experience"] = 1.0

        # Education (0-10)
        edu_list = resume_data.get("education", [])
        edu_score = 3.0  # base
        for edu in edu_list:
            degree = str(edu.get("degree", "")).upper()
            if "PHD" in degree or "DOCTORATE" in degree:
                edu_score = max(edu_score, 10.0)
            elif "MSC" in degree or "MASTER" in degree or "MS" in degree:
                edu_score = max(edu_score, 8.0)
            elif "BSC" in degree or "BACHELOR" in degree or "BE" in degree or "BENG" in degree:
                edu_score = max(edu_score, 6.0)
            elif "DIPLOMA" in degree:
                edu_score = max(edu_score, 4.0)
        scores["education"] = edu_score

        # Certifications bonus (0-2 extra points)
        certs = resume_data.get("certifications", [])
        scores["certifications"] = min(2.0, len(certs) * 0.5)

        # Projects (0-1 extra point)
        projects = resume_data.get("projects", [])
        scores["projects"] = min(1.0, len(projects) * 0.3)

        # Weighted resume score
        resume_score = (
            scores["skills_breadth"] * 0.35 +
            scores["experience"]     * 0.40 +
            scores["education"]      * 0.20 +
            scores["certifications"] * 0.03 +
            scores["projects"]       * 0.02
        )

        return min(10.0, resume_score), scores

    # -----------------------------------------------------------------------
    # Signal 2 — GitHub score (0-10)
    # -----------------------------------------------------------------------

    def _score_github(self, github_data: dict) -> tuple[float, dict]:
        if not github_data or github_data.get("error"):
            return 5.0, {"note": "no github data — using neutral score"}

        # Use the pre-computed activity score from Phase 2
        activity = github_data.get("activity_score", 0.0)

        breakdown = {
            "activity_score":       activity,
            "last_active_days_ago": github_data.get("last_active_days_ago", 999),
            "original_repos":       github_data.get("original_repos", 0),
            "total_stars":          github_data.get("total_stars", 0),
            "contribution_days":    github_data.get("contribution_days", 0),
            "suspected_fake":       github_data.get("quality_flags", {}).get("suspected_fake", False),
        }

        return min(10.0, activity), breakdown

    # -----------------------------------------------------------------------
    # Signal 3 — Graph score (0-10)
    # -----------------------------------------------------------------------

    def _score_graph(self, graph_data: dict) -> tuple[float, dict]:
        if not graph_data:
            return 5.0, {"note": "no graph data — using neutral score"}

        skill_score = graph_data.get("skill_score", 0.0)

        breakdown = {
            "skill_score":          skill_score,
            "known_skills_count":   len(graph_data.get("known_skills", [])),
            "inferred_skills_count":len(graph_data.get("inferred_skills", [])),
            "domains_count":        len(graph_data.get("domains", [])),
            "total_competencies":   graph_data.get("total_competencies", 0),
            "top_domains": [
                d["domain"] for d in graph_data.get("domains", [])[:3]
            ],
        }

        return min(10.0, skill_score), breakdown

    # -----------------------------------------------------------------------
    # Job match scoring (optional)
    # -----------------------------------------------------------------------

    def _score_job_match(
        self,
        resume_data:      dict,
        graph_data:       dict,
        job_requirements: dict,
    ) -> dict:
        """
        Compute how well the candidate matches specific job requirements.
        """
        required_skills  = set(job_requirements.get("required_skills", []))
        preferred_skills = set(job_requirements.get("preferred_skills", []))
        min_exp          = job_requirements.get("min_experience_years", 0)
        required_domain  = job_requirements.get("domain", None)

        # All candidate skills (known + inferred)
        known    = set(resume_data.get("skills", []))
        inferred = set(
            s["skill"] for s in (graph_data or {}).get("inferred_skills", [])
            if s.get("confidence", 0) >= 0.7
        )
        all_skills = known | inferred

        # Required skill match
        if required_skills:
            req_matched   = required_skills & all_skills
            req_missing   = required_skills - all_skills
            req_match_pct = len(req_matched) / len(required_skills) * 100
        else:
            req_matched, req_missing, req_match_pct = set(), set(), 100.0

        # Preferred skill match
        if preferred_skills:
            pref_matched   = preferred_skills & all_skills
            pref_match_pct = len(pref_matched) / len(preferred_skills) * 100
        else:
            pref_matched, pref_match_pct = set(), 100.0

        # Experience match
        candidate_exp = resume_data.get("total_experience_years", 0) or 0
        exp_met       = candidate_exp >= min_exp

        # Domain match
        candidate_domains = [
            d["domain"] for d in (graph_data or {}).get("domains", [])
        ]
        domain_matched = required_domain in candidate_domains if required_domain else True

        # Overall match score (0-100%)
        match_score = (
            req_match_pct  * 0.50 +
            pref_match_pct * 0.25 +
            (100.0 if exp_met else max(0, 100 - (min_exp - candidate_exp) * 20)) * 0.15 +
            (100.0 if domain_matched else 40.0) * 0.10
        )

        return {
            "match_score_pct":      round(match_score, 1),
            "required_skills_met":  sorted(req_matched),
            "required_skills_missing": sorted(req_missing),
            "preferred_skills_met": sorted(pref_matched),
            "experience_met":       exp_met,
            "domain_matched":       domain_matched,
            "recommendation":       self._recommend(match_score, req_match_pct),
        }

    def _recommend(self, match_score: float, req_match_pct: float) -> str:
        if req_match_pct < 50:
            return "NOT RECOMMENDED — missing critical required skills"
        elif match_score >= 80:
            return "STRONGLY RECOMMENDED — excellent match"
        elif match_score >= 65:
            return "RECOMMENDED — good match"
        elif match_score >= 50:
            return "CONSIDER — partial match, some gaps"
        else:
            return "NOT RECOMMENDED — insufficient match"

    # -----------------------------------------------------------------------
    # Modifiers (bonuses and penalties)
    # -----------------------------------------------------------------------

    def _apply_modifiers(
        self,
        score:       float,
        resume_data: dict,
        github_data: dict,
        graph_data:  dict,
    ) -> tuple[float, list[dict]]:
        modifiers = []

        # Bonus: GitHub profile provided and genuine
        if github_data and not github_data.get("error"):
            if not github_data.get("quality_flags", {}).get("suspected_fake"):
                modifiers.append({
                    "type":   "bonus",
                    "reason": "Genuine GitHub profile provided",
                    "value":  +0.3,
                })
                score += 0.3

        # Bonus: High inferred skill count (deep knowledge graph)
        inferred_count = len((graph_data or {}).get("inferred_skills", []))
        if inferred_count >= 10:
            modifiers.append({
                "type":   "bonus",
                "reason": f"Strong skill inference ({inferred_count} competencies inferred)",
                "value":  +0.2,
            })
            score += 0.2

        # Bonus: Multiple education degrees
        edu_count = len(resume_data.get("education", []))
        if edu_count >= 2:
            modifiers.append({
                "type":   "bonus",
                "reason": "Multiple educational qualifications",
                "value":  +0.2,
            })
            score += 0.2

        # Penalty: GitHub inactive for over 1 year
        if github_data and github_data.get("last_active_days_ago", 0) > 365:
            modifiers.append({
                "type":   "penalty",
                "reason": f"GitHub inactive for {github_data['last_active_days_ago']} days",
                "value":  -0.5,
            })
            score -= 0.5

        # Penalty: Suspected fake GitHub activity
        if github_data and github_data.get("quality_flags", {}).get("suspected_fake"):
            modifiers.append({
                "type":   "penalty",
                "reason": "Suspected inflated GitHub activity detected",
                "value":  -1.5,
            })
            score -= 1.5

        # Penalty: No skills found in resume
        if not resume_data.get("skills"):
            modifiers.append({
                "type":   "penalty",
                "reason": "No technical skills found in resume",
                "value":  -1.0,
            })
            score -= 1.0

        return score, modifiers

    # -----------------------------------------------------------------------
    # Strengths and weaknesses
    # -----------------------------------------------------------------------

    def _find_strengths(
        self,
        resume_score: float,
        github_score: float,
        graph_score:  float,
        resume_data:  dict,
        github_data:  dict,
        graph_data:   dict,
    ) -> list[str]:
        strengths = []

        if resume_score >= 7.0:
            strengths.append("Strong resume with solid experience and education")
        if github_score >= 7.0:
            strengths.append("Active GitHub profile with quality projects")
        if graph_score >= 7.0:
            strengths.append("Broad and deep technical skill set")

        exp = resume_data.get("total_experience_years", 0) or 0
        if exp >= 5:
            strengths.append(f"{exp} years of professional experience")

        if github_data:
            stars = github_data.get("total_stars", 0)
            if stars >= 50:
                strengths.append(f"Open source contributions ({stars} GitHub stars)")
            contrib = github_data.get("contribution_days", 0)
            if contrib >= 30:
                strengths.append(f"Consistent coding activity ({contrib} active days in 90d)")

        if graph_data:
            domains = [d["domain"] for d in graph_data.get("domains", [])]
            if domains:
                strengths.append(f"Expertise in: {', '.join(_safe_str_list(domains))}")
            inferred = graph_data.get("inferred_skills", [])
            high_conf = [s for s in inferred if s.get("confidence", 0) >= 0.8]
            if len(high_conf) >= 5:
                strengths.append(f"{len(high_conf)} strongly inferred technical competencies")

        certs = resume_data.get("certifications", [])
        if certs:
            strengths.append(f"Professional certifications: {', '.join(_safe_str_list(certs))}")

        return strengths if strengths else ["Profile submitted for review"]

    def _find_weaknesses(
        self,
        resume_score: float,
        github_score: float,
        graph_score:  float,
        resume_data:  dict,
        github_data:  dict,
        graph_data:   dict,
    ) -> list[str]:
        weaknesses = []

        exp = resume_data.get("total_experience_years", 0) or 0
        if exp < 2:
            weaknesses.append("Limited professional experience (under 2 years)")

        if github_data:
            days_ago = github_data.get("last_active_days_ago", 0)
            if days_ago > 180:
                weaknesses.append(f"GitHub inactive for {days_ago} days")
            if github_data.get("total_stars", 0) == 0:
                weaknesses.append("No GitHub stars received on projects")
            if github_data.get("quality_flags", {}).get("mostly_forks"):
                weaknesses.append("GitHub profile consists mostly of forked repositories")
        else:
            weaknesses.append("No GitHub profile provided")

        if not resume_data.get("certifications"):
            weaknesses.append("No professional certifications listed")

        if graph_data:
            known = len(graph_data.get("known_skills", []))
            if known < 4:
                weaknesses.append("Limited technical skill breadth on resume")

        if resume_score < 5.0:
            weaknesses.append("Resume signal is weak — consider requesting more detail")
        if github_score < 3.0 and github_data:
            weaknesses.append("Low GitHub activity score")

        return weaknesses if weaknesses else ["No significant weaknesses identified"]

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _adjust_weights(
        self,
        github_data: dict,
        graph_data:  dict,
        consistency_data: dict = None,
    ) -> dict:
        """Redistribute weights if a signal is missing."""
        w = dict(self.weights)

        if not github_data or github_data.get("error"):
            # Redistribute GitHub weight to resume
            w["resume"] += w["github"]
            w["github"]  = 0.0

        if not graph_data:
            # Redistribute graph weight to resume
            w["resume"] += w["graph"]
            w["graph"]   = 0.0

        if not consistency_data or not consistency_data.get("available"):
            # Missing evidence is not proof of inconsistency. Move its weight to resume.
            w["resume"] += w["consistency"]
            w["consistency"] = 0.0

        return w

    def _classify_seniority(self, resume_data: dict, score: float) -> str:
        exp = resume_data.get("total_experience_years", 0) or 0
        if exp >= 8 and score >= 7.0:
            return "lead / principal"
        elif exp >= 5 or score >= 7.0:
            return "senior"
        elif exp >= 2 or score >= 5.0:
            return "mid-level"
        else:
            return "junior"

    def _grade(self, score: float) -> str:
        if score >= 9.0: return "A+"
        if score >= 8.0: return "A"
        if score >= 7.0: return "B+"
        if score >= 6.0: return "B"
        if score >= 5.0: return "C+"
        if score >= 4.0: return "C"
        if score >= 3.0: return "D"
        return "F"

    # -----------------------------------------------------------------------
    # Batch scoring
    # -----------------------------------------------------------------------

    def score_batch(self, candidates: list[dict]) -> list[dict]:
        """
        Score multiple candidates and return ranked list.

        Each candidate dict must have:
            name, resume_data, github_data (optional), graph_data (optional)
        """
        results = []
        for c in candidates:
            result = self.score(
                candidate_name   = c.get("name", "Unknown"),
                resume_data      = c.get("resume_data", {}),
                github_data      = c.get("github_data"),
                graph_data       = c.get("graph_data"),
                consistency_data = c.get("consistency_data"),
                job_requirements = c.get("job_requirements"),
            )
            results.append(result)

        # Sort by final score descending
        results.sort(key=lambda x: x["final_score"], reverse=True)

        # Add rank
        for i, r in enumerate(results):
            r["rank"] = i + 1

        return results

    def compare(self, results: list[dict]) -> str:
        """Generate a plain-text comparison table for a list of scored candidates."""
        if not results:
            return "No results to compare."

        lines = [
            f"{'Rank':<5} {'Candidate':<25} {'Score':<8} {'Grade':<6} "
            f"{'Seniority':<15} {'Resume':<8} {'GitHub':<8} {'Graph':<8}",
            "-" * 90,
        ]

        for r in results:
            ss = r.get("signal_scores", {})
            lines.append(
                f"{r.get('rank', '-'):<5} "
                f"{r['candidate_name'][:24]:<25} "
                f"{r['final_score']:<8.2f} "
                f"{r['grade']:<6} "
                f"{r['seniority']:<15} "
                f"{ss.get('resume', {}).get('score', 0):<8.2f}"
                f"{ss.get('github', {}).get('score', 0):<8.2f}"
                f"{ss.get('graph',  {}).get('score', 0):<8.2f}"
            )

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    from skill_graph    import SkillGraph
    from github_analyzer import GitHubAnalyzer

    engine = ScoringEngine()

    # ── Candidate 1: Darksting (from your Phase 2 test) ───────────────────
    resume_darksting = {
        "name":                   "Darksting",
        "skills":                 ["Python", "JavaScript", "CSS", "HTML"],
        "programming_languages":  ["Python", "JavaScript"],
        "total_experience_years": 2,
        "education": [{"degree": "BSc", "field": "Computer Science",
                        "institution": "SLIIT"}],
        "certifications":         [],
        "projects":               ["Portfolio website", "ML notebook"],
    }

    github_darksting = {
        "activity_score":       1.72,
        "languages":            {"Jupyter Notebook": 77.8, "JavaScript": 15.7,
                                 "CSS": 6.2, "Python": 0.3},
        "original_repos":       9,
        "total_stars":          0,
        "contribution_days":    0,
        "last_active_days_ago": 418,
        "quality_flags":        {"suspected_fake": False, "mostly_forks": False},
    }

    graph   = SkillGraph()
    g_data  = graph.infer("Darksting",
                           list(github_darksting["languages"].keys()) +
                           resume_darksting["skills"])

    result1 = engine.score(
        candidate_name   = "Darksting (Akash Induruwa)",
        resume_data      = resume_darksting,
        github_data      = github_darksting,
        graph_data       = g_data,
        job_requirements = {
            "required_skills":        ["Python", "Machine Learning"],
            "preferred_skills":       ["Docker", "TensorFlow"],
            "min_experience_years":   2,
            "domain":                 "Data Science",
        },
    )

    print("\n" + "="*60)
    print("SCORING RESULT — Darksting")
    print("="*60)
    print(json.dumps(result1, indent=2))

    # ── Candidate 2: Senior ML Engineer ───────────────────────────────────
    resume_senior = {
        "name":                   "Kavinda Perera",
        "skills":                 ["Python", "TensorFlow", "PyTorch", "Docker",
                                   "Kubernetes", "PostgreSQL", "FastAPI", "MLflow"],
        "programming_languages":  ["Python", "SQL"],
        "total_experience_years": 6,
        "education": [
            {"degree": "MSc", "field": "Machine Learning",
             "institution": "University of Moratuwa"},
            {"degree": "BSc", "field": "Computer Science",
             "institution": "University of Colombo"},
        ],
        "certifications": ["AWS Certified ML Specialty", "TensorFlow Developer"],
        "projects":       ["Open source NLP library (230 stars)",
                           "Production recommendation system"],
    }

    github_senior = {
        "activity_score":       8.4,
        "languages":            {"Python": 72.0, "Jupyter Notebook": 18.0,
                                 "Shell": 10.0},
        "original_repos":       28,
        "total_stars":          312,
        "contribution_days":    67,
        "last_active_days_ago": 2,
        "quality_flags":        {"suspected_fake": False, "mostly_forks": False},
    }

    g_data2 = graph.infer("Kavinda",
                            resume_senior["skills"] +
                            list(github_senior["languages"].keys()))

    result2 = engine.score(
        candidate_name   = "Kavinda Perera",
        resume_data      = resume_senior,
        github_data      = github_senior,
        graph_data       = g_data2,
        job_requirements = {
            "required_skills":      ["Python", "Machine Learning", "Docker"],
            "preferred_skills":     ["Kubernetes", "MLflow", "TensorFlow"],
            "min_experience_years": 4,
            "domain":               "Machine Learning",
        },
    )

    # ── Compare both candidates ───────────────────────────────────────────
    print("\n" + "="*60)
    print("CANDIDATE COMPARISON")
    print("="*60)
    ranked = engine.score_batch([
        {"name": "Darksting",       "resume_data": resume_darksting,
         "github_data": github_darksting, "graph_data": g_data},
        {"name": "Kavinda Perera",  "resume_data": resume_senior,
         "github_data": github_senior,   "graph_data": g_data2},
    ])
    print(engine.compare(ranked))
