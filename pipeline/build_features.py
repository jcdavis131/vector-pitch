"""Vector Pitch MTNN data pipeline (v2): expanded StatsBomb open corpus ->
per-90 statistical-profile matrix + competition-season z-scores + family masks ->
pipeline/data/train_matrix.npz + pipeline/data/feature_manifest.json.

Reuses the cached-fetch + per-match aggregation layer from build_vectors.py (the live
PCA game pipeline) and WIDENS the corpus from 2 World Cups to all available male
StatsBomb open competitions (leagues + UCL + Euros + WCs + Copa America + AFCON + MLS).

Context-honest: every feature is z-scored WITHIN its competition-season so a La Liga
volume player isn't compared against a WC mean. Generalizes build_vectors.py's
within-tournament normalization to every competition-season.

Additive: does NOT touch assets/vectors.json (the live game). Emits to pipeline/data/.

Run:
  python pipeline/build_features.py                 # starter allowlist (fetch resumable)
  python pipeline/build_features.py --cached-only   # only competitions already on disk
  python pipeline/build_features.py --all-male      # every male non-youth competition
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

# Reuse the live game's fetch + aggregation internals (no duplication).
from build_vectors import (
    BASE,
    EXCLUDE_GOALKEEPERS,
    FEATURES,
    LABELS,
    MIN_MINUTES,
    PlayerAgg,
    fetch_json,
    match_end_seconds,
    process_events,
    process_lineups,
)

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DATA = ROOT / "pipeline" / "data"

# 16 per-90 features -> 3 sport-agnostic role families (towers for the MTNN).
FAMILIES = {
    "attacking": [
        "GOALS_P90",
        "XG_P90",
        "FINISHING_P90",
        "ASSISTS_P90",
        "KEY_PASSES_P90",
        "CROSSES_P90",
    ],
    "passing_control": [
        "PASSES_CMP_P90",
        "PASS_CMP_PCT",
        "PROG_CARRY_P90",
        "DRIBBLES_P90",
        "FOULS_WON_P90",
    ],
    "defending_duel": [
        "PRESSURES_P90",
        "TACKLES_P90",
        "INTERCEPTIONS_P90",
        "RECOVERIES_P90",
        "FOULS_CONV_P90",
    ],
}

# Curated starter set: 2 WCs (already cached) + Euros + Copa + a season each from the
# top-5 leagues + 2 UCL seasons. Mix of league + international, enough to train a NN.
STARTER = [
    (43, 3, "WC 2018"),  # cached
    (43, 106, "WC 2022"),  # cached
    (55, 43, "Euro 2020"),  # ~51 matches — small, international
    (55, 282, "Euro 2024"),  # ~51 matches
    (223, 282, "Copa America 2024"),  # ~32 matches
    # UCL dropped: StatsBomb open data only releases isolated UCL matches (~1/season)
    (11, 90, "La Liga 2020/2021"),  # leagues = the real volume source
    (11, 4, "La Liga 2018/2019"),
    (2, 27, "Premier League 2015/2016"),
    (12, 27, "Serie A 2015/2016"),
    (7, 235, "Ligue 1 2022/2023"),
    (9, 27, "Bundesliga 2015/2016"),
]


def select_competitions(
    mode: str, competitions: list[dict]
) -> list[tuple[int, int, str]]:
    """Return list of (competition_id, season_id, label) to ingest."""
    if mode == "starter":
        return list(STARTER)
    rows = []
    for c in competitions:
        if c.get("competition_gender") != "male":
            continue
        if c.get("competition_youth"):
            continue
        if mode == "all-male":
            label = f"{c['competition_name']} {c['season_name']}"
            rows.append((c["competition_id"], c["season_id"], label))
    return rows


def context_is_cached(comp_id: int, season_id: int) -> bool:
    """True if the match list + at least one match's lineups+events are already on disk."""
    mp = CACHE / f"matches_{comp_id}_{season_id}.json"
    if not mp.exists():
        return False
    try:
        matches = json.loads(mp.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not matches:
        return False
    mid = matches[0]["match_id"]
    return (CACHE / f"lineups_{mid}.json").exists() and (
        CACHE / f"events_{mid}.json"
    ).exists()


def build_context(comp_id: int, season_id: int, label: str, cached_only: bool):
    """Ingest one competition-season -> list of per-90 player rows (dicts).

    Reuses process_lineups/process_events over every match. Fetch is resumable
    (fetch_json caches each file). If cached_only and the match list isn't present,
    skip the context entirely.
    """
    if cached_only and not (CACHE / f"matches_{comp_id}_{season_id}.json").exists():
        return [], 0, 0

    matches = fetch_json(
        f"{BASE}matches/{comp_id}/{season_id}.json",
        f"matches_{comp_id}_{season_id}.json",
        note=f"{label} match list",
    )
    if not matches:
        return [], 0, 1

    agg: dict[int, PlayerAgg] = {}
    fetched, failed = 0, 0
    for i, m in enumerate(matches):
        mid = m["match_id"]
        lineups = fetch_json(
            f"{BASE}lineups/{mid}.json",
            f"lineups_{mid}.json",
            note=f"{label} lineups {mid}",
        )
        events = fetch_json(
            f"{BASE}events/{mid}.json",
            f"events_{mid}.json",
            note=f"{label} events {mid}",
        )
        if not lineups or not events:
            failed += 1
            continue
        end_s = match_end_seconds(events)
        process_lineups(lineups, end_s, agg)
        process_events(events, agg)
        fetched += 1
        if (i + 1) % 32 == 0 or i == len(matches) - 1:
            print(
                f"  {label}: {i + 1}/{len(matches)} matches ({fetched} ok, {failed} fail)"
            )

    # per-90 rows for qualified outfielders
    rows = []
    for pid, a in agg.items():
        if a.minutes < MIN_MINUTES:
            continue
        pos = max(a.pos_minutes, key=a.pos_minutes.get)
        if EXCLUDE_GOALKEEPERS and pos == "GK":
            continue
        m90 = a.minutes / 90.0
        cmp_pct = (a.passes_cmp / a.passes_att) if a.passes_att else 0.0
        vals = {
            "GOALS_P90": a.goals / m90,
            "XG_P90": a.xg / m90,
            "FINISHING_P90": (a.goals - a.xg) / m90,
            "KEY_PASSES_P90": a.key_passes / m90,
            "ASSISTS_P90": a.assists / m90,
            "PASSES_CMP_P90": a.passes_cmp / m90,
            "PASS_CMP_PCT": cmp_pct,
            "PROG_CARRY_P90": a.prog_carry / m90,
            "DRIBBLES_P90": a.dribbles / m90,
            "PRESSURES_P90": a.pressures / m90,
            "TACKLES_P90": a.tackles / m90,
            "INTERCEPTIONS_P90": a.interceptions / m90,
            "RECOVERIES_P90": a.recoveries / m90,
            "CROSSES_P90": a.crosses / m90,
            "FOULS_WON_P90": a.fouls_won / m90,
            "FOULS_CONV_P90": a.fouls_committed / m90,
        }
        rows.append(
            {
                "player_id": pid,
                "name": a.name,
                "team": a.team,
                "pos": pos,
                "minutes": a.minutes,
                "context": label,
                **vals,
            }
        )
    return rows, fetched, failed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cached-only",
        action="store_true",
        help="only ingest competition-seasons already on disk",
    )
    ap.add_argument(
        "--all-male",
        action="store_true",
        help="ingest every male non-youth competition (else starter allowlist)",
    )
    ap.add_argument(
        "--contexts",
        type=str,
        default="",
        help="comma-separated label substrings to keep (e.g. 'WC,Euro,Copa,UCL')",
    )
    ap.add_argument(
        "--out",
        type=str,
        default="train_matrix",
        help="output matrix stem (pipeline/data/<stem>.npz)",
    )
    args = ap.parse_args()
    mode = "all-male" if args.all_male else "starter"
    keep = [s.strip() for s in args.contexts.split(",") if s.strip()]
    t0 = time.time()

    competitions = fetch_json(BASE + "competitions.json", "competitions.json")
    if not competitions:
        raise SystemExit("could not fetch/cache competitions.json -- aborting")
    selected = select_competitions(mode, competitions)
    if keep:
        selected = [s for s in selected if any(k.lower() in s[2].lower() for k in keep)]
    print(
        f"mode={mode} | {len(selected)} competition-seasons selected"
        f"{' (cached-only)' if args.cached_only else ''}"
        f"{f' | contexts filter: {keep}' if keep else ''}"
    )

    all_rows: list[dict] = []
    contexts_loaded: list[str] = []
    total_matches, total_fail = 0, 0
    for comp_id, season_id, label in selected:
        if args.cached_only and not context_is_cached(comp_id, season_id):
            print(f"  skip {label} (not cached)")
            continue
        rows, m_ok, m_fail = build_context(comp_id, season_id, label, args.cached_only)
        if rows:
            all_rows.extend(rows)
            contexts_loaded.append(label)
            total_matches += m_ok
            total_fail += m_fail
            print(
                f"  {label}: {len(rows)} qualified player-seasons "
                f"({m_ok} matches, {time.time() - t0:.0f}s elapsed)"
            )
        else:
            print(f"  {label}: no rows (matches={m_ok}, fail={m_fail})")

    if not all_rows:
        raise SystemExit(
            "no player-seasons produced -- run without --cached-only to fetch"
        )

    n, d = len(all_rows), len(FEATURES)
    X = np.array([[r[f] for f in FEATURES] for r in all_rows], dtype=np.float64)

    # context-honest z-scores: within each competition-season
    ctx_index: dict[str, list[int]] = {}
    for i, r in enumerate(all_rows):
        ctx_index.setdefault(r["context"], []).append(i)
    Z = np.zeros_like(X)
    for _ctx, idxs in ctx_index.items():
        block = X[idxs]
        mu = block.mean(axis=0)
        sd = block.std(axis=0)
        sd[sd == 0] = 1.0
        Z[idxs] = (block - mu) / sd
    Z = np.clip(Z, -4, 4)
    M = np.ones_like(
        Z, dtype=np.float32
    )  # pitch open data is complete for qualified players

    ctx_ids = np.zeros(n, dtype=np.int64)
    ctx_list = sorted(ctx_index)
    ctx_map = {c: i for i, c in enumerate(ctx_list)}
    for i, r in enumerate(all_rows):
        ctx_ids[i] = ctx_map[r["context"]]

    DATA.mkdir(parents=True, exist_ok=True)
    np.savez(
        DATA / f"{args.out}.npz",
        X=Z.astype(np.float32),
        M=M,
        ctx_ids=ctx_ids,
        n_rows=n,
        n_features=d,
    )
    (DATA / f"meta_{args.out}.json").write_text(
        json.dumps(
            [
                {
                    "name": r["name"],
                    "team": r["team"],
                    "pos": r["pos"],
                    "minutes": round(r["minutes"], 1),
                    "context": r["context"],
                    "player_id": r["player_id"],
                }
                for r in all_rows
            ],
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    fam_lists = dict(FAMILIES.items())
    coverage = dict.fromkeys(FAMILIES, 1.0)
    manifest = {
        "built": time.strftime("%Y-%m-%d"),
        "features": FEATURES,
        "families": {feat: fam for fam, cols in FAMILIES.items() for feat in cols},
        "family_lists": fam_lists,
        "contexts": ctx_list,
        "n_rows": n,
        "n_features": d,
        "n_contexts": len(ctx_list),
        "coverage": coverage,
        "normalization": "per-90 rates, z-scored within each competition-season (context-honest)",
        "matches_processed": total_matches,
        "matches_failed": total_fail,
        "feature_labels": LABELS,
    }
    (DATA / f"feature_manifest_{args.out}.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    # audit asserts
    assert not np.isnan(Z).any(), "NaN in z-scored matrix"
    assert Z.shape == (n, d)
    assert all(len(v) == d for v in Z)
    assert all(-4.0001 <= v <= 4.0001 for v in Z.reshape(-1))

    print(
        f"\nwrote {args.out}.npz: {n} player-seasons, {d} features, "
        f"{len(ctx_list)} contexts, {total_matches} matches "
        f"({total_fail} failed) | {time.time() - t0:.0f}s"
    )
    for c in ctx_list:
        print(f"  {c}: {len(ctx_index[c])} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
