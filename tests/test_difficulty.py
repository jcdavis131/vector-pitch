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
    MAX_GATE_REROLLS,
    band_flag,
    compute_components,
    daily_target_index,
    difficulty_scores,
    expected_solve,
    gated_daily_target_index,
    mulberry32_first,
    mulberry32_stream,
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

# Recorded the same way (game.js RNG functions verbatim under node v24), but
# taking the first FOUR draws of each daily stream as floor(r*633). The
# rotation gate redraws the SAME stream, so multi-draw parity is what keeps
# the Python replica honest.
JS_STREAM_FIXTURES = {
    "2026-07-05": [490, 600, 187, 490],
    "2026-07-22": [255, 343, 246, 24],
    "2026-07-23": [86, 337, 408, 356],
    "2026-08-01": [133, 164, 376, 597],
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


def test_mulberry32_stream_parity_with_game_js():
    n = len(VECTORS["players"])
    assert n == 633, "fixtures were recorded for the 633-player corpus"
    for date, expected in JS_STREAM_FIXTURES.items():
        rng = mulberry32_stream(xmur3_seed("vector-pitch:" + date))
        assert [int(rng() * n) for _ in expected] == expected, date


def test_mulberry32_stream_first_draw_matches_single_draw_helper():
    seed = xmur3_seed("vector-pitch:2026-07-22")
    assert mulberry32_stream(seed)() == mulberry32_first(seed)


# Rotation-gate tests use 2026-07-22, whose stream draws 255, 343, 246, ...
# (JS_STREAM_FIXTURES above), so held-back outcomes are exact.


def test_gate_in_band_first_pick_passes():
    assert gated_daily_target_index("2026-07-22", 633, {255: None}) == (255, 0)


def test_gate_holds_back_out_of_band_pick():
    # 255 flagged -> held; the next draw of the same stream (343) ships
    idx, rerolls = gated_daily_target_index("2026-07-22", 633, {255: "too_easy"})
    assert (idx, rerolls) == (343, 1)
    # 255 and 343 both flagged -> two rerolls, 246 ships
    idx, rerolls = gated_daily_target_index(
        "2026-07-22", 633, {255: "too_hard", 343: "too_easy"}
    )
    assert (idx, rerolls) == (246, 2)


def test_gate_bounded_when_everything_flagged():
    flags = dict.fromkeys(range(633), "too_hard")
    idx, rerolls = gated_daily_target_index("2026-07-22", 633, flags)
    assert rerolls == MAX_GATE_REROLLS, "gate must give up, never spin"
    # the (1 + MAX_GATE_REROLLS)th draw ships even though it is out-of-band
    rng = mulberry32_stream(xmur3_seed("vector-pitch:2026-07-22"))
    last_draw = [int(rng() * 633) for _ in range(MAX_GATE_REROLLS + 1)][-1]
    assert idx == last_draw


def test_gate_missing_calibration_disables_gate():
    # flags=None means no calibration artifact at all: the raw pick ships
    raw = daily_target_index("2026-07-22", 633)
    assert gated_daily_target_index("2026-07-22", 633, None) == (raw, 0)


def test_gate_missing_flag_never_holds():
    # id absent from flags: no evidence about the item, so it is never held
    raw = daily_target_index("2026-07-22", 633)
    assert gated_daily_target_index("2026-07-22", 633, {}) == (raw, 0)


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
        # rotation-gate audit: raw_id is the ungated draw, id the gated pick
        assert u["raw_id"] == daily_target_index(u["date"], len(players))
        assert 0 <= u["gate_rerolls"] <= MAX_GATE_REROLLS
        if u["gate_rerolls"] == 0:
            assert u["id"] == u["raw_id"]
        else:
            assert targets[u["raw_id"]]["flag"] is not None
        if u["gate_rerolls"] < MAX_GATE_REROLLS:
            assert u["in_band"], "gate must land in band unless budget exhausted"
