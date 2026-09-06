# weekend/artifact-claims-pitch

**What and why.** `assets/eval_scoreboard.json` presented v3 design-*target* numbers
(composite 0.86, embedding `mtnn_v3_32d_l2 archetype8`) as the file's own unlabeled
headline, over the real v1.1 shipped bytes — a shipped/aspirational conflation of exactly
the kind the weekend's honesty guard exists to catch. A same-branch follow-up commit then
caught and corrected its own over-claim (see below).

**Measured evidence.**
- The file already labeled some v3 content honestly (`difficulty.v3_target`,
  `evaluation.v3_target_8_metrics` both say "target" in their key names) and already
  carried the real v1.1 numbers untouched at `evaluation.mtnn_v1_1_con05` (composite
  0.7785, `pos_cluster_acc` 0.797) — only the top-level `composite`/`embedding`/`model`
  fields lacked any target qualifier.
- Renamed the three top-level fields to `composite_v3_target` / `embedding_v3_target` /
  `model_v3_target` (values unchanged), and added `composite_shipped` (0.7785),
  `pos_cluster_acc_shipped` (0.797), `embedding_shipped` (`mtnn_v1_24d_l2`) — all three
  restated from this same file's `evaluation.mtnn_v1_1_con05` object and from
  `assets/vectors.json`'s own `embedding` field, not invented. No number removed;
  `composite_before` (0.8512) left alone as an already-honest "before" comparator.
- **Self-correction (second commit on this branch):** the first commit's message and docs
  described `assets/vectors.json` as "what the site actually serves." That's false — a
  fresh `curl -s -o /dev/null -w '%{http_code}'` against both
  `https://pitch.dumbmodel.com/assets/vectors.json` and `.../assets/eval_scoreboard.json`
  returns 404, live, right now (`SHIPPED_MODELS.md:19` already established
  pitch.dumbmodel.com serves only `public/`, no model asset). Reworded the JSON's
  `v3_vs_shipped_note` and the docs paragraph to say plainly that the `_shipped` fields
  restate the repo's own committed v1.1 numbers independent of whether any of it currently
  reaches a visitor. No value changed in this second commit either — history was not
  rewritten; the correction is a new commit on top, disclosed in
  `docs/ARTIFACT_CLAIM_CORRECTIONS_2026-09-06.md`.

**Verified, and how.**
- Branch built off `42411cc`, re-verified this session as the live site's own bytes:
  `git show 42411cc:index.html | sha256sum` matches a fresh
  `curl -s https://pitch.dumbmodel.com/` byte-for-byte
  (`40b096de0d68be...26e057`).
- `pytest tests pipeline` → 9 failed / 17 passed, **identical** before and after this edit
  (confirmed via `git stash` / re-run / `stash pop` on the unmodified tree). All 9
  pre-existing failures are unrelated to `eval_scoreboard.json` (Windows cp1252
  `read_text()` vs UTF-8 HTML bytes, a stale manifest/sw string assertion, two tests
  asserting strings from an older Lab page against the redesigned `model.html`) — full
  breakdown in `docs/ARTIFACT_CLAIM_CORRECTIONS_2026-09-06.md`.
- No page or script reads the renamed fields: `players.html` is the only consumer of this
  file and only reads `evalRes.difficulty.new_mtnn24` (untouched). No cache token exists
  for this file (repo has no `stamp_assets.py`), so nothing needed bumping.
- Guard 11: `git -C vector-pitch status --porcelain` empty before and after; `qctl.py
  status` showed vector-hoops (j0012) or vector-realty (j0006) running throughout, never
  vector-pitch.

**Explicitly NOT done.** No shipped file's actual value changed — this is a labeling-only
fix. The dead `/model` route and the non-honored `vercel.json` catch-all rewrite (both
audited by the sibling branch `weekend/fix-model-page-assets`) are out of this branch's
scope.

**Merge target and blocker.** Base: `origin/master` (`42411cc`), 2 commits ahead, clean. No
blocker. Touches only `assets/eval_scoreboard.json` and adds
`docs/ARTIFACT_CLAIM_CORRECTIONS_2026-09-06.md` — disjoint from
`weekend/live-fix-pitch`'s `index.html`/`public/index.html` edits and from
`weekend/fix-model-page-assets`'s docs-only findings file, so all three pitch branches can
merge independently without conflict.
