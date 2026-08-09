# Vector Pitch — Handoff

Current state as of **2026-08-09**.

## Snapshot
- **Domain:** World Cup soccer (StatsBomb Open Data, attribution in-app)
- **Game corpus:** 633 player-tournaments — 319 WC 2018 + 314 WC 2022
- **Full corpus:** 2430 rows × 11 contexts (2 WC + 9 tm_9ctx for towers)
- **Features:** 16 per-90 tournament-z (within competition-season)
- **Embedding:** 24-d L2 MTNN v1.1 SupCon con_w=0.5 (position-supervised contrastive, 3 towers: attacking/passing/defending)
- **Difficulty:** 588/633 in-band 92.9% (band 0.4–0.8), 7 too-easy, 38 too-hard, median 0.4843, warm_sim 0.985, slope 2.5
- **LoCO:** 9-fold tm_9ctx 2295 rows — pos_cluster_acc 0.797 beats PCA16 oracle 0.7457, knn5 0.7894, nn_role 0.7492, composite 0.7785 (`assets/eval_scoreboard.json`)

## Assets — frozen, committed
- `assets/vectors.json` — 633 × 24-d L2 + profile 16-d + cluster 8 (game)
- `assets/vectors_mtnn.json` — 2430 × 24-d (full)
- `assets/pitch_mtnn_embeddings.json` — 2430 × 24-d con_w=0.5
- `assets/difficulty_calibration.json` — 633 targets, calibration
- `assets/eval_scoreboard.json` — LoCO eval + difficulty gate (composite 0.7785)
- `pipeline/data/` — train_matrix.npz, feature_manifest.json, pitch_mtnn_report.json
- `manifest.json` + `assets/manifest.json` — PWA manifest (copy prevents /assets 404)
- `sw.js` + `offline.html` — offline shell, 14 CORE, network-first 1MB cap

## Source data
- StatsBomb Open Data — public/free-tier, no API key, cached under `pipeline/data/` (gitignored cache, rebuilt via `--cached-only`)
- Min minutes 100, goalkeepers excluded, missing-fill median
- Tournament-z: every feature z-scored within its competition-season (WC-honest)

## Verification commands
```bash
python -m json.tool assets/eval_scoreboard.json > /dev/null
python -m json.tool manifest.json > /dev/null
python -m json.tool assets/manifest.json > /dev/null
python -m json.tool vercel.json > /dev/null
python -m json.tool bundles/manifest.json > /dev/null
python -m pytest tests/ -q
python -m http.server 8000  # open http://localhost:8000 — check /manifest.json 200
curl -sI http://localhost:8000/manifest.json | head
```

## Open follow-ups (if picking up)
- **Historical backfill:** `pipeline/fetch_historical_pitch.py` scaffolds pre-2018 WC backfill — StatsBomb has limited historical WC, verify licensing.
- **ONNX export:** `pipeline/export_onnx.py` → `assets/pitch_mtnn.onnx` 24-d L2 (~2MB) — already wireable, client-side inference optional.
- **v6 transformer fusion:** 17-body → CLS 19-token transformer (like hoops v6) — not yet started, requires local GPU.
- **Provenance 7/7:** keep every number recomputable — hashes in `candidate.json`, no secret sauce.
- **PWA cage match:** `/play` and `/players` for dedicated caches; methods.html cockpit lists what-ships-now vs what-trains-next.

## Do not touch
- Live game contract: 633 WC rows is the shipped game — wider corpus is for training only until LoCO gate + difficulty gate both pass.
- Difficulty band 0.4–0.8 is product decision — do not re-tune without A/B story.
- No telemetry — `api/telemetry.js` optional serverless, anonymous event-name-only, no-op unless API key set.

Solo personal project, no connection to employer, built with public/free-tier only.
