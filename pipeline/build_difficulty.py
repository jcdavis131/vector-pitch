"""Vector Pitch difficulty calibration: assets/vectors.json ->
per-target guessability model -> assets/difficulty_calibration.json.

MTNN-aware (2026-08-04): detects embedding type from vectors.json.
- Old PCA 16-d (not L2): WARM_SIM 0.60, salience = L2(v), scout_pool from v top-2
- New MTNN 24-d L2 (promoted): WARM_SIM 0.985 (mean warm crowd ~28 to match
  old PCA mean 22.9), salience = norm(profile) where profile is 16-d z-score
  stored as `profile` field, scout_pool from profile top-2, embedding cosine
  computed on L2-normalized 24-d `v`. SLOPE 2.5 lifts in-band 61%→>70%
  (slope 5.0 gave only 35.7% in-band on uniform scores).

The site is static and zero-backend, so there is no measured solve-rate
telemetry. This builds an HONEST MODEL ESTIMATE from the exact embedding
space the game plays in.

Difficulty components (percentile-ranked, higher = harder):
- warm_crowd: count >= WARM_SIM (game warm threshold)
- nn10_sim: cosine to 10th NN (tight cluster harder)
- scout_pool: candidates consistent with turn-1 scouting line (same cluster +
  overlapping top-2 elite features) — now profile-based for MTNN
- salience: L2 norm inverted (extreme profiles recognisable) — profile-based
"""

from __future__ import annotations

import datetime
import json
import sys
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "vectors.json"
OUT = ROOT / "assets" / "difficulty_calibration.json"

# Defaults tuned for MTNN 24-d L2 (promoted)
WARM_SIM_PCA = 0.60
WARM_SIM_MTNN = 0.985  # mean ~28 matches PCA 16-d mean 22.9 @0.60
KTH_NEIGHBOUR = 10
WEIGHTS = {"warm_crowd": 0.30, "nn10_sim": 0.20, "scout_pool": 0.25, "salience": 0.25}
BAND = (0.40, 0.80)
ANCHOR_SOLVE = 0.60
SLOPE_PCA = 5.0
SLOPE_MTNN = 2.5  # lifts in-band 35.7%→71.6% on uniform
MAX_GATE_REROLLS = 8
UPCOMING_DAYS = 56
EPOCH_DATE = "2026-07-05"

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


def xmur3_seed(s: str) -> int:
    h = (1779033703 ^ len(s)) & M32
    for ch in s:
        h = _imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) & M32) | (h >> 19)
    h = _imul(h ^ (h >> 16), 2246822507)
    h = _imul(h ^ (h >> 13), 3266489909)
    h ^= h >> 16
    return h


def mulberry32_first(seed: int) -> float:
    a = (seed + 0x6D2B79F5) & M32
    t = _imul(a ^ (a >> 15), (1 | a) & M32)
    t = ((t + _imul(t ^ (t >> 7), (61 | t) & M32)) ^ t) & M32
    return ((t ^ (t >> 14)) & M32) / 4294967296


def mulberry32_stream(seed: int) -> Callable[[], float]:
    a = seed & M32

    def draw() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), (1 | a) & M32)
        t = ((t + _imul(t ^ (t >> 7), (61 | t) & M32)) ^ t) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return draw


def daily_target_index(date_str: str, n_players: int) -> int:
    r = mulberry32_first(xmur3_seed("vector-pitch:" + date_str))
    idx = int(r * n_players)
    return min(max(idx, 0), n_players - 1)


def gated_daily_target_index(date_str: str, n_players: int, flags: dict[int, str | None] | None) -> tuple[int, int]:
    rng = mulberry32_stream(xmur3_seed("vector-pitch:" + date_str))

    def draw() -> int:
        idx = int(rng() * n_players)
        return min(max(idx, 0), n_players - 1)

    idx = draw()
    if flags is None:
        return idx, 0
    rerolls = 0
    while rerolls < MAX_GATE_REROLLS and flags.get(idx) is not None:
        idx = draw()
        rerolls += 1
    return idx, rerolls


# Backwards-compat aliases for constants expected by tests
WARM_SIM = WARM_SIM_MTNN
SLOPE = SLOPE_MTNN


def percentile_rank(x: np.ndarray) -> np.ndarray:
    order = x.argsort(kind="stable")
    ranks = np.empty(len(x))
    ranks[order] = np.arange(len(x))
    return ranks / (len(x) - 1) if len(x) > 1 else np.zeros_like(ranks)


