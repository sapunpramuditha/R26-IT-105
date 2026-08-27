from __future__ import annotations

import os
import json
import random
import argparse
from dataclasses import dataclass, field
import logging

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data

logger = logging.getLogger(__name__)

# Reuse the same hand-written seed edges as skill_graph.py so both
# systems share one vocabulary of node names.
try:
    from app.component1.skill_graph import (
        SKILL_EDGES, REQUIRES, IMPLIES, BELONGS_TO, 
        SkillGraph as _RuleBasedSkillGraph,
    )
except ImportError:
    from skill_graph import (
        SKILL_EDGES, REQUIRES, IMPLIES, BELONGS_TO, 
        SkillGraph as _RuleBasedSkillGraph,
    )


# ---------------------------------------------------------------------------
# Graph construction: seed edges + mined co-occurrence -> PyG Data object
# ---------------------------------------------------------------------------

def build_vocab(mined_skill_sets: list[list[str]] | None = None) -> dict[str, int]:
    """Collect every skill name from seed edges + mined data into one vocab."""
    skills = set()
    for src, _, tgt, _ in SKILL_EDGES:
        skills.add(src)
        skills.add(tgt)
    if mined_skill_sets:
        for skill_set in mined_skill_sets:
            skills.update(skill_set)
    return {name: i for i, name in enumerate(sorted(skills))}


def build_edge_list(vocab: dict[str, int],
                     mined_skill_sets: list[list[str]] | None = None,
                     min_seed_weight: float = 0.5) -> list[tuple[int, int]]:
    """
    Positive edges for training = seed relations above a confidence
    threshold + every co-occurring pair from mined real repos.
    """
    edges = set()

    for src, _, tgt, weight in SKILL_EDGES:
        if weight >= min_seed_weight:
            edges.add((vocab[src], vocab[tgt]))
            edges.add((vocab[tgt], vocab[src]))  # treat as undirected for GNN

    if mined_skill_sets:
        for skill_set in mined_skill_sets:
            idxs = [vocab[s] for s in skill_set if s in vocab]
            for i in range(len(idxs)):
                for j in range(len(idxs)):
                    if i != j:
                        edges.add((idxs[i], idxs[j]))

    return list(edges)


def node_features(vocab: dict[str, int]) -> torch.Tensor:
    """
    Simple starting node features: one-hot domain membership derived
    from BELONGS_TO edges in the seed rules, padded to a fixed width.
    Swap this for real embeddings (e.g. sentence-transformer over the
    skill name) once you have more signal — see README note at bottom.
    """
    domains = sorted({tgt for _, rel, tgt, _ in SKILL_EDGES if rel == BELONGS_TO})
    domain_idx = {d: i for i, d in enumerate(domains)}
    feat_dim = max(len(domains), 8)

    x = torch.zeros(len(vocab), feat_dim)
    belongs = {src: tgt for src, rel, tgt, _ in SKILL_EDGES if rel == BELONGS_TO}
    for skill, idx in vocab.items():
        domain = belongs.get(skill)
        if domain in domain_idx:
            x[idx, domain_idx[domain]] = 1.0
    return x


def build_occurrence_counts(vocab: dict[str, int],
                             mined_skill_sets: list[list[str]] | None) -> dict[str, int]:

    counts = {name: 0 for name in vocab}
    if mined_skill_sets:
        for skill_set in mined_skill_sets:
            for skill in skill_set:
                if skill in counts:
                    counts[skill] += 1
    return counts


def build_pyg_data(mined_path: str | None = None) -> tuple[Data, dict[str, int], dict[str, int]]:
    mined = None
    if mined_path:
        with open(mined_path) as f:
            mined = json.load(f)

    vocab = build_vocab(mined)
    edges = build_edge_list(vocab, mined)
    occurrence_counts = build_occurrence_counts(vocab, mined)

    edge_index = torch.tensor(edges, dtype=torch.long).t().contiguous()
    x = node_features(vocab)

    data = Data(x=x, edge_index=edge_index)
    return data, vocab, occurrence_counts


