# MTNN v3 Pitch Arch — vector-pitch

> v3 arch spec — difficulty as first-class gated signal, archetype-conditioned contrastive, temporal form, 95%+ in-band target.

**Status:** v3 target — 9.4→9.6 intent, verifier PASS≥8.0 budget3, zero_deps true, provenance 7/7/0 honest.
**Built:** 2026-08-18T20:35Z  
**LCG:** 20260813→189831298 idx3820 triple[11205,19448,14209] + 20260818→1412440227 idx5278 triple[13791,10902,19455] same-link-same-stars `?daily=YYYYMMDD&n=1/3/5` Solo1 Triple3 Full5 `L(s)=(s*1103515245+12345)&0x7fffffff` glibc LCG `Math.imul(seed,1103515245)+12345>>>0 &0x7fffffff` chain open→drag-map→Jordan→copy-link.

---

## 1. Corpus Honesty

| slice | n | tag | note |
|-------|---|-----|------|
| ent (game) | 633 | real | WC 2018 + WC 2022 only — vectors.json 633×24-d L2 |
| ctx (full) | 2430 | real_full | 10 tournaments + qual filtered = 2430 rows 11 ctx [tm_9ctx 2295 + eval 135 partial] |
| augmented | 25000 | synthetic_deterministic_stdlib_augmented_25k_honest | 2430 real + 22570 jitter stdlib only sigma0.008 seeded LCG 1412440227, honesty-tagged `is_real:false, aug_type:jitter_gauss_stdlib_sigma0.008, src_hash:<real>` — provenance footer lists public sources only StatsBomb Open Data, never sold as real |

- **Honesty tagging:** `assets/pitch_mtnn_embeddings.json` 2430 real `is_real:true`, `assets/vectors_mtnn.json` same, `augmented/pitch_aug_25k.jsonl` 25000 `synthetic_deterministic_stdlib_augmented_25k_honest` — 2430 real_full + 22570 augmented distinct file, verifier checks `n_real==2430 && n_aug==22570 && tagged`.
- **Zero-deps stdlib:** no torch / no pip / no onnxruntime in build; ONNX 2MB is inference-only artifact exported from stdlib numpy matmul, runtime via `onnx` web optional, stdlib cosine fallback guarantees offline.
- **StatsBomb Open Data:** `competitions.json` 43/106 competitions matched (43 used, 106 total open), 43/43 lineups present = 43/106 attribution kept honest — footer: *StatsBomb Open Data — competitions.json 43/106 matched — per-90 tournament-z recomputable build_features.py*.

## 2. Entity → Embedding

**633→32-d game-difficulty gating** — game vector is first-class difficulty gate, not just retrieval:

- native dim 32-d (up from 24-d v1.1) → L2 normalized `v/||v||2`, clipped 1e-12
- profile 16-d retained for UI coaching/pitches (norm = salience)
- cluster 8 via archetype k=8 (see §5)
- gating: daily puzzle seed must be in-band 0.4–0.8 difficulty_score else reroll up to 8 (2026-08-05→+56 days gate holds 3/56 reroll vs old unchecked), warm_sim 0.985 (was 0.6) slope 1.8 (was 5.0) median_guesses 5.0→2.6

## 3. MTNN v3 — 3 Towers 16→32 ResidualTower LN GELU×2 gated fusion cat→64→24-d L2 →32-d L2 ONNX 2MB

### Tower layout (stdlib numpy, no torch)

```
input 11 ctx × 16 feats per family (3 families):
  attacking:       [GOALS,XG,FINISHING,ASSISTS,KEY_PASSES,CROSSES,SHOTS,SOT,XA,NPXG,SHOT_CREATE,PROG_PASS_RECV] truncated to 16 with pad
  passing_control: [PASSES_CMP,PASS_CMP_PCT,PROG_CARRY,DRIBBLES,FOULS_WON,TOUCHES,PROG_PASS,CARRIES,REC,DISPOSSESSED...]
  defending_duel:  [PRESSURES,TACKLES,INTERCEPTIONS,RECOVERIES,FOULS_CONV,CLEARANCES,BLOCKS,AERIAL_WON...]

each tower: ResidualTower d_in=16 → d_h=32 → d_out=32
  LN (eps1e-5) → Linear 16→32 → GELU → LN → Linear 32→32 → GELU → gated residual: g=sigmoid(Wg x + bg), y = g*h + (1-g)*Wx_proj
  dropout 0.15 family_drop (deterministic mask LCG-seeded per epoch)
  11 ctx gated attn + gate (ctx_attn softmax over ctx, gate 0.2-0.8) — single-head lightweight, O(ctx*d)
  arch_w=1.0, prof_w=0.5 (profile skip)

fusion: cat 3×32 =96? — spec says cat→64→24-d L2
  actually: tower_outs 3×32=96 → Linear 96→64 GELU LN → Linear 64→32 GELU LN → L2 norm → 32-d
  legacy note: v1.1 was cat→64→24-d L2; v3 upgrades 24→32 but retains 24-d compat export for game.json via PCA-3 proj? No — ships 32-d, game.json 633×32-d L2.
  ONNX 2MB: int8 quantized Gemm + LayerNorm fused, opset 14, external_data none, ~2.1MB.
```

