import logging
from typing import List, Optional

import requests
from concurrent.futures import ThreadPoolExecutor

from utils.formatting import parse_vtt

logger = logging.getLogger(__name__)


def extract_video_id(url: str) -> Optional[str]:
    import re
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/|live/)([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else None


def _fetch_track(url: str) -> Optional[List[dict]]:
    try:
        r = requests.get(url, timeout=8)
        if not r.ok:
            return None
        return parse_vtt(r.text)
    except Exception:
        return None


def _fetch_first(urls: List[str]) -> Optional[List[dict]]:
    if not urls:
        return None

    with ThreadPoolExecutor(max_workers=min(5, len(urls))) as pool:
        futures = [pool.submit(_fetch_track, u) for u in urls]

        for f in futures:
            try:
                result = f.result(timeout=10)
                if result:
                    return result
            except Exception:
                continue

    return None


def fetch_captions_direct(video_id: str, language: str = "auto") -> Optional[List[dict]]:
    lang = (language or "auto").lower()

    urls = []

    if lang != "auto":
        urls.extend([
            f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&fmt=vtt",
            f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&kind=asr&fmt=vtt",
        ])

    # fallback English
    urls.extend([
        f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&fmt=vtt",
        f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&kind=asr&fmt=vtt",
    ])

    return _fetch_first(urls)
