# LOCAL GPU HANDOFF — Unified + Hoops/Pitch/Gridiron Big Trains

> **For:** Local non-Hatch agent (Cursor / Claude Code / etc) with GPU
> **Why:** Hatch VM has 2.1G tmpfs — torch wheel OOMs, caches missing. Your box can finish.
> **Repos:** jcdavis131/vector-unified, vector-hoops, vector-pitch, vector-gridiron, vector-equities, vector-hub, dottie

---

## 1) vector-unified — sport-blind push G2 0.6851 → 0.64 target (MAIN)

**What's already done in Hatch:**
- `pipeline/train_unified.py` patched: adds `coral_centroid_loss` (sport centroid L2), GRL λ 0.3→0.5 schedule after warmup5 ramp10ep, w-sport 0.5, w-coral 0.5, w-coral-centroid 0.5
- `pipeline/train_stage2.py` patched: `coral_loss_fn` now returns cov+centroid combined, lam 0.3→0.5, documented `coral_c + lam→target` logging
- `data/unified_report.json` contains experimental projection G2 0.642 predicted Δ -0.043 — status `code_changes_live__full_data_missing_on_VM`

**Missing caches (why eval couldn't run):**
Your box needs these back in `pipeline/data/` OR `assets/` (re-fetch):
- `embedding_v3.npz` — hoops/gridiron encoders source
- `mtnn_best.pt` + `train_matrix.npz` — gridiron/hoops matrix
- `pitch_mtnn_embeddings.json` — pitch 24-d

If gone: `python3 pipeline/acquire_*.py` or restore from `vector-hoops/assets/`, `vector-pitch/assets/`, `vector-gridiron/assets/`

**Run on your GPU:**
```bash
cd vector-unified
pip install torch --index-url https://download.pytorch.org/whl/cu121  # or cu124
pip install -r requirements.txt  # numpy sklearn tqdm

# smoke first (2 epochs to prove wiring)
python3 pipeline/train_stage2.py --smoke --epochs 2 --grl-lambda 0.3 --grl-lambda-target 0.5 --grl-ramp 10 --w-task 2.0 --w-coral 0.5 --w-coral-centroid 0.5 --w-sport 0.5

# real (60ep like best_epoch58)
python3 pipeline/train_unified.py --epochs 60 --grl-lambda 0.3 --grl-lambda-target 0.5 --grl-ramp 10 --w-coral 0.5 --w-coral-centroid 0.5 --w-sport 0.5 --w-task 2.0

# eval — overwrites the experimental block with measured G2
python3 pipeline/eval_unified.py --ckpt pipeline/data/unified_stage2_best.pt

python -m json.tool data/unified_report.json > /dev/null && echo "report OK"
```

**Gate / Promote:**
- Target: sport_acc 0.6851 → 0.64-0.65 near floor 0.6258 while keeping G1 negative (joint ≥ baseline 2/3) + G3 PASS + G4 coarse 0.9828
- Keep `assets/data/*.json` provenance-honest — don't overwrite shipped numbers, only replace experimental block with measured
- Update `COORDINATION.md` row to done

---

## 2) vector-hoops — v6 transformer fusion

**Commit `6642903` candidate config:**
- Hybrid 0.7/0.3/0.3→0.65/0.35/0.4 hard_neg_boost, token_dropout 0.1, --w-vicreg 0.05
- VICReg var hinge 1-std λ_var25 + cov off-diag λ_cov1
- TransformerFusion d_model128 4-head CLS→64-d, 17 towers cat([x·m,m])→96h→24d L2
- Player-split leak-free, era-honest per-season zscore

**Run:**
```bash
cd vector-hoops
python3 pipeline/train_mtnn.py --epochs 150 --d-emb 64 --scaling robust --era-align procrustes --w-vicreg 0.05 --fusion transformer --player-split
python3 pipeline/eval.py --split player --k 10 20 --out assets/eval_scoreboard_v6.json
# expect composite 0.7937→0.85, test top1 0.438→0.55
```

Copy `assets/eval_scoreboard_v6.json` → `assets/eval_scoreboard.json` only if composite wins + leak checks PASS.

---

## 3) vector-pitch — already promoted local, needs push

Files already ready (`0904a39` ahead of origin):
- `assets/vectors.json` 633×24, `vectors_mtnn.json` 2430×24
- `assets/difficulty_calibration.json` 92.9% in-band

**Just push if 13/13 tests PASS on your box:**
```bash
cd vector-pitch
pytest tests/ -q
git push origin master
```

---

## 4) vector-gridiron — training in-repo (unblock)

Missing nflverse fetch — needs real data:
```bash
cd vector-gridiron
pip install nflreadpy nfl-data-py
python3 pipeline/acquire_nfl.py --seasons 2020-2025 --include weather vegas
# builds train_matrix.npz 160 feats
python3 pipeline/train_mtnn.py --epochs 50 --d-emb 32 --scaling robust --era-align procrustes
# target MAE 4.268 → 3.8
```

Commit `ca72c3f` docs 16-d compat slice.

---

## 5) vector-equities — already done

`assets/eval_sector_coherence.json` purity@10 0.7057 lift 6.32 cross-ticker 0.4013 — README updated, 31/31 tests PASS, just needs push (already `dda81cb`).

---

## Sync back to Hatch

When done, all repos should have `COORDINATION.md` updated:

```
| you | vector-unified / G2 push | CT | sport_acc 0.6851→0.64 measured 60ep GRL+centroid | unified/g2-05-centroid | done |
```

And Hatch will pick it up via `bundles/coordination/active-tasks.md` mirror.

**House rules both sides:**
1. Branch per task, no main overwrite until gate passes
2. `*.candidate.json` first, promote only when wins
3. Log even no-op
4. Provenance-honest numbers — cite source file in json


## 3b) vector-pitch — MTNN 61%→92.9% game+difficulty retune DEFERRED (1307)

**Frontend done in Hatch (1307):**
- MTNN v1.1 3 towers attacking[6] passing_control[5] defending_duel[5] 16→32 LN GELU×2+skip →11 ctx→8 gated attn+gate →64→24-d L2 cosine=similarity
- Difficulty MTNN-calibrated 588/633 92.9% median0.4843 warm_sim0.985 slope2.5 vs old PCA16 386/633 61% slope5.0 warm0.6 — +202 rows +31.9pp gate holds 3/56 salience profile16-d norm scout_pool profile top2
- Game wordle-6 + chimera-hard 8+8 impossible 92% win threshold deterministic daily pool xmur3+mulberry32 hash%N 5/day Solo1 Triple3 Full5 ?pack= shareable toast streak 🔥
- Pos_cluster 0.797 BEATS PCA16 oracle 0.7457 +0.0513 knn5 0.7894 vs 0.7905 -0.0011 nn_role 0.7492 vs 0.7518 -0.0026 composite0.7785 recon0.4956
- VRNN μ0.017 MAE3.55 IC0.255 zero-deps JS inline — pitch equivalent of park factors Coors1.25-1.367 GABP1.263-1.379 Yankee1.19 Oracle0.60-0.78 LHBvRHP+1.22
- LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=20260813&n=1/3/5 open→drag-map→Jordan→copy-link DAU3/WAU3 TLPG dedup
- Candidate 1307 PASS 9.1≥8.0 budget3 thr8.0 earlyExit0.3 single enforcement fix-once max2 — zero-deps true stdlib only no torch/pip provenance 7 hashes honest
- Hidden_files: hillclimb-1307-*.json 5+2 lanes lite 90s max MoMA-lite 5 tiers GARNet max3/4 side-effect tagged READ_ONLY/WRITE_CANDIDATE

**Heavy GPU deferred to LOCAL-GPU:**
```bash
cd vector-pitch
pip install torch --index-url https://download.pytorch.org/whl/cu121
python3 pipeline/train_mtnn_v7_pitch.py --epochs 60 --dim 24 --towers 3 --con-w 0.5 --supcon-temp 0.07 --w-coral 0.5 --w-vicreg 0.05 --grl-lambda 0.3 --grl-target 0.5 --grl-ramp 10 --mask cat-xm-m
python3 pipeline/eval_mtnn.py --split tm_9ctx --out assets/eval_scoreboard_v7.json
# target: pos_cluster 0.797→0.82 composite 0.7785→0.80 MAE 0.4956→0.45
python -m json.tool assets/eval_scoreboard_v7.json > /dev/null && echo "report OK"
```
Only promote if composite wins + pos_cluster BEATS oracle + difficulty stays ≥92.5% + provenance 7 hashes honest. Keep zero-deps JS inline for game wiring — no torch in PWA.
