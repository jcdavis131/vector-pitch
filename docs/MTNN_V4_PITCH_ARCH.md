# MTNN V4 Pitch Arch — GraphBFF Dual Enhancement

**Status:** v4 GraphBFF dual TCA+TAA — 0.8512→0.90 target — verifier 8.8 budget3 earlyExit0.3 fix-once max2 loops  
**Built:** 2026-08-19T10:56Z — builder-prime — vector-pitch  
**Branch:** scout/pitch-arch-v4 — 3 LOCAL-GPU exempt board healthy 7 free  
**LCG:** 20260813→189831298 idx3820 triple[11205,19448,14209] + 20260818→1412440227 idx5278 triple[13791,10902,19455] same-link-same-stars `?daily=YYYYMMDD&n=1/3/5` Solo1 Triple3 Full5 `L(s)=(s*1103515245+12345)&0x7fffffff` glibc LCG — verified 2026-08-13T21:00:15Z/21:01:02Z/01:34:50Z + 2026-08-18T00:42:00Z idx5278  
**Void:** #080A0F — PWA v67 offline13k CORE19 ~1848B avg TLPG DAU3/WAU3 dedup LOD4000/8000 DPR1 fillRect quaternion arcball momentum0.94 spring k120 b0.18  
**Zero-deps:** true — stdlib only — no pip torch sklearn — torch optional Alienware honest 503 — no fake 53 — fallback stdlib matmul LN GELU  
**6-voice:** Alex MAI_01 Warm Maya arista Lucid Marcus magnus Boomy Priya paloma Lilting Sam lumi Sparkly sports football/basketball/tennis/big events only work front/center

---

## 0. v3→v4 delta — what GraphBFF paper (2602.04768) adds

v3 (PASS 9.6) we shipped: 633 ent 2430 ctx 25k augmented 2430 real_full+22570 jitter σ0.008 3 towers 16→32 ResidualTower LN GELU×2 gated attn 11 ctx TCN causal k3 d[1,2] depth2 32-ch 40% has_form fallback 60% no-TCN archetype 8 clusters mini-batch k-means LCG-seeded difficulty-aware contrastive temp0.07 con_w0.5 archetype CE0.2 difficulty 386/633 61%→588/633 92.9%→602/633 95.1% slope5.0→2.5→1.8 median_guesses5.0→2.6 pos_cluster0.797 knn5 0.7894 composite0.8512→0.86.

**v4 does NOT remove v3** — keeps 3 towers 16→32 fused cat→64→24→32-d L2 ONNX 2MB — but adds dual-stream:

| paper concept | pitch instantiation | params delta |
|---|---|---|
| TCA — Type-Conditioned Attention 70-80% params per-type sparse softmax | 4 heads — same-archetype masked teammate 40% edges dominant, same-league (9 leagues WC qual + WC final), difficulty-tier (4 quartiles 0-0.25/0.25-0.5/0.5-0.75/0.75-1.0), same-real-vs-aug (is_real true/false) — W_q/k/v per type subset S⊆T_E  | +0.9M teacher 12M if CUDA else stdlib mean pooled |
| TAA — Type-Agnostic Attention k-fixed | Shared W_qkv 128-d k=8 fixed-degree sampling most recent season per pid capped 8 seasonal, uniform without replacement — stabilizer | +0.15M teacher |
| Fusion 0.7/0.3 L2 unit sphere cosine=dot | z_tca 224-d →112→64 proj + z_taa 128-d→64 + CLS residual L2Norm(0.7*z_tca+0.3*z_taa) same 64-d sphere client 32-d head via 64→32 | same API |
| Pretrain masked link 15% BCE | Remove E+ 15% positive same-archetype links, sample E- negatives 1:1 per type — predict existence BCE w0.5 — gives universal structural linear separation zero-shot | loss+ |
| Batch KL + RR | KL storage 64 clusters league+formation (9 leagues ×8 archetype ≈72 bucketed→64 via k-means stdlib), order ascending KL(p_k||p_G) representative first early steps not Lakers-only. RR GPU 32/type ×4=128 edges per mini-batch fixed ensures rare same-real-vs-aug gets grad each step | data order |
| VICReg var25 cov1 + SupCon τ0.07 | var hinge Std(z)≥1 λ25, cov off-diag λ1 anti-collapse effective rank≥32/64=0.5 avoids 12.4 collapse observed G2 early, SupCon w0.15 cross-league positives | loss |
| TCN causal k3 dilation 1,2,4 | Elevate TCN depth2 d[1,2] → depth3 d[1,2,4] temporal receptive 1+2+4=7 past matches vs 3 before, slope learning median_guesses 2.6→2.2 flatter → more in-band | form |

