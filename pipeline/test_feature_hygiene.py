"""Feature-hygiene gates -- same discipline as vector-hoops'/vector-gridiron's
pipeline/test_feature_hygiene.py, adapted for this repo's schema (X/M/ctx_ids
in tm_full.npz, no separate Y-target array to check leaks against -- the
16-feature matrix is small and audit_features.py found zero findings of any
kind as of 2026-07-30, so this gate ships with no allowlist entries; any
future hit is a new, real thing to look at).

Run:  python pipeline/test_feature_hygiene.py    (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MATRIX = DATA / "tm_full.npz"
MANIFEST = DATA / "feature_manifest_tm_full.json"

DUP_R = 0.98
MIN_OVERLAP = 100
MIN_COVERAGE = 0.01
NEAR_CONST_STD = 0.01

# No known exceptions as of 2026-07-30 -- audit_features.py found 0 dead
# columns and 0 redundant pairs across all 16 features. Add here only with a
# reason and a measurement if a future feature addition trips a gate.
KNOWN_DUPLICATES: set[str] = set()
KNOWN_NEAR_CONSTANT: set[str] = set()

FAILURES: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        FAILURES.append(label)


def masked_corr(a, b, ma, mb) -> tuple[float, int]:
    both = (ma > 0) & (mb > 0)
    n = int(both.sum())
    if n < MIN_OVERLAP:
        return 0.0, n
    x, y = a[both].astype(np.float64), b[both].astype(np.float64)
    sx, sy = x.std(), y.std()
    if sx < 1e-9 or sy < 1e-9:
        return 0.0, n
    return float(((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)), n


def main() -> None:
    if not MATRIX.exists() or not MANIFEST.exists():
        print(f"{MATRIX.name} / {MANIFEST.name} missing -- run the pitch feature build")
        sys.exit(1)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    m = np.load(MATRIX, allow_pickle=True)
    Z, M = m["X"], m["M"]
    feats: list[str] = man["features"]
    fam_of: dict[str, str] = man["families"]

    print("shape")
    check(Z.shape[1] == len(feats), f"matrix width == manifest features ({len(feats)})")
    check(Z.shape == M.shape, "values and mask same shape")

    print("no dead columns")
    dead = []
    for j, f in enumerate(feats):
        if f in KNOWN_NEAR_CONSTANT:
            continue
        obs = M[:, j] > 0
        if obs.mean() < MIN_COVERAGE:
            dead.append(f"{f} (coverage {obs.mean():.4f})")
        elif obs.sum() >= MIN_OVERLAP and float(Z[obs, j].std()) < NEAR_CONST_STD:
            dead.append(f"{f} (near-constant)")
    check(
        not dead,
        f"every feature carries signal{'' if not dead else ': ' + ', '.join(dead[:5])}",
    )

    print("no new duplicate input pairs")
    dups = []
    for j in range(len(feats)):
        for k in range(j + 1, len(feats)):
            r, _ = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= DUP_R:
                dups.append(f"{feats[j]}~{feats[k]} r={r:+.4f}")
    unknown_dups = [d for d in dups if d.split(" r=")[0] not in KNOWN_DUPLICATES]
    check(
        not unknown_dups,
        f"no new duplicate pairs |r|>={DUP_R}"
        f"{'' if not unknown_dups else ': ' + ', '.join(unknown_dups[:5])}",
    )

    print("families intact")
    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(feats):
        fam_cols[fam_of.get(f, "?")].append(j)
    check("?" not in fam_cols, "every feature has a family")
    check(len(fam_cols) >= 3, f"family count sane ({len(fam_cols)})")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} feature-hygiene gate(s) FAILED")
        sys.exit(1)
    print("all feature-hygiene gates passed")


if __name__ == "__main__":
    main()
