import logging

from fastapi import APIRouter, HTTPException

import config
from models.transcript import YouTubeTranscriptRequest, YouTubeTranscriptResponse
from services import progress
from services.youtube import extract_video_id, fetch_captions_direct
from services.transcription import transcribe_youtube_with_groq

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve(url: str, language: str, job_id: str = "") -> dict:
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    progress.start(job_id, ["captions", "whisper"])

    cache_key = f"{video_id}:{language}"
    cached = config.TRANSCRIPT_CACHE.get(cache_key)

    if cached:
        progress.finish(job_id, "cached")
        return cached["payload"]

    # STEP 1: captions only (SAFE PATH)
    progress.set_stage(job_id, "captions", "Fetching captions")

    captions = fetch_captions_direct(video_id, language)

    if captions:
        payload = {
            "source": "youtube_captions",
            "language": language,
            "segments": captions
        }
        config.cache_put(cache_key, payload)
        progress.finish(job_id, "done")
        return payload

    # STEP 2: whisper fallback (ONLY if needed)
    progress.set_stage(job_id, "whisper", "Transcribing audio")

    try:
        result = transcribe_youtube_with_groq(url, language, info=None, job_id=job_id)
    except Exception:
        result = None

    if result:
        payload = {
            "source": "whisper",
            "language": language,
            "segments": result
        }
        config.cache_put(cache_key, payload)
        progress.finish(job_id, "done")
        return payload

    # STEP 3: FAIL SAFE (never crash UI)
    progress.fail(job_id, "no transcript")

    return {
        "source": "unavailable",
        "language": language,
        "segments": []
    }


@router.post("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_post(payload: YouTubeTranscriptRequest):
    return _resolve(payload.url, payload.language, payload.job)


@router.get("/youtube/transcript", response_model=YouTubeTranscriptResponse)
def youtube_get(url: str, language: str = "auto", job: str = ""):
    return _resolve(url, language, job)
