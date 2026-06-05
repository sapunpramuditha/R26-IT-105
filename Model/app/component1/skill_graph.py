"""
skill_graph.py
==============
Phase 3 — Skill Knowledge Graph + Inference Engine
Intelligent Recruitment Analysis System

Usage:
    from skill_graph import SkillGraph

    graph  = SkillGraph()
    result = graph.infer("torvalds", ["Python", "TensorFlow", "Docker"])
    print(result)
"""

import json
import math
from collections import defaultdict

try:
    import networkx as nx
except ImportError:
    raise ImportError("Run: pip install networkx")


# ---------------------------------------------------------------------------
# Relationship types
# ---------------------------------------------------------------------------

REQUIRES    = "REQUIRES"     # Skill A needs Skill B to be useful
IMPLIES     = "IMPLIES"      # Knowing A strongly suggests knowing B
BELONGS_TO  = "BELONGS_TO"   # A is part of domain B
SIMILAR_TO  = "SIMILAR_TO"   # A and B are interchangeable


# ---------------------------------------------------------------------------
# Skill taxonomy — the knowledge base
# ---------------------------------------------------------------------------

# Each entry: (source_skill, relationship, target_skill, weight 0-1)
# Weight = how strongly the relationship holds
#   1.0 = always true   (Python REQUIRES programming basics)
#   0.8 = very likely   (PyTorch IMPLIES Deep Learning)
#   0.6 = likely        (Docker IMPLIES DevOps awareness)
#   0.4 = possible      (SQL IMPLIES data analysis)

