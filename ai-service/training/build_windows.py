"""
Convert raw MPU6050 samples into the 8-feature CSV used by
train_helmet_model.py.

Raw input columns:
    timestamp_ms, ax, ay, az, gx, gy, gz, session_id, label

Units:
    ax, ay, az -> g
    gx, gy, gz -> degrees/second
    label      -> 0 normal, 1 crash/impact

Example:
    python training/build_windows.py training/raw_helmet_log.csv

Output:
    training/helmet_windows.csv
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

FEATURES = [
    "peak_accel_g",
    "mean_accel_g",
    "std_accel_g",
    "peak_gyro_dps",
    "mean_gyro_dps",
    "jerk_g_s",
    "impact_duration_ms",
    "post_impact_stillness",
]

RAW_COLUMNS = [
    "timestamp_ms",
    "ax",
    "ay",
    "az",
    "gx",
    "gy",
    "gz",
    "session_id",
    "label",
]


def build_windows(
    raw_path: Path,
    out_path: Path,
    sample_rate_hz: float = 50.0,
    window_seconds: float = 2.0,
    overlap: float = 0.5,
):
    df = pd.read_csv(raw_path)

    missing = [c for c in RAW_COLUMNS if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing raw columns: {missing}")

    df = df.sort_values(["session_id", "timestamp_ms"])

    window_size = int(sample_rate_hz * window_seconds)
    if window_size < 2:
        raise SystemExit("Window size must contain at least two samples.")

    step = max(1, int(window_size * (1.0 - overlap)))
    dt = 1.0 / sample_rate_hz
    rows = []

    for session_id, group in df.groupby("session_id"):
        group = group.reset_index(drop=True)

        for start in range(0, len(group) - window_size + 1, step):
            window = group.iloc[start : start + window_size]

            ax = window["ax"].to_numpy(dtype=float)
            ay = window["ay"].to_numpy(dtype=float)
            az = window["az"].to_numpy(dtype=float)
            gx = window["gx"].to_numpy(dtype=float)
            gy = window["gy"].to_numpy(dtype=float)
            gz = window["gz"].to_numpy(dtype=float)

            accel = np.sqrt(ax**2 + ay**2 + az**2)
            gyro = np.sqrt(gx**2 + gy**2 + gz**2)

            jerk = np.abs(np.diff(accel)) / dt
            tail = accel[-max(1, int(0.5 * sample_rate_hz)) :]

            rows.append(
                {
                    "session_id": session_id,
                    "peak_accel_g": float(np.max(accel)),
                    "mean_accel_g": float(np.mean(accel)),
                    "std_accel_g": float(np.std(accel)),
                    "peak_gyro_dps": float(np.max(gyro)),
                    "mean_gyro_dps": float(np.mean(gyro)),
                    "jerk_g_s": float(np.max(jerk)) if len(jerk) else 0.0,
                    "impact_duration_ms": float(
                        np.sum(accel >= 2.0) * dt * 1000.0
                    ),
                    "post_impact_stillness": float(np.std(tail)),
                    "label": int(window["label"].max()),
                }
            )

    out = pd.DataFrame(rows, columns=["session_id"] + FEATURES + ["label"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(out_path, index=False)

    print(f"Wrote {len(out)} windows to {out_path}")
    print(out["label"].value_counts().to_string())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_csv", type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("training/helmet_windows.csv"),
    )
    parser.add_argument("--sample-rate", type=float, default=50.0)
    parser.add_argument("--window-seconds", type=float, default=2.0)
    parser.add_argument("--overlap", type=float, default=0.5)
    args = parser.parse_args()

    build_windows(
        args.raw_csv,
        args.out,
        sample_rate_hz=args.sample_rate,
        window_seconds=args.window_seconds,
        overlap=args.overlap,
    )