# ---------------------------------------------------------------------------
# Model: GraphSAGE encoder + dot-product link predictor
# ---------------------------------------------------------------------------

class SkillEncoder(nn.Module):
    def __init__(self, in_dim: int, hidden_dim: int = 64, out_dim: int = 32):
        super().__init__()
        self.conv1 = SAGEConv(in_dim, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, out_dim)
        # NOTE: temperature is deliberately NOT a learned nn.Parameter.
        # An earlier version made it learnable and the model simply
        # trained it back up (~4.9), re-saturating the sigmoid from a
        # different direction — the network will always exploit any free
        # parameter that lets it express false confidence more cheaply
        # than actually separating related from unrelated pairs. Fixing
        # it as a hyperparameter you control directly is more honest.
        self.temperature = 3.0

    def forward(self, x, edge_index):
        h = F.relu(self.conv1(x, edge_index))
        h = F.dropout(h, p=0.2, training=self.training)
        h = self.conv2(h, edge_index)
        return h  # node embeddings


def decode(z: torch.Tensor, edge_index: torch.Tensor,
           temperature: torch.Tensor | float = 1.0) -> torch.Tensor:
    """
    Cosine-similarity score for each edge (u, v), scaled by a temperature.

    Using raw dot products (the original approach) lets a hub node's
    embedding grow arbitrarily large during training, since a bigger
    vector norm trivially increases every dot product it's part of.
    That's what caused confidences to saturate near 1.0 for almost
    everything connected to a popular node like "Python" — the model
    was learning to inflate norms, not to rank neighbours. L2-normalising
    both vectors bounds the score to [-1, 1] regardless of magnitude, so
    the model has to actually separate related from unrelated pairs by
    DIRECTION in embedding space, not by size.
    """
    zu = F.normalize(z[edge_index[0]], dim=-1)
    zv = F.normalize(z[edge_index[1]], dim=-1)
    cos_sim = (zu * zv).sum(dim=-1)
    return cos_sim * temperature


def _node_degrees(num_nodes: int, edge_index: torch.Tensor) -> torch.Tensor:
    deg = torch.zeros(num_nodes)
    deg.index_add_(0, edge_index[0], torch.ones(edge_index.size(1)))
    return deg


def negative_sample(num_nodes: int, num_samples: int,
                     existing: set[tuple[int, int]],
                     degree_weights: torch.Tensor | None = None) -> torch.Tensor:
    """
    Sample negative (non-)edges for contrastive training.

    If degree_weights is given, negatives are drawn PROPORTIONALLY TO
    NODE DEGREE instead of uniformly at random. This is the standard fix
    for the "popularity collapse" failure mode: with uniform random
    negatives, popular hub skills (Python, JavaScript, Docker...) rarely
    appear as negatives relative to how often they appear as positives,
    so the model learns "well-connected node = likely linked" instead of
    learning which specific pairs actually relate. Degree-weighted
    ("hard") negatives force the model to distinguish popular-but-
    unrelated pairs from popular-and-related ones.
    """
    neg = []
    if degree_weights is not None:
        probs = (degree_weights + 1.0)  # smooth so zero-degree nodes are still sampleable
        probs = probs / probs.sum()
    while len(neg) < num_samples:
        if degree_weights is not None:
            u = torch.multinomial(probs, 1).item()
            v = torch.multinomial(probs, 1).item()
        else:
            u, v = random.randrange(num_nodes), random.randrange(num_nodes)
        if u != v and (u, v) not in existing:
            neg.append((u, v))
    return torch.tensor(neg, dtype=torch.long).t().contiguous()


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _split_edges(edge_index: torch.Tensor, val_fraction: float = 0.15
                  ) -> tuple[torch.Tensor, torch.Tensor]:
    """Random split of edges into train/val, so val accuracy actually
    measures generalisation to unseen pairs instead of memorisation."""
    num_edges = edge_index.size(1)
    perm = torch.randperm(num_edges)
    val_size = int(num_edges * val_fraction)
    val_idx, train_idx = perm[:val_size], perm[val_size:]
    return edge_index[:, train_idx], edge_index[:, val_idx]


