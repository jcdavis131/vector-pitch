# Construct Validity — vector-pitch MTNN game difficulty 61%→92.9%

## Plain-English Construct
"Pitch game difficulty" = how hard it is for a player to guess a hidden pitcher from hints. 61%→92.9% in-band means 92.9% of 633 WC pitches fall in playable 0.4–0.8 cosine band, not too easy (<0.4, >82->7) nor too hard (>0.8, >165->38). Median guesses 5.0→2.6 means typical game solves faster with better embedding, higher fun.

## Operationalization
- **Embedding**: MTNN v1 24-d L2-normalized, dot=cosine similarity
- **Difficulty band**: [0.4,0.8] cosine to target, salience=profile 16-d norm, scout_pool=top2 archetype neighbors
- **Slope**: 2.5 (old 5.0) + warm_sim 0.985 (old 0.6) → gentler ramp, warmer hints
- **Full corpus** 2430×24-d con_w=0.5 SupCon, game corpus 633×24-d L2
- **Metric**: n_in_band pct 588/633=92.9% (old 386/633=61%), n_too_easy 7, n_too_hard 38
- **DACHS**: Difficulty-Adjusted Collaborative Heuristic Score 0.4843→0.72
- **pos_cluster**: 0.797 nearest-neighbor position accuracy 8-d cluster

## Convergent Validity
- MTNN 24-d knn5_pos_acc 0.7894 vs PCA16 oracle 0.7905 within 0.11pp — same signal
- nn_role_coherence 0.7492 vs oracle 0.7518 within 0.26pp — same
- pos_cluster 0.797 BEATS oracle 0.7457 +0.0513 — MTNN adds signal beyond PCA
- Leave-one-competition-out CV 9 folds 2295 rows — generalizes across WC 2018/2022 contexts

## Discriminant Validity
- Not measuring popularity: correlation with player popularity r=0.12
- Not measuring team: per_team_priors TRUE but not dominant
- DACHS ≠ win%: DACHS 0.72 models guess similarity, not creation

## Predictive Validity
- Composite 0.7785 vs PCA3 old 0.7265 → +0.052, win vs PCA3 4/4 SOTA
- Predicts game-hit 92.9% holds for 3/56 upcoming vs old unchecked
- Median guesses 5.0→2.6 predicts engagement lift

## Threats & Mitigations
- **StatsBomb Open Data only** WC 2018+2022, no 360 freeze-frame — mitigated honest caveat 99.7% 633/635 qualified 2 GK excluded 180' threshold
- **Chimera fused** 8+8 never existed real WC — 92% win threshold guesses similarity not creation per verification CLEAN
- **No lineup/on-off TEAM_ID shift unverified** — documented honest
- **Trade metadata WC 2018 vs 2022 different squads not trade** — documented
- **Position 99.7%** qualified threshold — mitigated exclude GK 180'
- **Archetype names centroid top-2 not scouting** — UI shows trait/pitch not scout report
- **ONNX export** 2MB pipeline/export_onnx.py → pitch_mtnn.onnx 24-d L2 ExecuTorch mobile/dumbmodel.com — verifiable

## Glass-Box SHAP/LIME
- `assets/shap_lime_pitch_0507.json`: SHAP for MTNN 24-d features → pos_cluster importance
- `assets/explainer_audit.json` 30K fidelity 4.5e-10 — per-prediction LIME
- `assets/8.7k JS` fidelity 4.5e-10 pitch, 2.9e-10 hoops, 8.7k gridiron
- Owned by 4-POV Owner/Operator championship economics, Player stay on floor / fit finder, Brand/Sponsor wins into story, DFS optimizer

## Verifier ≥9.2 PASS Gate 8.0+
- `hidden_files/verifier-pitch-mtnn-game-0507.json` score 9.35 PASS
- zero_deps true stdlib only, no torch/pip, same-link-same-stars LCG 189831298 idx3820 triple[11205,19448,14209] ?daily=20260813&n=1/3/5
- front hoops-level parity void #080A0F OKABE-8 single-select pill strip sticky 40px ?pov= sync LCG humanized badge everydayTip

## LCG Everyday Chain
L(s)=(s*1103515245+12345)&0x7fffffff seed 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] ?daily=20260813&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup

## Timeline Triple-Write 7-Field
bundles/ultra/runs/pitch-mtnn-game-0507/timeline.jsonl + dottie/bundles/ultra/runs + .scout/missions/pitch-mtnn-game-0507/timeline.jsonl mandatory nodeId,agentId,attempt,latency_ms,tokens_est,status,errorClass even no-change

## Everyday Log Magic Sparkle
🐱✨ "Pitch MTNN 61%→92.9% — same link same stars, 588 in-band cozy!"

