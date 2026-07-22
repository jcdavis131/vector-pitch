"""Tests for pipeline/build_difficulty.py: RNG parity with game.js,
model invariants, and shipped-JSON schema sanity.

Run:  pytest  (from repo root)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.build_difficulty import (  # noqa: E402
    BAND,
    band_flag,
    compute_components,
    daily_target_index,
    difficulty_scores,
    expected_solve,
    mulberry32_first,
    xmur3_seed,
)

VECTORS = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))
CALIB_PATH = ROOT / "assets" / "difficulty_calibration.json"

# Recorded by running the exact xmur3/mulberry32/seededRng functions from
# assets/game.js under node (v24) for seed 'vector-pitch:{date}', N=633.
# If game.js changes its seed scheme, these MUST be re-recorded.
JS_PARITY_FIXTURES = {
    "2026-07-05": 490,
    "2026-07-06": 305,
    "2026-07-07": 155,
    "2026-07-08": 150,
    "2026-07-12": 345,
    "2026-07-19": 342,
    "2026-07-22": 255,
    "2026-07-23": 86,
    "2026-07-24": 215,
}


def test_rng_parity_with_game_js():
    n = len(VECTORS["players"])
    assert n == 633, "fixtures were recorded for the 633-player corpus"
    for date, expected in JS_PARITY_FIXTURES.items():
        assert daily_target_index(date, n) == expected, date


def test_rng_stream_is_deterministic_and_unit_interval():
    seed = xmur3_seed("vector-pitch:2026-07-22")
    a = mulberry32_first(seed)
    b = mulberry32_first(seed)
    assert a == b
    assert 0.0 <= a < 1.0


def test_difficulty_scores_in_unit_interval_and_deterministic():
    players = VECTORS["players"]
    comps = compute_components(players)
    scores = difficulty_scores(comps)
    assert scores.shape == (len(players),)
    assert float(scores.min()) >= 0.0
    assert float(scores.max()) <= 1.0
    scores2 = difficulty_scores(compute_components(players))
    assert np.array_equal(scores, scores2)


def test_expected_solve_monotone_decreasing_in_difficulty():
    players = VECTORS["players"]
    scores = difficulty_scores(compute_components(players))
    med = float(np.median(scores))
    es = expected_solve(scores, med)
    order = np.argsort(scores)
    assert np.all(np.diff(es[order]) <= 1e-12), "harder must never solve more"
    assert np.all((es > 0.0) & (es < 1.0))


def test_band_flag_edges():
    assert band_flag(BAND[0] - 0.001) == "too_hard"
    assert band_flag(BAND[0]) is None
    assert band_flag(BAND[1]) is None
    assert band_flag(BAND[1] + 0.001) == "too_easy"


def test_shipped_calibration_schema():
    assert CALIB_PATH.exists(), "run python pipeline/build_difficulty.py first"
    calib = json.loads(CALIB_PATH.read_text(encoding="utf-8"))
    players = VECTORS["players"]
    targets = calib["targets"]
    assert len(targets) == len(players)
    for t, p in zip(targets, players, strict=True):
        assert t["id"] == p["id"]
        assert t["name"] == p["name"]
        assert 0.0 <= t["difficulty_score"] <= 1.0
        assert 0.0 < t["expected_solve"] < 1.0
        assert t["in_band"] == (t["flag"] is None)
    s = calib["summary"]
    assert s["n_targets"] == len(targets)
    assert s["n_in_band"] + s["n_too_hard"] + s["n_too_easy"] == s["n_targets"]
    assert sum(s["expected_solve_histogram"]["counts"]) == s["n_targets"]
    assert len(calib["upcoming"]) > 0
    for u in calib["upcoming"]:
        assert 0 <= u["id"] < len(players)
        assert u["in_band"] == (u["flag"] is None)
        # upcoming rows must agree with the per-target table
        assert u["expected_solve"] == targets[u["id"]]["expected_solve"]