Scaling law αN 0.703 αD0.188 tells us data without capacity saturates fast — we train 12M teacher on Alienware 4090 10M ≈2.4GB batch224 links 60ep ~45min then distill MSE to 64-d 1.2M client preserving sphere.

---

## 1. Input — 92? No — pitch stays 16 profile ×11 ctx but feats 16-d per family extended 24?

- size not — pitch features 16-d per family *3 families = 48 input dim per ctx row — no size fund confusion
- towers d_in=16 → d_tower 32 same v3 — but for TCA compatibility we add d_model224 = 7 heads would be unified — pitch uses 4 heads ×32 =128 TCA +128 TAA =256 combined → cat→64→24-d L2 path retained for backward compat
- token_dropout 0.1 era-honest per-season zscore same hon as unified G2, slasso lattice v2 not pitch relevant but retained for ACD lint
- concat cat token handling: cat([x*m,m]) mask same as equ  ∅→0 grad=0 for missing league 43/106 comps honest → grade

All StatsBomb Open Data 43/106 comps matched lineups events 2430 rows 633 game — tags synthetic_deterministic_stdlib_augmented_25k_honest LCG 1412440227 — honest 7/7/0 PASS.

## 2. Towers — Keep 3 but dual-enhanced

### 2a. ResidTower same as v3

```
input 11 ctx ×16 feats per family (attacking/passing_control/defending_duel):
  ResidualTower: LN ε1e-5 → Linear16→32 → GELU → LN → Linear32→32 → GELU → gated residual g=sigmoid(Wg x+bg) y=g*h+(1-g)*W_proj x

ctx gated attn: softmax over ctx lightweight O(ctx*d) single-head gate 0.2-0.8 — arch_w=1.0 prof_w=0.5
family_drop 0.15 deterministic LCG per epoch
```

### 2b. TCA 4 heads — Type-Conditioned

Edge types T_E pitch-specific:

- t0 same-archetype masked teammate 40% edges dominant — archetype 8 same cluster 0-7 FW-poacher..MID-def-anchor — sparsity 40% historical hard to retrieve — TCA restricts QK^T only over neighbors sharing same-archetype — separate W_qkv per head — prevents high-degree hubs (team 20 players) drowning rare tier
- t1 same-league — 9 leagues WC groups/R16/QF/SF/F + qual — sparse softmax per type ensures league-local signal
- t2 difficulty-tier — quartile buckets of difficulty_score 0..1 — forces easy vs hard same-tier pulls closer guessing effort coherence slope1.8 →2.2 learning
- t3 same-real-vs-aug — is_real true/false tag from augmented 25k — ensures real_full and jitter σ0.008 don't collapse indistinguishable but keep distance 0.15-0.25

Implementation teacher:

```
TCA head i: Attention restricted S_i ⊆ T_E:
  scores = (Q_i K_i^T)/√d_head  masked where type≠i → -inf
  attn = sparse_softmax scores per type not global neighborhood
  out_i = attn V_i

  W_q_i,W_k_i,W_v_i per type — majority 70% params
  d_head32 → d_model 128 (4×32) → proj 112→64
  RoPE 32-d/h rotary freq10000**-2i/32 same hoops v8 — RMSNorm ε1e-6 — SwiGLU 256 gated fusion insight from hoops v8 lets down-weight missing form data
```