SKILL_EDGES = [

    # ── Python ecosystem ────────────────────────────────────────────────────
    ("Python",          IMPLIES,     "Programming",          1.0),
    ("Python",          BELONGS_TO,  "Software Development", 1.0),
    ("NumPy",           REQUIRES,    "Python",               1.0),
    ("NumPy",           IMPLIES,     "Data Analysis",        0.8),
    ("Pandas",          REQUIRES,    "Python",               1.0),
    ("Pandas",          IMPLIES,     "Data Analysis",        0.9),
    ("Pandas",          IMPLIES,     "Data Science",         0.7),
    ("Matplotlib",      REQUIRES,    "Python",               1.0),
    ("Matplotlib",      IMPLIES,     "Data Visualization",   0.9),
    ("Seaborn",         REQUIRES,    "Python",               1.0),
    ("Seaborn",         SIMILAR_TO,  "Matplotlib",           0.9),
    ("FastAPI",         REQUIRES,    "Python",               1.0),
    ("FastAPI",         IMPLIES,     "REST API Development", 0.9),
    ("FastAPI",         IMPLIES,     "Backend Development",  0.8),
    ("Django",          REQUIRES,    "Python",               1.0),
    ("Django",          IMPLIES,     "Web Development",      0.9),
    ("Django",          IMPLIES,     "Backend Development",  0.8),
    ("Flask",           REQUIRES,    "Python",               1.0),
    ("Flask",           IMPLIES,     "Web Development",      0.8),
    ("Flask",           SIMILAR_TO,  "FastAPI",              0.7),

    # ── Machine Learning ────────────────────────────────────────────────────
    ("TensorFlow",      REQUIRES,    "Python",               1.0),
    ("TensorFlow",      IMPLIES,     "Deep Learning",        0.9),
    ("TensorFlow",      IMPLIES,     "Machine Learning",     1.0),
    ("TensorFlow",      IMPLIES,     "Neural Networks",      0.8),
    ("TensorFlow",      SIMILAR_TO,  "PyTorch",              0.8),
    ("PyTorch",         REQUIRES,    "Python",               1.0),
    ("PyTorch",         IMPLIES,     "Deep Learning",        0.9),
    ("PyTorch",         IMPLIES,     "Machine Learning",     1.0),
    ("PyTorch",         IMPLIES,     "Neural Networks",      0.8),
    ("Keras",           REQUIRES,    "Python",               1.0),
    ("Keras",           REQUIRES,    "TensorFlow",           0.8),
    ("Keras",           IMPLIES,     "Deep Learning",        0.9),
    ("scikit-learn",    REQUIRES,    "Python",               1.0),
    ("scikit-learn",    IMPLIES,     "Machine Learning",     1.0),
    ("scikit-learn",    IMPLIES,     "Data Science",         0.8),
    ("Deep Learning",   IMPLIES,     "Machine Learning",     1.0),
    ("Deep Learning",   IMPLIES,     "Neural Networks",      1.0),
    ("Machine Learning",IMPLIES,     "Data Science",         0.8),
    ("Machine Learning",BELONGS_TO,  "Artificial Intelligence", 1.0),
    ("MLflow",          REQUIRES,    "Python",               1.0),
    ("MLflow",          IMPLIES,     "Machine Learning",     0.8),
    ("MLflow",          IMPLIES,     "MLOps",                0.9),
    ("Hugging Face",    REQUIRES,    "Python",               1.0),
    ("Hugging Face",    IMPLIES,     "NLP",                  0.9),
    ("Hugging Face",    IMPLIES,     "Deep Learning",        0.8),
    ("Hugging Face",    IMPLIES,     "Transformers",         0.9),
    ("Transformers",    IMPLIES,     "NLP",                  0.9),
    ("Transformers",    IMPLIES,     "Deep Learning",        0.8),
    ("BERT",            IMPLIES,     "NLP",                  1.0),
    ("BERT",            IMPLIES,     "Transformers",         0.9),
    ("BERT",            REQUIRES,    "Python",               1.0),
    ("spaCy",           REQUIRES,    "Python",               1.0),
    ("spaCy",           IMPLIES,     "NLP",                  1.0),
    ("NLTK",            REQUIRES,    "Python",               1.0),
    ("NLTK",            IMPLIES,     "NLP",                  1.0),
    ("NLTK",            SIMILAR_TO,  "spaCy",                0.7),

    # ── Data Engineering ────────────────────────────────────────────────────
    ("Apache Spark",    IMPLIES,     "Big Data",             1.0),
    ("Apache Spark",    IMPLIES,     "Data Engineering",     0.9),
    ("Apache Spark",    IMPLIES,     "Distributed Computing",0.8),
    ("Kafka",           IMPLIES,     "Data Engineering",     0.9),
    ("Kafka",           IMPLIES,     "Distributed Systems",  0.8),
    ("Kafka",           IMPLIES,     "Real-time Processing", 0.8),
    ("Airflow",         IMPLIES,     "Data Engineering",     0.9),
    ("Airflow",         IMPLIES,     "ETL",                  0.8),
    ("Airflow",         REQUIRES,    "Python",               1.0),
    ("dbt",             IMPLIES,     "Data Engineering",     0.8),
    ("dbt",             IMPLIES,     "SQL",                  0.9),
    ("Snowflake",       IMPLIES,     "Data Warehousing",     0.9),
    ("Snowflake",       IMPLIES,     "SQL",                  0.9),
    ("BigQuery",        IMPLIES,     "Data Warehousing",     0.9),
    ("BigQuery",        IMPLIES,     "SQL",                  0.9),
    ("BigQuery",        IMPLIES,     "GCP",                  0.7),
    ("SQL",             IMPLIES,     "Database Management",  0.9),
    ("SQL",             IMPLIES,     "Data Analysis",        0.8),
    ("PostgreSQL",      REQUIRES,    "SQL",                  1.0),
    ("PostgreSQL",      IMPLIES,     "Database Management",  0.9),
    ("MySQL",           REQUIRES,    "SQL",                  1.0),
    ("MySQL",           SIMILAR_TO,  "PostgreSQL",           0.8),
    ("MongoDB",         IMPLIES,     "NoSQL",                1.0),
    ("MongoDB",         IMPLIES,     "Database Management",  0.8),
    ("Redis",           IMPLIES,     "Caching",              0.9),
    ("Redis",           IMPLIES,     "Backend Development",  0.7),

    # ── DevOps & Cloud ──────────────────────────────────────────────────────
    ("Docker",          IMPLIES,     "DevOps",               0.9),
    ("Docker",          IMPLIES,     "Containerization",     1.0),
    ("Docker",          IMPLIES,     "Software Deployment",  0.8),
    ("Kubernetes",      REQUIRES,    "Docker",               0.9),
    ("Kubernetes",      IMPLIES,     "DevOps",               1.0),
    ("Kubernetes",      IMPLIES,     "Container Orchestration", 1.0),
    ("Kubernetes",      IMPLIES,     "Cloud Native",         0.8),
    ("Terraform",       IMPLIES,     "Infrastructure as Code", 1.0),
    ("Terraform",       IMPLIES,     "DevOps",               0.9),
    ("Terraform",       IMPLIES,     "Cloud",                0.8),
    ("Ansible",         IMPLIES,     "DevOps",               0.9),
    ("Ansible",         IMPLIES,     "Infrastructure as Code", 0.8),
    ("Jenkins",         IMPLIES,     "CI/CD",                1.0),
    ("Jenkins",         IMPLIES,     "DevOps",               0.9),
    ("GitHub Actions",  IMPLIES,     "CI/CD",                1.0),
    ("GitHub Actions",  IMPLIES,     "DevOps",               0.8),
    ("AWS",             IMPLIES,     "Cloud Computing",      1.0),
    ("AWS",             IMPLIES,     "DevOps",               0.6),
    ("Azure",           IMPLIES,     "Cloud Computing",      1.0),
    ("Azure",           SIMILAR_TO,  "AWS",                  0.8),
    ("GCP",             IMPLIES,     "Cloud Computing",      1.0),
    ("GCP",             SIMILAR_TO,  "AWS",                  0.8),
    ("Linux",           IMPLIES,     "System Administration",0.8),
    ("Linux",           IMPLIES,     "DevOps",               0.6),

    # ── Web & Backend ───────────────────────────────────────────────────────
    ("React",           REQUIRES,    "JavaScript",           1.0),
    ("React",           IMPLIES,     "Frontend Development", 1.0),
    ("React",           IMPLIES,     "Web Development",      1.0),
    ("Vue.js",          REQUIRES,    "JavaScript",           1.0),
    ("Vue.js",          SIMILAR_TO,  "React",                0.8),
    ("Angular",         REQUIRES,    "TypeScript",           0.9),
    ("Angular",         SIMILAR_TO,  "React",                0.7),
    ("Node.js",         REQUIRES,    "JavaScript",           1.0),
    ("Node.js",         IMPLIES,     "Backend Development",  0.9),
    ("Node.js",         IMPLIES,     "REST API Development", 0.8),
    ("TypeScript",      REQUIRES,    "JavaScript",           1.0),
    ("TypeScript",      IMPLIES,     "Programming",          1.0),
    ("JavaScript",      IMPLIES,     "Programming",          1.0),
    ("JavaScript",      IMPLIES,     "Web Development",      0.9),
    ("Spring Boot",     REQUIRES,    "Java",                 1.0),
    ("Spring Boot",     IMPLIES,     "Backend Development",  0.9),
    ("Spring Boot",     IMPLIES,     "Microservices",        0.7),
    ("Java",            IMPLIES,     "Programming",          1.0),
    ("Java",            IMPLIES,     "Object-Oriented Programming", 0.9),
    ("Go",              IMPLIES,     "Programming",          1.0),
    ("Go",              IMPLIES,     "Backend Development",  0.7),
    ("REST API Development", IMPLIES,"Backend Development",  0.9),
    ("Microservices",   IMPLIES,     "Backend Development",  0.9),
    ("Microservices",   IMPLIES,     "Software Architecture",0.8),

    # ── Mobile ──────────────────────────────────────────────────────────────
    ("Flutter",         REQUIRES,    "Dart",                 1.0),
    ("Flutter",         IMPLIES,     "Mobile Development",   1.0),
    ("Flutter",         IMPLIES,     "Cross-Platform Development", 0.9),
    ("React Native",    REQUIRES,    "JavaScript",           1.0),
    ("React Native",    IMPLIES,     "Mobile Development",   1.0),
    ("React Native",    SIMILAR_TO,  "Flutter",              0.7),
    ("Kotlin",          IMPLIES,     "Android Development",  0.9),
    ("Kotlin",          IMPLIES,     "Mobile Development",   0.9),
    ("Kotlin",          IMPLIES,     "Programming",          1.0),
    ("Swift",           IMPLIES,     "iOS Development",      0.9),
    ("Swift",           IMPLIES,     "Mobile Development",   0.9),

    # ── Security ────────────────────────────────────────────────────────────
    ("Penetration Testing", IMPLIES, "Cybersecurity",        1.0),
    ("Wireshark",       IMPLIES,     "Network Security",     0.9),
    ("Wireshark",       IMPLIES,     "Cybersecurity",        0.8),
    ("Metasploit",      IMPLIES,     "Penetration Testing",  0.9),
    ("Metasploit",      IMPLIES,     "Cybersecurity",        1.0),
    ("Nmap",            IMPLIES,     "Network Security",     0.8),
    ("Burp Suite",      IMPLIES,     "Web Security",         0.9),
    ("Burp Suite",      IMPLIES,     "Cybersecurity",        0.9),
    ("Cryptography",    IMPLIES,     "Cybersecurity",        0.8),

    # ── Data Science / Analysis ─────────────────────────────────────────────
    ("Tableau",         IMPLIES,     "Data Visualization",   1.0),
    ("Tableau",         IMPLIES,     "Business Intelligence",0.8),
    ("Power BI",        IMPLIES,     "Data Visualization",   1.0),
    ("Power BI",        SIMILAR_TO,  "Tableau",              0.8),
    ("Statistics",      IMPLIES,     "Data Analysis",        0.9),
    ("Statistics",      IMPLIES,     "Data Science",         0.7),
    ("R",               IMPLIES,     "Statistics",           0.9),
    ("R",               IMPLIES,     "Data Analysis",        0.9),
    ("R",               IMPLIES,     "Programming",          0.9),

    # ── Jupyter Notebook (important for your test case) ─────────────────────
    ("Jupyter Notebook",REQUIRES,    "Python",               0.9),
    ("Jupyter Notebook",IMPLIES,     "Data Analysis",        0.9),
    ("Jupyter Notebook",IMPLIES,     "Data Science",         0.8),
    ("Jupyter Notebook",IMPLIES,     "Machine Learning",     0.6),

    # ── Domain nodes ────────────────────────────────────────────────────────
    ("Data Science",    BELONGS_TO,  "Artificial Intelligence", 0.7),
    ("NLP",             BELONGS_TO,  "Artificial Intelligence", 1.0),
    ("Computer Vision", BELONGS_TO,  "Artificial Intelligence", 1.0),
    ("MLOps",           BELONGS_TO,  "DevOps",               0.7),
    ("MLOps",           BELONGS_TO,  "Machine Learning",     0.9),
    ("Cloud Native",    BELONGS_TO,  "Cloud Computing",      0.9),
]


