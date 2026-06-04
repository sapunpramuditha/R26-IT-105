"""
github_analyzer.py
==================
Phase 2 — GitHub Repository Analysis Module
Intelligent Recruitment Analysis System

Usage:
    from github_analyzer import GitHubAnalyzer

    analyzer = GitHubAnalyzer(token="your_github_token")
    result   = analyzer.analyze("torvalds")
    print(result)
"""

import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import math
from datetime import datetime, timezone
from collections import defaultdict


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GITHUB_API   = "https://api.github.com"
MAX_REPOS    = 100      # Max repos to analyse per user
MAX_EVENTS   = 300      # Max events to fetch for activity scoring
REQUEST_DELAY = 0.5     # Seconds between API calls (stay well under rate limit)


# ---------------------------------------------------------------------------
# GitHubAnalyzer
# ---------------------------------------------------------------------------

class GitHubAnalyzer:
    """
    Fetches and analyses a candidate's GitHub profile.

    Parameters
    ----------
    token : str
        GitHub personal access token.
        Get one at: https://github.com/settings/tokens
        Required scopes: public_repo (read-only is fine)
    """

    def __init__(self, token: str):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })

    # -----------------------------------------------------------------------
    # Public entry point
    # -----------------------------------------------------------------------

    def analyze(self, username: str) -> dict:
        """
        Full analysis pipeline for a GitHub username.

        Returns a feature vector dict ready for the scoring engine.
        Returns None if the user does not exist or is not accessible.
        """
        print(f"[GitHub] Analysing: {username}")

        # Step 1 — fetch profile
        profile = self._fetch_profile(username)
        if profile is None:
            return self._empty_result(username, reason="user_not_found")

        # Step 2 — fetch repositories
        repos = self._fetch_repos(username)
        if not repos:
            return self._empty_result(username, reason="no_public_repos")

        # Step 3 — extract language breakdown
        languages = self._extract_languages(repos)

        # Step 4 — extract activity signals
        activity  = self._extract_activity(username, repos)

        # Step 5 — detect fake / inflated signals
        quality   = self._detect_quality(repos, activity)

        # Step 6 — compute final activity score 0-10
        score = self._compute_score(profile, repos, activity, quality)

        result = {
            "username":               username,
            "name":                   profile.get("name"),
            "account_age_years":      self._account_age(profile),
            "public_repos":           profile.get("public_repos", 0),
            "followers":              profile.get("followers", 0),
            "activity_score":         round(score, 2),
            "languages":              languages,
            "top_language":           max(languages, key=languages.get) if languages else None,
            "original_repos":         activity["original_repos"],
            "forked_repos":           activity["forked_repos"],
            "total_stars":            activity["total_stars"],
            "total_forks_received":   activity["total_forks_received"],
            "avg_commits_per_repo":   activity["avg_commits_per_repo"],
            "repos_with_readme":      activity["repos_with_readme"],
            "repos_with_description": activity["repos_with_description"],
            "last_active_days_ago":   activity["last_active_days_ago"],
            "contribution_days":      activity["contribution_days"],
            "quality_flags":          quality,
            "raw_repos_analysed":     len(repos),
        }

        print(f"[GitHub] Done. Activity score: {score:.2f}/10")
        return result

    # -----------------------------------------------------------------------
    # Step 1 — Fetch profile
    # -----------------------------------------------------------------------

    def _fetch_profile(self, username: str) -> dict | None:
        url  = f"{GITHUB_API}/users/{username}"
        resp = self._get(url)
        if resp is None or resp.status_code == 404:
            print(f"[GitHub] User '{username}' not found.")
            return None
        if resp.status_code != 200:
            print(f"[GitHub] Profile fetch failed: {resp.status_code}")
            return None
        return resp.json()

    # -----------------------------------------------------------------------
    # Step 2 — Fetch repositories
    # -----------------------------------------------------------------------

    def _fetch_repos(self, username: str) -> list[dict]:
        repos  = []
        page   = 1
        while len(repos) < MAX_REPOS:
            url  = f"{GITHUB_API}/users/{username}/repos"
            resp = self._get(url, params={
                "type":     "owner",
                "sort":     "pushed",
                "per_page": 100,
                "page":     page,
            })
            if resp is None or resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1

        print(f"[GitHub] Fetched {len(repos)} repositories")
        return repos[:MAX_REPOS]

    # -----------------------------------------------------------------------
    # Step 3 — Language extraction
    # -----------------------------------------------------------------------

    def _extract_languages(self, repos: list[dict]) -> dict:
        """
        Returns language → percentage of total bytes written.
        Fetches all repo language URLs in parallel to avoid sequential delay.
        """
        byte_counts = defaultdict(int)
        original    = [r for r in repos if not r.get("fork", False)]
        lang_urls   = [r.get("languages_url") for r in original[:30] if r.get("languages_url")]

        def fetch_lang(url):
            resp = self._get(url)
            if resp and resp.status_code == 200:
                return resp.json()
            return {}

        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(fetch_lang, url): url for url in lang_urls}
            for future in as_completed(futures):
                try:
                    for lang, bytes_count in future.result().items():
                        byte_counts[lang] += bytes_count
                except Exception:
                    pass

        total = sum(byte_counts.values())
        if total == 0:
            return {}

        sorted_langs = sorted(byte_counts.items(), key=lambda x: x[1], reverse=True)
        return {
            lang: round(100 * count / total, 1)
            for lang, count in sorted_langs[:10]
        }

    # -----------------------------------------------------------------------
    # Step 4 — Activity signals
    # -----------------------------------------------------------------------

    def _extract_activity(self, username: str, repos: list[dict]) -> dict:
        now = datetime.now(timezone.utc)

        original = [r for r in repos if not r.get("fork", False)]
        forked   = [r for r in repos if r.get("fork", False)]

        # Stars and forks received
        total_stars          = sum(r.get("stargazers_count", 0) for r in original)
        total_forks_received = sum(r.get("forks_count", 0)      for r in original)

        # Repos with readme / description (proxy for repo quality)
        repos_with_desc   = sum(1 for r in original if r.get("description"))
        repos_with_readme = self._count_repos_with_readme(original[:15])

        # Last active (most recently pushed repo)
        push_dates = []
        for r in repos:
            pushed = r.get("pushed_at")
            if pushed:
                push_dates.append(datetime.fromisoformat(pushed.replace("Z", "+00:00")))
        last_active_days = 999
        if push_dates:
            latest = max(push_dates)
            last_active_days = (now - latest).days

        # Average commits per original repo (use size as proxy — exact needs per-repo API)
        # GitHub "size" is in KB and correlates with commit history length
        sizes = [r.get("size", 0) for r in original if r.get("size", 0) > 0]
        avg_size = sum(sizes) / len(sizes) if sizes else 0

        # Contribution days — count unique days with a push event in past 90 days
        contribution_days = self._count_contribution_days(username)

        # Avg commits per repo using commit count API (sample top 10 repos by stars)
        avg_commits = self._estimate_avg_commits(original[:10])

        return {
            "original_repos":         len(original),
            "forked_repos":           len(forked),
            "total_stars":            total_stars,
            "total_forks_received":   total_forks_received,
            "repos_with_description": repos_with_desc,
            "repos_with_readme":      repos_with_readme,
            "last_active_days_ago":   last_active_days,
            "contribution_days":      contribution_days,
            "avg_repo_size_kb":       round(avg_size, 1),
            "avg_commits_per_repo":   avg_commits,
        }

    def _count_repos_with_readme(self, repos: list[dict]) -> int:
        """Check how many repos have a README file — fetched in parallel."""
        def has_readme(repo):
            owner = repo["owner"]["login"]
            name  = repo["name"]
            url   = f"{GITHUB_API}/repos/{owner}/{name}/readme"
            resp  = self._get(url)
            return resp is not None and resp.status_code == 200

        count = 0
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(has_readme, repo) for repo in repos]
            for future in as_completed(futures):
                try:
                    if future.result():
                        count += 1
                except Exception:
                    pass
        return count

    def _count_contribution_days(self, username: str) -> int:
        """Count unique days with push events in the last 90 days."""
        url  = f"{GITHUB_API}/users/{username}/events/public"
        resp = self._get(url, params={"per_page": 100})
        if not resp or resp.status_code != 200:
            return 0

        now        = datetime.now(timezone.utc)
        cutoff     = now.replace(day=now.day) if now.day <= 90 else now
        push_days  = set()

        for event in resp.json():
            if event.get("type") != "PushEvent":
                continue
            created = event.get("created_at", "")
            if not created:
                continue
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if (now - dt).days <= 90:
                push_days.add(dt.date())

        return len(push_days)

    def _estimate_avg_commits(self, repos: list[dict]) -> float:
        """Get actual commit count for a sample of repos — fetched in parallel."""
        def fetch_commit_count(repo):
            owner = repo["owner"]["login"]
            name  = repo["name"]
            url   = f"{GITHUB_API}/repos/{owner}/{name}/commits"
            resp  = self._get(url, params={"per_page": 1})
            if resp and resp.status_code == 200:
                link = resp.headers.get("Link", "")
                if 'rel="last"' in link:
                    try:
                        return int(link.split('page=')[-1].split('>')[0])
                    except Exception:
                        pass
                return len(resp.json())
            return None

        commit_counts = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(fetch_commit_count, repo) for repo in repos[:8]]
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result is not None:
                        commit_counts.append(result)
                except Exception:
                    pass

        return round(sum(commit_counts) / len(commit_counts), 1) if commit_counts else 0.0

    # -----------------------------------------------------------------------
    # Step 5 — Quality / fake signal detection
    # -----------------------------------------------------------------------

    def _detect_quality(self, repos: list[dict], activity: dict) -> dict:
        """
        Detect signals that suggest inflated or low-quality GitHub activity.
        These flags are used by the scoring engine to penalise fake profiles.
        """
        original = [r for r in repos if not r.get("fork", False)]
        total    = len(repos)

        # Flag 1: Almost all repos are forks (>80%)
        fork_ratio = len([r for r in repos if r.get("fork")]) / total if total else 0
        mostly_forks = fork_ratio > 0.8

        # Flag 2: Most repos have zero stars AND zero forks received (unused repos)
        empty_repos = sum(
            1 for r in original
            if r.get("stargazers_count", 0) == 0
            and r.get("forks_count", 0) == 0
            and r.get("size", 0) < 10        # less than 10KB
        )
        empty_ratio = empty_repos / len(original) if original else 0
        mostly_empty = empty_ratio > 0.7

        # Flag 3: Account very new but has many repos (bulk upload pattern)
        # Exempt profiles with high total stars — real developers earn stars organically.
        # contribution_days may be 0 when GraphQL data is unavailable, so we only
        # flag this when there is no social proof (stars) to counter it.
        total_stars     = activity.get("total_stars", 0)
        HIGH_STAR_THRESHOLD = 500   # above this → clearly a real developer
        suspicious_bulk = (
            len(original) > 20
            and activity.get("contribution_days", 0) < 5
            and total_stars < HIGH_STAR_THRESHOLD   # new guard
        )

        # Flag 4: No descriptions, no READMEs (copy-paste repos)
        no_quality_signals = (
            activity["repos_with_description"] == 0
            and activity["repos_with_readme"] == 0
            and len(original) > 5
        )

        # Overall flag
        suspected_fake = mostly_forks or (mostly_empty and no_quality_signals) or suspicious_bulk

        return {
            "mostly_forks":        mostly_forks,
            "fork_ratio":          round(fork_ratio, 2),
            "mostly_empty_repos":  mostly_empty,
            "empty_repo_ratio":    round(empty_ratio, 2),
            "suspicious_bulk":     suspicious_bulk,
            "no_quality_signals":  no_quality_signals,
            "suspected_fake":      suspected_fake,
        }

    # -----------------------------------------------------------------------
    # Step 6 — Score computation (0–10)
    # -----------------------------------------------------------------------

    def _compute_score(
        self,
        profile:  dict,
        repos:    list[dict],
        activity: dict,
        quality:  dict,
    ) -> float:
        """
        Compute a 0–10 GitHub activity score.

        Weights:
            30%  Recency (how recently active)
            25%  Consistency (contribution days)
            20%  Repo quality (READMEs, descriptions, stars)
            15%  Volume (original repos, commit depth)
            10%  Social proof (followers, stars received)
        """

        # --- Recency (0-10) ---
        days_ago = activity["last_active_days_ago"]
        if days_ago <= 7:
            recency = 10.0
        elif days_ago <= 30:
            recency = 8.0
        elif days_ago <= 90:
            recency = 6.0
        elif days_ago <= 180:
            recency = 4.0
        elif days_ago <= 365:
            recency = 2.0
        else:
            recency = 0.5

        # --- Consistency (0-10) ---
        # contribution_days comes from the GitHub contribution calendar which
        # requires the GraphQL API. When unavailable it is 0, which would
        # unfairly zero out 25% of the score. In that case we estimate
        # consistency from stars (social proof of sustained effort) and
        # avg commits per repo (depth of work).
        contrib_days = activity["contribution_days"]
        stars        = activity["total_stars"]
        if contrib_days > 0:
            consistency = min(10.0, contrib_days / 9.0)   # 90 days → 10
        else:
            # Proxy when contribution calendar is unavailable
            star_proxy   = min(10.0, math.log1p(stars)  / math.log1p(1000) * 10)
            commit_proxy = min(10.0, activity["avg_commits_per_repo"] / 5.0)
            consistency  = star_proxy * 0.6 + commit_proxy * 0.4

        # --- Repo quality (0-10) ---
        original = activity["original_repos"]
        if original == 0:
            quality_score = 0.0
        else:
            readme_ratio = activity["repos_with_readme"] / min(original, 15)
            desc_ratio   = activity["repos_with_description"] / original
            # Use log1p(10000) cap so high-star profiles score near 1.0
            star_score   = min(1.0, math.log1p(stars) / math.log1p(10000))
            quality_score = (readme_ratio * 4 + desc_ratio * 3 + star_score * 3)

        # --- Volume (0-10) ---
        repo_score   = min(10.0, original / 2.0)              # 20 repos → 10
        commit_score = min(10.0, activity["avg_commits_per_repo"] / 10.0)
        volume       = (repo_score * 0.5 + commit_score * 0.5)

        # --- Social proof (0-10) ---
        # Use higher log caps so profiles with 10K+ stars/followers
        # score proportionally higher instead of capping out early.
        followers    = profile.get("followers", 0)
        social       = min(10.0,
            math.log1p(followers) / math.log1p(10000) * 5 +
            math.log1p(stars)     / math.log1p(50000) * 5
        )

        # --- Weighted total ---
        raw = (
            recency       * 0.30 +
            consistency   * 0.25 +
            quality_score * 0.20 +
            volume        * 0.15 +
            social        * 0.10
        )

        # --- Penalty for suspected fake activity ---
        if quality["suspected_fake"]:
            raw *= 0.4
            print("[GitHub] Warning: suspected fake/inflated activity — score penalised")
        elif quality["mostly_forks"]:
            raw *= 0.7

        return round(min(10.0, max(0.0, raw)), 2)

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _account_age(self, profile: dict) -> float:
        created = profile.get("created_at")
        if not created:
            return 0.0
        created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        return round((datetime.now(timezone.utc) - created_dt).days / 365.25, 1)

    def _get(self, url: str, params: dict = None) -> requests.Response | None:
        """Wrapper around requests.get with rate-limit handling."""
        try:
            resp = self.session.get(url, params=params, timeout=15)

            # Rate limit hit
            if resp.status_code == 403:
                reset_time = int(resp.headers.get("X-RateLimit-Reset", 0))
                wait       = max(0, reset_time - int(time.time())) + 5
                print(f"[GitHub] Rate limit hit. Waiting {wait}s...")
                time.sleep(wait)
                resp = self.session.get(url, params=params, timeout=15)

            return resp

        except requests.exceptions.RequestException as e:
            print(f"[GitHub] Request error: {e}")
            return None

    def _empty_result(self, username: str, reason: str) -> dict:
        return {
            "username":             username,
            "error":                reason,
            "activity_score":       0.0,
            "languages":            {},
            "top_language":         None,
            "original_repos":       0,
            "total_stars":          0,
            "contribution_days":    0,
            "last_active_days_ago": 999,
            "quality_flags":        {"suspected_fake": False},
        }


# ---------------------------------------------------------------------------
# Quick test — run this file directly to test with any username
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    GITHUB_TOKEN = "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"   # Replace with your token

    analyzer = GitHubAnalyzer(token=GITHUB_TOKEN)

    # Test with a well-known public profile
    result = analyzer.analyze("Darksting")

    print("\n" + "=" * 50)
    print("GITHUB ANALYSIS RESULT")
    print("=" * 50)
    print(json.dumps(result, indent=2))