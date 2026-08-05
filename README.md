# Vector Pitch

A daily World Cup "chimera" puzzle over StatsBomb Open Data (attribution in-app): guess the blend of real player-tournaments behind each day's composite. 633 player-tournaments from the 2018 and 2022 World Cups (319 WC 2018 + 314 WC 2022), per-90 stats z-scored within tournament, embedded with a small multi-tower net (`pipeline/train_mtnn.py`). Sister project to [vector-hoops](https://github.com/jcdavis131/vector-hoops).

Live: https://pitch.dumbmodel.com

> Solo personal project, no connection to employer, built with public/free-tier only.

Static site (plain HTML/JS/canvas), hosted on Vercel. The stats card is localStorage-only — game history stays on the device. The one server-side piece is `api/telemetry.js`, an optional serverless function that forwards anonymous, event-name-only play pings (start/guess/win/loss/share); it is a no-op unless its API key is configured.

## Pipeline

```bash
python pipeline/build_features.py      # StatsBomb open-data -> 16f per-90 tournament-z features (2430 rows × 11 contexts)
python pipeline/build_vectors.py       # assets/vectors.json (633 WC-only game) + assets/vectors_mtnn.json (2430×24d full)
python pipeline/train_mtnn.py          # assets/pitch_mtnn_embeddings.json (LOCO 9-fold on tm_9ctx 2295 rows)
python pipeline/build_difficulty.py    # assets/difficulty_calibration.json (588/633 in-band 92.9%)
```

Difficulty calibration is an embedding-space guessability model targeting a 40–80% expected-solve band. Because there is no gameplay telemetry with user detail, it is a model estimate, not measurement — the site says so on the stats card. `tests/test_difficulty.py` gates the calibration build.

- **MTNN 24-d (v1.1 SupCon con_w=0.5):** 588/633 in-band 92.9% (7 too-easy, 38 too-hard), median difficulty 0.4843, median expected-solve 0.60, slope 2.5, warm_sim 0.985, salience=profile 16-d norm. Rotation gate holds 3/56 upcoming vs old unchecked.
- **Old PCA16 baseline:** 386/633 in-band 61.0% (82 too-easy, 165 too-hard), slope 5.0, warm_sim 0.60.
- **Improvement:** +202 in-band (+31.9pp) 386→588.

### Embedding evaluation (LOCO 9-fold, tm_9ctx 2295 rows, 9 contexts)

| metric | baseline v1 no-con | PCA3 shipped old | PCA16 oracle | MTNN v1.1 SupCon |
|---|---|---|---|---|
| pos_cluster_acc | 0.7265 | 0.7008 | 0.7457 | **0.797** |
| knn5_pos_acc | 0.7621 | 0.6857 | 0.7905 | **0.7894** |
| nn_role_coherence | 0.7217 | 0.6314 | 0.7518 | **0.7492** |
| recon_mae | 0.4773 | 0.52 | 0.0 | 0.4956 |

MTNN v1.1 beats shipped PCA3 on 4/4 metrics (+0.0962 pos_cluster, +0.1037 knn5, +0.1178 nn_role, -0.0244 recon), beats PCA16 oracle on pos-cluster by +0.0513 (0.797 vs 0.7457) and ties oracle on knn5 within 0.11pp and nn_role within 0.26pp.

MIT. Solo personal project, no connection to employer, built with public/free-tier only.