# ---------------------------------------------------------------------------
# SkillGraph
# ---------------------------------------------------------------------------

class SkillGraph:
    """
    Builds a directed skill knowledge graph and runs inference to find
    hidden/implied competencies from a set of known skills.

    Parameters
    ----------
    min_confidence : float
        Minimum confidence threshold (0-1) for an inferred skill
        to be included in the output. Default 0.5.
    max_hops : int
        Maximum graph hops when inferring skills. 1 = direct neighbours,
        2 = neighbours of neighbours. Default 2.
    """

    def __init__(self, min_confidence: float = 0.5, max_hops: int = 2):
        self.min_confidence = min_confidence
        self.max_hops       = max_hops
        self.graph          = self._build_graph()

    # -----------------------------------------------------------------------
    # Build the graph
    # -----------------------------------------------------------------------

    def _build_graph(self) -> nx.DiGraph:
        G = nx.DiGraph()

        for source, rel, target, weight in SKILL_EDGES:
            G.add_edge(source, target, relation=rel, weight=weight)

            # SIMILAR_TO is bidirectional
            if rel == SIMILAR_TO:
                G.add_edge(target, source, relation=rel, weight=weight)

        print(f"[SkillGraph] Built graph: {G.number_of_nodes()} nodes, "
              f"{G.number_of_edges()} edges")
        return G

    # -----------------------------------------------------------------------
    # Public entry point
    # -----------------------------------------------------------------------

    def infer(self, candidate_name: str, known_skills: list[str]) -> dict:
        """
        Given a list of known skills, infer implied competencies.

        Parameters
        ----------
        candidate_name : str
            Name of the candidate (for logging).
        known_skills : list[str]
            Skills extracted from the resume parser.

        Returns
        -------
        dict with keys:
            known_skills        — normalised input skills
            inferred_skills     — list of {skill, confidence, via, relation}
            domains             — high-level domain memberships
            skill_score         — 0-10 graph-based skill score
            similar_skills      — skills the candidate likely knows too
        """
        print(f"\n[SkillGraph] Inferring for: {candidate_name}")
        print(f"[SkillGraph] Known skills  : {known_skills}")

        # Normalise known skills (case-insensitive match against graph nodes)
        matched   = self._normalise_skills(known_skills)
        unmatched = [s for s in known_skills if s not in matched]

        print(f"[SkillGraph] Matched in graph : {matched}")
        if unmatched:
            print(f"[SkillGraph] Not in graph     : {unmatched}")

        # Run multi-hop inference
        inferred = self._run_inference(matched)

        # Identify domains
        domains = self._find_domains(matched, inferred)

        # Find similar/alternative skills
        similar = self._find_similar(matched)

        # Compute graph-based skill score
        skill_score = self._compute_skill_score(matched, inferred, domains)

        return {
            "candidate":        candidate_name,
            "known_skills":     matched,
            "unmatched_skills": unmatched,
            "inferred_skills":  inferred,
            "domains":          domains,
            "similar_skills":   similar,
            "skill_score":      round(skill_score, 2),
            "total_competencies": len(matched) + len(inferred),
        }

    # -----------------------------------------------------------------------
    # Skill normalisation
    # -----------------------------------------------------------------------

    def _normalise_skills(self, skills: list[str]) -> list[str]:
        """Match input skills to graph nodes (case-insensitive)."""
        graph_nodes_lower = {n.lower(): n for n in self.graph.nodes()}
        matched = []
        for skill in skills:
            node = graph_nodes_lower.get(skill.lower())
            if node and node not in matched:
                matched.append(node)
        return matched

    # -----------------------------------------------------------------------
    # Multi-hop inference
    # -----------------------------------------------------------------------

    def _run_inference(self, known_skills: list[str]) -> list[dict]:
        """
        Walk outgoing edges from each known skill up to max_hops.
        Accumulate confidence by multiplying edge weights along the path.
        If a node is reachable via multiple paths, take the max confidence.
        """
        inferred_conf = {}   # skill → max confidence
        inferred_via  = {}   # skill → (via_skill, relation)

        for start_skill in known_skills:
            if start_skill not in self.graph:
                continue

            # BFS up to max_hops
            queue   = [(start_skill, 1.0, 0, start_skill, "direct")]
            visited = {start_skill}

            while queue:
                current, conf, hops, via_skill, via_rel = queue.pop(0)

                if hops > self.max_hops:
                    continue

                for _, neighbour, data in self.graph.out_edges(current, data=True):
                    edge_weight = data.get("weight", 0.5)
                    new_conf    = conf * edge_weight
                    relation    = data.get("relation", "IMPLIES")

                    # Skip SIMILAR_TO in inference (handled separately)
                    if relation == SIMILAR_TO:
                        continue

                    # Skip skills already known
                    if neighbour in known_skills:
                        continue

                    # Update if this path gives higher confidence
                    if new_conf > inferred_conf.get(neighbour, 0):
                        inferred_conf[neighbour] = new_conf
                        inferred_via[neighbour]  = (via_skill, relation)

                    # Continue BFS only if above threshold and not visited
                    if neighbour not in visited and new_conf >= self.min_confidence:
                        visited.add(neighbour)
                        queue.append((neighbour, new_conf, hops + 1,
                                      neighbour, relation))

        # Filter by min_confidence and sort by confidence descending
        results = []
        for skill, conf in inferred_conf.items():
            if conf >= self.min_confidence:
                via_skill, via_rel = inferred_via.get(skill, ("unknown", "IMPLIES"))
                results.append({
                    "skill":      skill,
                    "confidence": round(conf, 3),
                    "via":        via_skill,
                    "relation":   via_rel,
                })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results

    # -----------------------------------------------------------------------
    # Domain detection
    # -----------------------------------------------------------------------

    def _find_domains(
        self,
        known_skills: list[str],
        inferred: list[dict],
    ) -> list[dict]:
        """
        Find high-level domain memberships for the candidate.
        Domains are nodes with no outgoing BELONGS_TO edges
        (i.e. top-level categories).
        """
        domain_scores = defaultdict(float)
        all_skills    = set(known_skills) | {i["skill"] for i in inferred}

        for skill in all_skills:
            if skill not in self.graph:
                continue
            # Confidence of this skill
            if skill in known_skills:
                conf = 1.0
            else:
                inf_item = next((i for i in inferred if i["skill"] == skill), None)
                conf = inf_item["confidence"] if inf_item else 0.5

            for _, domain, data in self.graph.out_edges(skill, data=True):
                if data.get("relation") == BELONGS_TO:
                    domain_scores[domain] += conf * data.get("weight", 0.5)

        # Normalise to 0-1 and return top domains
        if not domain_scores:
            return []

        max_score = max(domain_scores.values())
        domains   = []
        for domain, score in sorted(domain_scores.items(),
                                    key=lambda x: x[1], reverse=True):
            domains.append({
                "domain":     domain,
                "confidence": round(min(1.0, score / max_score), 3),
            })

        return domains[:8]   # top 8 domains

    # -----------------------------------------------------------------------
    # Similar skills
    # -----------------------------------------------------------------------

    def _find_similar(self, known_skills: list[str]) -> list[dict]:
        """
        Find skills that are SIMILAR_TO any known skill.
        These are technologies the candidate could likely pick up fast.
        """
        similar = []
        seen    = set(known_skills)

        for skill in known_skills:
            if skill not in self.graph:
                continue
            for _, neighbour, data in self.graph.out_edges(skill, data=True):
                if data.get("relation") == SIMILAR_TO and neighbour not in seen:
                    similar.append({
                        "skill":      neighbour,
                        "similar_to": skill,
                        "confidence": data.get("weight", 0.5),
                    })
                    seen.add(neighbour)

        similar.sort(key=lambda x: x["confidence"], reverse=True)
        return similar

    # -----------------------------------------------------------------------
    # Skill score computation (0-10)
    # -----------------------------------------------------------------------

    def _compute_skill_score(
        self,
        known_skills: list[str],
        inferred: list[dict],
        domains: list[dict],
    ) -> float:
        """
        Compute a 0-10 graph-based skill score.

        Components:
            40%  Breadth — how many distinct skills are confirmed
            30%  Depth   — how many high-confidence inferences are made
            30%  Domain coverage — how many distinct domains are covered
        """

        # Breadth: number of known skills (cap at 20 for normalisation)
        breadth = min(10.0, len(known_skills) / 2.0)

        # Depth: sum of inferred confidences (cap contribution)
        high_conf_inferred = [i for i in inferred if i["confidence"] >= 0.7]
        depth = min(10.0, len(high_conf_inferred) / 1.5)

        # Domain coverage: number of domains (cap at 5)
        domain_coverage = min(10.0, len(domains) * 2.0)

        score = (breadth * 0.4) + (depth * 0.3) + (domain_coverage * 0.3)
        return min(10.0, max(0.0, score))

    # -----------------------------------------------------------------------
    # Utility methods
    # -----------------------------------------------------------------------

    def get_graph_stats(self) -> dict:
        """Return statistics about the knowledge graph."""
        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "relation_counts": {
                rel: sum(1 for _, _, d in self.graph.edges(data=True)
                         if d.get("relation") == rel)
                for rel in [REQUIRES, IMPLIES, BELONGS_TO, SIMILAR_TO]
            },
        }

    def get_skill_neighbours(self, skill: str) -> dict:
        """Inspect what a specific skill connects to."""
        if skill not in self.graph:
            return {"error": f"'{skill}' not found in graph"}

        out_edges = [
            {"target": t, "relation": d["relation"], "weight": d["weight"]}
            for _, t, d in self.graph.out_edges(skill, data=True)
        ]
        in_edges = [
            {"source": s, "relation": d["relation"], "weight": d["weight"]}
            for s, _, d in self.graph.in_edges(skill, data=True)
        ]
        return {
            "skill":     skill,
            "implies":   [e for e in out_edges if e["relation"] == IMPLIES],
            "requires":  [e for e in out_edges if e["relation"] == REQUIRES],
            "belongs_to":[e for e in out_edges if e["relation"] == BELONGS_TO],
            "similar_to":[e for e in out_edges if e["relation"] == SIMILAR_TO],
            "required_by":[e for e in in_edges if e["relation"] == REQUIRES],
        }

    def add_custom_skill(
        self,
        source: str,
        relation: str,
        target: str,
        weight: float = 0.7,
    ):
        """Add a custom skill relationship to the graph at runtime."""
        self.graph.add_edge(source, target, relation=relation, weight=weight)
        if relation == SIMILAR_TO:
            self.graph.add_edge(target, source, relation=relation, weight=weight)
        print(f"[SkillGraph] Added: {source} --[{relation}]--> {target} (w={weight})")


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    graph = SkillGraph(min_confidence=0.5, max_hops=2)

    print("\n" + "="*55)
    print("GRAPH STATISTICS")
    print("="*55)
    print(json.dumps(graph.get_graph_stats(), indent=2))

    # ── Test 1: ML Engineer ────────────────────────────────────────────────
    print("\n" + "="*55)
    print("TEST 1 — ML Engineer")
    print("="*55)
    result1 = graph.infer(
        candidate_name="Akash (ML)",
        known_skills=["Python", "TensorFlow", "Pandas", "Docker"]
    )
    print(f"\nKnown skills    : {result1['known_skills']}")
    print(f"Skill score     : {result1['skill_score']}/10")
    print(f"\nInferred skills ({len(result1['inferred_skills'])}):")
    for s in result1["inferred_skills"]:
        bar = "█" * int(s["confidence"] * 10)
        print(f"  {s['skill']:<30} {bar:<10} {s['confidence']:.2f}  via {s['via']}")
    print(f"\nDomains:")
    for d in result1["domains"]:
        print(f"  {d['domain']:<35} {d['confidence']:.2f}")
    print(f"\nSimilar skills (quick to learn):")
    for s in result1["similar_skills"]:
        print(f"  {s['skill']:<25} similar to {s['similar_to']}")

    # ── Test 2: Darksting profile (your test case from Phase 2) ───────────
    print("\n" + "="*55)
    print("TEST 2 — Darksting (Jupyter, JavaScript, CSS, Python)")
    print("="*55)
    result2 = graph.infer(
        candidate_name="Darksting",
        known_skills=["Jupyter Notebook", "JavaScript", "CSS", "Python", "HTML"]
    )
    print(f"\nKnown skills    : {result2['known_skills']}")
    print(f"Skill score     : {result2['skill_score']}/10")
    print(f"\nInferred skills ({len(result2['inferred_skills'])}):")
    for s in result2["inferred_skills"]:
        bar = "█" * int(s["confidence"] * 10)
        print(f"  {s['skill']:<30} {bar:<10} {s['confidence']:.2f}  via {s['via']}")
    print(f"\nDomains:")
    for d in result2["domains"]:
        print(f"  {d['domain']:<35} {d['confidence']:.2f}")

    # ── Test 3: Inspect a single skill ─────────────────────────────────────
    print("\n" + "="*55)
    print("TEST 3 — Inspect 'PyTorch' in the graph")
    print("="*55)
    print(json.dumps(graph.get_skill_neighbours("PyTorch"), indent=2))