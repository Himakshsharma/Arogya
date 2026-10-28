"""Sign recognition: ONNX LSTM (optional) + DTW template matching."""
import json
import logging
import os
import threading

import numpy as np

from ..config import settings
from ..db import Database
from . import features as F

log = logging.getLogger("arogya.signs")


class OnnxSignModel:
    def __init__(self, model_path: str, labels_path: str):
        self.session = None
        self.labels: list[str] = []
        if not (os.path.exists(model_path) and os.path.exists(labels_path)):
            return
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            with open(labels_path, encoding="utf-8") as f:
                self.labels = json.load(f)
            self.input_name = self.session.get_inputs()[0].name
            log.info("Loaded sign model with %d classes", len(self.labels))
        except Exception as e:
            log.warning("Could not load sign model: %s", e)
            self.session = None

    @property
    def ready(self) -> bool:
        return self.session is not None

    def predict(self, frames: list[dict], top_k: int = 3) -> list[dict]:
        x = F.sequence_for_model(frames)[None, ...].astype(np.float32)
        out = self.session.run(None, {self.input_name: x})[0][0].astype(np.float64)
        # Keras models usually end in softmax already; otherwise apply it here
        if out.min() >= 0 and abs(out.sum() - 1.0) < 1e-3:
            probs = out
        else:
            e = np.exp(out - out.max())
            probs = e / e.sum()
        order = np.argsort(probs)[::-1][:top_k]
        return [{"label": self.labels[i], "score": round(float(probs[i]), 3), "source": "model"} for i in order]


class TemplateMatcher:
    def __init__(self, db: Database):
        self.db = db
        self._lock = threading.Lock()
        self._cache: list[tuple[int, str, str, np.ndarray]] | None = None

    def invalidate(self):
        with self._lock:
            self._cache = None

    def _templates(self):
        with self._lock:
            if self._cache is None:
                rows = self.db.all("SELECT id, label, source, frames FROM sign_templates")
                cache = []
                for r in rows:
                    frames = json.loads(r["frames"])
                    if frames:
                        cache.append((r["id"], r["label"], r["source"], F.sequence_for_dtw(frames)))
                self._cache = cache
            return self._cache

    def count(self) -> int:
        return len(self._templates())

    def predict(self, frames: list[dict], top_k: int = 3) -> list[dict]:
        templates = self._templates()
        if not templates:
            return []
        query = F.sequence_for_dtw(frames)
        mirrored = F.sequence_for_dtw([F.mirror_frame(f) for f in frames])

        best: dict[str, tuple[float, str]] = {}
        for _, label, source, seq in templates:
            d = min(F.dtw_distance(query, seq), F.dtw_distance(mirrored, seq))
            # prefer the user's own recordings
            if source == "user":
                d *= 0.85
            if label not in best or d < best[label][0]:
                best[label] = (d, source)

        ranked = sorted(best.items(), key=lambda kv: kv[1][0])[: max(top_k, 5)]
        dists = np.array([d for _, (d, _) in ranked])
        # softmax over -distance, temperature from the spread
        temp = max(0.04, float(np.std(dists)) if len(dists) > 1 else 0.1)
        weights = np.exp(-(dists - dists.min()) / temp)
        probs = weights / weights.sum()
        # penalise when even the best match is far away
        quality = float(np.exp(-max(0.0, dists[0] - 0.25) * 3))
        out = []
        for (label, (d, source)), p in list(zip(ranked, probs))[:top_k]:
            out.append({"label": label, "score": round(float(p) * quality, 3),
                        "distance": round(float(d), 4), "source": "template-" + source})
        return out


class SignRecognizer:
    CONFIDENT = 0.45

    def __init__(self, db: Database):
        self.model = OnnxSignModel(settings.sign_model_path, settings.sign_labels_path)
        self.templates = TemplateMatcher(db)

    def recognize(self, frames: list[dict], top_k: int = 3) -> dict:
        if len(frames) < 4 or not F.has_motion(frames):
            return {"predictions": [], "confident": False, "reason": "no_hands"}

        merged: dict[str, dict] = {}
        for pred in (self.model.predict(frames, top_k) if self.model.ready else []):
            merged[pred["label"]] = pred
        for pred in self.templates.predict(frames, top_k):
            current = merged.get(pred["label"])
            if current is None or pred["score"] > current["score"]:
                merged[pred["label"]] = pred

        preds = sorted(merged.values(), key=lambda p: p["score"], reverse=True)[:top_k]
        confident = bool(preds) and preds[0]["score"] >= self.CONFIDENT
        return {"predictions": preds, "confident": confident}


_recognizer: SignRecognizer | None = None


def get_recognizer(db: Database) -> SignRecognizer:
    global _recognizer
    if _recognizer is None or _recognizer.templates.db is not db:
        _recognizer = SignRecognizer(db)
    return _recognizer


def seed_starter_templates(db: Database, path) -> int:
    """Load avatar-generated templates once so recognition works on day one."""
    if not os.path.exists(path):
        return 0
    if db.one("SELECT 1 AS x FROM sign_templates WHERE source = 'starter' LIMIT 1"):
        return 0
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    from ..db import dumps, now_iso
    n = 0
    with db.tx() as c:
        for label, variants in data.items():
            for frames in variants:
                c.execute("INSERT INTO sign_templates(label, frames, source, created_at) VALUES (?,?,?,?)",
                          (label, dumps(frames), "starter", now_iso()))
                n += 1
    return n