@torch.no_grad()
def _evaluate(model: SkillEncoder, data: Data, train_edge_index: torch.Tensor,
              eval_edge_index: torch.Tensor, existing: set[tuple[int, int]],
              degree_weights: torch.Tensor) -> tuple[float, float]:
    """Compute loss + accuracy on a held-out edge set.
    Message passing still uses train_edge_index only (no leakage of the
    edges being evaluated into the GNN's own neighbourhood aggregation)."""
    model.eval()
    z = model(data.x, train_edge_index)

    pos_score = decode(z, eval_edge_index, model.temperature)
    neg_edge_index = negative_sample(
        data.x.size(0), eval_edge_index.size(1), existing, degree_weights
    )
    neg_score = decode(z, neg_edge_index, model.temperature)

    scores = torch.cat([pos_score, neg_score])
    labels = torch.cat([torch.ones_like(pos_score), torch.zeros_like(neg_score)])
    loss = F.binary_cross_entropy_with_logits(scores, labels).item()
    acc = ((torch.sigmoid(scores) > 0.5).float() == labels).float().mean().item()
    return loss, acc


def train(data: Data, epochs: int = 100, lr: float = 0.01,
          val_fraction: float = 0.15, patience: int = 20,
          hard_negatives: bool = True, model: SkillEncoder | None = None) -> SkillEncoder:
    """
    Trains with:
      - a held-out validation edge split (val_fraction), so you get an
        honest generalisation number instead of only train accuracy
      - degree-weighted hard negative sampling (hard_negatives=True) to
        fight popularity collapse — see negative_sample()'s docstring
      - early stopping on validation loss (patience), so training stops
        once it's no longer generalising better, rather than running a
        fixed epoch count regardless of overfitting

    Pass `model` if you want to set a custom `.temperature` before
    training (see the CLI's --temperature flag); otherwise a fresh
    SkillEncoder with the default temperature is created.
    """
    if model is None:
        model = SkillEncoder(in_dim=data.x.size(1))
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    num_nodes = data.x.size(0)
    train_edge_index, val_edge_index = _split_edges(data.edge_index, val_fraction)
    existing = set(map(tuple, data.edge_index.t().tolist()))  # full set, so negatives never collide with any real edge (train or val)

    degree_weights = _node_degrees(num_nodes, train_edge_index) if hard_negatives else None

    best_val_loss = float("inf")
    best_state = None
    epochs_without_improvement = 0

    for epoch in range(1, epochs + 1):
        model.train()
        optimizer.zero_grad()

        z = model(data.x, train_edge_index)

        pos_score = decode(z, train_edge_index, model.temperature)
        neg_edge_index = negative_sample(
            num_nodes, train_edge_index.size(1), existing, degree_weights
        )
        neg_score = decode(z, neg_edge_index, model.temperature)

        scores = torch.cat([pos_score, neg_score])
        labels = torch.cat([torch.ones_like(pos_score), torch.zeros_like(neg_score)])
        loss = F.binary_cross_entropy_with_logits(scores, labels)

        loss.backward()
        optimizer.step()

        val_loss, val_acc = _evaluate(
            model, data, train_edge_index, val_edge_index, existing, degree_weights
        )

        if epoch % 10 == 0 or epoch == 1:
            with torch.no_grad():
                train_acc = ((torch.sigmoid(scores) > 0.5).float() == labels).float().mean()
            print(f"epoch {epoch:4d}  train_loss {loss.item():.4f}  train_acc {train_acc.item():.3f}"
                  f"  |  val_loss {val_loss:.4f}  val_acc {val_acc:.3f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                print(f"Early stopping at epoch {epoch} "
                      f"(no val improvement for {patience} epochs). "
                      f"Best val_loss={best_val_loss:.4f}")
                break

    if best_state is not None:
        model.load_state_dict(best_state)  # restore the best-val checkpoint, not the last epoch

    # Final message passing uses the FULL edge set (train+val) so the
    # embeddings saved for inference see all known edges — only training
    # itself withheld val edges, to keep the reported metric honest.
    return model



