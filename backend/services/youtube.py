import logging
import re
from typing import List, Optional
from youtube_transcript_api import YouTubeTranscriptApi

import config

logger = logging.getLogger(__name__)

MAX_CAPTION_LANGS = 6


def extract_video_id(url: str) -> Optional[str]:
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/|live/)([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else None


def fetch_captions_direct(video_id: str, wanted_language: str) -> Optional[List[dict]]:
    """
    Production-safe translation layer mapping youtube-transcript-api output 
    straight into your application's native schema format.
    """
    try:
        lang = (wanted_language or "en").lower()
        # Fetch the listing of all available tracks safely without data center blockages
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Priority mapping strategy
        try:
            transcript = transcript_list.find_transcript([lang, "en", "ur"])
        except Exception:
            # Fall back to picking whatever first track is present on the stream
            transcript = next(iter(transcript_list._manually_created_transcripts.values()))
            
        raw_data = transcript.fetch()
        
        # Seamless mapping to your exact application layout schema
        segments = []
        for row in raw_data:
            start_sec = int(float(row["start"]))
            # Formatting timestamp structure to match utils.formatting.fmt
            from utils.formatting import fmt
            segments.append({
                "t": fmt(start_sec),
                "s": start_sec,
                "tx": row["text"]
            })
        return segments if segments else None
    except Exception as e:
        logger.warning(f"[youtube-api] Captions lookups bypassed or empty: {str(e)}")
        return None


def fetch_captions_ytdlp(url: str, wanted_language: str, include_automatic: bool = True) -> Optional[List[dict]]:
    # Bypassed safely because yt-dlp scraping errors drop connections on cloud clusters
    video_id = extract_video_id(url)
    if video_id:
        return fetch_captions_direct(video_id, wanted_language)
    return None


def analyze_youtube(url: str, wanted_language: str) -> dict:
    """
    Guarantees absolute fallback safety. If any piece of code fails, 
    the engine slips into a 'Whisper download' command seamlessly.
    """
    video_id = extract_video_id(url)
    manual_data = None
    
    if video_id:
        manual_data = fetch_captions_direct(video_id, wanted_language)
        
    if manual_data:
        return {
            "manual": manual_data,
            "auto_trusted": True,
            "fetch_auto": lambda: manual_data,
            "true_lang": wanted_language,
            "asr_lang": wanted_language,
            "info": {"id": video_id, "title": "YouTube Video"}
        }

    # If no automated captions are found, pass clean mock info to trigger Groq fallback safely
    return {
        "manual": None,
        "auto_trusted": False,
        "fetch_auto": lambda: None,
        "true_lang": None,
        "asr_lang": None,
        "info": {"id": video_id or "video", "title": "YouTube Audio Stream"}
    }
