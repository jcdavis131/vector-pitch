# weekend/fix-model-page-assets (vector-pitch)

**What and why.** Investigates the live `/model` 404 on pitch.dumbmodel.com. Finding: this
is **not a code bug** — `origin/master` (this branch's base) is 104 commits ahead of the
previously-checked-out local master and already retired the multi-page site `model.html`
lived on. Commit `34fdee9` (2026-08-21) moved `outputDirectory` to `"public"` and rewrote
every route to `/index.html`, a new single-page embedding-map app; `model.html`,
`players.html`, `methods.html` and their data assets are real and committed but live only
at the repo root, outside `public/` — so `/model` 404s by design of that redesign. This is a
docs-only branch: no shipped file is changed.

**Measured evidence.**
- `production does not appear to honor vercel.json's rewrites at all` — a catch-all
  `"/(.*)" -> "/index.html"` exists in the committed config, yet `/nonexistent-route-xyz`
  404s live exactly as a bare static serve of `public/` does locally
  (`python -m http.server --directory public` reproduces the identical 200/404 split for
  `/`, `/assets/news/news_features.json`, `/model`, `/assets/vectors.json`, `/players`,
  `/nonexistent-route-xyz`).
- A follow-up commit on the same branch tightened this claim after a second verification
  pass: "vercel.json not applied at all" is too strong (contradicted by `nosniff` appearing
  on the live root's 200) — restated precisely as "rewrites are demonstrably ineffective
  (a catch-all that cannot miss still 404s); headers may or may not be applied (`nosniff`
  also appears on the live 404, a plausible platform default) — not distinguishable from
  here." Also ruled out `.vercelignore` swallowing `vercel.json` (checked verbatim: it
  doesn't).
- `pos_cluster_acc 0.797` (the number named in the original task brief) is real and
  traceable to `assets/eval_scoreboard.json` (`evaluation.mtnn_v1_1_con05.pos_cluster_acc`)
  and `assets/vectors_mtnn.json` — it just isn't reachable from the live site under the
  current routing.

**Verified, and how.**
- Re-verified (on this branch's HEAD, not just the earlier stale checkout) that
  `assets/vectors.json`, `assets/difficulty_calibration.json`,
  `assets/pitch_mtnn_embeddings.json`, `pipeline/data/pitch_mtnn_report.json`,
  `pipeline/data/tm_9ctx_con05_report.json`, and `pipeline/eval_reports/eval_pitch_latest.json`
  are all tracked and parse as valid JSON.
- Full test suite: 26 collected, 17 passed, 9 failed, all pre-existing — 7 an unrelated
  Windows cp1252 `read_text()` bug, 2 genuine content-mismatch failures against an earlier
  `model.html` generation. Left untouched per this lane's no-unrelated-cleanup guardrail.

**Explicitly NOT done.** No shipped file changed. Reversing the redesign (restoring
per-page routing) is a **product decision**; fixing the deploy-root/rewrite mismatch
cannot be verified without deploying, which this lane may not do. Both decisions are
named for the operator in `docs/MODEL_PAGE_DEPLOY_FINDINGS_2026-09-05.md`.

**Merge target and blocker.** Base: `origin/master` (`42411cc`), 2 commits ahead, clean —
adds only `docs/MODEL_PAGE_DEPLOY_FINDINGS_2026-09-05.md` (152 lines), no code touched, so
it merges without conflicting with `weekend/artifact-claims-pitch` or
`weekend/live-fix-pitch`. No git-level blocker; the underlying `/model` gap itself needs an
**operator product decision** before any code fix is worth writing.

Note: `vector-equities` has a *different* branch that happens to share this exact name,
`weekend/fix-model-page-assets` — same branch name, unrelated repo, unrelated content (see
that repo's own `docs/PR_BODY_fix-model-page-assets.md` on its branch).
