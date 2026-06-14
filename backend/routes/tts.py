import asyncio
import hashlib
import io
import logging
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import config
from models.translate import TTSRequest
from services.tts import edge_voice_for, synthesize_edge, synthesize_gtts, tts_lang_code

router = APIRouter()
logger = logging.getLogger(__name__)


def _mp3_response(mp3_bytes: bytes) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(mp3_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'inline; filename="speechfindr.mp3"'},
    )


@router.post("/tts")
async def tts_endpoint(payload: TTSRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty.")

    language = tts_lang_code(payload.language)

    max_chars = max(1000, int(config.TTS_MAX_CHARS))
    if len(text) > max_chars:
        text = text[:max_chars]

    cache_key = f"tts:v2:{hashlib.sha256((text + '|' + language).encode('utf-8')).hexdigest()}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        return _mp3_response(cached["payload"]["mp3"])

    mp3_bytes = None
    engine = "edge"
    voice = edge_voice_for(language)
    if config.TTS_ENGINE != "gtts" and voice:
        try:
            t0 = time.time()
            mp3_bytes = await synthesize_edge(text, voice)
            logger.info("[tts] edge voice=%s chars=%d: %.2fs", voice, len(text), time.time() - t0)
        except Exception:
            logger.exception("[tts] edge-tts failed (voice=%s); falling back to gTTS", voice)
            mp3_bytes = None

    if mp3_bytes is None:
        engine = "gtts"
        try:
            t0 = time.time()
            mp3_bytes = await asyncio.to_thread(synthesize_gtts, text, language)
            logger.info("[tts] gtts lang=%s chars=%d: %.2fs", language, len(text), time.time() - t0)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"TTS generation failed: {exc}") from exc

    config.cache_put(cache_key, {"mp3": mp3_bytes, "engine": engine})
    return _mp3_response(mp3_bytes)
