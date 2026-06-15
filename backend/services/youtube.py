import logging
import os
import re
import time
from typing import List, Optional

import requests
from yt_dlp import YoutubeDL

import config
from utils.formatting import parse_vtt

logger = logging.getLogger(__name__)

MAX_CAPTION_LANGS = 6

ydl_opts = {
    'format': 'bestaudio/best',
    # ... leave all your original settings exactly as they are ...
}

# Add these two lines directly below your dictionary:
if os.path.exists("cookies.txt"):
    ydl_opts['cookiefile'] = "cookies.txt"



def extract_video_id(url: str) -> Optional[str]:
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/|live/)([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else None


def _lang_priority_keys(wanted_language: str, available_keys: List[str]) -> List[str]:
    wanted = (wanted_language or "auto").lower()
    norm_map = {k.lower(): k for k in available_keys}
    order: List[str] = []

    if wanted != "auto":
        exact = norm_map.get(wanted)
        if exact:
            order.append(exact)
        prefixed = [orig for key, orig in norm_map.items() if key.startswith(f"{wanted}-")]
        order.extend([k for k in prefixed if k not in order])

    for fallback in ("en",):
        exact = norm_map.get(fallback)
        if exact and exact not in order:
            order.append(exact)
        prefixed = [orig for key, orig in norm_map.items() if key.startswith(f"{fallback}-")]
        order.extend([k for k in prefixed if k not in order])

    for key in available_keys:
        if key not in order:
            order.append(key)
    return order


def _fetch_one_track(url: str, timeout: float = 8.0) -> Optional[List[dict]]:
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": os.getenv("HTTP_USER_AGENT", "Mozilla/5.0")},
        )
    except requests.RequestException:
        return None
    if not resp.ok:
        return None
    return parse_vtt(resp.text) or None


def _fetch_first_caption(urls: List[str], budget_seconds: float = 10.0) -> Optional[List[dict]]:
    """Fetch all candidate caption URLs in parallel under a hard time budget,
    returning the first hit in priority order. YouTube often rate-limits
    anonymous caption requests, so trying them one by one with retries used to
    burn 60-90s per video before transcription even started."""
    if not urls:
        return None
    from concurrent.futures import ThreadPoolExecutor

    deadline = time.monotonic() + budget_seconds
    pool = ThreadPoolExecutor(max_workers=min(6, len(urls)))
    try:
        futures = [pool.submit(_fetch_one_track, u) for u in urls]
        for fut in futures:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                segments = fut.result(timeout=remaining)
            except Exception:
                segments = None
            if segments:
                return segments
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _track_urls(track_list: List[dict], max_urls: int = 3) -> List[str]:
    urls: List[str] = []
    for ext_pref in ("vtt", None):
        for track in track_list:
            if ext_pref and (track.get("ext") or "").lower() != ext_pref:
                continue
            url = track.get("url")
            if url and url not in urls:
                urls.append(url)
            if len(urls) >= max_urls:
                return urls
    return urls


def _fetch_track_segments(track_list: List[dict]) -> Optional[List[dict]]:
    return _fetch_first_caption(_track_urls(track_list), budget_seconds=10.0)


def fetch_captions_direct(video_id: str, wanted_language: str) -> Optional[List[dict]]:
    lang = (wanted_language or "auto").lower()
    candidates: List[str] = []
    if lang != "auto":
        candidates.extend([
            f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&fmt=vtt",
            f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&kind=asr&fmt=vtt",
        ])
    candidates.extend([
        f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&fmt=vtt",
        f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&kind=asr&fmt=vtt",
    ])
    return _fetch_first_caption(candidates, budget_seconds=8.0)


def fetch_captions_ytdlp(url: str, wanted_language: str, include_automatic: bool = True) -> Optional[List[dict]]:
    browser_cookie = (os.getenv("YTDLP_COOKIES_FROM_BROWSER") or "").strip().lower()
    proxy = (os.getenv("YTDLP_PROXY") or "").strip()

    def _build_opts(use_cookie: bool) -> dict:
        opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "retries": 5,
            "fragment_retries": 5,
            "socket_timeout": 30,
        }
        if use_cookie and browser_cookie:
            opts["cookiesfrombrowser"] = (browser_cookie,)
        if proxy:
            opts["proxy"] = proxy
        return opts

    info = None
    attempts = [True, False] if browser_cookie else [False]
    for use_cookie in attempts:
        try:
            with YoutubeDL(_build_opts(use_cookie)) as ydl:
                info = ydl.extract_info(url, download=False)
            break
        except Exception:
            info = None
            continue
    if not info:
        return None

    subtitles = info.get("subtitles") or {}
    automatic = info.get("automatic_captions") or {}

    sources = (subtitles, automatic) if include_automatic else (subtitles,)
    for source in sources:
        if not source:
            continue
        keys = list(source.keys())
        for lang_key in _lang_priority_keys(wanted_language, keys):
            tracks = source.get(lang_key) or []
            segments = _fetch_track_segments(tracks)
            if segments:
                return segments
    return None


