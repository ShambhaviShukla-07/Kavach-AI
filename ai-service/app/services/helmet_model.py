import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "helmet_rf.joblib"
CRASH_THRESHOLD = float(os.getenv("HELMET_CRASH_THRESHOLD", "0.5"))

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

_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is None and MODEL_PATH.exists():
        _MODEL = joblib.load(MODEL_PATH)
    return _MODEL


def _severity(features: dict[str, float], probability: float) -> str:
    peak = features["peak_accel_g"]
    duration = features["impact_duration_ms"]

    if peak >= 8 or duration >= 120 or probability >= 0.90:
        return "critical"
    if peak >= 5 or duration >= 80 or probability >= 0.75:
        return "high"
    if peak >= 3 or probability >= 0.55:
        return "medium"
    return "low"


def predict(features: dict[str, float]) -> dict[str, Any]:
    model = _load_model()

    if model is None:
        # Transparent fallback so the API still works before training.
        is_crash = (
            features["peak_accel_g"] >= 3.0
            and features["jerk_g_s"] >= 18.0
        )
        probability = 0.55 if is_crash else 0.45
        model_version = "threshold-fallback"
    else:
        row = np.array(
            [[features[name] for name in FEATURES]],
            dtype=float,
        )
        probability = float(model.predict_proba(row)[0][1])
        is_crash = probability >= CRASH_THRESHOLD
        model_version = "random-forest-v1"

    reasons = []
    if features["peak_accel_g"] >= 3.0:
        reasons.append(f"peak acceleration {features['peak_accel_g']:.1f} g")
    if features["jerk_g_s"] >= 18.0:
        reasons.append(f"jerk {features['jerk_g_s']:.1f} g/s")
    if features["peak_gyro_dps"] >= 200.0:
        reasons.append(f"rotation {features['peak_gyro_dps']:.0f} deg/s")
    if features["impact_duration_ms"] >= 80.0:
        reasons.append(
            f"impact duration {features['impact_duration_ms']:.0f} ms"
        )
    if not reasons:
        reasons.append("no impact pattern above the normal-riding range")

    return {
        "is_crash": bool(is_crash),
        "confidence": round(
            probability if is_crash else 1.0 - probability,
            4,
        ),
        "severity": _severity(features, probability) if is_crash else "low",
        "model_version": model_version,
        "reasons": reasons,
    }