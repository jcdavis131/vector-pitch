# Artifact-claim correction — 2026-09-06 (weekend/artifact-claims-pitch)

Branch built off `42411cc` (verified: `git show 42411cc:index.html | sha256sum` =
`40b096de0d68beba76aa373e965d567500eb8138f164b2c86ffab49d2e26d057`, identical to
`curl -s https://pitch.dumbmodel.com/` fetched fresh this session — this ref is the live site's
own bytes, confirmed independently rather than assumed from the plan's hint).

## Fixed on this branch

**`assets/eval_scoreboard.json` presented v3 design-target numbers as the file's own headline,
without a target label, over the real v1.1 shipped numbers.**

The file already labels some of its v3 content honestly: `difficulty.v3_target` and
`evaluation.v3_target_8_metrics` both say "target" in their own key names, and the file already
contains the real measured v1.1 numbers untouched, at `evaluation.mtnn_v1_1_con05` (`composite`
0.7785, `pos_cluster_acc` 0.797, `knn5_pos_acc` 0.7894, `nn_role_coherence` 0.7492, `recon_mae`
0.4956). What was NOT labeled: the file's own top-level `composite` (0.86), `embedding`
("mtnn_v3_32d_l2 archetype8"), and `model` ("PitchMTNN v3 ...") fields, which read as the file's
current headline identity with no target qualifier — even though this same file's
`evaluation.v3_target_8_metrics` says outright these are targets, and `assets/vectors.json` (the
file the site actually serves for retrieval) has `embedding: "mtnn_v1_24d_l2"`, built
2026-08-05, not the v3 32-d design.

Fix: renamed the three top-level fields to `composite_v3_target`, `embedding_v3_target`,
`model_v3_target` (values unchanged), and added `composite_shipped` (0.7785),
`pos_cluster_acc_shipped` (0.797), and `embedding_shipped` ("mtnn_v1_24d_l2") at the top level —
all three restated from this same file's `evaluation.mtnn_v1_1_con05` object and from
`assets/vectors.json`'s own `embedding` field, not invented. Added a `v3_vs_shipped_note`
field citing both sources. The real v1.1 row was not touched or deleted; `composite_before`
(0.8512, matching `evaluation.mtnn_v1_1_con05.composite_with_game_hit`) was left as-is since it
was already honestly named as a "before" comparator, not presented as current.

No page or script reads the renamed top-level fields: `players.html` is the only consumer of this
file (`grep -rn eval_scoreboard *.html assets/*.js` — no other repo file references it), and it
only reads `evalRes.difficulty.new_mtnn24` (untouched by this edit;
`players.html:483`). `tests/test_parity.py::test_json_tools` only checks the file still parses,
which it does. No `?v=` cache token exists for this file anywhere in the repo (unlike hoops, this
repo has no `stamp_assets.py`), so there was no token to bump.

## Not fixed — pre-existing, unrelated to this change

Running `pytest tests pipeline` at this exact commit (`42411cc`, before any edit — verified by
`git stash` / re-run / `git stash pop`) already fails 9 of 26 collected tests, identically with and
without this branch's edit:

- `test_html_exist_and_200`, `test_no_todo`, `test_data_active_8_8`,
  `test_play_daily_pack_sharedmap`, `test_trends_scrubber_vorp` — `UnicodeDecodeError: 'charmap'
  codec can't decode byte ...` from `Path.read_text()` with no explicit encoding, hitting UTF-8
  multi-byte sequences (em-dashes etc.) under the Windows default `cp1252` codec. An environment/
  test-authoring issue (the test suite assumes a UTF-8 default locale), not a content bug.
- `test_manifest` (`assert '#0A1510' in ...`), `test_sw` (`assert 'DENY_CACHE' in ...`) — assert
  strings absent from the current `manifest.json` / service worker at this commit.
- `test_eval_scoreboard_chips`, `test_manim_autoplay` — both read `model.html` and assert strings
  ("eval_scoreboard", "evsb-pos", "autoplay", "MTNNFlow") that are absent from the redesigned
  175-line `model.html` at this commit. This matches `NEXT_LEVEL_PLAN.md`'s independent finding
  that a "deliberate 2-week-old redesign retired `/model`" — the test file was written against an
  older Lab page and never updated for the redesign. No CI workflow in this repo runs pytest at
  all (`.github/workflows/lint.yml` runs only `ruff`), so this drift was never caught.

Net: 9 failed / 17 passed, bit-identical before and after this branch's `assets/eval_scoreboard.json`
edit. Confirmed via `git stash` (baseline run) then `git stash pop` (edit restored, diff intact).
These 9 are reported here for the operator, not fixed — out of this lane's brief, which named
`assets/eval_scoreboard.json` specifically.