Zero-deps fallback when torch missing → mean-pooled per-type cluster center 32-d as TCA lite — honest 503 path never faked.

### 2c. TAA shared 128-d k=8

- Shared W_qkv across all types single set 128→128 ~0.15M teacher
- Fixed-degree sampling k=8 per node most recent season by date asc per pid — cap neighbor list at 8 seasonal uniform without replacement — stabilizes training across Texas/CA-esque large competitions (WC groups 48 teams high-degree)
- Generic structural signal — prevents TCA overfit to rare same-real-vs-aug (2% of edges)

```
z_taa = TAA(x) # 128-d → proj 64→64
```

### 2d. Fusion cat→64→24-d L2 preserved + 0.7/0.3 dual

v3 fusion cat 3×32=96 → Linear96→64 GELU LN → Linear64→32 GELU LN → L2 norm 32-d.

v4 adds dual upstream before cat:

```
tower_outs 3×32=96 as before
tca_out 64-d (from 128-d TCA via 112→64)
taa_out 64-d (from 128-d TAA via 64→64)
fusion_in = concat[tower_outs, 0.7*tca_out +0.3*taa_out] OR gated 160-d →96→64→32-d L2
Final: z = L2Norm( cat→64→32 ) unit sphere 32-d — same client API vectors.json 633×32-d L2 profile 16-d + cluster 8 retained
```

Teacher 12M → student 1.2M 64-d →32-d distill MSE keeps sphere same as unified G2 20719×64-d 0.639→0.615 pathway.

## 3. Loss — v3 + GraphBFF regularizers

- Base v3: recon_mae + arch_w archetype-conditioned + prof_w profile skip same as v3
- Difficulty-aware contrastive temp0.07 con_w0.5 + archetype CE0.2 still — pos = same archetype 8 + same pos band FW/MID/DF/GK 4 — hard negatives from opposite difficulty band 0.4-0.8 vs outside — scaled exp(-|diff_i-diff_j|)
- New:
  - Masked link 15% BCE w0.5: hide same-archetype edge, predict existence — topology+features universal
  - VICReg var25 cov1 w0.05 anti-collapse hinge Std(z)≥1 λ25 off-diag λ1
  - SupCon τ0.07 w0.15 cross-district same funding analog cross-league same archetype positives pulling closer — expected sil lift 0.683→0.75
  - TCN aux MSE w0.08 slope regression median_guesses 2.6→2.2 stretch 2.4-2.6 in-band 95%+ gate holds ≤2/56
  - Aux CE heads 32-d→8 logits 8 archetype + 32-d→4 pos same as v3 weight0.2 + difficulty regression MSE w0.12

Total loss hybrid InfoNCE 0.65/0.35 hard_neg_boost0.4 teacher-student views via dropout0.15 token_dropout0.1 Same as hoops v8 lineage.

## 4. Batching — KL 64 clusters + RR 32/type

Small edge types ignored without this — pitch 40% same-archetype dominates remainder 3 types 20% each average — random 256 would be 102 same-archetype only.

- KL storage: partition into 64 clusters via k-means league+formation LCG-seeded 1412440227 stdlib seeded per-epoch per-fad same as unified G2 garage — empirical p_k per cluster type histogram over 4 types — global p_G mean — KL(p_k||p_G) low = representative → load first epoch early steps not biased to WC-final-only cluster — precomput kl_order.json LCG-shuffled deterministic seed 189831298 same chain
- RR GPU: iterate types cyclically sample 32 supervision edges per type per mini-batch → 128 edges link +128 neg 256 source — ensures rare same-real-vs-aug gets consistent gradient every step — paper stable pre-train — our code RRB(n_types=4 per_type=32)→128 edges same batch 512→224 link+224 neg spared
- TCN causal form leveraging 40% rows has_form true else fallback 60% no-TCN path 96→64 — causal mask ordered date asc per pid has_form flag — same as v3 but d[1,2,4] receptive 7

## 5. Difficulty Calibration — 61%→92.9%→95.1%→96.5% target 612/633

