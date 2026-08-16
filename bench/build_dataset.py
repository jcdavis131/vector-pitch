#!/usr/bin/env python3
"""Build the REAL-data multi-target bench dataset for vector-pitch.

Solo personal project, no connection to employer, built with public/free-tier only

Source: StatsBomb open-data (https://github.com/statsbomb/open-data), the SAME
public dataset the repo's committed corpus (pipeline/build_vectors.py /
build_features.py) is built from. The committed corpus is per-(player,
competition-season) aggregates — it has no per-match time axis, so the two
forward prediction targets the vector-bench registry declares for pitch
(next_window_minutes, next_window_goal_contribution) cannot be wired from it.
This builder fetches the per-MATCH layer for a bounded league panel instead:

    FA Women's Super League — seasons 2018/2019, 2019/2020, 2020/2021
    (competition_id 37; season_ids 4, 42, 90; 325 matches, all "available")

chosen because it is the only competition in StatsBomb open data with three
CONSECUTIVE full-league seasons (players recur match to match and season to
season), which is exactly what a forward player-window panel needs. Fetches are
bounded: matches + lineups + events per match, parsed with the repo's own
per-match aggregation functions (process_lineups / process_events imported from
pipeline/build_vectors.py — no reimplementation), then the raw event files are
DISCARDED; only the small per-(player, match) aggregate rows are kept and
committed (bench/data/wsl_player_matches_<season_id>.json) so the dataset build
is reproducible offline from real committed data.

Windows and forward-shifted labels
----------------------------------
Entities = players; time = non-overlapping windows of N=3 consecutive matches
of the player's TEAM within one season (windows never span seasons). A row is
(player, team-season, window w), emitted from the first window in which the
player appears in the team's matchday squad through the second-to-last window
of the season:

- features use ONLY matches in windows first_seen..w (i.e. data at times <= t):
  current-window per-90 rates (masked when the player played 0 minutes in w),
  current-window volume/availability counts, season-to-date history, and the
  season-to-date dominant-position one-hot;
- y_next_window_minutes = the player's total minutes over the N matches of
  window w+1 (0 when they are not in the squad — a real availability outcome);
- y_next_window_goal_contribution = (goals + assists) * 90 / minutes over
  window w+1, defined (mask=1) only when the player played > 0 minutes in w+1.

Every label therefore uses only matches STRICTLY AFTER the feature window
(asserted row-by-row: feat_end_date < label_start_date).

Split (temporal, by season)
---------------------------
Harness time_key = label-window END date (days since 1970-01-01), cut at
2020-07-01: train = label windows inside 2018/19 + 2019/20 (last 19/20 match
2020-02-23), test = label windows inside 2020/21 (first match 2020-09-05). The
MTNN's own early-stopping val slice is the tail of the train side (label-end >=
2019-12-01); its gradient rows end before that. Preprocessing (vector-core
MaskedZScaler) is fit on harness-TRAIN rows only.

Goalkeepers are excluded (repo convention, EXCLUDE_GOALKEEPERS): any row whose
season-to-date played minutes are majority-GK is dropped. Players with zero
played minutes to date (unused subs so far) are kept, with role mask 0.

Usage
-----
    python bench/build_dataset.py                 # fetch (cached) + build
    python bench/build_dataset.py --cached-only   # build from committed jsons
    python bench/build_dataset.py --exchange-dir /workspace/exchange/pitch

Writes bench/data/pitch_bench_dataset.npz + bench/data/datasheet.json (and the
same two files to --exchange-dir when given).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

# The repo's own per-match aggregation layer — imported, not reimplemented.
from build_vectors import (  # noqa: E402
    BASE,
    UA,
    PlayerAgg,
    match_end_seconds,
    process_events,
    process_lineups,
)

DATA_DIR = ROOT / "bench" / "data"
SEED = 0
N_WINDOW = 3  # matches per window

# FA Women's Super League: the only 3 consecutive full-league seasons in
# StatsBomb open data. (competition_id, season_id, label)
COMPETITION_ID = 37
SEASONS = [
    (4, "2018/2019"),
    (42, "2019/2020"),
    (90, "2020/2021"),
]

CUT_DATE = date(2020, 7, 1)  # label-end >= this  -> harness TEST (2020/21)
VAL_DATE = date(2019, 12, 1)  # label-end in [this, cut) -> MTNN val (early stop)
EPOCH = date(1970, 1, 1)

# Feature families (masked towers, repo convention). Names -> column lists are
# emitted into the npz as fam / fam_idx so the trainer builds towers from data.
FAMILIES: dict[str, list[str]] = {
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
    "volume_availability": [
        "CUR_MINUTES",
        "CUR_IN_SQUAD",
        "CUR_PLAYED",
        "CUR_STARTS",
        "CUR_MINUTES_SHARE",
        "CUR_GC",
    ],
    "history": [
        "PREV_WINDOW_MINUTES",
        "STD_MINUTES",
        "MEAN_WINDOW_MINUTES",
        "STD_GC_P90",
        "STARTS_SHARE",
        "WINDOWS_SEEN",
    ],
    "role": ["POS_DEF", "POS_MID", "POS_FWD"],
}
FEATURES: list[str] = [c for cols in FAMILIES.values() for c in cols]

TARGETS = ("next_window_minutes", "next_window_goal_contribution")


def days(d: date) -> int:
    return (d - EPOCH).days


# --------------------------------------------------------------------------- #
# Phase A — fetch + per-match aggregation (cached to committed JSON)
# --------------------------------------------------------------------------- #
def _fetch(url: str, retries: int = 4) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(retries):
        try:
            raw = urllib.request.urlopen(req, timeout=60).read()
            return json.loads(raw)
        except Exception as e:
            if attempt == retries - 1:
                raise
            wait = 2**attempt
            print(
                f"  fetch {url.rsplit('/', 2)[-1]}: attempt {attempt + 1} failed "
                f"({type(e).__name__}); retrying in {wait}s"
            )
            time.sleep(wait)
    raise RuntimeError("unreachable")


def aggregate_match(match: dict) -> list[dict]:
    """One match -> per-player aggregate rows, via the repo's own functions."""
    mid = match["match_id"]
    lineups = _fetch(f"{BASE}lineups/{mid}.json")
    events = _fetch(f"{BASE}events/{mid}.json")
    end_seconds = match_end_seconds(events)

    agg: dict[int, PlayerAgg] = {}
    process_lineups(lineups, end_seconds, agg)
    process_events(events, agg)

    # starts + squad membership come from the lineups file directly
    started: set[int] = set()
    team_of: dict[int, str] = {}
    for team in lineups:
        for pl in team["lineup"]:
            team_of[pl["player_id"]] = team["team_name"]
            for stint in pl.get("positions", []):
                if stint.get("start_reason") == "Starting XI":
                    started.add(pl["player_id"])
                break  # only the first stint can be Starting XI

    home = match["home_team"]["home_team_name"]
    away = match["away_team"]["away_team_name"]
    rows = []
    for pid, a in agg.items():
        team = team_of.get(pid, a.team)
        rows.append(
            {
                "match_id": mid,
                "match_date": match["match_date"],
                "team": team,
                "opponent": away if team == home else home,
                "player_id": pid,
                "name": a.name,
                "minutes": round(a.minutes, 2),
                "gk_minutes": round(a.pos_minutes["GK"], 2),
                "def_minutes": round(a.pos_minutes["DEF"], 2),
                "mid_minutes": round(a.pos_minutes["MID"], 2),
                "fwd_minutes": round(a.pos_minutes["FWD"], 2),
                "started": pid in started,
                "goals": a.goals,
                "assists": a.assists,
                "xg": round(a.xg, 4),
                "shots": a.shots,
                "key_passes": a.key_passes,
                "passes_att": a.passes_att,
                "passes_cmp": a.passes_cmp,
                "dribbles": a.dribbles,
                "pressures": a.pressures,
                "tackles": a.tackles,
                "interceptions": a.interceptions,
                "recoveries": a.recoveries,
                "crosses": a.crosses,
                "fouls_won": a.fouls_won,
                "fouls_committed": a.fouls_committed,
                "prog_carry": round(a.prog_carry, 2),
            }
        )
    return rows