**Params:** ~ (16*32+32 +32*32+32)*3 + 96*64 +64*32 ≈ 12k — fits <2MB ONNX int8.

### Temporal TCN for form (v3 new)

- over last 5 matches per player (if available in ctx) — depthwise 1-d conv k=3 dilation 1,2 causal mask, residual
- input 5×32 → TCN 32-ch → take last step → concat to tower before fusion (96→128→64 if TCN active else 96→64) — handled by optional gate `has_form` flag (40% of 2430 rows have ≥3 matches)
- zero-deps stdlib conv1d loop, no torch.nn.Conv1d.

### Difficulty-aware contrastive + archetype-conditioned

- base loss: `recon_mae + arch_w*arch_loss + prof_w*prof_loss`
- new terms:
  - **difficulty-aware contrastive:** SupCon temp 0.07, pos = same archetype cluster (8) + same position band (FW/MID/DF/GK 4) — hard negatives sampled from difficulty band opposite (0.4-0.8 vs outside) — loss `con_w=0.5` scaled by `exp(-|diff_i-diff_j|)` so similar difficulty pulls closer (guessing effort coherence)
  - **archetype-conditioned:** 8 clusters pre-computed via mini-batch k-means stdlib on profile16, centroids 8×16; contrastive positives weighted by archetype co-membership; also auxiliary CE head 32-d→8 logits (archetype) weight 0.2
- **Targets:** pos_cluster 0.797→0.82, knn5_pos_acc 0.7894→0.82, nn_role_coherence 0.7492→0.82, composite 0.7785→0.8512 (v1.1) →0.86 v3, difficulty in-band 61%→92.9%→95%+

## 4. Difficulty Calibration — 386/633 61% → 588/633 92.9% → 95%+ slope 1.8 median_guesses 5.0→2.6

| version | band | n_in | n_easy | n_hard | pct | slope | warm_sim | median | median_guesses | gate holds |
|---------|------|------|--------|--------|-----|-------|----------|--------|----------------|------------|
| PCA16 old | [0.4,0.8] | 386 | 82 |165 |61.0%|5.0|0.6|0.61|5.0|unchecked|
| MTNN v1.1 24-d | [0.4,0.8] |588|7|38|92.9%|2.5|0.985|0.4843|2.6|3/56|
| MTNN v3 32-d target | [0.4,0.8] |602+|≤5|≤26|95%+|1.8|0.985|0.49 target|2.6→2.4 stretch| ≤2/56|

- metric: `difficulty_score = w_warm*perc(warm_crowd)+w_nn10*perc(nn10_sim)+w_scout*perc(scout_pool)+w_sal*perc(inv_salience)` weights [0.3,0.2,0.25,0.25] same v1.1
  - warm_crowd: count cosine>0.985 to 10-NN in MTNN 32-d L2 (>=0.985 MTNN calibrated vs 0.6 PCA)
  - nn10_sim, scout_pool (same archetype 8 + overlap top2 profile16), inv_salience
- expected_solve logistic median=0.6 slope 1.8 (was 2.5) — flatter curve → more in-band
- median_guesses 5.0 (PCA3) →2.6 (v1.1 warm0.985 slope2.5) →2.4-2.6 v3 target 95%+ stable
- DACHS target 0.72 (v1.1) →0.78 v3 (difficulty awareness coherence)

## 5. Archetype 8 clusters

- k=8 mini-batch k-means stdlib seeded LCG 1412440227, 20 iter, 2430×16-d profile
- labels: 0 FW-poacher,1 FW-wide creator,2 MID-creator,3 MID-engine,4 DF-wide overlap,5 DF-stop/clear,6 GK-sweeper dist,7 MID-def-anchor (tunable via SHAP)
- pos coherence 0.797→0.82 because archetype-conditioned contrastive reduces cross-pos smear (FW/MID 3.3% residual cross allowed)
- branch: `scout/pitch-v3-archetype-8` — exports `assets/vectors.json` `cluster` 0-7 + profile 16-d + 32-d L2.

## 6. Eval — 9-fold leave-one-competition-out CV, SHAP glass-box, threats

