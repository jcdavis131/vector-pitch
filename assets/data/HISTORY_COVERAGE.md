# HISTORY_COVERAGE — vector-pitch historical gap audit

> Historical training data not gambling. (coaching baseline, not betting)

## Current state

- **Live game corpus:** `assets/vectors.json` → 633 WC player-tournaments
  - WC 2018: 319 rows (StatsBomb competition 43 season_id 3)
  - WC 2022: 314 rows (StatsBomb competition 43 season_id 106)
  - Filter: ≥180΄ qualified, GK excluded (2 GK excluded threshold 180΄)
  - Normalization: per-90 + z-scored within tournament (WC-honest)
  - Every row recomputable from `pipeline/cache/` resumable fetch

- **Expanded training corpus:** `pipeline/data/` matrices
  - `meta_tm_9ctx.json` 271KB · `meta_tm_full.json` 288KB → 2,430 rows 11 contexts (2 WC + 9 tm_9ctx)
  - `feature_manifest_tm_9ctx.json` towers 3 (attacking/passing_control/defending_duel)
  - `pitch_mtnn_embeddings.json` 804KB 24-d L2 cosine=similarity MTNN v1.1

- **Market expectation baseline (new):** `assets/data/pitch_win_totals.json`
  - Analogous to hoops 944 OU entries (preseason win totals 1993-2026, 31 seasons ≥20, 944 entries)
  - Pitch/MLB analog: 29 seasons (1996-2024) ≥20 teams, 870 entries synthetic fallback + real-attempt path
  - Structure: `{built, source, coverage, seasons: {year: {team: total}}, worldcup_outrights}`
  - MLB win totals: 81 baseline ± bias (NYY/LAD high, OAK/PIT low) + deterministic hash 59.5-101.5 .5 steps
  - WC expected points: top Elo FRA/BRA/GER 6.5-7.4 pts, mid 4.5-5.6, others 3.2-4.1 (group-stage expectation)
  - WC outrights: synthetic 450-2500 American-odds style baseline, from `sportsoddshistory.com` attempt cache

## Gap vs hoops parity

| Domain | Hoops | Pitch (before) | Pitch (after this PR) | Gap remaining |
|--------|-------|----------------|-----------------------|---------------|
| Game rows | 12,966 player-seasons, playable subset ~4k | 633 WC only | 633 playable + 2,430 full MTNN | Expand WC to 1930-2022 would be 20 tournaments ~6k rows — needs StatsBomb data not available free |
| Market OU | 944 entries 31 seasons 1993-2026 | 0 | 870 entries 29 seasons 1996-2024 (synthetic + BRef/Covers stub) | Need real Covers.com historical scrape for 1996-2000 subset (JS-heavy) |
| Props WAR | 2.6MB `player_season_props.json` PPG/RPG etc per-season lines | 0 | 120 pitcher WAR lines synthetic `pitcher_war_lines.json` | Real FanGraphs WAR lines need JS fetch + auth — stub maps vec strength |
| WC outrights | Title odds in `preseason_win_totals.json.source` | 0 | 2018+2022 8-9 entries odds cache | Pull 1998-2014 historical odds from sportsoddshistory.com |
| Embedding map | `shared-map.js` v4-filtered 26KB 3+ seasons OR recent PID-aware | v1-light 6,145 bytes no filter | v2-light filtered ported | Keep <28KB budget — hoops 26KB over budget for pitch intentional |
| Play / Daily | `play.html` distinct from index with daily 5× + random + pack 1/3/5 | index+play identical 12038 bytes | Same but adapted to pitch (WC ids 0-632) — daily/lab/play tabs pattern as hoops | Lab tab hoops is `/model` — pitch uses `model.html` already; Play integration done |

## Why 633 only?

StatsBomb open-data free license provides full event logs only for WC 2018 (3) and WC 2022 (106), Euros 2020 (43), limited leagues top-5 2015-2023 behind paywall beyond starter allowlist. Full 1930-2022 (22 tournaments) would require Opta paywall → not free/open. For historical expectation baseline we don't need pre-2018 rows: we need preseason markets (=OU totals) back to 1996 — which this PR adds.

## Needed next (backfill roadmap)

1. **Browser-based Covers MLB fetch:** port hoops Covers pattern to real `https://www.covers.com/sport/baseball/mlb/teams/matchups?team=X&season=Y` → parse OU table; requires browser not urllib (3.5s rate-limit).

2. **Club World Cup / UCL win totals:** expand WC outrights to club — could reuse `pipeline/data/meta_tm_full.json` 2,430 rows already contain club seasons.

3. **1990-1996 MLB preseason OU:** older seasons not on Covers — source is newspaper Vegas lines archive.

4. **Pitcher WAR lines:** real FanGraphs ZiPS projections per pitcher per season → WAR lines 0.5-6.5 → analogous to hoops player_season_props.json (2.6MB). Our stub 120 map but goal ~21k lines.

## Files added this PR

- `pipeline/fetch_historical_pitch.py` zero-deps, docstring historical training, functions fetch_bref_preseason_totals(), fetch_fangraphs_war(), fetch_covers_mlb_win_totals(since=1996), fetch_worldcup_odds(), fetch_team_covers(), synthetic_win_totals_from_actuals(since), write_dest(), argparse --since 1996 --team FRA --offline. Rate-limit 3.5s urllib+curl fallback.

- `assets/data/pitch_win_totals.json` (17KB) 29 seasons ≥20 teams
- `assets/data/mlb_win_totals.json` alias compat
- `assets/data/pitcher_war_lines.json` 120 lines 0-7 WAR
- `assets/shared-map.js` v2-light filtered (port of hoops v4-filtered logic)

## Verification

```bash
python pipeline/fetch_historical_pitch.py --offline --since 1996
cat assets/data/pitch_win_totals.json | python -m json.tool > /dev/null && echo ok
wc -c assets/shared-map.js index.html play.html
python -m json.tool candidate.json > /dev/null && echo candidate ok
```

- hoops coverage: 31 seasons ≥20 → 944 entries
- pitch coverage after: 29 seasons ≥20 → 870 entries (parity -2 seasons pre-1996, expected)
- index.html 12,038 <28k self-contained inline CSS/JS base64 target kept
- shared-map v2-light filtered ported but still <10k (vs hoops 26KB over budget trade-off intentional)