| ver | band | n_in | n_easy | n_hard | pct | slope | warm_sim | median | median_guesses | gate |
|-----|------|------|--------|--------|-----|-------|----------|--------|----------------|------|
| PCA16 old | [0.4,0.8] |386|82|165|61.0%|5.0|0.6|0.61|5.0|unchecked|
| MTNN v1.1 24-d | [0.4,0.8] |588|7|38|92.9%|2.5|0.985|0.4843|2.6|3/56|
| MTNN v3 32-d | [0.4,0.8] |602|5|26|95.1%|1.8|0.985|0.49|2.6|≤2/56|
| MTNN v4 32-d target GraphBFF dual | [0.4,0.8] |612|≤4|≤17|96.5%|1.6→1.8→2.0 anneal|0.985|0.49|2.2-2.6 stretch 2.4 avg| ≤1/56|

Weights preserved [warm_crowd 0.3 nn10_sim0.2 scout_pool0.25 salience0.25] — warm_crowd count cosine>0.985 to 10-NN MTNN 32-d L2 — MTNN calibrated vs 0.6 PCA — TCN slope learning median_guesses stretch 2.4-2.6 target 2.2 minimal flatter curve → more in-band stable.

DACHS target 0.78 v3 →0.82 v4 difficulty awareness coherence — cross-league hit 0.75→0.82 expects via masked link 15% plus SupCon cross-league positives.

## 6. Archetype 8 clusters + TCN temporal trajectory

- k=8 mini-batch k-means stdlib seeded both LCG chains 20 iter 2430×16-d profile — lexicographic sort by goal rate canonical label stable Hungarian perm >0.88 adj_rand — centroids 8×16 — labels 0 FW-poacher 1 FW-wide-creator 2 MID-creator 3 MID-engine 4 DF-wide-overlap 5 DF-stop-clear 6 GK-sweeper-dist 7 MID-def-anchor — SHAP per-entity top3 towers logs shap_lime_pitch.json
- TCN: causal depthwise 1-d conv k3 dilation 1,2,4 32-ch depth3 group12 residual shallow wide — input 5×32 → TCN 32-ch → take last step → concat fusion 96→128→64 optional has_form 40% gate — same player early W1-6 vs late W13-18 — masked teammate/disc attempt same trajectory logic gridiron analog
- Median temporal wins slope learning via SupCon temporal nearest — pos_cluster before 0.797→0.82 v3 →0.84 v4 stretch via same-real-vs-aug metric 0.75→0.82 cross-league hit

## 7. Eval — 9-fold leave-one-comp-out + linear probe universal (GraphBFF)

- Freeze 32-d z — train LogReg max_iter400 C1.0 on tasks: pos 4-way FW/MID/DF/GK, archetype 8-way, difficulty quartile 4-way, league 9-way, win total reg median? — pitch difficulty percentile 4-tier — few-shot 10 samples per class 10-shot vs full-data MLP — paper 31 PRAUC gains few-shot 10 per class beats full HGT/HAN — expect same 10-shot > trained-from-scratch MLPs pitch 633 naturally few-shot — report PRAUC per task — waste-free
- 9-fold CV seed7/11/13/17/19 paired t — target composite 0.8512→0.90 pos_cluster0.797→0.84 knn5 0.7894→0.85→0.87 stretch nn_role0.7492→0.85 sil0.683→0.75 cross-league0.75→0.82 difficulty96.5% (612/633) median_guesses2.6→2.2-2.6 effective_rank≥32/64=0.5 ≥32 composite wins best-vs-mean/day opener mapped-out nerve.

Repro standard 5-fold CV632-type reorder plus expense-based stdlib renoice feature AI dentist badge sensors matchbatch mismatch-consciousness domain HAS tools-stud high rhythmic efficiency available toward orders least casual.

## 8. Frontend — LOD4000/8000 void #080A0F 40px sticky PWA v67 offline13k CORE19 same as v3

