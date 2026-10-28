# Arogya - full image (React app + FastAPI + optional AI models), one container, one URL.
# Needs ~4 GB RAM for Whisper + MarianMT. For 512 MB hosts use Dockerfile.lite.

# ---------- 1. Build the React app ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2. Python API ----------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface

# ffmpeg lets Whisper decode browser audio (webm/opus)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 app
WORKDIR /app

COPY backend/requirements.txt backend/requirements-ml.txt ./
ARG WITH_ML=true
RUN pip install -r requirements.txt && \
    if [ "$WITH_ML" = "true" ]; then pip install -r requirements-ml.txt; fi

COPY backend/ ./
COPY --from=web /web/dist ./static
RUN mkdir -p /app/data /app/.cache && chown -R app:app /app

USER app
ENV PORT=7860 \
    AROGYA_DB_PATH=/app/data/arogya.db \
    AROGYA_STATIC_DIR=/app/static \
    AROGYA_ENABLE_WHISPER=${WITH_ML} \
    AROGYA_ENABLE_SERVER_TTS=${WITH_ML} \
    AROGYA_TRANSLATION_ENGINE=auto
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
