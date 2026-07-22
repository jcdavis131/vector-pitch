"""Vector Pitch difficulty calibration: assets/vectors.json ->
per-target guessability model -> assets/difficulty_calibration.json.

The site is static and zero-backend, so there is no measured solve-rate
telemetry. This script builds an HONEST MODEL ESTIMATE of daily-puzzle
difficulty from the exact embedding space the game plays in (the 16-dim
tournament z-score vectors that game.js feeds cosineSim), so the daily
rotation can be audited against the steering-program goal that a daily
puzzle should land in a 40-80% expected-solve band.

Difficulty components (each percentile-ranked across the 633 targets,
higher = harder to guess):
- warm_crowd:  how many other players sit at >= 0.60 cosine similarity
  (the game UI's own "warm" feedback threshold). A crowded warm band
  means % match feedback discriminates poorly.
- nn10_sim:    cosine similarity to the 10th-nearest neighbour -- local
  neighbourhood tightness; near-duplicates make the endgame a coin flip.
- scout_pool:  how many players are consistent with the opening scouting
  line the game prints on turn 1 (same archetype cluster AND overlapping
  top-2 elite features) -- the effective candidate pool a player starts
  from.
- salience:    L2 norm of the z-vector, INVERTED. Extreme profiles
  ("elite scorer +4 sigma") are recognisable from the clue text; profiles
  near the origin read as generic. Inverted so low salience = harder.

difficulty_score = 0.30*warm_crowd + 0.20*nn10_sim
                 + 0.25*scout_pool + 0.25*(1 - salience)   in [0, 1].

expected_solve mapping (MODEL ESTIMATE, not measured): logistic anchored
so the corpus-median target maps to 0.60 (midpoint of the 40-80 steering
band) with slope 5.0 per unit of difficulty score. Anchors are stated
assumptions pending real feedback; the relative ranking is the sturdy
part, the absolute scale is the assumption.

NO fame/coverage prior is applied: the repo carries no popularity data
(vectors.json has no weights/popularity field), and inventing one would
be dishonest. Famous players therefore land mid-scale unless their
statistical profile itself is distinctive.

Upcoming rotation: the daily target is deterministic (game.js seeds
xmur3->mulberry32 with 'vector-pitch:{date}'). The RNG is replicated
here bit-for-bit (parity-tested in tests/test_difficulty.py), so the
next UPCOMING_DAYS days are resolved and any day outside the band is
flagged IN THE JSON ONLY -- rotation logic is deliberately untouched.

Run:  python pipeline/build_difficulty.py
"""

from __future__ import annotations

import datetime
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "vectors.json"
OUT = ROOT / "assets" / "difficulty_calibration.json"

# Model constants (all documented in the JSON metric block).
WARM_SIM = 0.60  # game.js pctColorClass "warm" threshold
KTH_NEIGHBOUR = 10
WEIGHTS = {"warm_crowd": 0.30, "nn10_sim": 0.20, "scout_pool": 0.25, "salience": 0.25}
BAND = (0.40, 0.80)  # steering-program expected-solve band
ANCHOR_SOLVE = 0.60  # corpus-median target maps here (band midpoint)
SLOPE = 5.0  # logistic slope per unit difficulty score
UPCOMING_DAYS = 56
EPOCH_DATE = "2026-07-05"  # game.js EPOCH_DATE (puzzle #1)

M32 = 0xFFFFFFFF


# ---------------------------------------------------------------------------
# game.js RNG replicated bit-for-bit (xmur3 seed -> mulberry32 stream)
# ---------------------------------------------------------------------------


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


def daily_target_index(date_str: str, n_players: int) -> int:
    """Index game.js buildSingleDailyTarget picks for a UTC date (guess mode,
    uniform -- vectors.json ships no weights)."""
    r = mulberry32_first(xmur3_seed("vector-pitch:" + date_str))
    idx = int(r * n_players)
    return min(max(idx, 0), n_players - 1)


# ---------------------------------------------------------------------------
# Difficulty model
# ---------------------------------------------------------------------------


def percentile_rank(x: np.ndarray) -> np.ndarray:
    order = x.argsort(kind="stable")
    ranks = np.empty(len(x))
    ranks[order] = np.arange(len(x))
    return ranks / (len(x) - 1)


def compute_components(players: list[dict]) -> dict[str, np.ndarray]:
    v = np.array([p["v"] for p in players], dtype=np.float64)
    n = len(players)
    norms = np.linalg.norm(v, axis=1)
    vn = v / np.where(norms[:, None] == 0, 1.0, norms[:, None])
    sim = vn @ vn.T
    np.fill_diagonal(sim, -2.0)  # exclude self from all neighbour stats

    warm_crowd = (sim >= WARM_SIM).sum(axis=1).astype(np.float64)
    nn10_sim = np.sort(sim, axis=1)[:, ::-1][:, KTH_NEIGHBOUR - 1]

    top2 = np.argsort(-v, axis=1)[:, :2]
    t2sets = [set(row) for row in top2]
    clusters = np.array([p["c"] for p in players])
    scout_pool = np.array(
        [
            sum(
                1
                for j in range(n)
                if clusters[j] == clusters[i] and t2sets[i] & t2sets[j]
            )
            for i in range(n)
        ],
        dtype=np.float64,
    )
    return {
        "warm_crowd": warm_crowd,
        "nn10_sim": nn10_sim,
        "scout_pool": scout_pool,
        "salience": norms,
    }


