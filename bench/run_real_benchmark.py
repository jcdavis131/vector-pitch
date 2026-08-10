#!/usr/bin/env python3
"""Run the REAL-data multi-target vector-bench gauntlet for vector-pitch.

Solo personal project, no connection to employer, built with public/free-tier only

Loads the real StatsBomb FA WSL dataset built by ``bench/build_dataset.py``,
trains the repo's MTNN (pipeline/train_mtnn.py ``PitchMTNN``: masked residual
family towers -> attention+gate fusion -> L2 24-d embedding) END TO END on CPU
with TWO heads — next_window_minutes and next_window_goal_contribution (MSE on
z-scored targets) — plus the domain's own adjacent-window InfoNCE retrieval
loss as a multi-task auxiliary (pitch is retrieval-primary: "find the same
player's adjacent window"). Then runs vector-bench's full multi-target baseline
gauntlet (``run_domain_benchmark``) with the trained MTNN slotted in per
target, and writes the schema-1.1 domain report to
``bench/benchmark_report.json``.

Leakage discipline
------------------
- Harness split per target: temporal, time_key = label-window END date (days),
  cut = 2020-07-01 -> train = 2018/19 + 2019/20 label windows, test = 2020/21.
  Baselines fit on each target's full train side.
- MTNN: gradient steps on rows with label-end < 2019-12-01 ONLY; early-stops on
  label-end in [2019-12-01, cut) (val); test rows (2020/21) are NEVER forward-
  passed at fit time (asserted). Because every row's features end strictly
  before its label window starts (asserted in build_dataset.py), no gradient or
  early-stop signal ever reaches a test-period match.
- Preprocessing (vector-core MaskedZScaler in build_dataset.py; per-target
  label z-scoring here) is fit on train rows only.

A momentum rung is added to the ladder as ``persistence_current`` (predict the
next window = the CURRENT window's raw value: minutes for the minutes target,
(goals+assists)*90/minutes for the goal-contribution target) alongside the
harness defaults (dummy_mean, persistence, ridge, pca_ridge, knn, hist_gbm,
mlp).

Hyperparameters (lr x ret_weight x family_drop, 12 configs) are selected on
VAL loss only; the test split is never consulted. Every number in the report
is produced by this script on the real dataset. Seeded: SEED = 0.

Usage
-----
    python bench/run_real_benchmark.py [--data bench/data/pitch_bench_dataset.npz]
        [--report bench/benchmark_report.json] [--epochs 400] [--no-grid]

Requires vector-bench + vector-core (editable installs from the vector-hub
monorepo) and torch (CPU). See bench/README.md.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

SEED = 0
TARGETS = ("next_window_minutes", "next_window_goal_contribution")

DEFAULT_DATA = ROOT / "bench" / "data" / "pitch_bench_dataset.npz"
DEFAULT_REPORT = ROOT / "bench" / "benchmark_report.json"
DEFAULT_CONFIG = ROOT / "bench" / "training_config.json"


def target_rows_and_split(data: dict, tname: str):
    """Deterministic task rows + harness temporal split for one target.

    Returns (rows, split): ``rows`` are global row indices with a defined label
    and ``split`` is the harness temporal split over those rows on the
    label-window END date at the dataset's committed cut.
    """
    from vector_bench.tasks import temporal_split

    rows = np.where(data[f"mask_{tname}"].astype(bool))[0]
    t = data["label_end_days"][rows]
    return rows, temporal_split(t, cut=int(data["cut_days"]))


# --------------------------------------------------------------------------- #
# Momentum persistence: next window := the current window's raw value.
# --------------------------------------------------------------------------- #
def make_persistence_current_rung(data: dict, fingerprints: dict):
    """``persistence_current``: forward value := current-window raw value.

    The harness runs ONE shared ladder across all targets and hands each rung
    only (X_train, y_train) at fit time, so this rung identifies which target's
    run it is in by exact-matching y_train against each target's stored train
    labels (the two label arrays are distinct real series). predict() returns
    the row's RAW current-window statistic: CUR_MINUTES for the minutes target;
    (GOALS_P90 + ASSISTS_P90) for the per-90 goal-contribution target, falling
    back to the target's train-label mean when the player played 0 minutes in
    the current window (per-90 unobserved there).
    """
    from vector_bench.baselines import PredictionBaseline

    feat = [str(f) for f in data["feat"]]
    X_raw = data["X_raw"]
    M = data["M"]

    class PersistenceCurrent(PredictionBaseline):
        name = "persistence_current"

        def __init__(self):
            self._active: str | None = None
            self._fallback = 0.0

        def fit(self, X, y, **ctx):
            y = np.asarray(y)
            for tname, ref in fingerprints.items():
                if y.shape == ref.shape and np.array_equal(y, ref):
                    self._active = tname
                    self._fallback = float(np.asarray(y, float).mean())
                    return self
            raise ValueError("could not identify target for persistence_current")

        def predict(self, X, **ctx):
            if self._active is None:
                raise RuntimeError("fit must run before predict")
            rows, split = target_rows_and_split(data, self._active)
            te = rows[split.test_idx]
            if self._active == "next_window_minutes":
                preds = X_raw[te, feat.index("CUR_MINUTES")].astype(np.float64)
            else:
                gp, ap = feat.index("GOALS_P90"), feat.index("ASSISTS_P90")
                cur = (X_raw[te, gp] + X_raw[te, ap]).astype(np.float64)
                observed = M[te, gp] > 0  # attacking family mask: played in w
                preds = np.where(observed, cur, self._fallback)
            if np.asarray(X).shape[0] != preds.shape[0]:
                raise ValueError("test row count mismatch for persistence_current")
            return preds

    return PersistenceCurrent()


# --------------------------------------------------------------------------- #
# MTNN training (the repo's real model, 2 heads + retrieval aux, seeded, CPU)
# --------------------------------------------------------------------------- #
def train_mtnn_multitask(
    data: dict,
    epochs: int,
    patience: int = 40,
    lr: float = 1e-3,
    family_drop: float = 0.15,
    ret_weight: float = 0.5,
    verbose: bool = True,
):
    """Train PitchMTNN with 2 heads + adjacent-window InfoNCE auxiliary.

    Returns (per-target predictions over each target's HARNESS test rows,
    best_val, config dict).
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from train_mtnn import PitchMTNN  # the repo's committed model class

    torch.set_num_threads(2)
    torch.manual_seed(SEED)
    np.random.seed(SEED)

    Z = data["X"].astype(np.float32)  # MaskedZScaler output, fit on train side only
    M = data["M"].astype(np.float32)
    fams = [str(f) for f in data["fam"]]
    fam_idx = data["fam_idx"]
    train_idx = data["train_idx"]
    val_idx = data["val_idx"]

    fam_cols = {fam: [int(c) for c in fam_idx[r] if int(c) >= 0] for r, fam in enumerate(fams)}
    fam_dims = {f: len(c) for f, c in fam_cols.items()}

    # --- per-target labels z-scored on MTNN gradient-train rows only ---
    y_raw, y_mask, y_mu, y_sd = {}, {}, {}, {}
    for t in TARGETS:
        yv = data[f"y_{t}"].astype(np.float64)
        mk = data[f"mask_{t}"].astype(bool)
        y_raw[t], y_mask[t] = yv, mk
        tr = train_idx[mk[train_idx]]
        y_mu[t] = float(yv[tr].mean())
        y_sd[t] = float(yv[tr].std() + 1e-8)

    # --- adjacent-window same-player pairs fully inside the TRAIN universe ---
    ent = data["entity_ids"]
    team = data["team"]
    season = data["season"]
    win = data["window_index"]
    loc = {
        (int(e), str(tm), str(s), int(w)): i for i, (e, tm, s, w) in enumerate(zip(ent, team, season, win, strict=True))
    }
    train_set = {int(i) for i in train_idx}
    pairs = [
        (i, loc[(int(e), str(tm), str(s), int(w) + 1)])
        for i, (e, tm, s, w) in enumerate(zip(ent, team, season, win, strict=True))
        if i in train_set and loc.get((int(e), str(tm), str(s), int(w) + 1), -1) in train_set
    ]
    # --- fit-time universe = train + val rows ONLY. Test rows are excluded from
    # every fit-time tensor, so no harness test row is ever forward-passed while
    # the model can still change (the airtight version of the leakage rule).
    fit_univ = np.concatenate([train_idx, val_idx])
    local = {int(gidx): i for i, gidx in enumerate(fit_univ)}
    a_idx = torch.tensor([local[a] for a, _ in pairs], dtype=torch.long)
    b_idx = torch.tensor([local[b] for _, b in pairs], dtype=torch.long)

    Zt, Mt = torch.tensor(Z), torch.tensor(M)
    Zf, Mf = Zt[fit_univ], Mt[fit_univ]
    xs_fit = {f: Zf[:, c] for f, c in fam_cols.items()}
    ms_fit = {f: Mf[:, c] for f, c in fam_cols.items()}
    ctx_fit = torch.zeros(len(fit_univ), dtype=torch.long)  # single-context vocab (WSL)

    d_tower, d_emb = 16, 24  # repo defaults (train_mtnn.py)
    model = PitchMTNN(fam_dims, n_ctx=1, d_tower=d_tower, d_emb=d_emb, n_feat=Z.shape[1])
    heads = nn.ModuleDict({t: nn.Linear(d_emb, 1) for t in TARGETS})
    torch.manual_seed(SEED)  # pin head init independent of trunk-construction draws
    for h in heads.values():
        nn.init.normal_(h.weight, std=0.02)
        nn.init.zeros_(h.bias)

    params = list(model.parameters()) + list(heads.parameters())
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
    g = torch.Generator(device="cpu").manual_seed(SEED)

    tr_t = torch.tensor([local[int(i)] for i in train_idx], dtype=torch.long)
    va_t = torch.tensor([local[int(i)] for i in val_idx], dtype=torch.long)
    y_t = {
        t: torch.tensor(
            ((np.nan_to_num(y_raw[t], nan=0.0) - y_mu[t]) / y_sd[t])[fit_univ],
            dtype=torch.float32,
        )
        for t in TARGETS
    }
    m_t = {t: torch.tensor(y_mask[t][fit_univ]) for t in TARGETS}

    def encode(ms):
        return model.encode(xs_fit, ms, ctx_fit)

    def head_loss(E, idx):
        total = 0.0
        for t in TARGETS:
            sel = idx[m_t[t][idx]]
            if len(sel) == 0:
                continue
            out = heads[t](E[sel]).squeeze(-1)
            total = total + F.mse_loss(out, y_t[t][sel])
        return total

    best_val, best_state, best_epoch, epochs_run = float("inf"), None, -1, 0
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        heads.train()
        ms = ms_fit
        if family_drop > 0:  # the repo's family-dropout augmentation, seeded
            ms = {}
            for f, m in ms_fit.items():
                keep = (torch.rand(m.shape[0], 1, generator=g) > family_drop).float()
                ms[f] = m * keep
        E = encode(ms)
        loss = head_loss(E, tr_t)
        if len(pairs) and ret_weight > 0:  # the domain's retrieval task, train pairs only
            S = (E[a_idx] @ E[b_idx].T) / 0.07
            loss = loss + ret_weight * F.cross_entropy(S, torch.arange(len(a_idx)))
        opt.zero_grad()
        loss.backward()
        opt.step()

        model.eval()
        heads.eval()
        with torch.no_grad():
            vloss = float(head_loss(encode(ms_fit), va_t))
        epochs_run = ep + 1
        if vloss < best_val - 1e-5:
            best_val, best_epoch = vloss, ep + 1
            best_state = {
                "model": {k: v.clone() for k, v in model.state_dict().items()},
                "heads": {k: v.clone() for k, v in heads.state_dict().items()},
            }
        if verbose and ((ep + 1) % 100 == 0 or ep == 0):
            print(
                f"[mtnn] epoch {ep + 1:3d} train={float(loss.detach()):.4f} "
                f"val={vloss:.4f} best={best_val:.4f}@{best_epoch} "
                f"({time.time() - t0:.0f}s)"
            )
        if ep + 1 - best_epoch >= patience:
            if verbose:
                print(f"[mtnn] early stop at epoch {ep + 1} (no val gain for {patience})")
            break

    if best_state is not None:
        model.load_state_dict(best_state["model"])
        heads.load_state_dict(best_state["heads"])
    model.eval()
    heads.eval()

    # --- predictions for each target's HARNESS test rows (first and only
    # forward pass over test rows, after weights are frozen) ---
    import torch as _torch

    with _torch.no_grad():
        xs_all = {f: Zt[:, c] for f, c in fam_cols.items()}
        ms_all = {f: Mt[:, c] for f, c in fam_cols.items()}
        ctx_all = torch.zeros(Z.shape[0], dtype=torch.long)
        E = model.encode(xs_all, ms_all, ctx_all)
        preds: dict[str, np.ndarray] = {}
        fit_rows = {int(i) for i in fit_univ}
        for t in TARGETS:
            rows, split = target_rows_and_split(data, t)
            test_rows = rows[split.test_idx]
            # hard guarantee: no fit-time row is ever a harness test row
            assert not fit_rows.intersection(int(i) for i in test_rows), f"{t}: MTNN fit rows overlap harness test rows"
            out = heads[t](E[_torch.tensor(test_rows, dtype=_torch.long)]).squeeze(-1)
            preds[t] = out.numpy().astype(np.float64) * y_sd[t] + y_mu[t]

    n_params = sum(p.numel() for p in params)
    config = {
        "model": "pipeline/train_mtnn.py PitchMTNN — 6 masked residual family "
        "towers (cat([x*m, m]) input) -> attention+gate fusion (+ctx "
        "embedding, single-context vocab) -> L2 24-d embedding",
        "heads": "2x nn.Linear(24, 1) on the shared L2 embedding "
        "(next_window_minutes MSE-z, next_window_goal_contribution "
        "MSE-z, masked where undefined)",
        "auxiliary_loss": f"adjacent-window same-player InfoNCE (temp 0.07) x "
        f"{ret_weight} over {len(pairs)} train-universe pairs "
        "(the domain's retrieval-primary task)",
        "dims": {"d_tower": d_tower, "d_emb": d_emb, "families": fam_dims},
        "params_total": int(n_params),
        "optimizer": f"AdamW(lr={lr}, weight_decay=1e-4), full-batch",
        "family_drop": family_drop,
        "max_epochs": epochs,
        "epochs_run": epochs_run,
        "best_epoch": best_epoch,
        "best_val_loss": round(best_val, 6),
        "early_stop_patience": patience,
        "seed": SEED,
        "preprocessing": "vector_core MaskedZScaler fit on harness-train rows "
        "only (in build_dataset.py); targets z-scored on MTNN "
        "gradient-train rows only; predictions de-standardized "
        "to raw units",
        "train_rows": len(train_idx),
        "val_rows": len(val_idx),
        "split": "gradient rows: label-end < 2019-12-01; val: label-end in "
        "[2019-12-01, 2020-07-01) (early stop only); no 2020/21 row "
        "is ever forward-passed at fit time",
        "wall_seconds": round(time.time() - t0, 1),
    }
    if verbose:
        print(
            f"[mtnn] done: best val loss {best_val:.4f} at epoch {best_epoch}; "
            f"{n_params} params; {config['wall_seconds']}s"
        )
    return preds, best_val, config