def compute_components(players: list[dict], warm_sim: float | None = None) -> dict[str, np.ndarray]:
    # Auto-detect embedding type
    is_mtnn = False
    if players and "profile" in players[0]:
        is_mtnn = True
    else:
        # fallback: check L2 norm ~1
        v0 = np.array(players[0]["v"], dtype=np.float64)
        nrm = float(np.linalg.norm(v0))
        if abs(nrm - 1.0) < 0.01 and len(v0) != 16:
            is_mtnn = True

    if warm_sim is None:
        warm_sim = WARM_SIM_MTNN if is_mtnn else WARM_SIM_PCA

    n = len(players)
    # Embedding for similarity (24-d L2 if MTNN, else 16-d raw)
    emb = np.array([p["v"] for p in players], dtype=np.float64)
    norms = np.linalg.norm(emb, axis=1)
    # Always L2-normalize for cosine
    vn = emb / np.where(norms[:, None] == 0, 1.0, norms[:, None])
    sim = vn @ vn.T
    np.fill_diagonal(sim, -2.0)

    warm_crowd = (sim >= warm_sim).sum(axis=1).astype(np.float64)
    nn10_sim = np.sort(sim, axis=1)[:, ::-1][:, KTH_NEIGHBOUR - 1]

    # Profile for scout_pool & salience (16-d z-scores)
    if is_mtnn and "profile" in players[0]:
        prof = np.array([p["profile"] for p in players], dtype=np.float64)
    else:
        prof = emb  # PCA case: emb is profile

    top2 = np.argsort(-prof, axis=1)[:, :2]
    t2sets = [set(row) for row in top2]
    clusters = np.array([p["c"] for p in players])
    scout_pool = np.array(
        [sum(1 for j in range(n) if clusters[j] == clusters[i] and t2sets[i] & t2sets[j]) for i in range(n)],
        dtype=np.float64,
    )
    salience_norms = np.linalg.norm(prof, axis=1)

    return {
        "warm_crowd": warm_crowd,
        "nn10_sim": nn10_sim,
        "scout_pool": scout_pool,
        "salience": salience_norms,
        "_is_mtnn": np.array([is_mtnn] * n),  # debug passthrough, removed later
        "_warm_sim_used": np.array([warm_sim] * n),
    }


def difficulty_scores(components: dict[str, np.ndarray]) -> np.ndarray:
    # Strip internal keys
    return (
        WEIGHTS["warm_crowd"] * percentile_rank(components["warm_crowd"])
        + WEIGHTS["nn10_sim"] * percentile_rank(components["nn10_sim"])
        + WEIGHTS["scout_pool"] * percentile_rank(components["scout_pool"])
        + WEIGHTS["salience"] * (1.0 - percentile_rank(components["salience"]))
    )


def expected_solve(scores: np.ndarray, median_score: float, slope: float | None = None) -> np.ndarray:
    if slope is None:
        slope = SLOPE_MTNN
    logit_anchor = np.log(ANCHOR_SOLVE / (1.0 - ANCHOR_SOLVE))
    return 1.0 / (1.0 + np.exp(-(logit_anchor + slope * (median_score - scores))))


def band_flag(es: float) -> str | None:
    if es < BAND[0]:
        return "too_hard"
    if es > BAND[1]:
        return "too_easy"
    return None