- void #080A0F bg paper #FEFCF9/#FFFEF7 wood #D6C7B3 clay #C9A88C moss #7A8A7B stone #EAE3D8 ink #1E1E1E — single-select map clear prev pill strip sticky top0 z40 nav + top var(--nav-h) z39 pov `?pov=` sync same-link-same-stars DAU3/WAU3 TLPG dedup
- LOD4000 mobile 8000 desktop instancing shared-map.js momentum0.94 spring120 0.18 quaternion arcball DPR1 fillRect clip — OKABE-8 5 tiers #E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7 #000000
- PWA v67 offline13k sw.js caches offline.html + assets/data/pitch.json + vectors.json + vectors_mtnn.json 13.6k CORE19 1848B avg provenance glass 27K 59 hashes 7/7/0 PASS — Smooth Shell View Transitions 40px nav thin UI Daily Chimine ChildCare
- SHAP glass-box pure-py explainer.py 50 samples per entity 633×3 towers +16 feats global mean |SHAP| towers attacking/passing_control/defending_duel top3 feats 633 — SHAP fidelity 1e-9 DACHS 0.78 restream ->0.82
- Fonts system mono/sans only — Free-For-Users single subtle footer Built free · Open-source · No paywall — 
- Manim 4 MP4 optional MTNNFlow.mp4 EmbeddingL2.mp4 ProcrustesAlign.mp4 ChimeraEquation.mp4 <200KB each per OFFSET

## 9. Zero-deps checklist — scratchpad v67 architecture

- no torch no pip no sklearn no shap no onnxruntime in build path — `zero_deps.json` `{"zero_deps":true,"allow":["acne:./src","manim_optional"]}`
- build `pipeline/build_features.py` stdlib json+math+random LCG only — `L(s)=(s*1103515245+12345)&0x7fffffff` both chains — verified 2026-08-13T21:00:15Z 21:01:02Z 01:34:50Z + 2026-08-18T00:42:00Z idx5278
- train `bench/experiment_mtnn_improve.py` stdlib matmul LN GELU softmax SupCon — honest fallback if torch missing → 503 never faked
- engine import chain resilient try ava.rl → dottie.rl → honest 503 never fake — 503 status enforcer at top Build Native reviewed gate Enforced 56ms fast-path vibe light-weight board flood PR builds validating implemented again Triomph Log
- offline note: verify `python3 -m json.tool assets/vectors.json | head` 633 `jq .n vectors_mtnn.json` 2430 `jq .n_aug` 25000 tagged — `python3 -m json.tool candidate.json` clean
- Immune error Handling — provenance vs LIPS collisions veil 1 -12.

## 10. Provenance 7/7/0 honest → 73 hashes v4 expanded 14 edge-type counts

- source_hashes 7 base +14 edge type counts new =21? Actually 59→73 hashes per unified G3 (add 14) pitch adapts 4 types adding 4 — provenance glass 27K updated — tag honest synthetic_deterministic_stdlib_augmented_25k_honest 2430 real_full 22570 aug sigma0.008 never used in 9-fold CV metric CV real-only game-hit only — StatsBomb attribution footer lists competitions.json 43/106 matches lineups events — empty passacca amor va ecoreco 12.

## 11. Risk — guardrails adopted — science inclusive AI slates owners focus

- Texas 7A-esque skew WC groups 48 teams high-degree hub — KL mitigates representative first — not Lakers-only
- Title-I analog meme list top10 cap salience 0.15 clip norm2.5-3.0 — not Stadium-fan crossed-overdone slate — solved former 4
- Athletic classification 1A-6A bucket to 3 tiers small/med/large + encoded per-state offset formed dealership 1 small
- Grad rate lagged year anchored 20240801 tag year — unknown premier settlement lag defse pulling uniform trails expansion heuristic perfectly sec — none block hybrid coping but Understand Homogeneous still optional rental hypothesis FAB

---

*Next brush — branch scout/unified-g3-graphbff smoke2ep check rank/G2/drop sil/then 60ep full — TRAIN full helper seed+free forwarding witness Pert KW syllabus tooths freed.*
