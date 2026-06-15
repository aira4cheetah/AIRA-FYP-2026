import logging
import time

from fastapi import APIRouter, HTTPException

import config
from models.transcript import YouTubeTranscriptRequest, YouTubeTranscriptResponse
from services import progress
from services.youtube import extract_video_id, fetch_captions_direct

router = APIRouter()
logger = logging.getLogger(__name__)

YOUTUBE_STAGES = ["captions"]


def _resolve_youtube_transcript(url: str, language: str, job_id: str = "") -> dict:
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    progress.start(job_id, YOUTUBE_STAGES)
    progress.set_stage(job_id, "captions", "Fetching captions")

    cache_key = f"{video_id}:{(language or 'auto').lower()}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)

    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        progress.finish(job_id, "Loaded from cache")
        return cached["payload"]

    captions = fetch_captions_direct(video_id, language)

    if captions:
        payload = {
            "source": "youtube_captions",
            "language": language,
            "segments": captions
        }
        config.cache_put(cache_key, payload)
        progress.finish(job_id, "Captions found")
        return payload

    logger.warning("[youtube] captions unavailable for %s", url)

    progress.fail(job_id, "No captions available")

    return {
        "source": "unavailable",
        "language": language,
        "segments": []
    }


@router.post("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_transcript(payload: YouTubeTranscriptRequest):
    return _resolve_youtube_transcript(payload.url, payload.language, payload.job)


@router.get("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_transcript_get(url: str, language: str = "auto", job: str = ""):
    return _resolve_youtube_transcript(url, language, job)
