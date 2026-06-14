import hashlib
import logging
import time

from fastapi import APIRouter, HTTPException

import config
from models.translate import TranslateRequest, TranslateResponse
from services import progress
from services.groq_clients import pick_translation_client
from services.translation import group_segments_into_sentences, translate_segments_with_retries

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/translate", response_model=TranslateResponse)
def translate_endpoint(payload: TranslateRequest):
    target_language = (payload.target_language or "auto").strip().lower()
    logger.info("[translate] request: target=%s segments=%d", target_language, len(payload.segments or []))
    if not payload.segments:
        raise HTTPException(status_code=400, detail="No segments provided for translation.")

    raw_text = " ".join([seg.tx for seg in payload.segments if seg.tx]).strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Transcript text is empty.")

    progress.start(payload.job, ["translate"])

    engine_pref = "google" if config.TRANSLATION_PREFER_GOOGLE else "groq"
    cache_key = f"translate:{hashlib.sha256(raw_text.encode('utf-8')).hexdigest()}:{target_language}:{engine_pref}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        logger.info("[translate] cache hit for target=%s", target_language)
        progress.finish(payload.job, "Loaded from cache")
        return cached["payload"]

    segments = [{"t": seg.t, "s": seg.s, "tx": seg.tx} for seg in payload.segments if seg.tx]

    work_segments = segments
    grouped = False
    if config.TRANSLATION_GROUP_SENTENCES:
        sentence_segments = group_segments_into_sentences(segments)
        if sentence_segments:
            work_segments = sentence_segments
            grouped = True

    client = pick_translation_client()
    t0 = time.time()
    try:
        translated_segments, engine = translate_segments_with_retries(
            client, work_segments, target_language, job_id=payload.job
        )
    except Exception:
        progress.fail(payload.job, "Translation failed")
        raise
    elapsed = time.time() - t0
    logger.info(
        "[translate] DONE target=%s engine=%s grouped=%s cues=%d->%d elapsed=%.2fs (%.1f min)",
        target_language, engine, grouped, len(segments), len(work_segments), elapsed, elapsed / 60,
    )

    if grouped:
        for out, src_seg in zip(translated_segments, work_segments):
            out["src"] = src_seg.get("tx", "")

    translated_text = " ".join([s.get("tx", "") for s in translated_segments]).strip()
    result = TranslateResponse(translated_text=translated_text, translated_segments=translated_segments, engine=engine)  # type: ignore[arg-type]

    config.cache_put(cache_key, result)
    progress.finish(payload.job)
    return result