# ---------------------------------------------------------------------------
# Inference wrapper — mirrors skill_graph.SkillGraph.infer()'s output shape
# so it's a drop-in swap in the rest of Smart Recruiter.
# ---------------------------------------------------------------------------

@dataclass
class SkillGNN:
    model: SkillEncoder
    data: Data
    vocab: dict[str, int]
    occurrence_counts: dict[str, int] = field(default_factory=dict)
    inv_vocab: dict[int, str] = field(init=False)
    vocab_lower: dict[str, str] = field(init=False)  # lowercase name -> canonical vocab name

    def __post_init__(self):
        self.inv_vocab = {i: s for s, i in self.vocab.items()}
        self.vocab_lower = {name.lower(): name for name in self.vocab}
        self.model.eval()
        with torch.no_grad():
            self.embeddings = self.model(self.data.x, self.data.edge_index)
            # Pre-normalised copy for cosine-similarity scoring — see decode()'s
            # docstring for why raw dot products saturate confidence near 1.0.
            self.embeddings_norm = F.normalize(self.embeddings, dim=-1)
            self.temperature = self.model.temperature

    def _resolve(self, skill: str) -> str | None:
        """Case-insensitive lookup against the vocab (e.g. 'python' -> 'Python')."""
        return self.vocab_lower.get(skill.strip().lower())

    def infer(self, candidate_name: str, known_skills: list[str],
              top_k: int = 15, threshold: float = 0.5,
              low_data_threshold: int = 5) -> dict:
        # Resolve each input skill to its canonical, cased vocab name.
        # Anything that doesn't resolve is silently skipped here — the
        # SkillGraph wrapper's `unmatched_skills` field is where callers
        # should surface that to the user, not this lower-level method.
        resolved = [self._resolve(s) for s in known_skills]
        matched_names = {r for r in resolved if r is not None}
        known_idx = [self.vocab[name] for name in matched_names]
        unknown = set(self.vocab) - matched_names

        inferred = []
        with torch.no_grad():
            for skill in unknown:
                j = self.vocab[skill]
                # score against every known skill, keep the strongest link
                best_score, best_via = 0.0, None
                for i in known_idx:
                    cos_sim = (self.embeddings_norm[i] * self.embeddings_norm[j]).sum()
                    score = torch.sigmoid(cos_sim * self.temperature).item()
                    if score > best_score:
                        best_score, best_via = score, self.inv_vocab[i]
                if best_score >= threshold:
                    # Flag inferences resting on thin real-world data (either
                    # side of the pair). E.g. YOLO with only 3 mined repos —
                    # the score may be well-calibrated in the model's own
                    # terms but isn't backed by much real evidence yet.
                    via_count = self.occurrence_counts.get(best_via, 0)
                    skill_count = self.occurrence_counts.get(skill, 0)
                    inferred.append({
                        "skill": skill,
                        "confidence": round(best_score, 3),
                        "via": best_via,
                        "low_data": min(via_count, skill_count) <= low_data_threshold,
                        "occurrence_count": min(via_count, skill_count),
                    })

        inferred.sort(key=lambda x: x["confidence"], reverse=True)
        inferred = inferred[:top_k]

        return {
            "candidate": candidate_name,
            "known_skills": sorted(matched_names),  # canonical casing, not raw input
            "inferred_skills": inferred,
            "skill_score": self._score(list(matched_names), inferred),
        }

    def _score(self, known: list[str], inferred: list[dict]) -> float:
        breadth = min(10.0, len(known) / 2.0)
        high_conf = [i for i in inferred if i["confidence"] >= 0.7]
        depth = min(10.0, len(high_conf) / 1.5)
        return round(min(10.0, breadth * 0.6 + depth * 0.4), 2)

    # -----------------------------------------------------------------------
    # Drop-in compatibility with skill_graph.SkillGraph's public methods,
    # so the Flask blueprint doesn't need to change beyond the import line.
    # -----------------------------------------------------------------------

    def get_graph_stats(self) -> dict:
        return {
            "total_nodes": self.data.x.size(0),
            "total_edges": self.data.edge_index.size(1),
            "backend": "GraphSAGE (GNN)",
        }

    def get_skill_neighbours(self, skill: str) -> dict:
        resolved = self._resolve(skill)
        if resolved is None:
            return {"error": f"'{skill}' not found in graph"}
        i = self.vocab[resolved]
        with torch.no_grad():
            scores = torch.sigmoid(
                (self.embeddings_norm * self.embeddings_norm[i]).sum(dim=-1) * self.temperature
            )
        top = torch.topk(scores, k=min(10, len(scores)))
        return {
            "skill": resolved,
            "related": [
                {"target": self.inv_vocab[idx.item()], "confidence": round(score.item(), 3)}
                for idx, score in zip(top.indices, top.values)
                if idx.item() != i
            ],
        }

    def find_similar_skills(self, known_skills: list[str], top_k: int = 10) -> list[dict]:
        """Mirrors SkillGraph.find_similar_skills — nearest unknown skills by embedding."""
        resolved = [self._resolve(s) for s in known_skills]
        matched_names = {r for r in resolved if r is not None}
        known_idx = [self.vocab[name] for name in matched_names]
        if not known_idx:
            return []
        with torch.no_grad():
            centroid = F.normalize(self.embeddings_norm[known_idx].mean(dim=0), dim=-1)
            scores = torch.sigmoid((self.embeddings_norm * centroid).sum(dim=-1) * self.temperature)
        results = []
        known_set = matched_names
        for idx, score in enumerate(scores.tolist()):
            name = self.inv_vocab[idx]
            if name not in known_set:
                results.append({"skill": name, "confidence": round(score, 3)})
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[:top_k]

    def save(self, path: str):
        torch.save({
            "model_state": self.model.state_dict(),
            "temperature": self.model.temperature,
            "in_dim": self.data.x.size(1),
            "x": self.data.x,
            "edge_index": self.data.edge_index,
            "vocab": self.vocab,
            "occurrence_counts": self.occurrence_counts,
        }, path)

    @classmethod
    def load(cls, path: str) -> "SkillGNN":
        ckpt = torch.load(path, weights_only=False)
        model = SkillEncoder(in_dim=ckpt["in_dim"])
        model.load_state_dict(ckpt["model_state"])
        model.temperature = ckpt.get("temperature", 3.0)  # older checkpoints saved before this field existed
        data = Data(x=ckpt["x"], edge_index=ckpt["edge_index"])
        return cls(model=model, data=data, vocab=ckpt["vocab"],
                   occurrence_counts=ckpt.get("occurrence_counts", {}))



