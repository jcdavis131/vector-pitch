# Live-fix findings — pitch.dumbmodel.com, 2026-09-06 (lane L2)

Two items from L1's audit (`C:\Users\jcdav\.claude\jobs\b3fe1852\tmp\lanes\L1-pitch\AUDIT_pitch.md`)
are **not** fixed on this branch (`weekend/live-fix-pitch`), per the L2 brief's "if it's a product
decision, write findings and stop" rule and the guard-11 lane-overlap rule. Everything else in the
audit (D2, D3, D4a) is fixed — see the commit on this branch.

## D1 — `vercel.json` rewrites not honored live (dashboard-scope, no code fix exists)

**Evidence (re-confirmed, not re-derived — L1's curls stand):** `origin/master`'s `vercel.json`
declares 6 named rewrites (`/play`, `/players`, `/model`, `/trends`, `/lab`, `/dfs`) plus a
catch-all `/(.*)  → /index.html`. Live, all 7 return Vercel's generic `NOT_FOUND` page, never
`index.html`. L1 independently confirmed the repo *is* the one being built (`cleanUrls` redirects
fire live, `/api/telemetry` serves as a live function from this repo's `api/` folder) — so this
isolates specifically to the `rewrites` section being skipped, not a wrong-repo/wrong-root deploy.

**Why no lane can fix this:** there is no file in the repo whose content controls whether Vercel's
build honors `vercel.json`'s `rewrites` key — that's a project-level setting (Production Branch /
build-cache mismatch, or a dashboard-level "skip rewrites" toggle) that only the Vercel dashboard
exposes. No code change in this worktree can reach it, and per the weekend guards this lane cannot
run `vercel` CLI or a deploy command.

**Operator action needed:** open the Vercel project dashboard for `vector-pitch` and check (a) the
Production Branch actually points at `master` (not a stale commit's build cache) and (b) there is
no project-level override disabling `rewrites`. Re-deploying from the dashboard after fixing
either would restore `/model`, `/players`, `/trends`, `/lab`, `/dfs`, `/play`, and the catch-all
SPA fallback.

## D4(b) — `assets/eval_scoreboard_v4.json` / `pipeline/train_mtnn_v4_pitch_graphbff.py` fabricated eval (deferred, not fixed on this branch)

**Evidence (re-confirmed independently by this lane before deferring):**
- `git -C vector-pitch grep -io "graphbff\|tca\|taa" origin/master:assets/construct_validity_v3.json`
  → **zero matches**, confirmed in this lane. `git log --all -S"GraphBFF" -- assets/construct_validity_v3.json`
  → **empty**. So the shipped v3 asset never mentioned GraphBFF/TCA/TAA at any point in its history —
  this lane fixed the live page's name-drop (D4a, see commit) on that basis.
- `pipeline/train_mtnn_v4_pitch_graphbff.py`'s `main()` unconditionally calls `stdlib_smoke()`
  regardless of its `--epochs`/`--batch`/`--d-emb` flags; that function generates
  `np.random.default_rng(189831298).standard_normal((633,32))` L2-normalized noise as the
  "embedding," then writes a **hardcoded literal** metrics dict (not computed from that array or
  any data) to `assets/eval_scoreboard_v4.json`. The committed file wraps this in a
  `retune_2026_08_19.verifier: {"pass": true}` block — a fabricated PASS on numpy noise.
- **Confirmed not currently live:** `git grep -l "eval_scoreboard_v4\|construct_validity_v4\|pitch_mtnn_v4_32d_graphbff" origin/master`
  returns only the training script itself — no page (`public/index.html`, root `index.html`,
  `model.html`, `dashboard.html`) fetches or reads these files. The fabrication is real and
  tracked, but not rendered to a visitor.

**Why this lane is not fixing it:** at the time this lane's worktree was created, a second active
worktree already existed on this same repo — `C:/Users/jcdav/.claude/jobs/b3fe1852/tmp/lanes/L7/wt-pitch`,
branch `weekend/artifact-claims-pitch`, also at `42411cc` — whose brief (`NEXT_LEVEL_PLAN.md` §6,
lane L7) is explicitly "pitch: `assets/eval_scoreboard.json` presents v3 targets over v1.1 shipped
bytes — label them as targets," i.e. the exact same class of work (asset-honesty labeling in
`vector-pitch/assets/`) on the same repo. Two lanes independently relabeling pitch scoreboard JSON
files is the collision the plan's per-lane split exists to prevent, so this lane stopped at
documenting rather than editing `assets/eval_scoreboard_v4.json` or the training script.

**Recommended fix (unchanged from L1, for whoever picks this up — L7 or the operator):** either
(a) remove `assets/eval_scoreboard_v4.json` and `assets/pitch_mtnn_v4_32d_graphbff.npz` from
tracking (nothing reads them), or (b) add an explicit `"synthetic_placeholder": true` + corrective
note to the JSON, flip `retune_2026_08_19.verifier.pass` to `false`, and label the script's own
docstring/console output as spec/target numbers rather than achieved results — matching the
"label, not deletion" approach this lane used for D2 (roster tiles) and the PROJECTED-label
approach used elsewhere on hoops (L7's hoops half, `model_registry.json`).
