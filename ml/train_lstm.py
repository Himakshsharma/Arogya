"""Train the sign classifier and export it to ONNX.

    python ml/train_lstm.py --data ml/data/keypoints.npz --out backend/app/data/models
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.features import FEATURE_DIM, SEQ_LEN, sequence_for_model  # noqa: E402


def load(path: Path):
    data = np.load(path, allow_pickle=False)
    frames = [json.loads(s) for s in data["samples"]]
    labels = [str(l) for l in data["labels"]]
    return frames, labels


def augment(frames: list[dict], rng: np.random.Generator) -> list[dict]:
    """Small realistic changes: speed, position, size, a little jitter, dropped frames."""
    n = len(frames)
    keep = max(6, int(n * rng.uniform(0.75, 1.25)))
    idx = np.clip(np.round(np.linspace(0, n - 1, keep) + rng.normal(0, 0.3, keep)), 0, n - 1).astype(int)
    shift = rng.normal(0, 0.04, 3)
    scale = rng.uniform(0.92, 1.08)
    out = []
    for i in idx:
        f = frames[i]

        def tf(pts):
            if pts is None:
                return None
            a = np.asarray(pts) * scale + shift + rng.normal(0, 0.008, (len(pts), 3))
            return a.tolist()
        hand_drop = rng.random() < 0.05
        out.append({"p": tf(f["p"]), "l": None if hand_drop else tf(f["l"]), "r": tf(f["r"])})
    return out


def build_model(n_classes: int):
    import tensorflow as tf
    from tensorflow.keras import layers

    inputs = layers.Input(shape=(SEQ_LEN, FEATURE_DIM), name="keypoints")
    x = layers.LayerNormalization()(inputs)
    x = layers.LSTM(128, return_sequences=True)(x)
    x = layers.Dropout(0.3)(x)
    x = layers.LSTM(96)(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(96, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(n_classes, activation="softmax", name="probs")(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=ROOT / "ml" / "data" / "keypoints.npz", type=Path)
    ap.add_argument("--out", default=ROOT / "backend" / "app" / "data" / "models", type=Path)
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--augment", type=int, default=4, help="Augmented copies per training sample")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import train_test_split

    rng = np.random.default_rng(args.seed)
    tf.random.set_seed(args.seed)

    frames, labels = load(args.data)
    counts = Counter(labels)
    keep = [i for i, l in enumerate(labels) if counts[l] >= 3]  # need samples in train and test
    frames = [frames[i] for i in keep]
    labels = [labels[i] for i in keep]
    classes = sorted(set(labels))
    y = np.array([classes.index(l) for l in labels])
    print(f"{len(frames)} samples, {len(classes)} classes")

    idx_train, idx_test = train_test_split(np.arange(len(frames)), test_size=0.2, stratify=y, random_state=args.seed)

    X_train, y_train = [], []
    for i in idx_train:
        X_train.append(sequence_for_model(frames[i]))
        y_train.append(y[i])
        for _ in range(args.augment):
            X_train.append(sequence_for_model(augment(frames[i], rng)))
            y_train.append(y[i])
    X_train = np.stack(X_train).astype(np.float32)
    y_train = np.array(y_train)
    X_test = np.stack([sequence_for_model(frames[i]) for i in idx_test]).astype(np.float32)
    y_test = y[idx_test]

    model = build_model(len(classes))
    model.summary()
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=12, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5),
    ]
    model.fit(X_train, y_train, validation_data=(X_test, y_test), epochs=args.epochs,
              batch_size=64, callbacks=callbacks, verbose=2)

    probs = model.predict(X_test, verbose=0)
    pred = probs.argmax(1)
    top3 = np.mean([y_test[i] in probs[i].argsort()[-3:] for i in range(len(y_test))])
    acc = float(np.mean(pred == y_test))
    print(f"\nTest accuracy: {acc:.3f}   top-3: {top3:.3f}")
    report = classification_report(y_test, pred, labels=list(range(len(classes))), target_names=classes,
                                   output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, pred, labels=list(range(len(classes))))
    np.fill_diagonal(cm, 0)
    confused = [(classes[i], classes[j], int(cm[i, j])) for i, j in zip(*np.nonzero(cm))]
    confused.sort(key=lambda x: -x[2])

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "labels.json", "w") as f:
        json.dump(classes, f, indent=1)
    with open(args.out / "report.json", "w") as f:
        json.dump({"accuracy": acc, "top3": float(top3), "classes": len(classes), "test_samples": int(len(y_test)),
                   "most_confused": confused[:20],
                   "per_class_f1": {c: round(report[c]["f1-score"], 3) for c in classes}}, f, indent=1)

    # export to ONNX: the server only needs onnxruntime
    import tf2onnx
    spec = (tf.TensorSpec((None, SEQ_LEN, FEATURE_DIM), tf.float32, name="keypoints"),)
    tf2onnx.convert.from_keras(model, input_signature=spec, opset=13, output_path=str(args.out / "isl_lstm.onnx"))
    print(f"Saved model, labels and report to {args.out}")

    # ONNX output should match Keras
    import onnxruntime as ort
    sess = ort.InferenceSession(str(args.out / "isl_lstm.onnx"), providers=["CPUExecutionProvider"])
    onnx_probs = sess.run(None, {sess.get_inputs()[0].name: X_test[:8]})[0]
    assert np.allclose(onnx_probs, probs[:8], atol=1e-3), "ONNX output differs from Keras"
    print("ONNX export verified.")


if __name__ == "__main__":
    main()