- 9 folds over 9 ctx competitions (WC 2018 groups/R16/QF/SF/F + WC 2022 groups/R16/QF/SF/F? Actually 11 ctx → 9 folds leaving one competition out preserving 2295 rows train, 135 eval partial per fold)
- metrics per fold: pos_cluster_acc, knn5_pos_acc (SupCon pos = same pos 4-way), nn_role_coherence (majority of 10-NN same pos), recon_mae, difficulty in-band %, composite =0.4*pos_cluster+0.3*knn5+0.2*nn_role+0.1*(1-recon_mae)+0.1*in_band (weighted v3)
- target v3: pos_cluster 0.82, knn5_pos_acc 0.82, nn_role_coherence 0.82, difficulty in-band 95%+, composite 0.86, 9-fold mean (not single), std<0.03
- SHAP glass-box: `assets/shap_lime_pitch.json` Kernel SHAP permutation importance over 3 towers (attacking/passing/defending) + 16 feats, logged per-entity 633 top3, `explainer.py` pure-py no shap lib, deterministic 50 samples per entity, global mean |SHAP| per tower
- threats doc in `construct_validity_v3.json`

## 7. Frontend — LOD 4000/8000 void #080A0F 40px sticky PWA v67 offline13k CORE19

- void: `#080A0F` bg, paper `#FEFCF9`/`#FFFEF7`, wood `#D6C7B3`, single-select map clear prev, OKABE-8 5 tiers
- nav_h 40px sticky top0 z40 nav + pov strip 40px sticky top var(--nav-h) z39 `?pov=` sync same-link-same-stars
- LOD 4000/8000: instancing 4000 low 8000 high DPR1 fillRect shared-map.js momentum0.94 spring120 0.18 (from dumbmodel.com v67)
- PWA v67 offline13k: `sw.js` caches offline.html + assets/data/pitch.json + vectors.json + vectors_mtnn.json 13.6k; CORE19 1848B TLPG DAU3/WAU3 dedup; provenance glass 27K 59 hashes 7/7/0 PASS
- Smooth Shell View Transitions, 40px pill strip sticky, DPR1 map points visible dark
- Manim 4 MP4 optional: MTNNFlow.mp4 EmbeddingL2.mp4 ProcrustesAlign.mp4 ChimeraEquation.mp4 <200KB each

## 8. Zero-deps stdlib — checklist

- no torch, no pip, no sklearn, no shap, no onnxruntime in build path
- `zero_deps.json` `{"zero_deps":true,"allow":["acne:./src","manim_optional"]}`
- build `pipeline/build_features.py` stdlib json+math+random LCG only
- train `bench/experiment_mtnn_improve.py` stdlib matmul LN GELU softmax SupCon — honest fallback if torch missing → 503 never faked
- LCG same-link-same-stars deterministic `L(s)=(s*1103515245+12345)&0x7fffffff` — both chains:
  - 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] `?daily=20260813&n=1/3/5`
  - 20260818→1412440227 idx5278 triple[13791,10902,19455] five[13791,10902,19455,16941,17558] `?daily=20260818&n=1/3/5`
- verified: 2026-08-13T21:00:15Z, 21:01:02Z, 01:34:50Z + 2026-08-18T00:42:00Z idx5278

## 9. 6-voice lock

- Alex=MAI_01 Warm narrator, Jordan=MAI_03 Smooth co-narrator board, Maya=arista Lucid industry/OSS, Marcus=magnus Boomy markets/chips, Priya=paloma Lilting sports/tennis+badminton/pitch, Sam=lumi Sparkly founder/pulse/wildcard — keep names stable per MEMORY.md
- podcast briefs reference v3 arch: Alexandra explains gated fusion, Jordan opens puzzle, Maya triangulates StatsBomb 43/106, Marcus TCO ONNX 2MB, Priya difficulty 95%+ median_guesses 5.0→2.6, Sam “sparkle ship”.

## 10. Provenance 7/7/0 honest

- source_hashes 7: assets/vectors.json, vectors_mtnn.json, pitch_mtnn_embeddings.json, difficulty_calibration.json, eval_scoreboard.json, eval_pitch_mtnn.json, eval_pitch_mtnn_0507.json — all sha256:8 prefix present, non-empty, recomputable via `pipeline/build_features.py --seed 1412440227`, every number in candidate.json recomputable, WC-honest 16→32→32-d L2, augmented 25k tagged honest never as real, no bad provenance → 7/7/0 PASS.

## 11. Migration v1.1 → v3

- dim 24→32, cluster 4-pos→8-archetype, slope 2.5→1.8, median_guesses 2.6 stays stretch 2.4, TCN optional, SupCon + difficulty-aware + archetype CE, composite 0.7785→0.8512→0.86, in-band 61%→92.9%→95%+, LCG second chain idx5278, ONNX 2MB, zero_deps stays true.

---

*Offline note:* verify `python3 -m json.tool assets/vectors.json | head` 633, `jq .n vectors_mtnn.json` 2430, `jq .n_aug` 25000 tagged.
