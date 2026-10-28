"""Optional server speech: faster-whisper STT and gTTS."""
import hashlib
from importlib.util import find_spec
import io
import logging
import tempfile
from collections import OrderedDict
from functools import lru_cache

from ..config import settings

log = logging.getLogger("arogya.speech")


@lru_cache(maxsize=1)
def whisper_model():
    if not settings.enable_whisper:
        return None
    try:
        from faster_whisper import WhisperModel
        log.info("Loading Whisper model '%s'", settings.whisper_model)
        return WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
    except Exception as e:
        log.warning("Whisper unavailable: %s", e)
        return None


def stt_available() -> bool:
    return settings.enable_whisper


def transcribe(audio: bytes, lang: str = "en") -> dict:
    model = whisper_model()
    if model is None:
        raise RuntimeError("Speech recognition is not enabled on this server")
    with tempfile.NamedTemporaryFile(suffix=".webm") as tmp:
        tmp.write(audio)
        tmp.flush()
        # bias towards clinic vocabulary
        prompt = "Doctor and patient talking about symptoms, pain, fever and medicine."
        segments, info = model.transcribe(tmp.name, language=lang if lang in ("en", "hi") else None,
                                          beam_size=1, vad_filter=True, initial_prompt=prompt)
        text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "lang": info.language, "confidence": round(float(info.language_probability), 3)}


class _AudioCache:
    def __init__(self, size=128):
        self.size = size
        self.data: OrderedDict[str, bytes] = OrderedDict()

    def get(self, key):
        if key in self.data:
            self.data.move_to_end(key)
            return self.data[key]
        return None

    def put(self, key, value):
        self.data[key] = value
        self.data.move_to_end(key)
        while len(self.data) > self.size:
            self.data.popitem(last=False)


_cache = _AudioCache()


def tts_available() -> bool:
    if not settings.enable_server_tts:
        return False
    return find_spec("gtts") is not None


def synthesize(text: str, lang: str = "hi") -> bytes:
    if not tts_available():
        raise RuntimeError("Server text-to-speech is not enabled")
    key = hashlib.sha1(f"{lang}:{text}".encode()).hexdigest()
    cached = _cache.get(key)
    if cached:
        return cached
    from gtts import gTTS
    buf = io.BytesIO()
    gTTS(text=text, lang=lang if lang in ("en", "hi") else "en", tld="co.in").write_to_fp(buf)
    audio = buf.getvalue()
    _cache.put(key, audio)
    return audio
