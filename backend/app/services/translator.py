"""English <-> Hindi: phrasebook, then optional neural model, then word lookup."""
import logging
import re
import unicodedata
from importlib.util import find_spec
from functools import lru_cache

from ..config import settings
from .catalog import phrases, symptoms

log = logging.getLogger("arogya.translate")

_PUNCT = re.compile(r"[^\w\sऀ-ॿ]", re.UNICODE)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "").lower().replace("।", " ")
    return " ".join(_PUNCT.sub(" ", text).split())


@lru_cache(maxsize=1)
def _phrase_index() -> dict:
    """Maps normalized sentence -> {"en": ..., "hi": ...} for both directions."""
    index = {}
    p = phrases()
    for entry in p["doctor"] + p["patient"] + p.get("aliases", []):
        pair = {"en": entry["en"], "hi": entry["hi"]}
        index[_norm(entry["en"])] = pair
        index[_norm(entry["hi"])] = pair
    for s in symptoms()["symptoms"]:
        pair = {"en": s["say_en"], "hi": s["say_hi"]}
        index[_norm(s["say_en"])] = pair
        index[_norm(s["say_hi"])] = pair
    return index


class _NeuralEngine:
    """Lazy wrapper; models download on first use and stay in memory."""

    name = "none"

    def __init__(self):
        self.ready = False
        self.error = None

    def translate(self, text: str, src: str, tgt: str) -> str | None:
        return None


class MarianEngine(_NeuralEngine):
    name = "marian"
    MODELS = {("en", "hi"): "Helsinki-NLP/opus-mt-en-hi", ("hi", "en"): "Helsinki-NLP/opus-mt-hi-en"}

    def __init__(self):
        super().__init__()
        self._cache = {}
        self.ready = find_spec("transformers") is not None
        if not self.ready:
            self.error = "transformers is not installed"

    def _load(self, pair):
        if pair not in self._cache:
            from transformers import MarianMTModel, MarianTokenizer
            name = self.MODELS[pair]
            self._cache[pair] = (MarianTokenizer.from_pretrained(name), MarianMTModel.from_pretrained(name))
        return self._cache[pair]

    def translate(self, text, src, tgt):
        tok, model = self._load((src, tgt))
        batch = tok([text], return_tensors="pt", padding=True, truncation=True, max_length=256)
        out = model.generate(**batch, max_new_tokens=256, num_beams=4)
        return tok.decode(out[0], skip_special_tokens=True)


class IndicTrans2Engine(_NeuralEngine):
    name = "indictrans2"
    MODELS = {("en", "hi"): "ai4bharat/indictrans2-en-indic-dist-200M",
              ("hi", "en"): "ai4bharat/indictrans2-indic-en-dist-200M"}
    CODES = {"en": "eng_Latn", "hi": "hin_Deva"}

    def __init__(self):
        super().__init__()
        self._cache = {}
        try:
            if find_spec("transformers") is None:
                raise ImportError("transformers is not installed")
            try:
                from IndicTransToolkit.processor import IndicProcessor  # newer toolkit
            except ImportError:
                from IndicTransToolkit import IndicProcessor  # older toolkit
            self._processor = IndicProcessor(inference=True)
            self.ready = True
        except Exception as e:  # toolkit missing or failed to build
            self.error = str(e)

    def _load(self, pair):
        if pair not in self._cache:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            name = self.MODELS[pair]
            tok = AutoTokenizer.from_pretrained(name, trust_remote_code=True)
            model = AutoModelForSeq2SeqLM.from_pretrained(name, trust_remote_code=True)
            self._cache[pair] = (tok, model)
        return self._cache[pair]

    def translate(self, text, src, tgt):
        import torch
        tok, model = self._load((src, tgt))
        batch = self._processor.preprocess_batch([text], src_lang=self.CODES[src], tgt_lang=self.CODES[tgt])
        inputs = tok(batch, truncation=True, padding="longest", return_tensors="pt")
        with torch.no_grad():
            out = model.generate(**inputs, max_length=256, num_beams=4)
        decoded = tok.batch_decode(out, skip_special_tokens=True, clean_up_tokenization_spaces=True)
        return self._processor.postprocess_batch(decoded, lang=self.CODES[tgt])[0]


@lru_cache(maxsize=1)
def neural_engine() -> _NeuralEngine:
    choice = settings.translation_engine
    if choice == "phrasebook":
        return _NeuralEngine()
    order = {"indictrans2": [IndicTrans2Engine], "marian": [MarianEngine],
             "auto": [IndicTrans2Engine, MarianEngine]}.get(choice, [])
    for cls in order:
        engine = cls()
        if engine.ready:
            log.info("Translation engine: %s", engine.name)
            return engine
        log.info("Translation engine %s unavailable: %s", cls.name, engine.error)
    return _NeuralEngine()


def _word_by_word(text: str, src: str, tgt: str) -> str:
    words = phrases()["words"]
    table = words if src == "en" else {v: k for k, v in words.items()}
    tokens = re.findall(r"[ऀ-ॿ]+|[A-Za-z']+|\d+|[^\s\w]", text)
    out = [table.get(t.lower(), t) for t in tokens]
    return re.sub(r"\s+([?.!,।])", r"\1", " ".join(w for w in out if w))


def translate(text: str, src: str, tgt: str) -> dict:
    text = (text or "").strip()
    if not text or src == tgt:
        return {"text": text, "engine": "none", "approximate": False}

    hit = _phrase_index().get(_norm(text))
    if hit:
        return {"text": hit[tgt], "engine": "phrasebook", "approximate": False}

    engine = neural_engine()
    if engine.ready:
        try:
            result = engine.translate(text, src, tgt)
            if result:
                return {"text": result, "engine": engine.name, "approximate": False}
        except Exception as e:  # never let a model crash the consultation
            log.warning("Neural translation failed: %s", e)

    return {"text": _word_by_word(text, src, tgt), "engine": "dictionary", "approximate": True}


def engine_name() -> str:
    eng = neural_engine()
    return eng.name if eng.ready else "phrasebook"
