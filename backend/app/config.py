"""App settings, read from environment variables."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    app_name = "Arogya"
    version = "1.0.0"

    # Security
    secret_key = os.getenv("AROGYA_SECRET_KEY", "change-me-in-production-arogya-dev-secret-key")
    token_minutes = int(os.getenv("AROGYA_TOKEN_MINUTES", str(60 * 12)))

    # Storage
    db_path = os.getenv("AROGYA_DB_PATH", str(BASE_DIR.parent / "arogya.db"))
    static_dir = os.getenv("AROGYA_STATIC_DIR", str(BASE_DIR.parent / "static"))

    # comma separated; "*" allows any origin
    cors_origins = [o.strip() for o in os.getenv("AROGYA_CORS_ORIGINS", "*").split(",") if o.strip()]

    # Optional ML features
    enable_whisper = _bool("AROGYA_ENABLE_WHISPER")
    whisper_model = os.getenv("AROGYA_WHISPER_MODEL", "base")
    enable_server_tts = _bool("AROGYA_ENABLE_SERVER_TTS")
    # phrasebook | marian | indictrans2 | auto
    translation_engine = os.getenv("AROGYA_TRANSLATION_ENGINE", "auto")
    sign_model_path = os.getenv("AROGYA_SIGN_MODEL", str(DATA_DIR / "models" / "isl_lstm.onnx"))
    sign_labels_path = os.getenv("AROGYA_SIGN_LABELS", str(DATA_DIR / "models" / "labels.json"))

    # demo login, created on first start
    seed_demo = _bool("AROGYA_SEED_DEMO", True)
    demo_email = "demo@arogya.in"
    demo_password = "arogya123"


settings = Settings()
