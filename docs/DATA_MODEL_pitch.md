# DATA MODEL — Vector Pitch

Pitch: World Cup player-tournament embedding pipeline. 11 contexts, 16 features, tournament-z, 24-d MTNN, difficulty model.

## 1. Contexts — 11 total

- **Game (WC-only) 2 contexts:** `2018 FIFA World Cup` (319 rows), `2022 FIFA World Cup` (314 rows) — 633 total.
- **Training wideners 9 tm_9ctx:** 9 additional StatsBomb Open male competitions (leagues + UCL + Euros + Copa America, etc.) — enables towers to see 2295 rows in LoCO. Full corpus 2430 rows × 11 contexts.
- **LoCO CV:** Leave-One-Competition-Out — 9 folds on tm_9ctx (2295 rows) — prevents leakage across seasons; WC 2018/2022 held out as game test.

## 2. Features — 16 per-90, tournament-z

16d raw per-90 stats, z-scored within competition-season (tournament-z):

- **Shooting / finishing:** xG/90, shots/90, goals/90, shot_accuracy?
- **Passing / creation:** xA/90, key_passes/90, passes_attempted/90, pass_accuracy, progressive_passes/90
- **Dribbling / carrying:** dribbles/90, carry_progress/90
- **Defending / pressing:** tackles/90, interceptions/90, pressures/90, recoveries/90
- **(example bucket — see `pipeline/data/feature_manifest.json` for EXACT list):** `['goals_p90','assists_p90','xg_p90','xa_p90','shots_p90','key_passes_p90','passes_p90','pass_acc','prog_passes_p90','dribbles_p90','tackles_p90','interceptions_p90','pressures_p90','recoveries_p90','carries_p90','minutes']` (minutes threshold 100, not z-feature, used for filtering).

Families → Towers:

- **Attacking tower (5–6 feats):** goals, xG, shots, dribbles, carries
- **Passing tower (5–6 feats):** assists, xA, key_passes, passes, prog_passes, pass_acc
- **Defending tower (4–5 feats):** tackles, interceptions, pressures, recoveries

Missing → median fill per context, goalkeepers excluded, min 100 minutes.

## 3. Normalization — tournament-z

Context-honest: every feature is `(x - mean_ctx)/std_ctx` where ctx = competition-season. WC 2018 mean does not contaminate WC 2022; La Liga volume does not dominate WC.

- Pipeline: `pipeline/build_features.py` → `pipeline/data/train_matrix.npz` (N=2430, D=16) + `feature_manifest.json`
- Game artifact: `assets/vectors.json` stores both L2 embedding 24-d and profile 16-d (0-99 grades for UI)

## 4. Embedding — 16-d → 24-d MTNN v1.1 SupCon con_w=0.5

- **Architecture:** ResidualTower per family `cat([x·m,m])→32h→24d LayerNorm GELU×2 skip` → 3 towers 16→32→24 → gated fusion `cat(towers)+attn+gate 64→24-d L2`. ~18K params, ~224K with heads.
- **Heads:** position (4-way), archetype (8-way), next-profile (recon), skills stub.
- **Loss:** reconstruction MAE + SupCon position loss con_w=0.5 (positive = same position cluster) + VICReg var/cov regularization.
- **Training:** `pipeline/train_mtnn.py` torch, LoCO 9-fold 2295 rows, z-dim 24, L2 normalize, cosine scoring.
- **Eval (LoCO):** pos_cluster_acc 0.797 (beats PCA16 oracle 0.7457 +5.13pp), knn5 0.7894 (oracle 0.7905 within 0.11pp), nn_role 0.7492 (oracle 0.7518 within 0.26pp), recon_mae 0.4956, composite 0.7785 (`assets/eval_scoreboard.json`).
- **Artifacts:** `assets/pitch_mtnn_embeddings.json` 2430×24-d, `assets/vectors_mtnn.json` same, `assets/vectors.json` 633 WC game.

## 5. Difficulty model

- **Target:** guessability 40–80% expected-solve band (40 hardest → 80 easiest).
- **Build:** `pipeline/build_difficulty.py` embedding-space — scout_pool = profile top2 same archetype overlap, salience = profile 16-d norm, warm_sim 0.985 (cosine warm-start), slope 2.5 logistic → expected-solve.
- **Calibration:** 588/633 in-band 92.9% (7 too-easy, 38 too-hard), median difficulty 0.4843, median expected-solve 0.60, gate holds 3/56 upcoming rerolls vs old unchecked.
- **Old PCA16 baseline:** 386/633 61.0% (82 too-easy, 165 too-hard), slope 5.0, warm_sim 0.60 — improvement +202 (+31.9pp).
- **Gate:** `tests/test_difficulty.py` asserts in-band ≥92%, no hard cliff.

## 6. Provenance

- Every number recomputable — source_hashes in `candidate.json`, pipeline/data reports, feature_manifest → vectors deterministic seed.
- StatsBomb Open Data — public, no API key, attribution in-app methods.html footer.
- Solo personal project, no connection to employer, public/free-tier only, Vercel static + optional serverless `api/telemetry.js` anonymous event-name-only.

## 7. Files map

```
pipeline/build_features.py    # 11 contexts → 16f z-matrix
pipeline/build_vectors.py     # 633 WC game + 2430 full vectors
pipeline/train_mtnn.py        # 16-d → 24-d MTNN v1.1 SupCon
pipeline/build_difficulty.py  # 633 targets → calibration 92.9% in-band
assets/eval_scoreboard.json   # LoCO + difficulty truth
assets/vectors.json           # L2 24-d + profile 16-d
methods.html                  # glass-box cockpit: towers, fusion, LoCO, difficulty
docs/HANDOFF.md               # current state
docs/DATA_MODEL_pitch.md      # this file
```

Comparable to `docs/DATA_MODEL_*.md` in vector-hoops but World Cup-honest — 633 rows, 24-d, tournament-z, no era leakage.

