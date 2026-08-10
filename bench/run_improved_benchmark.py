#!/usr/bin/env python3
"""Full gauntlet re-run with the IMPROVED MTNN (minutes-skip residual + tuned
hyperparameters), for direct before/after comparison against the committed
bench/benchmark_report.json. Same dataset, same split, same baseline ladder —
only the MTNN training changes (see bench/experiment_mtnn_improve.py).

Supports multi-seed ensembling: trains N seeds of the SAME winning config and
averages raw-scale test predictions per target before scoring (disclosed).

Usage
-----
    python bench/run_improved_benchmark.py --seeds 0,1,2,3,4 \
        --lr 0.003 --ret-weight 0.3 --minutes-skip \
        --report bench/benchmark_report_improved.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "bench"))

from experiment_mtnn_improve import train_mtnn_v2  # noqa: E402
from run_real_benchmark import SEED, TARGETS, make_persistence_current_rung, target_rows_and_split  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=str, default=str(ROOT / "bench" / "data" / "pitch_bench_dataset.npz"))
    ap.add_argument("--report", type=str, default=str(ROOT / "bench" / "benchmark_report_improved.json"))
    ap.add_argument("--config-out", type=str, default=str(ROOT / "bench" / "training_config_improved.json"))
    ap.add_argument("--epochs", type=int, default=400)
    ap.add_argument("--patience", type=int, default=40)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--ret-weight", type=float, default=0.5)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--family-drop", type=float, default=0.0)
    ap.add_argument("--d-emb", type=int, default=24)
    ap.add_argument("--minutes-skip", action="store_true")
    ap.add_argument("--seeds", type=str, default="0", help="comma-separated seeds to ensemble")
    args = ap.parse_args(argv)

    from vector_bench.baselines import MTNNRung, default_prediction_ladder
    from vector_bench.registry import get_domain_spec
    from vector_bench.report import write_domain_report
    from vector_bench.runner import run_domain_benchmark
    from vector_bench.tasks import build_task_for_target

    data_path = Path(args.data)
    npz = np.load(data_path, allow_pickle=True)
    data = {k: npz[k] for k in npz.files}
    cut = int(data["cut_days"])

    seeds = [int(s) for s in args.seeds.split(",")]
    per_seed_preds = []
    per_seed_cfg = []
    for s in seeds:
        preds, val, cfg = train_mtnn_v2(
            data,
            epochs=args.epochs,
            patience=args.patience,
            lr=args.lr,
            weight_decay=args.weight_decay,
            family_drop=args.family_drop,
            ret_weight=args.ret_weight,
            d_emb=args.d_emb,
            minutes_skip=args.minutes_skip,
            seed=s,
            verbose=False,
        )
        per_seed_preds.append(preds)
        per_seed_cfg.append(cfg)
        print(f"[seed {s}] val={val:.5f} comp={cfg['best_val_components']} best_epoch={cfg['best_epoch']}")

    # ensemble: mean of raw-scale predictions across seeds, per target
    preds = {t: np.mean(np.stack([p[t] for p in per_seed_preds], axis=0), axis=0) for t in TARGETS}

    config = {
        "model": "pipeline/train_mtnn.py PitchMTNN (improvement pass) — same 6-tower "
        "trunk + gated fusion + L2 embedding, PLUS a direct raw-CUR_MINUTES "
        "residual skip into the next_window_minutes head "
        f"(minutes_skip={args.minutes_skip})",
        "heads": "next_window_minutes: nn.Linear(d_emb+1 if minutes_skip else d_emb, 1); "
        "next_window_goal_contribution: nn.Linear(d_emb, 1) (unchanged)",
        "auxiliary_loss": f"adjacent-window same-player InfoNCE (temp 0.07) x {args.ret_weight}",
        "dims": {"d_tower": 16, "d_emb": args.d_emb},
        "optimizer": f"AdamW(lr={args.lr}, weight_decay={args.weight_decay}), full-batch",
        "family_drop": args.family_drop,
        "seeds_ensembled": seeds,
        "per_seed": per_seed_cfg,
        "hyperparameter_selection": "chosen by VAL loss only over the phase-1 grid in "
        "bench/experiment_mtnn_improve.py (minutes_skip x lr x ret_weight, 40 configs) "
        "plus this run's own seed(s); test split never consulted for selection.",
    }
    Path(args.config_out).write_text(json.dumps(config, indent=2, default=str) + "\n")

    spec = get_domain_spec("pitch")
    ent = data["entity_ids"].astype(np.int64)
    X_task_full = np.concatenate([data["X"].astype(np.float64), data["M"].astype(np.float64)], axis=1)

    tasks, mtnns, fingerprints = {}, {}, {}
    for t in TARGETS:
        rows, split = target_rows_and_split(data, t)
        y_task = data[f"y_{t}"].astype(np.float32)[rows]
        fingerprints[t] = y_task[split.train_idx]
        tasks[t] = build_task_for_target(
            spec.target(t),
            "pitch",
            X=X_task_full[rows],
            y=y_task,
            group_key=ent[rows],
            time_key=data["label_end_days"][rows].astype(np.int64),
            time_cut=cut,
            seed=SEED,
            extra_notes={
                "data": "REAL StatsBomb open-data, FA WSL 2018/19-2020/21 (see bench/data/datasheet.json)",
                "features": "train-fit MaskedZScaler features + observability "
                f"mask columns ({X_task_full.shape[1]} cols)",
                "mtnn_training": f"IMPROVEMENT PASS: minutes_skip={args.minutes_skip} seeds={seeds} "
                "gradient<2019-12-01 val 2019-12..2020-07",
            },
        )
        mtnns[t] = MTNNRung(predictions=preds[t])

    ladder = [*default_prediction_ladder(SEED), make_persistence_current_rung(data, fingerprints)]
    dsc = run_domain_benchmark(spec, tasks, mtnns=mtnns, ladder=ladder)
    out = write_domain_report(dsc, args.report)
    print(f"[bench] wrote {out}")

    print(f"\n== pitch domain (IMPROVED): {dsc.aggregate['headline']} ==")
    for ts in dsc.targets:
        if ts.scorecard is None:
            continue
        v = ts.scorecard.verdicts.get(ts.primary_metric)
        print(
            f"  {ts.target_name} [{ts.primary_metric}]: "
            f"best_baseline={v.best_baseline}={v.best_baseline_value:.4f} "
            f"mtnn={v.mtnn_value:.4f} delta={v.mtnn_delta:+.4f} beats={v.mtnn_beats_best_baseline}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
