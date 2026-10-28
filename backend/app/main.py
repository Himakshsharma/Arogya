"""FastAPI application. Serves the built frontend from ./static when present."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import DATA_DIR, settings
from .db import get_db, now_iso
from .routers import auth, consultations, language, prescriptions, signs, speech
from .security import hash_password
from .services import speech as speech_service
from .services.recognizer import get_recognizer, seed_starter_templates
from .services.translator import engine_name

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("arogya")


def seed(db) -> None:
    if settings.seed_demo and not db.one("SELECT id FROM doctors WHERE email = ?", (settings.demo_email,)):
        db.insert("INSERT INTO doctors(name, email, password_hash, specialty, created_at) VALUES (?,?,?,?,?)",
                  ("Dr. Meera Iyer", settings.demo_email, hash_password(settings.demo_password),
                   "General Medicine", now_iso()))
        log.info("Created demo doctor %s", settings.demo_email)
    added = seed_starter_templates(db, DATA_DIR / "starter_templates.json")
    if added:
        log.info("Loaded %d starter sign templates", added)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = get_db()
    seed(db)
    get_recognizer(db)
    yield


app = FastAPI(
    title="Arogya API",
    version=settings.version,
    description="Two-way Indian Sign Language and doctor-patient communication assistant.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, consultations.router, language.router, signs.router, speech.router, prescriptions.router):
    app.include_router(r)


@app.get("/api/health", tags=["meta"])
def health():
    db = get_db()
    rec = get_recognizer(db)
    return {
        "status": "ok",
        "version": settings.version,
        "capabilities": {
            "server_stt": speech_service.stt_available(),
            "server_tts": speech_service.tts_available(),
            "translation_engine": engine_name(),
            "sign_model": rec.model.ready,
            "sign_model_classes": len(rec.model.labels),
            "sign_templates": rec.templates.count(),
        },
    }


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse({"detail": "Something went wrong on the server. Try again."}, status_code=500)


# ---- Serve the React build (single-container deploy) ----
static_dir = Path(settings.static_dir)
if static_dir.is_dir() and (static_dir / "index.html").exists():
    if (static_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "ws/")):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = (static_dir / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(static_dir.resolve())):
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"app": "Arogya API", "docs": "/docs", "health": "/api/health",
                "hint": "Run the frontend with `npm run dev` in ./frontend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
