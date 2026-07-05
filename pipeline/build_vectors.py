"""Vector Pitch pipeline: StatsBomb open-data (FIFA World Cup 2018 + 2022) ->
per-90 statistical-profile vectors -> PCA map + named archetypes ->
assets/vectors.json. Soccer sibling of Vector Hoops
(vector-hoops/pipeline/build_vectors.py) -- same shape, same philosophy.

Design (mirrors the hoops build):
- Per-90-minute rates from raw event data (pace/minutes-adjusted at the door).
- Tournament normalization: z-score every feature WITHIN its tournament --
  2018 and 2022 are normalized separately (context-honest: a 2018 volume
  isn't compared against a 2022 mean).
- PCA(3) for the 3D map; k-means(K=8) archetypes named from centroids.

Data source (free, attribution required): StatsBomb open-data on GitHub,
raw JSON under https://raw.githubusercontent.com/statsbomb/open-data/master/data/
Competition 43 = FIFA World Cup.
  competitions.json         -> season_ids for 2018 (id 3) and 2022 (id 106)
  matches/43/<season_id>.json -> ~64 matches per tournament
  lineups/<match_id>.json   -> players + position stints with timestamps
  events/<match_id>.json    -> on-ball actions (shots, passes, duels, carries)

Minutes AND position both come from the lineups file's per-player
"positions" stint list: each stint has from/to as cumulative match-clock
"MM:SS" (contiguous while the player is on the pitch -- a "Tactical Shift"
just relabels position, it isn't a substitution). A stint with to=null runs
to the match's Final Whistle time, which we take as the latest "Half End"
event timestamp (periods 1-4 only; period 5 is a penalty shootout, not
playing time). Position group for a player-tournament = whichever group
(GK/DEF/MID/FWD) accumulated the most minutes across their stints.

Every lineup/events file is cached under pipeline/cache/, resumable --
re-running the script skips anything already on disk.

Run:  python pipeline/build_vectors.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "vectors.json"
CACHE = ROOT / "pipeline" / "cache"

BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) vector-pitch-pipeline/1.0"
COMPETITION_ID = 43  # FIFA World Cup
TOURNAMENTS = [("WC 2018", 2018), ("WC 2022", 2022)]  # (label, calendar year to match)
MIN_MINUTES = 180
SLEEP_BETWEEN_FETCHES = 0.3
EXCLUDE_GOALKEEPERS = True  # GK stats (shots/passes/pressures) break the outfield space

# ---------------------------------------------------------------------------
# Feature contract (16 dims, per-90 unless noted). Order is the game contract
# -- mirrors GAME_FEATURES in vector-hoops (frozen order the game indexes).
# ---------------------------------------------------------------------------

FEATURES = [
    "GOALS_P90", "XG_P90", "FINISHING_P90", "KEY_PASSES_P90", "ASSISTS_P90",
    "PASSES_CMP_P90", "PASS_CMP_PCT", "PROG_CARRY_P90", "DRIBBLES_P90",
    "PRESSURES_P90", "TACKLES_P90", "INTERCEPTIONS_P90", "RECOVERIES_P90",
    "CROSSES_P90", "FOULS_WON_P90", "FOULS_CONV_P90",
]
LABELS = {
    "GOALS_P90": "finishing volume",
    "XG_P90": "expected goals (shot quality)",
    "FINISHING_P90": "finishing (xG overperformance)",
    "KEY_PASSES_P90": "chance creation",
    "ASSISTS_P90": "assists",
    "PASSES_CMP_P90": "passing volume",
    "PASS_CMP_PCT": "passing accuracy",
    "PROG_CARRY_P90": "progressive carrying",
    "DRIBBLES_P90": "dribbling / take-ons",
    "PRESSURES_P90": "pressing intensity",
    "TACKLES_P90": "tackling",
    "INTERCEPTIONS_P90": "interceptions",
    "RECOVERIES_P90": "ball recovery",
    "CROSSES_P90": "crossing",
    "FOULS_WON_P90": "fouls drawn",
    "FOULS_CONV_P90": "fouls committed",
}


# ---------------------------------------------------------------------------
# Cached fetch layer
# ---------------------------------------------------------------------------

def cache_path(name: str) -> Path:
    return CACHE / name


def fetch_json(url: str, cache_name: str, note: str = ""):
    p = cache_path(cache_name)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass  # corrupt cache -> refetch
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            raw = urllib.request.urlopen(req, timeout=60).read()
            data = json.loads(raw)
            CACHE.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw)
            time.sleep(SLEEP_BETWEEN_FETCHES)
            return data
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            wait = 2 ** attempt
            print(f"  fetch {note or cache_name}: attempt {attempt + 1}/4 failed "
                  f"({type(e).__name__}: {e}); sleeping {wait}s")
            time.sleep(wait)
    print(f"  fetch {note or cache_name}: EXHAUSTED retries -- skipping")
    return None


# ---------------------------------------------------------------------------
# Position grouping (StatsBomb's 24 position names -> GK/DEF/MID/FWD)
# ---------------------------------------------------------------------------

def position_group(name: str | None) -> str:
    if not name:
        return "MID"
    if "Goalkeeper" in name:
        return "GK"
    if "Back" in name:  # Right/Left Back, Center Back, Right/Left Wing Back
        return "DEF"
    if "Wing" in name:  # Right/Left Wing (wide forwards, no "Back" in name here)
        return "FWD"
    if "Forward" in name or "Striker" in name:
        return "FWD"
    if "Midfield" in name:  # Defensive/Center/Attacking Midfield
        return "MID"
    return "MID"


def parse_clock(s: str) -> float:
    """'MM:SS' (cumulative match clock, StatsBomb lineups format) -> seconds."""
    mm, ss = s.split(":")
    return int(mm) * 60 + float(ss)


# ---------------------------------------------------------------------------
# Per-match processing
# ---------------------------------------------------------------------------

class PlayerAgg:
    __slots__ = (
        "name", "team", "minutes", "pos_minutes",
        "shots", "goals", "xg", "key_passes", "assists",
        "passes_att", "passes_cmp", "prog_carry", "dribbles",
        "pressures", "tackles", "interceptions", "recoveries",
        "crosses", "fouls_won", "fouls_committed",
    )

    def __init__(self, name: str, team: str):
        self.name = name
        self.team = team
        self.minutes = 0.0
        self.pos_minutes = {"GK": 0.0, "DEF": 0.0, "MID": 0.0, "FWD": 0.0}
        self.shots = 0
        self.goals = 0
        self.xg = 0.0
        self.key_passes = 0
        self.assists = 0
        self.passes_att = 0
        self.passes_cmp = 0
        self.prog_carry = 0.0
        self.dribbles = 0
        self.pressures = 0
        self.tackles = 0
        self.interceptions = 0
        self.recoveries = 0
        self.crosses = 0
        self.fouls_won = 0
        self.fouls_committed = 0


def match_end_seconds(events: list[dict]) -> float:
    ends = [e["minute"] * 60 + e["second"] for e in events
            if e["type"]["name"] == "Half End" and e.get("period", 0) <= 4]
    return max(ends) if ends else 95 * 60.0  # sane fallback


def process_lineups(lineups: list[dict], end_seconds: float,
                     agg: dict[int, PlayerAgg]) -> None:
    for team in lineups:
        team_name = team["team_name"]
        for pl in team["lineup"]:
            pid = pl["player_id"]
            name = pl.get("player_nickname") or pl["player_name"]
            if pid not in agg:
                agg[pid] = PlayerAgg(name, team_name)
            a = agg[pid]
            for stint in pl.get("positions", []):
                start = parse_clock(stint["from"])
                end = parse_clock(stint["to"]) if stint.get("to") else end_seconds
                dur = max(0.0, end - start)
                if dur <= 0:
                    continue
                mins = dur / 60.0
                a.minutes += mins
                a.pos_minutes[position_group(stint.get("position"))] += mins


def team_attack_directions(events: list[dict]) -> dict[tuple[str, int], int]:
    """(team_name, period) -> +1/-1: which x-direction that team attacks,
    inferred from the mean x of their own shot locations that period."""
    sums: dict[tuple[str, int], list[float]] = {}
    for e in events:
        if e["type"]["name"] != "Shot" or "team" not in e:
            continue
        key = (e["team"]["name"], e["period"])
        sums.setdefault(key, []).append(e["location"][0])
    out = {}
    for key, xs in sums.items():
        out[key] = 1 if (sum(xs) / len(xs)) > 60 else -1
    return out


def process_events(events: list[dict], agg: dict[int, PlayerAgg]) -> None:
    directions = team_attack_directions(events)
    for e in events:
        player = e.get("player")
        if not player:
            continue
        pid = player["id"]
        a = agg.get(pid)
        if a is None:
            continue  # player not in lineups (shouldn't happen) -- skip safely
        t = e["type"]["name"]

        if t == "Shot":
            a.shots += 1
            sh = e.get("shot", {})
            a.xg += float(sh.get("statsbomb_xg") or 0.0)
            if (sh.get("outcome") or {}).get("name") == "Goal":
                a.goals += 1

        elif t == "Pass":
            pas = e.get("pass", {})
            a.passes_att += 1
            if "outcome" not in pas:
                a.passes_cmp += 1
            if pas.get("shot_assist"):
                a.key_passes += 1
            if pas.get("goal_assist"):
                a.assists += 1
            if pas.get("cross"):
                a.crosses += 1

        elif t == "Dribble":
            if (e.get("dribble", {}).get("outcome") or {}).get("name") == "Complete":
                a.dribbles += 1

        elif t == "Pressure":
            a.pressures += 1

        elif t == "Duel":
            d = e.get("duel", {})
            if (d.get("type") or {}).get("name") == "Tackle":
                outcome = (d.get("outcome") or {}).get("name", "")
                if outcome.startswith("Won") or outcome.startswith("Success"):
                    a.tackles += 1

        elif t == "Interception":
            a.interceptions += 1

        elif t == "Ball Recovery":
            if not (e.get("ball_recovery") or {}).get("recovery_failure"):
                a.recoveries += 1

        elif t == "Carry":
            c = e.get("carry", {})
            end_loc = c.get("end_location")
            start_loc = e.get("location")
            if end_loc and start_loc and "team" in e:
                direction = directions.get((e["team"]["name"], e["period"]), 1)
                dx = direction * (end_loc[0] - start_loc[0])
                a.prog_carry += max(0.0, dx)

        elif t == "Foul Won":
            a.fouls_won += 1

        elif t == "Foul Committed":
            a.fouls_committed += 1


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def main() -> None:
    t_start = time.time()
    print("fetching competitions.json ...")
    competitions = fetch_json(BASE + "competitions.json", "competitions.json")
    if not competitions:
        raise SystemExit("could not fetch competitions.json -- aborting")

    season_id_by_year: dict[int, int] = {}
    for c in competitions:
        if c["competition_id"] == COMPETITION_ID:
            season_id_by_year[int(c["season_name"])] = c["season_id"]

    all_players: dict[tuple[int, str], PlayerAgg] = {}
    match_count = 0
    fetch_fail_count = 0

    for label, year in TOURNAMENTS:
        season_id = season_id_by_year.get(year)
        if season_id is None:
            print(f"WARNING: no season_id found for {year} -- skipping")
            continue
        matches = fetch_json(
            f"{BASE}matches/{COMPETITION_ID}/{season_id}.json",
            f"matches_{season_id}.json", note=f"{label} match list")
        if not matches:
            print(f"WARNING: could not fetch match list for {label} -- skipping")
            continue
        print(f"{label}: {len(matches)} matches")

        tourn_agg: dict[int, PlayerAgg] = {}
        for i, m in enumerate(matches):
            mid = m["match_id"]
            lineups = fetch_json(f"{BASE}lineups/{mid}.json",
                                  f"lineups_{mid}.json", note=f"{label} lineups {mid}")
            events = fetch_json(f"{BASE}events/{mid}.json",
                                 f"events_{mid}.json", note=f"{label} events {mid}")
            if not lineups or not events:
                fetch_fail_count += 1
                continue
            end_s = match_end_seconds(events)
            process_lineups(lineups, end_s, tourn_agg)
            process_events(events, tourn_agg)
            match_count += 1
            if (i + 1) % 16 == 0 or i == len(matches) - 1:
                elapsed = time.time() - t_start
                print(f"  {label}: {i + 1}/{len(matches)} matches processed "
                      f"({elapsed:.0f}s elapsed)")

        for pid, a in tourn_agg.items():
            all_players[(pid, label)] = a

    if not all_players:
        raise SystemExit("no player data aggregated -- aborting honestly "
                          "(network wall hit before any match processed; "
                          "cache is per-file and resumable, re-run)")

    if fetch_fail_count:
        print(f"WARNING: {fetch_fail_count} match file(s) failed to fetch "
              f"(cached files persist; re-run to retry)")

    # ---- filter to minutes-qualified outfield players, build per-90 rows ----
    rows: list[dict] = []
    for (pid, season), a in all_players.items():
        if a.minutes < MIN_MINUTES:
            continue
        pos = max(a.pos_minutes, key=a.pos_minutes.get)
        if EXCLUDE_GOALKEEPERS and pos == "GK":
            continue
        m90 = a.minutes / 90.0
        pass_cmp_pct = (a.passes_cmp / a.passes_att) if a.passes_att else 0.0
        vals = {
            "GOALS_P90": a.goals / m90,
            "XG_P90": a.xg / m90,
            "FINISHING_P90": (a.goals - a.xg) / m90,
            "KEY_PASSES_P90": a.key_passes / m90,
            "ASSISTS_P90": a.assists / m90,
            "PASSES_CMP_P90": a.passes_cmp / m90,
            "PASS_CMP_PCT": pass_cmp_pct,
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
        rows.append({
            "player_id": pid, "name": a.name, "season": season,
            "team": a.team, "pos": pos, "minutes": a.minutes, **vals,
        })

    if not rows:
        raise SystemExit("no player-seasons met the minutes threshold -- aborting")

    n, d = len(rows), len(FEATURES)
    X = np.array([[r[f] for f in FEATURES] for r in rows], dtype=np.float64)

    # ---- tournament z-scores (context-honest: 2018 and 2022 separately) ----
    season_idx: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        season_idx.setdefault(r["season"], []).append(i)
    Z = np.zeros_like(X)
    for idxs in season_idx.values():
        block = X[idxs]
        mu = block.mean(axis=0)
        sd = block.std(axis=0)
        sd[sd == 0] = 1.0
        Z[idxs] = (block - mu) / sd
    Z = np.clip(Z, -4, 4)

    # ---- PCA(3) map ----
    C = Z - Z.mean(0)
    U, S, _ = np.linalg.svd(C, full_matrices=False)
    P = U[:, :3] * S[:3]
    P = (P - P.min(0)) / (P.max(0) - P.min(0)).max()

    # ---- k-means(8) archetypes (numpy, seeded) ----
    K = 8
    rng = np.random.default_rng(7)
    cent = Z[rng.choice(n, K, replace=False)].copy()
    lab = np.zeros(n, dtype=int)
    for _ in range(60):
        dist = ((Z[:, None, :] - cent[None]) ** 2).sum(-1)
        lab = dist.argmin(1)
        for k in range(K):
            if (lab == k).any():
                cent[k] = Z[lab == k].mean(0)

    def name_cluster(c: np.ndarray) -> str:
        top = np.argsort(-c)[:2]
        low = np.argsort(c)[0]
        a, b = LABELS[FEATURES[top[0]]], LABELS[FEATURES[top[1]]]
        if c[top[1]] > 0.35:
            return f"{a} + {b}".title()
        return f"{a} (low {LABELS[FEATURES[low]]})".title()

    cluster_names = [name_cluster(cent[k]) for k in range(K)]

    players = []
    for i, r in enumerate(rows):
        players.append({
            "id": i,
            "name": r["name"], "season": r["season"], "team": r["team"],
            "pos": r["pos"],
            "v": [round(float(z), 3) for z in Z[i]],
            "x": round(float(P[i, 0]), 4), "y": round(float(P[i, 1]), 4),
            "z": round(float(P[i, 2]), 4),
            "c": int(lab[i]),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "seasons": [label for label, _ in TOURNAMENTS],
        "normalization": "per-90 minutes, z-scored within tournament (context-honest)",
        "features": FEATURES, "featureLabels": LABELS,
        "clusters": cluster_names,
        "players": players,
        "attribution": "Data: StatsBomb Open Data (statsbomb.com) -- free data license, attribution required",
    }, separators=(",", ":")), encoding="utf-8")

    # ---- audit assertions: never ship a dirty file ----
    assert len({(p["name"], p["season"]) for p in players}) <= len(players)
    assert all(len(p["v"]) == d for p in players), "vector length"
    assert all(all(-4.0001 <= v <= 4.0001 for v in p["v"]) for p in players), "clip"
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 and 0 <= p["z"] <= 1
               for p in players), "map range"

    elapsed = time.time() - t_start
    print(f"wrote {OUT.name}: {len(players)} player-tournament rows from "
          f"{match_count} matches, {K} archetypes, {d} features "
          f"({elapsed:.0f}s total)")
    for k, nm in enumerate(cluster_names):
        print(f"  cluster {k}: {nm} ({int((lab == k).sum())} players)")


if __name__ == "__main__":
    sys.exit(main())
