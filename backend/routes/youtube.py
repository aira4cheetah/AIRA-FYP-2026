import logging
import time

from fastapi import APIRouter, HTTPException

import config
from models.transcript import YouTubeTranscriptRequest, YouTubeTranscriptResponse
from services import progress
from services.transcription import transcribe_youtube_with_groq
from services.youtube import analyze_youtube, extract_video_id, fetch_captions_direct

router = APIRouter()
logger = logging.getLogger(__name__)

YOUTUBE_STAGES = ["analyze", "captions", "download", "transcribe", "translate"]


def _resolve_youtube_transcript(url: str, language: str, job_id: str = "") -> dict:
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    progress.start(job_id, YOUTUBE_STAGES)

    cache_key = f"{video_id}:{(language or 'auto').lower()}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        progress.finish(job_id, "Loaded from cache")
        return cached["payload"]

    def _store(source: str, segments: list) -> dict:
        payload = {"source": source, "language": language, "segments": segments}
        config.cache_put(cache_key, payload)
        return payload

    def _whisper(info=None):
        t = time.time()
        try:
            return transcribe_youtube_with_groq(url, language, info=info, job_id=job_id)
        except HTTPException as exc:
            detail = str(exc.detail).lower()
            logger.error("Whisper transcription failed for %s: %s", url, exc.detail)
            if "not configured" in detail or "not installed" in detail:
                raise
            return None
        except Exception:
            logger.error("Unexpected transcription error for %s", url, exc_info=True)
            return None
        finally:
            logger.info("[timing] whisper path total: %.2fs", time.time() - t)

    def _direct_captions():
        logger.info("[youtube] trying direct timedtext captions...")
        try:
            return fetch_captions_direct(video_id, language)
        except Exception:
            logger.warning("Direct caption fetch failed for %s", video_id, exc_info=True)
            return None

    progress.set_stage(job_id, "analyze", "Reading video info & checking captions")
    t_analyze = time.time()
    try:
        plan = analyze_youtube(url, language)
    except Exception:
        logger.warning("YouTube analysis failed for %s", url, exc_info=True)
        plan = {"manual": None, "auto_trusted": True, "fetch_auto": lambda: None, "true_lang": None, "asr_lang": None, "info": None}
    logger.info("[timing] analyze_youtube (yt-dlp metadata + manual captions): %.2fs", time.time() - t_analyze)
    logger.info(
        "[youtube] plan: manual=%s auto_trusted=%s true_lang=%s asr_lang=%s",
        bool(plan.get("manual")), plan.get("auto_trusted"), plan.get("true_lang"), plan.get("asr_lang"),
    )

    if plan.get("true_lang") and plan.get("asr_lang") and plan["true_lang"] != plan["asr_lang"]:
        logger.info(
            "Caption ASR language '%s' disagrees with audio language '%s' for %s; preferring Whisper.",
            plan["asr_lang"], plan["true_lang"], url,
        )

    if plan.get("manual"):
        logger.info("[youtube] using manual captions")
        progress.finish(job_id, "Captions found")
        return _store("youtube_captions", plan["manual"])

    if plan.get("auto_trusted"):
        logger.info("[youtube] fetching auto/direct captions...")
        progress.set_stage(job_id, "captions", "Looking for existing subtitles")
        t_cap = time.time()
        auto = plan["fetch_auto"]() or _direct_captions()
        logger.info("[timing] caption fetch (auto/direct): %.2fs -> %s", time.time() - t_cap, "found" if auto else "none")
        if auto:
            progress.finish(job_id, "Captions found")
            return _store("youtube_captions", auto)
        logger.info("[youtube] no captions; starting whisper transcription")
        whisper = _whisper(plan.get("info"))
        if whisper:
            progress.finish(job_id)
            return _store("groq_whisper", whisper)
    else:
        logger.info("[youtube] starting whisper transcription (captions not trusted)")
        whisper = _whisper(plan.get("info"))
        if whisper:
            progress.finish(job_id)
            return _store("groq_whisper", whisper)
        logger.info("[youtube] whisper produced nothing; trying auto/direct captions...")
        progress.set_stage(job_id, "captions", "Looking for existing subtitles")
        t_cap = time.time()
        auto = plan["fetch_auto"]() or _direct_captions()
        logger.info("[timing] caption fetch (auto/direct): %.2fs -> %s", time.time() - t_cap, "found" if auto else "none")
        if auto:
            progress.finish(job_id, "Captions found")
            return _store("youtube_captions", auto)

    logger.warning("[youtube] transcript UNAVAILABLE for %s", url)
    progress.fail(job_id, "No transcript available")
    return {"source": "unavailable", "language": language, "segments": []}


@router.post("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_transcript(payload: YouTubeTranscriptRequest):
    return _resolve_youtube_transcript(payload.url, payload.language, payload.job)


@router.get("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_transcript_get(url: str, language: str = "auto", job: str = ""):
    return _resolve_youtube_transcript(url, language, job)
