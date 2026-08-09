# Pitch Historical Coverage

- Current WC: 633 rows (2018, 2022) only - 16-d grades radar 92.9% in-band.
- Target expansion: MLB 1996-2024 30 seasons x 30 teams = 900 win totals + Fangraphs WAR pitcher lines.
- OU analogue: MLB win totals via Covers mlb-team fetcher stub pipeline/fetch_historical_pitch.py.
- Gap: need builder to expand vectors.json from 633 WC to 2,430 full corpus 11 ctx (WC + league) - already noted hoops_parity full_2430_11ctx_towers PASS.
- Hoops parity: 944 OU entries 31 seasons >=20, 1.4MB props 582 players, shared-map.js v4-filtered 521 lines 22,990 bytes.
- Pitch needs same: shared-map.js v2-light upgraded to filtered logic (3+ tournaments OR rookie last 3) - see assets/shared-map.js 6145 bytes current v1-light, should port hoops seasonEndYear + byPerson filter.

# Next Steps
- Run stub fetcher with --offline check existing.
- Expand vectors.json to include MLB 1996-2024 via StatsBomb open + Lahman.