def fetch_season(season_id: int, label: str, cached_only: bool) -> list[dict]:
    """All per-(player, match) rows for one season, cached to committed JSON."""
    out_path = DATA_DIR / f"wsl_player_matches_{season_id}.json"
    matches = _fetch(f"{BASE}matches/{COMPETITION_ID}/{season_id}.json")
    matches = sorted(
        (m for m in matches if m.get("match_status") == "available"),
        key=lambda m: (m["match_date"], m["match_id"]),
    )
    cached: dict[int, list[dict]] = {}
    if out_path.exists():
        for r in json.loads(out_path.read_text(encoding="utf-8"))["rows"]:
            cached.setdefault(r["match_id"], []).append(r)
    todo = [m for m in matches if m["match_id"] not in cached]
    if cached_only and todo:
        raise SystemExit(
            f"--cached-only but {len(todo)} matches of WSL {label} are not in "
            f"{out_path.name}; run without --cached-only first"
        )
    if todo:
        print(f"[fetch] WSL {label}: {len(todo)} matches to fetch ({len(cached)} cached)")
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=4) as ex:
            for i, rows in enumerate(ex.map(aggregate_match, todo)):
                cached[todo[i]["match_id"]] = rows
                if (i + 1) % 25 == 0:
                    print(f"  ... {i + 1}/{len(todo)} matches ({time.time() - t0:.0f}s)")
        all_rows = [r for m in matches for r in cached[m["match_id"]]]
        all_rows.sort(key=lambda r: (r["match_date"], r["match_id"], r["player_id"]))
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(
                {
                    "competition_id": COMPETITION_ID,
                    "season_id": season_id,
                    "season": label,
                    "source": f"{BASE}matches/{COMPETITION_ID}/{season_id}.json"
                    " + lineups/<match_id>.json + events/<match_id>.json",
                    "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "n_matches": len(matches),
                    "rows": all_rows,
                },
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"[fetch] WSL {label}: wrote {out_path.name} ({len(all_rows)} player-match rows, {len(matches)} matches)")
    else:
        all_rows = [r for m in matches for r in cached[m["match_id"]]]
        print(f"[fetch] WSL {label}: fully cached ({len(all_rows)} player-match rows, {len(matches)} matches)")
    return all_rows


