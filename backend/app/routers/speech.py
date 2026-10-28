from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..schemas import TTSIn
from ..services import speech

router = APIRouter(prefix="/api/speech", tags=["speech"])

MAX_AUDIO = 10 * 1024 * 1024  # 10 MB, roughly 5 minutes of compressed speech


@router.post("/stt")
async def speech_to_text(audio: UploadFile = File(...), lang: str = Form("en")):
    if not speech.stt_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Server speech recognition is off. Use the browser microphone instead.")
    data = await audio.read()
    if len(data) > MAX_AUDIO:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Recording is too long. Keep it under 5 minutes.")
    try:
        return await run_in_threadpool(speech.transcribe, data, lang)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))


@router.post("/tts")
async def text_to_speech(body: TTSIn):
    if not speech.tts_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Server voice is off. The browser voice will be used.")
    try:
        audio = await run_in_threadpool(speech.synthesize, body.text, body.lang)
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not create audio: {e}")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
