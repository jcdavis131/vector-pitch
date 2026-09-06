# weekend/live-fix-pitch

**What and why.** Fixes three live-site honesty defects on pitch.dumbmodel.com identified
by the L1 audit (`AUDIT_pitch.md`), all confirmed against `origin/master@42411cc`
(byte-identical to live via sha256 match on `/` and `assets/news/news_features.json`):
a roster section presenting hardcoded numbers as measured metrics with no disclosure, a
news-provenance string that never reflected the actual fetch result, and a fabricated
architecture name-drop that appears nowhere in the shipped v3 embedding's own file history.

**Measured evidence.**
- **D2:** `mod-roster`'s 12 real player tiles render two hardcoded decimal fields (a/b) as
  if measured metrics, with no backing file and no disclosure proximate to the numbers (the
  page's only honesty footer is scoped to the map's point-cloud randomness, never these
  numbers). Fix: one-line disclosure added to the existing roster section-head span, linked
  to the existing `#about` anchor. No numbers changed or added.
- **D3:** `fetchNews()` printed the literal hardcoded string "provenance
  7/7/0->14/14 LCG 20260813->189831298 triple[...]" identically on the loading, success,
  and catch paths, never derived from the actual fetch result — while the live JSON was
  serving real `provenance`/`lcg` fields (`j.provenance`, `j.lcg`) the code discarded. Fix:
  success path reads `provenance`/`lcg`/`fusion`/`dim` directly from the fetched JSON
  (`??`, no numeric fallbacks); catch path now says "provenance unavailable — fetch
  failed"; loading placeholder drops the fabricated counter. Three remaining
  "7/7/0->14/14" instances (footer intro/tag, console.log) are static design copy, not
  fetch-result status text — left untouched, out of D3's evidence scope.
- **D4(a):** the live page named "GraphBFF dual TCA4+TAA128" as part of `embedding_v3` in
  three places (hero deck copy, the "ALL" map-step description, `#about` honesty footer).
  Verified independently: `assets/construct_validity_v3.json` (the actually-shipped v3)
  never mentions GraphBFF/TCA/TAA in current content or any past revision
  (`git log --all -S"GraphBFF" -- assets/construct_validity_v3.json` is empty). GraphBFF is
  exclusively a v4 docs concept whose only artifact
  (`pipeline/train_mtnn_v4_pitch_graphbff.py`) is numpy noise with a hardcoded fabricated
  PASS verdict. Stripped the phrase from all three call sites, no replacement substituted.

`index.html` and `public/index.html` (the actually-served copy per `vercel.json
outputDirectory`) were byte-identical before this change, edited in lockstep, and verified
byte-identical after (`diff` confirmed).

**Verified, and how.**
- Served worktree `public/` on `127.0.0.1:8853` before and after the edit (port proven
  closed both times via a netstat-equivalent check); curled `/` and
  `/assets/news/news_features.json`, sha256 of the pre-edit blob matched L1's recorded live
  hashes exactly (`40b096de0d68be.../7d7683041cff...`).
- `pytest` from the worktree root: 9 failed / 17 passed, identical failing-test set before
  and after (all 9 pre-existing Windows cp1252-decoding and stale pre-redesign
  model.html/sw.js/manifest.json content issues, unrelated to this change).
- Guard 11: `vector-pitch` home checkout stayed porcelain-clean throughout (checked before
  worktree add, before running pytest, immediately before commit); `qctl status` showed
  j0012 vector-hoops running (never a pitch job) at every check.

**Explicitly NOT done** (`docs/LIVE_FIX_FINDINGS_pitch_2026-09-06.md` on this branch):
- D1 (`vercel.json` rewrites not honored live): dashboard-only fix, no code path exists in
  this repo for it.
- D4(b) (`assets/eval_scoreboard_v4.json` / the v4 training script's fabricated metrics +
  PASS verdict): deliberately deferred to avoid overlapping the sibling
  `weekend/artifact-claims-pitch` lane's already-active worktree on this same repo, whose
  brief covers exactly this class of pitch asset-honesty labeling.

**Merge target and blocker.** Base: `origin/master` (`42411cc`), 1 commit ahead, clean.
Touches `index.html` + `public/index.html`, disjoint from
`weekend/artifact-claims-pitch`'s `assets/eval_scoreboard.json` and
`weekend/fix-model-page-assets`'s docs-only findings file — all three pitch branches merge
independently without conflict. No blocker.