# --------------------------------------------------------------------------- #
# Phase B — windows, forward labels, masks, train-only scaling
# --------------------------------------------------------------------------- #
def p90(count: float, minutes: float) -> float:
    return count * 90.0 / minutes if minutes > 0 else 0.0


def build_rows(season_rows: dict[str, list[dict]]):
    """(player, team-season, window) rows with features at t and labels at t+1."""
    feat_rows: list[list[float]] = []
    mask_rows: list[list[float]] = []
    meta_rows: list[dict] = []
    n_gk_dropped = 0

    for season, rows in season_rows.items():
        by_team: dict[str, dict[int, list[dict]]] = {}
        for r in rows:
            by_team.setdefault(r["team"], {}).setdefault(r["match_id"], []).append(r)
        for team, by_match in sorted(by_team.items()):
            matches = sorted(
                {r[0]["match_id"]: r[0]["match_date"] for r in by_match.values()}.items(),
                key=lambda kv: (kv[1], kv[0]),
            )
            n_win = len(matches) // N_WINDOW
            if n_win < 2:
                continue
            win_mids = [[mid for mid, _ in matches[w * N_WINDOW : (w + 1) * N_WINDOW]] for w in range(n_win)]
            win_dates = [[d for _, d in matches[w * N_WINDOW : (w + 1) * N_WINDOW]] for w in range(n_win)]
            # player -> window -> list of that player's match rows
            pw: dict[int, dict[int, list[dict]]] = {}
            names: dict[int, str] = {}
            for w, mids in enumerate(win_mids):
                for mid in mids:
                    for r in by_match[mid]:
                        pw.setdefault(r["player_id"], {}).setdefault(w, []).append(r)
                        names[r["player_id"]] = r["name"]

            for pid, wmap in sorted(pw.items()):
                first_seen = min(wmap)
                for w in range(first_seen, n_win - 1):
                    cur = wmap.get(w, [])
                    hist = [r for ww in range(first_seen, w + 1) for r in wmap.get(ww, [])]
                    # --- season-to-date position & GK exclusion (<= t only) ---
                    played_min = sum(r["minutes"] for r in hist)
                    gk_min = sum(r["gk_minutes"] for r in hist)
                    if played_min > 0 and gk_min > 0.5 * played_min:
                        n_gk_dropped += 1
                        continue
                    # role one-hot = dominant DEF/MID/FWD by season-to-date
                    # played minutes (per-match pos_minutes from the repo's
                    # process_lineups); masked 0 until the first played minute.
                    role = [0.0, 0.0, 0.0]
                    role_mask = 1.0 if played_min > 0 else 0.0
                    if played_min > 0:
                        d_min = sum(r.get("def_minutes", 0.0) for r in hist)
                        m_min = sum(r.get("mid_minutes", 0.0) for r in hist)
                        f_min = sum(r.get("fwd_minutes", 0.0) for r in hist)
                        role[int(np.argmax([d_min, m_min, f_min]))] = 1.0

                    cur_minutes = sum(r["minutes"] for r in cur)
                    cur_in_squad = len(cur)
                    cur_played = sum(1 for r in cur if r["minutes"] > 0)
                    cur_starts = sum(1 for r in cur if r["started"])
                    cur_goals = sum(r["goals"] for r in cur)
                    cur_assists = sum(r["assists"] for r in cur)
                    cur_xg = sum(r["xg"] for r in cur)
                    cur_att = sum(r["passes_att"] for r in cur)
                    cur_cmp = sum(r["passes_cmp"] for r in cur)

                    m_cur = 1.0 if cur_minutes > 0 else 0.0
                    feats = {
                        "GOALS_P90": p90(cur_goals, cur_minutes),
                        "XG_P90": p90(cur_xg, cur_minutes),
                        "FINISHING_P90": p90(cur_goals - cur_xg, cur_minutes),
                        "ASSISTS_P90": p90(cur_assists, cur_minutes),
                        "KEY_PASSES_P90": p90(sum(r["key_passes"] for r in cur), cur_minutes),
                        "CROSSES_P90": p90(sum(r["crosses"] for r in cur), cur_minutes),
                        "PASSES_CMP_P90": p90(cur_cmp, cur_minutes),
                        "PASS_CMP_PCT": (cur_cmp / cur_att) if cur_att > 0 else 0.0,
                        "PROG_CARRY_P90": p90(sum(r["prog_carry"] for r in cur), cur_minutes),
                        "DRIBBLES_P90": p90(sum(r["dribbles"] for r in cur), cur_minutes),
                        "FOULS_WON_P90": p90(sum(r["fouls_won"] for r in cur), cur_minutes),
                        "PRESSURES_P90": p90(sum(r["pressures"] for r in cur), cur_minutes),
                        "TACKLES_P90": p90(sum(r["tackles"] for r in cur), cur_minutes),
                        "INTERCEPTIONS_P90": p90(sum(r["interceptions"] for r in cur), cur_minutes),
                        "RECOVERIES_P90": p90(sum(r["recoveries"] for r in cur), cur_minutes),
                        "FOULS_CONV_P90": p90(sum(r["fouls_committed"] for r in cur), cur_minutes),
                        "CUR_MINUTES": cur_minutes,
                        "CUR_IN_SQUAD": float(cur_in_squad),
                        "CUR_PLAYED": float(cur_played),
                        "CUR_STARTS": float(cur_starts),
                        "CUR_MINUTES_SHARE": cur_minutes / (N_WINDOW * 90.0),
                        "CUR_GC": float(cur_goals + cur_assists),
                        "PREV_WINDOW_MINUTES": sum(r["minutes"] for r in wmap.get(w - 1, [])),
                        "STD_MINUTES": played_min,
                        "MEAN_WINDOW_MINUTES": played_min / (w - first_seen + 1),
                        "STD_GC_P90": p90(sum(r["goals"] + r["assists"] for r in hist), played_min),
                        "STARTS_SHARE": (sum(1 for r in hist if r["started"]) / len(hist)) if hist else 0.0,
                        "WINDOWS_SEEN": float(w - first_seen + 1),
                        "POS_DEF": role[0],
                        "POS_MID": role[1],
                        "POS_FWD": role[2],
                    }
                    masks = dict.fromkeys(FEATURES, 1.0)
                    for c in FAMILIES["attacking"] + FAMILIES["passing_control"] + FAMILIES["defending_duel"]:
                        masks[c] = m_cur
                    masks["PASS_CMP_PCT"] = 1.0 if cur_att > 0 else 0.0
                    masks["PREV_WINDOW_MINUTES"] = 1.0 if w > first_seen else 0.0
                    masks["STD_GC_P90"] = 1.0 if played_min > 0 else 0.0
                    masks["STARTS_SHARE"] = 1.0 if hist else 0.0
                    for c in FAMILIES["role"]:
                        masks[c] = role_mask

                    nxt = wmap.get(w + 1, [])
                    nw_minutes = sum(r["minutes"] for r in nxt)
                    nw_gc = sum(r["goals"] + r["assists"] for r in nxt)

                    feat_rows.append([feats[c] for c in FEATURES])
                    mask_rows.append([masks[c] for c in FEATURES])
                    meta_rows.append(
                        {
                            "player_id": pid,
                            "name": names[pid],
                            "team": team,
                            "season": season,
                            "window_index": w,
                            "feat_end": win_dates[w][-1],
                            "label_start": win_dates[w + 1][0],
                            "label_end": win_dates[w + 1][-1],
                            "y_minutes": nw_minutes,
                            "y_gc": (nw_gc * 90.0 / nw_minutes) if nw_minutes > 0 else np.nan,
                            "gc_defined": nw_minutes > 0,
                        }
                    )
    print(f"[build] {len(feat_rows)} player-window rows ({n_gk_dropped} GK rows excluded)")
    return feat_rows, mask_rows, meta_rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cached-only", action="store_true", help="never hit the network; require committed season jsons")
    ap.add_argument("--out", type=str, default=str(DATA_DIR / "pitch_bench_dataset.npz"))
    ap.add_argument("--datasheet", type=str, default=str(DATA_DIR / "datasheet.json"))
    ap.add_argument("--exchange-dir", type=str, default="")
    args = ap.parse_args(argv)

    from vector_core.preproc import MaskedZScaler

    season_rows = {label: fetch_season(sid, label, args.cached_only) for sid, label in SEASONS}
    feat_rows, mask_rows, meta = build_rows(season_rows)

    X_raw = np.asarray(feat_rows, dtype=np.float32)
    M = np.asarray(mask_rows, dtype=np.float32)
    n = X_raw.shape[0]

    feat_end = np.array([days(date.fromisoformat(m["feat_end"])) for m in meta], np.int64)
    label_start = np.array([days(date.fromisoformat(m["label_start"])) for m in meta], np.int64)
    label_end = np.array([days(date.fromisoformat(m["label_end"])) for m in meta], np.int64)
    assert (feat_end < label_start).all(), "leakage: a feature window overlaps its label window"

    y_min = np.array([m["y_minutes"] for m in meta], np.float32)
    y_gc = np.array([m["y_gc"] for m in meta], np.float32)
    mask_min = np.ones(n, dtype=bool)
    mask_gc = np.array([m["gc_defined"] for m in meta], dtype=bool)

    cut, val0 = days(CUT_DATE), days(VAL_DATE)
    is_test = label_end >= cut
    is_val = (label_end >= val0) & ~is_test
    is_train = ~is_test & ~is_val
    train_idx = np.where(is_train)[0]
    val_idx = np.where(is_val)[0]
    test_idx = np.where(is_test)[0]

    # preprocessing fit on the harness TRAIN side only (train+val < cut)
    harness_train = np.where(~is_test)[0]
    scaler = MaskedZScaler().fit(X_raw[harness_train], M[harness_train])
    X = scaler.transform(X_raw, M)

    fam_names = sorted(FAMILIES)
    width = max(len(cols) for cols in FAMILIES.values())
    fam_idx = np.full((len(fam_names), width), -1, dtype=np.int64)
    for r, f in enumerate(fam_names):
        for j, c in enumerate(FAMILIES[f]):
            fam_idx[r, j] = FEATURES.index(c)

    entity = np.array([m["player_id"] for m in meta], np.int64)
    out = {
        "X": X,
        "M": M,
        "X_raw": X_raw,
        "feat": np.array(FEATURES),
        "fam": np.array(fam_names),
        "fam_idx": fam_idx,
        "y_next_window_minutes": y_min,
        "mask_next_window_minutes": mask_min,
        "y_next_window_goal_contribution": np.nan_to_num(y_gc, nan=0.0),
        "mask_next_window_goal_contribution": mask_gc,
        "entity_ids": entity,
        "player_names": np.array([m["name"] for m in meta]),
        "team": np.array([m["team"] for m in meta]),
        "season": np.array([m["season"] for m in meta]),
        "window_index": np.array([m["window_index"] for m in meta], np.int64),
        "time_ids": label_end,
        "feat_end_days": feat_end,
        "label_start_days": label_start,
        "label_end_days": label_end,
        "train_idx": train_idx,
        "val_idx": val_idx,
        "test_idx": test_idx,
        "cut_days": np.int64(cut),
        "val_start_days": np.int64(val0),
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_path, **out)
    print(
        f"[build] wrote {out_path} "
        f"({n} rows; train={len(train_idx)} val={len(val_idx)} test={len(test_idx)}; "
        f"gc-defined={int(mask_gc.sum())})"
    )

    per_season = {s: int((np.array([m["season"] for m in meta]) == s).sum()) for _, s in SEASONS}
    datasheet = {
        "domain": "pitch",
        "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "StatsBomb open-data (github.com/statsbomb/open-data), "
        "FA Women's Super League seasons 2018/2019, 2019/2020, 2020/2021 "
        "(competition_id 37; season_ids 4, 42, 90; 325 matches). "
        "Per-match aggregates committed as bench/data/wsl_player_matches_*.json; "
        "aggregation uses pipeline/build_vectors.py process_lineups/process_events.",
        "rows": int(n),
        "entities": len(np.unique(entity)),
        "entity": "player (StatsBomb player_id); a row is (player, team-season, window of 3 consecutive team matches)",
        "time_range": {
            "feat_end": [min(m["feat_end"] for m in meta), max(m["feat_end"] for m in meta)],
            "label_end": [min(m["label_end"] for m in meta), max(m["label_end"] for m in meta)],
        },
        "rows_per_season": per_season,
        "targets": {
            "next_window_minutes": {
                "construction": "y = player's total minutes over the NEXT window "
                "(3 team matches strictly after the feature window; "
                "0 when not in the matchday squad). Defined for all rows.",
                "observed": int(mask_min.sum()),
                "mean": float(y_min.mean()),
                "share_zero": float((y_min == 0).mean()),
            },
            "next_window_goal_contribution": {
                "construction": "y = (goals + assists) * 90 / minutes over the NEXT "
                "window; defined only when next-window minutes > 0 "
                "(per-90 rate is undefined at 0 minutes).",
                "observed": int(mask_gc.sum()),
                "mean": float(y_gc[mask_gc].mean()),
                "share_zero": float((y_gc[mask_gc] == 0).mean()),
            },
        },
        "split": {
            "kind": "temporal on label-window END date (days since 1970-01-01)",
            "harness_cut": f"{CUT_DATE.isoformat()} (test = all label windows in 2020/21; train = 2018/19 + 2019/20)",
            "mtnn_val": f"label-end >= {VAL_DATE.isoformat()} and < cut (early stopping only)",
            "train": len(train_idx),
            "val": len(val_idx),
            "test": len(test_idx),
            "leakage_guarantee": "every row asserts feat_end_date < label_start_date; "
            "windows never span seasons; scaler fit on the "
            "harness train side only",
        },
        "features": {
            "count": len(FEATURES),
            "families": {f: FAMILIES[f] for f in fam_names},
            "note": "current-window per-90 families masked when the player played "
            "0 minutes in the window; history/volume always observed; role "
            "one-hot masked until first played minute. X = train-fit "
            "MaskedZScaler(X_raw)*M; X_raw kept unscaled for the "
            "persistence_current rung.",
        },
        "exclusions": "goalkeeper rows (season-to-date GK minutes > 50% of played "
        "minutes) dropped, repo convention EXCLUDE_GOALKEEPERS",
    }
    ds_path = Path(args.datasheet)
    ds_path.write_text(json.dumps(datasheet, indent=2) + "\n", encoding="utf-8")
    print(f"[build] wrote {ds_path}")

    if args.exchange_dir:
        ex = Path(args.exchange_dir)
        ex.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(ex / "dataset.npz", **out)
        (ex / "datasheet.json").write_text(json.dumps(datasheet, indent=2) + "\n", encoding="utf-8")
        print(f"[build] wrote exchange artifacts to {ex}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
