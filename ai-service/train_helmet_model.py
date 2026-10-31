import argparse
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit, train_test_split

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("models/helmet_rf.joblib"),
    )
    args = parser.parse_args()

    df = pd.read_csv(args.csv)
    missing = [c for c in FEATURES + ["label"] if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing columns: {missing}")

    X = df[FEATURES].astype(float).to_numpy()
    y = df["label"].astype(int).to_numpy()

    # Group by ride/session so the same ride is not in both train and test.
    if "session_id" in df.columns:
        splitter = GroupShuffleSplit(
            n_splits=1,
            test_size=0.2,
            random_state=42,
        )
        train_idx, test_idx = next(
            splitter.split(X, y, groups=df["session_id"])
        )
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    probability = model.predict_proba(X_test)[:, 1]
    prediction = (probability >= 0.5).astype(int)

    print(
        classification_report(
            y_test,
            prediction,
            target_names=["normal", "crash"],
            zero_division=0,
        )
    )
    print("ROC-AUC:", round(roc_auc_score(y_test, probability), 4))
    print("Confusion matrix:\n", confusion_matrix(y_test, prediction))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.out)
    print(f"Saved model to {args.out}")


if __name__ == "__main__":
    main()