def difficulty_scores(components: dict[str, np.ndarray]) -> np.ndarray:
    return (
        WEIGHTS["warm_crowd"] * percentile_rank(components["warm_crowd"])
        + WEIGHTS["nn10_sim"] * percentile_rank(components["nn10_sim"])
        + WEIGHTS["scout_pool"] * percentile_rank(components["scout_pool"])
        + WEIGHTS["salience"] * (1.0 - percentile_rank(components["salience"]))
    )


def expected_solve(scores: np.ndarray, median_score: float) -> np.ndarray:
    logit_anchor = np.log(ANCHOR_SOLVE / (1.0 - ANCHOR_SOLVE))
    return 1.0 / (1.0 + np.exp(-(logit_anchor + SLOPE * (median_score - scores))))


def band_flag(es: float) -> str | None:
    if es < BAND[0]:
        return "too_hard"
    if es > BAND[1]:
        return "too_easy"
    return None


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------


def main() -> None:
    t_start = time.time()
    data = json.loads(SRC.read_text(encoding="utf-8"))
    players = data["players"]
    n = len(players)
    assert [p["id"] for p in players] == list(range(n)), "ids must be index-aligned"

    components = compute_components(players)
    scores = difficulty_scores(components)
    median_score = float(np.median(scores))
    es = expected_solve(scores, median_score)

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
    upcoming = []
    for k in range(UPCOMING_DAYS):
        day = (today + datetime.timedelta(days=k)).isoformat()
        idx = daily_target_index(day, n)
        day_es = float(es[idx])
        epoch = datetime.date.fromisoformat(EPOCH_DATE)
        puzzle_no = (datetime.date.fromisoformat(day) - epoch).days + 1
        upcoming.append(
            {
                "date": day,
                "puzzle_number": puzzle_no,
                "id": idx,
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
        "source": f"assets/vectors.json (built {data.get('built')}, {n} targets)",
        "metric": {
            "definition": (
                "difficulty_score in [0,1] (higher = harder), a weighted mean of "
                "percentile-ranked embedding-space components: warm_crowd (count "
                f"of other players at cosine >= {WARM_SIM}, the game's 'warm' "
                f"feedback threshold), nn10_sim (cosine to {KTH_NEIGHBOUR}th "
                "nearest neighbour), scout_pool (players consistent with the "
                "turn-1 scouting line: same archetype cluster + overlapping "
                "top-2 elite features), and inverted salience (L2 norm of the "
                "16-dim tournament z-vector)."
            ),
            "weights": WEIGHTS,
            "expected_solve": (
                "MODEL ESTIMATE, not measured telemetry (the site is static and "
                "zero-backend; no solve data exists). Logistic map anchored so "
                f"the corpus-median target = {ANCHOR_SOLVE} solve (midpoint of "
                f"the {int(BAND[0] * 100)}-{int(BAND[1] * 100)}% steering band) "
                f"with slope {SLOPE}. The relative ranking is embedding-derived; "
                "the absolute scale is a stated assumption."
            ),
            "fame_prior": (
                "none -- the repo has no popularity/coverage data, so none is "
                "used; famous players score mid-scale unless statistically "
                "distinctive"
            ),
            "rotation_note": (
                "upcoming[] resolves the deterministic daily seed "
                "('vector-pitch:{date}', xmur3->mulberry32, replicated "
                "bit-for-bit) and flags out-of-band days in this JSON only; "
                "rotation logic is unchanged"
            ),
        },
        "band": {"lo": BAND[0], "hi": BAND[1]},
        "summary": {
            "n_targets": n,
            "n_in_band": n - n_too_hard - n_too_easy,
            "n_too_hard": n_too_hard,
            "n_too_easy": n_too_easy,
            "median_difficulty_score": round(median_score, 4),
            "median_expected_solve": round(float(np.median(es)), 4),
            "expected_solve_histogram": {
                "bin_edges": hist_edges,
                "counts": [int(c) for c in hist],
            },
        },
        "upcoming": upcoming,
        "targets": targets,
    }

    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")

    # ---- audit assertions: never ship a dirty file ----
    assert len(targets) == n
    assert all(0.0 <= t["difficulty_score"] <= 1.0 for t in targets), "score range"
    assert all(0.0 < t["expected_solve"] < 1.0 for t in targets), "solve range"
    assert sum(out["summary"]["expected_solve_histogram"]["counts"]) == n
    assert len(upcoming) == UPCOMING_DAYS
    assert all(0 <= u["id"] < n for u in upcoming), "upcoming id range"

    elapsed = time.time() - t_start
    in_band_pct = 100.0 * out["summary"]["n_in_band"] / n
    print(
        f"wrote {OUT.name}: {n} targets, {out['summary']['n_in_band']} in band "
        f"({in_band_pct:.1f}%), {n_too_hard} too hard, {n_too_easy} too easy "
        f"({elapsed:.1f}s)"
    )
    flagged = [u for u in upcoming if not u["in_band"]]
    print(
        f"upcoming {UPCOMING_DAYS} days: {len(flagged)} outside the "
        f"{int(BAND[0] * 100)}-{int(BAND[1] * 100)}% band"
    )
    for u in flagged:
        print(
            f"  {u['date']} #{u['puzzle_number']}: id {u['id']} "
            f"est {u['expected_solve']:.2f} ({u['flag']})"
        )


if __name__ == "__main__":
    sys.exit(main())