def _norm_lang(code: str) -> str:
    return (code or "").split("-")[0].strip().lower()


def _extract_info(url: str) -> Optional[dict]:
    browser_cookie = (os.getenv("YTDLP_COOKIES_FROM_BROWSER") or "").strip().lower()
    proxy = (os.getenv("YTDLP_PROXY") or "").strip()

    def _opts(use_cookie: bool) -> dict:
        opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "retries": 5,
            "fragment_retries": 5,
            "socket_timeout": 30,
        }
        if use_cookie and browser_cookie:
            opts["cookiesfrombrowser"] = (browser_cookie,)
        if proxy:
            opts["proxy"] = proxy
        return opts

    for use_cookie in ([True, False] if browser_cookie else [False]):
        try:
            with YoutubeDL(_opts(use_cookie)) as ydl:
                return ydl.extract_info(url, download=False)
        except Exception:
            continue
    return None


def _original_audio_language(info: dict) -> Optional[str]:
    best = None
    best_score = None
    for f in info.get("formats") or []:
        if f.get("acodec") in (None, "none"):
            continue
        lang = f.get("language")
        if not lang:
            continue
        pref = f.get("language_preference")
        score = pref if isinstance(pref, int) else -999
        if "original" in (f.get("format_note") or "").lower():
            score += 100
        if best_score is None or score > best_score:
            best_score = score
            best = lang
    return best


def _asr_original_language(automatic: dict) -> Optional[str]:
    for lang_key, tracks in automatic.items():
        for tr in tracks or []:
            if "tlang=" not in (tr.get("url") or ""):
                return lang_key
    return None


def analyze_youtube(url: str, wanted_language: str) -> dict:
    empty = {"manual": None, "auto_trusted": True, "fetch_auto": lambda: None, "true_lang": None, "asr_lang": None, "info": None}
    info = _extract_info(url)
    if not info:
        return empty

    subtitles = info.get("subtitles") or {}
    automatic = info.get("automatic_captions") or {}
    logger.info("[youtube] caption tracks: manual_langs=%d auto_langs=%d", len(subtitles), len(automatic))

    manual = None
    if subtitles:
        manual_urls: List[str] = []
        for lang_key in _lang_priority_keys(wanted_language, list(subtitles.keys()))[:MAX_CAPTION_LANGS]:
            manual_urls.extend(_track_urls(subtitles.get(lang_key) or [], max_urls=2))
        manual = _fetch_first_caption(manual_urls, budget_seconds=12.0)

    true_lang = _norm_lang(_original_audio_language(info) or info.get("language") or "")
    asr_lang = _norm_lang(_asr_original_language(automatic) or "")

    if config.YOUTUBE_TRUST_AUTO_CAPTIONS or not true_lang or not asr_lang:
        auto_trusted = True
    else:
        auto_trusted = asr_lang == true_lang

    def fetch_auto():
        if not automatic:
            return None
        keys = _lang_priority_keys(wanted_language, list(automatic.keys()))[:MAX_CAPTION_LANGS]
        logger.info("[youtube] trying auto-captions in %d langs (of %d): %s", len(keys), len(automatic), keys)
        auto_urls: List[str] = []
        for lang_key in keys:
            auto_urls.extend(_track_urls(automatic.get(lang_key) or [], max_urls=2))
        seg = _fetch_first_caption(auto_urls, budget_seconds=12.0)
        if seg:
            logger.info("[youtube] auto-caption hit")
            return seg
        logger.info("[youtube] no auto-caption track returned content")
        return None

    return {
        "manual": manual,
        "auto_trusted": auto_trusted,
        "fetch_auto": fetch_auto,
        "true_lang": true_lang or None,
        "asr_lang": asr_lang or None,
        "info": info,
    }
