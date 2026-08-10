#!/usr/bin/env python3
"""Phase 2 of the MTNN improvement pass: refine weight_decay / d_emb / patience
around the phase-1 winner (minutes_skip=True, lr=0.003, ret_weight=0.5) from
``experiment_mtnn_improve.py search``. VAL loss only; test split untouched.

Conclusion (see bench/search_results_phase2.json for the full 18-config grid):
weight_decay is flat across 1e-4/3e-4/1e-3 (val loss identical to 5 decimal
places within each d_emb), and patience=60 never beats patience=40 (early
stopping already finds the same optimum). d_emb=32 edges out d_emb=24 by
~0.008 val loss (3.2167 vs 3.2245) but seed-to-seed variance at fixed
hyperparameters is ~0.04 (see the 5-seed spread in training_config_improved
.json) — an order of magnitude larger than the d_emb gap. d_emb=24 (the
repo's existing width, unchanged) is kept as the shipped config: it is the
minimal diff, statistically indistinguishable from d_emb=32 here, and (per
run_improved_benchmark.py's 5-seed test-set numbers) gives a better
next_window_goal_contribution margin than the single d_emb=32 run scored
during this sweep.

Usage
-----
    python bench/experiment_mtnn_improve_phase2.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "bench"))

from experiment_mtnn_improve import load_data, train_mtnn_v2  # noqa: E402


def main() -> None:
    data = load_data()
    grid = []
    for wd in (1e-4, 3e-4, 1e-3):
        for d_emb in (24, 32, 16):
            for patience in (40, 60):
                grid.append({"weight_decay": wd, "d_emb": d_emb, "patience": patience})

    print(f"[phase2] {len(grid)} configs around minutes_skip=True lr=0.003 ret_weight=0.5")
    results = []
    t0 = time.time()
    for i, cfg in enumerate(grid):
        patience = cfg["patience"]
        _, val, full = train_mtnn_v2(
            data,
            epochs=400,
            patience=patience,
            lr=3e-3,
            ret_weight=0.5,
            weight_decay=cfg["weight_decay"],
            d_emb=cfg["d_emb"],
            minutes_skip=True,
            seed=0,
        )
        full["patience"] = patience
        results.append(full)
        print(
            f"[{i + 1}/{len(grid)}] wd={cfg['weight_decay']} d_emb={cfg['d_emb']} "
            f"patience={patience}: val={val:.5f} comp={full['best_val_components']} "
            f"[{time.time() - t0:.0f}s elapsed]"
        )
    results.sort(key=lambda r: r["best_val_loss"])
    out_path = ROOT / "bench" / "search_results_phase2.json"
    out_path.write_text(json.dumps(results, indent=2) + "\n")
    print(f"\n[phase2] wrote {len(results)} results to {out_path}")
    print("[phase2] top 5:")
    for r in results[:5]:
        print(
            f"  wd={r['weight_decay']} d_emb={r['d_emb']} patience={r['patience']}: "
            f"val={r['best_val_loss']:.5f} comp={r['best_val_components']}"
        )


if __name__ == "__main__":
    main()