VERIFIER_API_URL = "https://SapunMendis-Resume-Parser.hf.space/verify-skills"


def verify_skill_graph_result(graph_result: dict, 
                               only_flagged: bool = True,
                               verifier_url: str | None = None) -> dict:

    import requests

    url = verifier_url or VERIFIER_API_URL

    try:
        resp = requests.post(
            url,
            json={
                "graph_result": graph_result,
                "only_flagged": only_flagged,
            },
            timeout=60,
        )
        print(resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print('hello')
        return graph_result


class SkillGraph:
    """Drop-in, GNN-backed replacement for skill_graph.SkillGraph."""

    def __init__(self, min_confidence: float = 0.5, max_hops: int = 2,
                 model_path: str | None = None,
                 verify: bool = True,
                 verifier_url: str | None = None):

        self.min_confidence = min_confidence
        self.max_hops = max_hops  # kept for signature compatibility; unused by the GNN
        self.verify = verify
        self.verifier_url = verifier_url

        if model_path is None:
            model_path = os.path.join(os.path.dirname(__file__), "skill_gnn.pt")
        elif not os.path.isabs(model_path) and not os.path.exists(model_path):
            local_path = os.path.join(os.path.dirname(__file__), model_path)
            if os.path.exists(local_path):
                model_path = local_path

        try:
            self._gnn = SkillGNN.load(model_path)
        except FileNotFoundError:
            raise FileNotFoundError(
                f"No trained GNN found at '{model_path}'. Run "
                f"`python gnn_skill_graph.py train --data skill_sets.json "
                f"--out {model_path}` first."
            )

        # Rule-based graph kept alive only for domains / similar_skills /
        # skill-name normalisation (relation-type logic the GNN doesn't do).
        self._rules = _RuleBasedSkillGraph(min_confidence=min_confidence, max_hops=max_hops)

    def infer(self, candidate_name: str, known_skills: list[str]) -> dict:
        matched = self._rules._normalise_skills(known_skills)
        unmatched = [s for s in known_skills if s not in matched]

        # GNN-based inference replaces the BFS/weight-multiplication walk
        gnn_result = self._gnn.infer(candidate_name, matched,
                                      top_k=50, threshold=self.min_confidence)
        inferred = gnn_result["inferred_skills"]

        domains = self._rules._find_domains(matched, inferred)
        similar = self._rules._find_similar(matched)


        result = {
            "candidate": candidate_name,
            "known_skills": matched,
            "unmatched_skills": unmatched,
            "inferred_skills": inferred,
            "domains": domains,
            "similar_skills": similar,
            "skill_score": self._rules._compute_skill_score(matched, inferred, domains),
            "total_competencies": len(matched) + len(inferred),
        }


        if self.verify:
            result = verify_skill_graph_result(
                result, verifier_url=self.verifier_url,
            )

        result["skill_score"] = self._rules._compute_skill_score(matched, result["inferred_skills"], domains)

        return result

    # Pass-through utility methods so any other code calling these on
    # SkillGraph keeps working too.
    def get_graph_stats(self) -> dict:
        return self._gnn.get_graph_stats()

    def get_skill_neighbours(self, skill: str) -> dict:
        return self._gnn.get_skill_neighbours(skill)

    def add_custom_skill(self, source: str, relation: str, target: str, weight: float = 0.7):
        # Custom edges added at runtime only affect the rule-based side
        # (domains/similar_skills); retrain the GNN to have it learn new
        # edges properly rather than patching embeddings ad hoc.
        self._rules.add_custom_skill(source, relation, target, weight)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_train = sub.add_parser("train")
    p_train.add_argument("--data", default=None, help="Path to skill_sets.json from github_miner.py")
    p_train.add_argument("--epochs", type=int, default=200,
                          help="Max epochs; early stopping usually halts sooner")
    p_train.add_argument("--patience", type=int, default=20,
                          help="Stop if val_loss hasn't improved for this many epochs")
    p_train.add_argument("--val-fraction", type=float, default=0.15)
    p_train.add_argument("--no-hard-negatives", action="store_true",
                          help="Disable degree-weighted negative sampling (not recommended — see negative_sample() docstring)")
    p_train.add_argument("--temperature", type=float, default=3.0,
                          help="Fixed cosine-similarity temperature. Lower = flatter/less confident scores, higher = sharper/more saturated. Tune this if confidences look too clustered or too flat on your real data.")
    p_train.add_argument("--out", default="skill_gnn.pt")

    p_infer = sub.add_parser("infer")
    p_infer.add_argument("--model", default="skill_gnn.pt")
    p_infer.add_argument("--name", required=True)
    p_infer.add_argument("--skills", required=True, help="Comma-separated known skills")

    args = parser.parse_args()

    if args.cmd == "train":
        data, vocab, occurrence_counts = build_pyg_data(args.data)
        print(f"Graph: {data.x.size(0)} nodes, {data.edge_index.size(1)} directed edges "
              f"({'seed rules only' if args.data is None else 'seed + mined'})")
        model = SkillEncoder(in_dim=data.x.size(1))
        model.temperature = args.temperature
        model = train(data, epochs=args.epochs, patience=args.patience,
                      val_fraction=args.val_fraction,
                      hard_negatives=not args.no_hard_negatives,
                      model=model)
        SkillGNN(model=model, data=data, vocab=vocab,
                 occurrence_counts=occurrence_counts).save(args.out)
        print(f"Saved -> {args.out}")

    elif args.cmd == "infer":
        gnn = SkillGNN.load(args.model)
        skills = [s.strip() for s in args.skills.split(",")]
        result = SkillGraph().infer(args.name,skills)
        print(json.dumps(result, indent=2))
