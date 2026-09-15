"""CV-to-GitHub skill consistency scoring with explainable evidence."""

import re


ALIASES = {
    "react js": "react",
    "reactjs": "react",
    "node js": "nodejs",
    "node": "nodejs",
    "mongo": "mongodb",
    "amazon web services": "aws",
    "google cloud platform": "gcp",
    "postgres": "postgresql",
    "c sharp": "c#",
    "dotnet": ".net",
    "asp net": "asp.net",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "k8s": "kubernetes",
}


def normalize_skill(skill: str) -> str:
    value = str(skill or "").strip().lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[._/\-]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return ALIASES.get(value, value)


def calculate_consistency(resume_skills: list, github_data: dict | None) -> dict:
    cv_display = [str(skill).strip() for skill in (resume_skills or []) if str(skill).strip()]
    cv_by_normalized = {}
    for skill in cv_display:
        cv_by_normalized.setdefault(normalize_skill(skill), skill)

    github_skills = (github_data or {}).get("detected_skills", [])
    github_by_normalized = {}
    for skill in github_skills:
        github_by_normalized.setdefault(normalize_skill(skill), str(skill))

    evidence = (github_data or {}).get("technology_evidence", {})
    normalized_evidence = {normalize_skill(skill): sources for skill, sources in evidence.items()}

    if not cv_by_normalized:
        return {
            "available": False,
            "reason": "No CV skills were extracted",
            "score": None,
            "percentage": None,
            "matched_count": 0,
            "total_cv_skills": 0,
            "cv_skills": [],
            "github_skills": list(github_by_normalized.values()),
            "matched_skills": [],
            "missing_skills": [],
            "evidence": {},
        }

    if not github_data or github_data.get("error"):
        return {
            "available": False,
            "reason": "GitHub skill evidence was unavailable",
            "score": None,
            "percentage": None,
            "matched_count": 0,
            "total_cv_skills": len(cv_by_normalized),
            "cv_skills": list(cv_by_normalized.values()),
            "github_skills": [],
            "matched_skills": [],
            "missing_skills": list(cv_by_normalized.values()),
            "evidence": {},
        }

    matched_keys = set(cv_by_normalized) & set(github_by_normalized)
    missing_keys = set(cv_by_normalized) - matched_keys
    percentage = len(matched_keys) / len(cv_by_normalized) * 100

    return {
        "available": True,
        "score": round(percentage / 10, 2),
        "percentage": round(percentage, 1),
        "matched_count": len(matched_keys),
        "total_cv_skills": len(cv_by_normalized),
        "cv_skills": list(cv_by_normalized.values()),
        "github_skills": list(github_by_normalized.values()),
        "matched_skills": [cv_by_normalized[key] for key in sorted(matched_keys)],
        "missing_skills": [cv_by_normalized[key] for key in sorted(missing_keys)],
        "evidence": {
            cv_by_normalized[key]: normalized_evidence.get(key, [])
            for key in sorted(matched_keys)
        },
    }