# --------------------------------------------------------------------------- #
# Benchmark
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", type=str, default=str(DEFAULT_DATA))
    ap.add_argument("--report", type=str, default=str(DEFAULT_REPORT))
    ap.add_argument("--config-out", type=str, default=str(DEFAULT_CONFIG))
    ap.add_argument("--epochs", type=int, default=400)
    ap.add_argument("--patience", type=int, default=40)
    ap.add_argument(
        "--no-grid",
        action="store_true",
        help="skip the val-only hyperparameter grid; use defaults (lr 1e-3, ret 0.5, family_drop 0.15)",
    )
    args = ap.parse_args(argv)

    from vector_bench.baselines import MTNNRung, default_prediction_ladder
    from vector_bench.registry import get_domain_spec
    from vector_bench.report import write_domain_report
    from vector_bench.runner import run_domain_benchmark
    from vector_bench.tasks import build_task_for_target

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(f"dataset not found: {data_path} — run bench/build_dataset.py first")
    npz = np.load(data_path, allow_pickle=True)
    data = {k: npz[k] for k in npz.files}

    cut = int(data["cut_days"])
    # split sanity per target, before any training
    for t in TARGETS:
        rows, split = target_rows_and_split(data, t)
        end = data["label_end_days"][rows]
        assert end[split.train_idx].max() < cut <= end[split.test_idx].min()
        # forward shift: every feature window ends before its label window starts
        assert (data["feat_end_days"] < data["label_start_days"]).all()
        print(f"[bench] {t}: rows={len(rows)} train={len(split.train_idx)} test={len(split.test_idx)} (cut day {cut})")

    # --- train the real MTNN (2 heads + retrieval aux); grid selected on VAL only ---
    if args.no_grid:
        grid = [(1e-3, 0.5, 0.15)]
    else:
        grid = list(itertools.product((1e-3, 3e-3), (0.0, 0.25, 0.5), (0.0, 0.15)))
    results = []
    for lr, ret, fd in grid:
        preds_i, val_i, cfg_i = train_mtnn_multitask(
            data,
            epochs=args.epochs,
            patience=args.patience,
            lr=lr,
            family_drop=fd,
            ret_weight=ret,
            verbose=len(grid) == 1,
        )
        results.append((val_i, (lr, ret, fd), preds_i, cfg_i))
        print(
            f"[grid] lr={lr} ret={ret} fd={fd}: best_val={val_i:.5f} @{cfg_i['best_epoch']} ({cfg_i['wall_seconds']}s)"
        )
    results.sort(key=lambda r: r[0])
    best_val, (lr, ret, fd), preds, config = results[0]
    config["hyperparameter_selection"] = (
        f"chosen by VAL loss only over a {len(grid)}-config grid "
        "(lr {1e-3, 3e-3} x ret_weight {0, 0.25, 0.5} x family_drop {0, 0.15}); "
        f"winner lr={lr} ret_weight={ret} family_drop={fd}; the test split was "
        "never consulted for selection."
    )
    print(f"[grid] winner: lr={lr} ret={ret} fd={fd} val={best_val:.5f}")
    Path(args.config_out).write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    # --- build per-target tasks + rungs ---
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
                "mtnn_training": f"seed={SEED} best_epoch={config['best_epoch']} "
                "gradient<2019-12-01 val 2019-12..2020-02",
            },
        )
        mtnns[t] = MTNNRung(predictions=preds[t])

    ladder = [*default_prediction_ladder(SEED), make_persistence_current_rung(data, fingerprints)]

    dsc = run_domain_benchmark(spec, tasks, mtnns=mtnns, ladder=ladder)
    out = write_domain_report(dsc, args.report)
    print(f"[bench] wrote {out}")

    # --- honest console summary ---
    print(f"\n== pitch domain: {dsc.aggregate['headline']} ==")
    for ts in dsc.targets:
        if ts.scorecard is None:
            print(f"  {ts.target_name}: {ts.status} ({ts.note})")
            continue
        v = ts.scorecard.verdicts.get(ts.primary_metric)
        print(
            f"  {ts.target_name} [{ts.primary_metric}]: "
            f"best_baseline={v.best_baseline}={v.best_baseline_value:.4f} "
            f"mtnn={v.mtnn_value:.4f} delta={v.mtnn_delta:+.4f} "
            f"beats={v.mtnn_beats_best_baseline}"
        )
        bad = [r.name for r in ts.scorecard.methods if r.status != "ok"]
        if bad:
            print(f"    NOTE non-ok rungs: {bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
