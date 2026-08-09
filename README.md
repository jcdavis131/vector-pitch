# Vector Pitch
![CI](https://github.com/jcdavis131/vector-pitch/actions/workflows/ci.yml/badge.svg)
![Python 3.11](https://img.shields.io/badge/python-3.11-blue)

A daily World Cup "chimera" puzzle over 633 player-tournaments embedding space.

Live: https://pitch.dumbmodel.com

> Solo personal project, no connection to employer, built with public/free-tier only.
> **Picking up in-progress work?** Start at [`docs/HANDOFF.md`](docs/HANDOFF.md)

## The embedding

633 player-tournaments — 319 WC 2018 + 314 WC 2022 — per-90 stats z-scored within tournament so World Cups compare honestly. 11 contexts total (2 WC + 9 tm_9ctx for towers), 2430 rows in full corpus, 2295 rows in LoCO CV.

16 features → 24-d MTNN v1.1 SupCon con_w=0.5 — 3 towers (attacking / passing / defending), `cat([x·m,m])→32h→24d LayerNorm skip`, gated fusion `64→24-d L2`, ~18K params. Position-supervised contrastive loss (`con_w=0.5`) + reconstruction MAE.

On the leak-free 9-fold LoCO (tm_9ctx 2295 rows, 9 contexts) — WC held out as game test:

- `pos_cluster_acc` **0.797** — beats PCA16 oracle 0.7457 by +5.13pp
- `knn5_pos_acc` **0.7894** — oracle 0.7905 within 0.11pp (tie)
- `nn_role_coherence` **0.7492** — oracle 0.7518 within 0.26pp (tie)
- `recon_mae` 0.4956, **composite 0.7785** (`assets/eval_scoreboard.json`)

Also beats shipped PCA3 4/4: pos_cluster +0.0962 (0.797 vs 0.7008), knn5 +0.1037 (0.7894 vs 0.6857), nn_role +0.1178 (0.7492 vs 0.6314), recon -0.0244 (0.4956 vs 0.52 lower better).

Tournament-z scoring keeps La Liga volume from contaminating WC means — every feature is `(x-mean_ctx)/std_ctx` per competition-season. StatsBomb Open Data, public/free-tier, attribution in-app.

Shipped artifacts (`assets/vectors.json`, `assets/vectors_mtnn.json`, `assets/pitch_mtnn_embeddings.json`, `assets/difficulty_calibration.json`, `assets/eval_scoreboard.json`) are committed, so the site runs from a static host.

## The site

Plain HTML/JS/Canvas, no framework, PWA-capable (`sw.js`, `offline.html`, `manifest.json` + `assets/manifest.json` copy for no 404). Pages:

- daily game (`play.html` / `/play` → `index.html`) — daily + lab tabs, 6 guesses, 24-d cosine, 633 WC + 2430 full toggle
- 3D embedding map (`model.html` / `/model`) — 633 WC · 2430 corpus · 24-d L2 cosine, orange=fwd blue=mid green=def, 8 archetypes, pause/reset/LOD canvas 30/24fps
- player dossiers (`players.html` / `/players`) — 633 WC searchable, 16-d 0-99 grades, radar canvas 360×280, top-10 cosine MTNN 24-d, trading-card v28
- trends (`trends.html` / `/trends`) — drift, press intensity, 5-sub rule, xG rise, Procrustes 11.1° 2021-22
- leaderboard (`leaderboard.html`), methods (`methods.html` / `/methods`) — glass-box cockpit, towers, fusion, LoCO, difficulty, provenance 7/7
- knowledge wiki — generated interlinked pages per charted player (AUTO regenerated from data, CURATED preserved) — contract in `knowledge/` pattern, built from `assets/data/pitch.json`
- dashboard (`dashboard.html`), offline (`offline.html`)

Shell: `assets/shell.css` + `assets/site-nav.js` + `assets/shared-map.js` (6145 bytes) + `assets/keyboard-a11y.js` + `assets/error-boundary.js` + `assets/pwa-install.js`. Viral row: Pack Battle 1×3×5 `?pack=`, same-link-same-stars, streak 🔥 Week Warrior toast, viral-today countdown UTC midnight.

Static site, hosted on Vercel (`vercel.json` `cleanUrls:true` + rewrites + redirects `pitch.jcamd.com` → `pitch.dumbmodel.com`). Stats card is localStorage-only — game history stays on device. One server-side piece is `api/telemetry.js`, optional serverless that forwards anonymous, event-name-only play pings (start/guess/win/loss/share); it's a no-op unless its API key is configured.

## Data pipeline

```bash
python pipeline/build_features.py      # StatsBomb open-data -> 16f per-90 tournament-z (2430 rows × 11 contexts)
python pipeline/build_vectors.py       # assets/vectors.json (633 WC-only game) + assets/vectors_mtnn.json (2430×24d full)
python pipeline/train_mtnn.py          # assets/pitch_mtnn_embeddings.json (LOCO 9-fold on tm_9ctx 2295 rows, 24-d L2 SupCon 0.5)
python pipeline/build_difficulty.py    # assets/difficulty_calibration.json (588/633 in-band 92.9%)
```

Sources: StatsBomb Open Data (free, no key, cache under `pipeline/data/`). Every response cached; reruns resume, `--cached-only` rebuilds offline. Rebuilds gated by `pipeline/test_feature_hygiene.py` + `tests/test_difficulty.py` before anything ships.

- **MTNN 24-d (v1.1 SupCon con_w=0.5):** 588/633 in-band 92.9% (7 too-easy, 38 too-hard), median difficulty 0.4843, median expected-solve 0.60, slope 2.5, warm_sim 0.985, salience=profile 16-d norm, scout_pool=profile top2 same archetype overlap. Rotation gate holds 3/56 upcoming vs old unchecked.
- **Old PCA16 baseline:** 386/633 in-band 61.0% (82 too-easy, 165 too-hard), slope 5.0, warm_sim 0.60.
- **Improvement:** +202 in-band (+31.9pp) 386→588.

Difficulty calibration is an embedding-space guessability model targeting a 40–80% expected-solve band. Because there is no gameplay telemetry with user detail, it is a model estimate, not measurement — the site says so on the stats card.

## Training

`train.sh` (or `python pipeline/train_mtnn.py`) drives MTNN training (torch). Promotion gated by two checks:

1. **Difficulty in-band:** new embedding must keep 92.9% (588/633) in 0.4–0.8 band — modeled guessability, not fake telemetry.
2. **LoCO beats PCA3:** 9-fold tm_9ctx 2295 rows — pos_cluster_acc, knn5, nn_role must beat shipped PCA3 (4/4 SOTA in v1.1) and pos_cluster must beat PCA16 oracle (0.797 vs 0.7457).

See `docs/DATA_MODEL_pitch.md`, `assets/eval_scoreboard.json`, `candidate.json`, and `pipeline/data/pitch_mtnn_report.json` for how the gate is defined. ONNX export optional via `pipeline/export_onnx.py` → `assets/pitch_mtnn.onnx` 24-d L2 (~2MB) for client-side inference.

Promotion is deliberate — transparent 16-d profile stays in `assets/vectors.json` for UI coaching/pitches, MTNN 24-d ships as game scorer. No fake promotion if not better on LoCO.

## Running locally

```bash
python -m http.server 8000   # static site, open http://localhost:8000 — check /manifest.json 200
python -m pytest -q          # pipeline gates + difficulty in-band check (needs dev extras in pyproject.toml)
```

PWA install: Chrome checks `manifest.json` + `assets/manifest.json` copy — both must JSON-parse and return 200. SW is already 14 CORE, network-first 1MB cap, JSON never cached, immutable SWR.

## License

MIT. See `LICENSE` — © 2026 J. Cameron Davis. Solo personal project, no connection to employer, built with public/free-tier only.