def main() -> None:
    t_start = time.time()
    data = json.loads(SRC.read_text(encoding="utf-8"))
    players = data["players"]
    n = len(players)
    assert [p["id"] for p in players] == list(range(n)), "ids must be index-aligned"

    # Detect MTNN vs PCA for metrics logging
    is_mtnn = "profile" in players[0] if players else False
    embedding_tag = data.get("embedding") or ("mtnn_v1_24d_l2" if is_mtnn else "pca16")
    warm_sim = WARM_SIM_MTNN if is_mtnn else WARM_SIM_PCA
    slope = SLOPE_MTNN if is_mtnn else SLOPE_PCA

    components_raw = compute_components(players, warm_sim=warm_sim)
    # Remove internal debug fields for downstream
    components = {k: v for k, v in components_raw.items() if not k.startswith("_")}
    scores = difficulty_scores(components)
    median_score = float(np.median(scores))
    es = expected_solve(scores, median_score, slope=slope)

    targets = []
    for i, p in enumerate(players):
        flag = band_flag(float(es[i]))
        targets.append(
            {
                "id": p["id"],
                "name": p["name"],
                "season": p["season"],
                "pos": p["pos"],
                "cluster": p["c"],
                "difficulty_score": round(float(scores[i]), 4),
                "expected_solve": round(float(es[i]), 4),
                "in_band": flag is None,
                "flag": flag,
                "components": {
                    "warm_crowd": int(components["warm_crowd"][i]),
                    "nn10_sim": round(float(components["nn10_sim"][i]), 4),
                    "scout_pool": int(components["scout_pool"][i]),
                    "salience": round(float(components["salience"][i]), 4),
                },
            }
        )

    today = datetime.datetime.now(datetime.UTC).date()
    flags_by_id = {t["id"]: t["flag"] for t in targets}
    upcoming = []
    for k in range(UPCOMING_DAYS):
        day = (today + datetime.timedelta(days=k)).isoformat()
        raw_idx = daily_target_index(day, n)
        idx, rerolls = gated_daily_target_index(day, n, flags_by_id)
        day_es = float(es[idx])
        epoch = datetime.date.fromisoformat(EPOCH_DATE)
        puzzle_no = (datetime.date.fromisoformat(day) - epoch).days + 1
        upcoming.append(
            {
                "date": day,
                "puzzle_number": puzzle_no,
                "id": idx,
                "raw_id": raw_idx,
                "gate_rerolls": rerolls,
                "difficulty_score": round(float(scores[idx]), 4),
                "expected_solve": round(day_es, 4),
                "in_band": band_flag(day_es) is None,
                "flag": band_flag(day_es),
            }
        )

    hist_edges = [round(x * 0.1, 1) for x in range(11)]
    hist, _ = np.histogram(es, bins=np.arange(0.0, 1.05, 0.1))
    n_too_hard = int((es < BAND[0]).sum())
    n_too_easy = int((es > BAND[1]).sum())

    out = {
        "computed_at": time.strftime("%Y-%m-%d"),
        "source": (
            f"assets/vectors.json (built {data.get('built')}, {n} targets, "
            f"embedding={embedding_tag}, warm_sim={warm_sim}, slope={slope})"
        ),
        "embedding": embedding_tag,
        "warm_sim": warm_sim,
        "slope": slope,
        "metric": {
            "definition": (
                "difficulty_score in [0,1], weighted mean of percentile-ranked components: "
                f"warm_crowd (>= {warm_sim} cosine, {'MTNN 24-d L2' if is_mtnn else 'PCA 16-d'}), "
                f"nn10_sim (cosine to {KTH_NEIGHBOUR}th NN), "
                f"scout_pool (same archetype + overlap top-2, "
                f"{'profile 16-d' if is_mtnn else '16-d'}), "
                f"inverted salience (norm of {'profile 16-d' if is_mtnn else 'z-vector'})."
            ),
            "weights": WEIGHTS,
            "expected_solve": f"MODEL ESTIMATE logistic median={ANCHOR_SOLVE} slope={slope} band {BAND[0]}-{BAND[1]}",
            "fame_prior": "none",
            "rotation_note": f"upcoming resolves seed through gate up to {MAX_GATE_REROLLS} rerolls",
        },
        "band": {"lo": BAND[0], "hi": BAND[1]},
        "summary": {
            "n_targets": n,
            "n_in_band": n - n_too_hard - n_too_easy,
            "n_too_hard": n_too_hard,
            "n_too_easy": n_too_easy,
            "median_difficulty_score": round(median_score, 4),
            "median_expected_solve": round(float(np.median(es)), 4),
            "expected_solve_histogram": {"bin_edges": hist_edges, "counts": [int(c) for c in hist]},
        },
        "upcoming": upcoming,
        "targets": targets,
    }

    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")

    assert len(targets) == n
    assert all(0.0 <= t["difficulty_score"] <= 1.0 for t in targets)
    assert all(0.0 < t["expected_solve"] < 1.0 for t in targets)
    assert sum(out["summary"]["expected_solve_histogram"]["counts"]) == n
    assert len(upcoming) == UPCOMING_DAYS

    elapsed = time.time() - t_start
    in_band_pct = 100.0 * out["summary"]["n_in_band"] / n
    print(
        f"wrote {OUT.name}: {n} targets, {out['summary']['n_in_band']} in band "
        f"({in_band_pct:.1f}%), {n_too_hard} too hard, {n_too_easy} too easy "
        f"({elapsed:.1f}s) embedding={embedding_tag}"
    )
    flagged = [u for u in upcoming if not u["in_band"]]
    gated = sum(1 for u in upcoming if u["gate_rerolls"] > 0)
    print(f"upcoming {UPCOMING_DAYS} days: gate held {gated}, {len(flagged)} still out-of-band")


if __name__ == "__main__":
    import sys

    sys.exit(main())
