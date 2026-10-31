"""
Generate a synthetic helmet-window dataset for a SMOKE TEST ONLY.

This file exists so you can verify that the training script, feature names,
grouped split and model export all work before you collect real helmet data.

The numbers below are invented. Do NOT use the resulting model or metrics in
your report, and do NOT present them as crash-detection accuracy.

Real data should come from the ESP32 + MPU6050 using training/build_windows.py.
"""

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


def normal_window(rng: np.random.Generator) -> dict:
    # Most normal windows are gentle, but potholes and braking create a few
    # larger readings so the classifier does not see a trivially separable set.
    if rng.random() < 0.18:
        peak = rng.normal(3.4, 0.9)
        jerk = rng.normal(20.0, 8.0)
        duration = rng.normal(45.0, 25.0)
    else:
        peak = rng.normal(1.25, 0.35)
        jerk = rng.normal(2.8, 1.4)
        duration = rng.normal(4.0, 8.0)

    return {
        "peak_accel_g": max(0.4, peak),
        "mean_accel_g": max(0.3, rng.normal(1.0, 0.18)),
        "std_accel_g": max(0.01, rng.normal(0.10, 0.04)),
        "peak_gyro_dps": max(1.0, rng.normal(55.0, 25.0)),
        "mean_gyro_dps": max(0.5, rng.normal(15.0, 7.0)),
        "jerk_g_s": max(0.1, jerk),
        "impact_duration_ms": max(0.0, duration),
        "post_impact_stillness": max(0.005, rng.normal(0.06, 0.025)),
        "label": 0,
    }


def crash_window(rng: np.random.Generator) -> dict:
    # A minority of impacts are deliberately weak/ambiguous, which gives the
    # smoke test some false negatives instead of a perfect score.
    if rng.random() < 0.15:
        peak = rng.normal(3.0, 0.6)
        jerk = rng.normal(18.0, 6.0)
        duration = rng.normal(45.0, 20.0)
    else:
        peak = rng.normal(6.2, 1.8)
        jerk = rng.normal(48.0, 16.0)
        duration = rng.normal(105.0, 40.0)

    return {
        "peak_accel_g": max(2.0, peak),
        "mean_accel_g": max(0.8, rng.normal(1.9, 0.45)),
        "std_accel_g": max(0.15, rng.normal(0.72, 0.22)),
        "peak_gyro_dps": max(20.0, rng.normal(360.0, 120.0)),
        "mean_gyro_dps": max(5.0, rng.normal(95.0, 30.0)),
        "jerk_g_s": max(1.0, jerk),
        "impact_duration_ms": max(0.0, duration),
        "post_impact_stillness": max(0.02, rng.normal(0.20, 0.08)),
        "label": 1,
    }


def main():
    rng = np.random.default_rng(42)
    rows = []

    # 30 sessions: 15 normal and 15 impact. Each session has 20 windows.
    for session in range(1, 16):
        for _ in range(20):
            row = normal_window(rng)
            row["session_id"] = f"normal_{session:02d}"
            rows.append(row)

    for session in range(1, 16):
        for _ in range(20):
            row = crash_window(rng)
            row["session_id"] = f"impact_{session:02d}"
            rows.append(row)

    df = pd.DataFrame(rows)
    df = df[["session_id"] + FEATURES + ["label"]]
    df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)

    out = Path(__file__).resolve().parent / "synthetic_smoke_test.csv"
    df.to_csv(out, index=False)

    print(f"Wrote {len(df)} rows to {out}")
    print(df["label"].value_counts().to_string())
    print("SMOKE TEST ONLY — replace this file with real helmet data.")


if __name__ == "__main__":
    main()
