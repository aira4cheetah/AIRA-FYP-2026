import copy
import hashlib
import logging
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException
from yt_dlp import YoutubeDL

import config
from services import progress
from services.groq_clients import transcription_client
from services.translation import _backoff_seconds, _is_rate_limit_error, translate_segments
from utils.formatting import fmt

logger = logging.getLogger(__name__)

# 16kHz mono 48kbps mp3: small uploads, plenty for speech recognition.
_AUDIO_ARGS = ["-vn", "-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame", "-b:a", "48k", "-compression_level", "9"]

ydl_opts = {
    'format': 'bestaudio/best',
    # ... leave all your original settings exactly as they are ...
}

# Add these two lines directly below your dictionary:
if os.path.exists("cookies.txt"):
    ydl_opts['cookiefile'] = "cookies.txt"



def _run_ffmpeg(command: List[str], timeout: int, failure_detail: str) -> None:
    try:
        proc = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="FFmpeg is not installed or not available in PATH.",
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=failure_detail) from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        detail = stderr.splitlines()[-1] if stderr else failure_detail
        raise HTTPException(status_code=400, detail=detail)


def _probe_audio_duration(audio_path: str) -> Optional[float]:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    raw = (proc.stdout or "").strip()
    try:
        value = float(raw)
        return value if value > 0 else None
    except ValueError:
        return None


def _chunk_plain_transcript(text: str, duration_seconds: Optional[float] = None) -> List[dict]:
    import re

    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return []

    pieces = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if not pieces:
        pieces = [cleaned]

    merged: List[str] = []
    current = ""
    for piece in pieces:
        candidate = f"{current} {piece}".strip() if current else piece
        if current and len(candidate) > 140:
            merged.append(current)
            current = piece
        else:
            current = candidate
    if current:
        merged.append(current)

    total_chunks = max(1, len(merged))
    total_duration = max(float(duration_seconds or 0), float(total_chunks * 6))
    step = max(1, int(total_duration / total_chunks))

    segments: List[dict] = []
    for idx, chunk in enumerate(merged):
        start = min(int(idx * step), int(max(total_duration - 1, 0)))
        segments.append({"t": fmt(start), "s": start, "tx": chunk})
    return segments


def _segments_from_groq_result(result, duration_seconds: Optional[float] = None) -> List[dict]:
    segments: List[dict] = []
    raw_segments = getattr(result, "segments", None) or []
    for seg in raw_segments:
        text = (getattr(seg, "text", "") or "").strip()
        start = int(float(getattr(seg, "start", 0) or 0))
        if text:
            segments.append({"t": fmt(start), "s": start, "tx": text})

    if not segments:
        fallback_text = (getattr(result, "text", "") or "").strip()
        if fallback_text:
            segments = _chunk_plain_transcript(fallback_text, duration_seconds)

    if not segments:
        raise HTTPException(status_code=500, detail="Transcription returned no segments.")
    return segments


def _offset_segments(segments: List[dict], offset_seconds: int) -> List[dict]:
    return [
        {"t": fmt(max(0, int(seg["s"]) + int(offset_seconds))), "s": max(0, int(seg["s"]) + int(offset_seconds)), "tx": seg["tx"]}
        for seg in segments
    ]


def _transcribe_audio_bytes(audio_name: str, audio_bytes: bytes, duration_seconds: Optional[float] = None) -> List[dict]:
    client = transcription_client()
    result = client.audio.transcriptions.create(
        file=(audio_name, audio_bytes),
        model=config.DEFAULT_MODEL,
        temperature=0,
        response_format="verbose_json",
        timestamp_granularities=["segment"],
    )
    return _segments_from_groq_result(result, duration_seconds)


def _save_uploaded_source(filename: str, data: bytes, temp_dir: str) -> str:
    suffix = Path(filename or "upload.bin").suffix or ".bin"
    source_path = os.path.join(temp_dir, f"source{suffix}")
    with open(source_path, "wb") as f:
        f.write(data)
    return source_path


def _transcode_single(source_path: str, out_path: str, duration_seconds: float) -> None:
    timeout = int(max(300, duration_seconds / 4))
    _run_ffmpeg(
        ["ffmpeg", "-y", "-i", source_path, *_AUDIO_ARGS, out_path],
        timeout=timeout,
        failure_detail="FFmpeg timed out while extracting audio.",
    )
    if not os.path.exists(out_path):
        raise HTTPException(status_code=400, detail="Audio extraction failed: FFmpeg could not extract audio from this file.")


def _segment_audio(source_path: str, temp_dir: str, chunk_seconds: int, duration_seconds: float) -> List[str]:
    """Split + transcode in a single ffmpeg pass (the old code re-encoded the
    whole file once per chunk, which made long videos crawl)."""
    pattern = os.path.join(temp_dir, "chunk_%05d.mp3")
    timeout = int(max(600, duration_seconds / 4))
    _run_ffmpeg(
        ["ffmpeg", "-y", "-i", source_path, *_AUDIO_ARGS,
         "-f", "segment", "-segment_time", str(chunk_seconds), "-reset_timestamps", "1", pattern],
        timeout=timeout,
        failure_detail="FFmpeg timed out while splitting audio into chunks.",
    )
    chunks = sorted(str(p) for p in Path(temp_dir).glob("chunk_*.mp3"))
    if not chunks:
        raise HTTPException(status_code=400, detail="Audio extraction failed: FFmpeg produced no audio chunks.")
    return chunks


def _transcribe_local_audio(
    source_path: str,
    temp_dir: str,
    duration_hint: Optional[float] = None,
    job_id: str = "",
) -> List[dict]:
    probed = _probe_audio_duration(source_path)
    if probed is not None:
        estimated_duration = float(probed)
    else:
        estimated_duration = float(duration_hint or 0)

    chunk_seconds = max(60, int(config.UPLOAD_CHUNK_SECONDS))
    progress.set_stage(job_id, "transcribe", "Preparing audio")

    if estimated_duration and estimated_duration <= chunk_seconds:
        single_path = os.path.join(temp_dir, "single.mp3")
        _transcode_single(source_path, single_path, estimated_duration)
        progress.set_percent(job_id, 30.0, "Whisper is listening")
        with open(single_path, "rb") as f:
            segments = _transcribe_audio_bytes("single.mp3", f.read(), estimated_duration)
        progress.add_partial(job_id, segments)
        return segments

    t_seg = time.time()
    progress.set_percent(job_id, 0.0, "Splitting audio into chunks")
    chunk_paths = _segment_audio(source_path, temp_dir, chunk_seconds, estimated_duration or 0)
    logger.info("[timing] ffmpeg segmentation (%d chunks): %.2fs", len(chunk_paths), time.time() - t_seg)

    if len(chunk_paths) == 1:
        progress.set_percent(job_id, 30.0, "Whisper is listening")
        with open(chunk_paths[0], "rb") as f:
            segments = _transcribe_audio_bytes(os.path.basename(chunk_paths[0]), f.read(), estimated_duration or None)
        progress.add_partial(job_id, segments)
        return segments

    progress.set_chunks(job_id, 0, len(chunk_paths))

    def _work(job: tuple) -> List[dict]:
        idx, chunk_path = job
        offset = idx * chunk_seconds
        attempts = max(1, config.HTTP_RETRIES)
        for attempt in range(attempts):
            try:
                with open(chunk_path, "rb") as f:
                    raw = _transcribe_audio_bytes(os.path.basename(chunk_path), f.read(), chunk_seconds)
                result = _offset_segments(raw, offset)
                progress.chunk_done(job_id, result)
                return result
            except Exception as exc:
                if attempt < attempts - 1:
                    wait = _backoff_seconds(exc, attempt) if _is_rate_limit_error(exc) else 1.0 + attempt
                    time.sleep(wait)
                    continue
                logger.error("Chunk at offset %ss failed after %s attempt(s): %s", offset, attempt + 1, exc)
                progress.chunk_done(job_id)
                return []

    workers = max(1, min(config.UPLOAD_MAX_PARALLEL, len(chunk_paths)))
    merged: List[dict] = []
    failed_chunks = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for part in pool.map(_work, list(enumerate(chunk_paths))):
            if part:
                merged.extend(part)
            else:
                failed_chunks += 1
    if failed_chunks == len(chunk_paths):
        raise HTTPException(status_code=502, detail="Transcription failed for every audio chunk.")
    if failed_chunks:
        logger.warning("%s of %s chunks failed; returning partial transcript.", failed_chunks, len(chunk_paths))
    return sorted(merged, key=lambda seg: seg["s"])


def _find_downloaded_audio(temp_dir: str) -> Optional[str]:
    candidates = [p for p in Path(temp_dir).glob("audio.*") if p.is_file()]
    if not candidates:
        return None
    return str(max(candidates, key=lambda p: p.stat().st_size))


def transcribe_youtube_with_groq(
    url: str,
    target_language: str,
    info: Optional[dict] = None,
    job_id: str = "",
) -> List[dict]:
    browser_cookie = (os.getenv("YTDLP_COOKIES_FROM_BROWSER") or "").strip().lower()
    proxy = (os.getenv("YTDLP_PROXY") or "").strip()
    client = transcription_client()

    progress.set_stage(job_id, "download", "Downloading audio stream")

    def _dl_hook(status: dict) -> None:
        if status.get("status") != "downloading":
            return
        total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
        done = status.get("downloaded_bytes") or 0
        if total > 0:
            mb = total / 1024 / 1024
            progress.set_percent(job_id, done * 100.0 / total, f"Downloading audio ({mb:.0f} MB)")

    with tempfile.TemporaryDirectory() as temp_dir:
        def _build_opts(use_cookie: bool) -> dict:
            # Smallest useful audio stream, no re-encode (ffmpeg reads the
            # native container directly), parallel fragment download.
            opts = {
                "format": "bestaudio[abr<=80]/bestaudio/best",
                "outtmpl": os.path.join(temp_dir, "audio.%(ext)s"),
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "retries": 5,
                "fragment_retries": 5,
                "socket_timeout": 30,
                "concurrent_fragment_downloads": 8,
            }
            if job_id:
                opts["progress_hooks"] = [_dl_hook]
            if use_cookie and browser_cookie:
                opts["cookiesfrombrowser"] = (browser_cookie,)
            if proxy:
                opts["proxy"] = proxy
            return opts

        t_dl = time.time()
        # Reuse the metadata already fetched by analyze_youtube so yt-dlp does not
        # extract the same video info a second time. Fall back to a full download
        # if reuse fails for any reason.
        downloaded = False
        if info is not None:
            try:
                with YoutubeDL(_build_opts(bool(browser_cookie))) as ydl:
                    ydl.process_ie_result(copy.deepcopy(info), download=True)
                downloaded = True
            except Exception as exc:
                logger.warning("Reusing analyzed metadata failed (%s); falling back to full download.", exc)

        if not downloaded:
            last_error = None
            attempts = [True, False] if browser_cookie else [False]
            for use_cookie in attempts:
                try:
                    with YoutubeDL(_build_opts(use_cookie)) as ydl:
                        ydl.download([url])
                    last_error = None
                    break
                except Exception as exc:
                    last_error = exc
                    continue
            if last_error is not None:
                raise HTTPException(status_code=502, detail=f"YouTube audio download failed: {last_error}") from last_error
        logger.info(
            "[timing] yt-dlp audio download%s: %.2fs",
            " (reused metadata)" if downloaded else " (re-extracted)",
            time.time() - t_dl,
        )

        audio_path = _find_downloaded_audio(temp_dir)
        if not audio_path:
            raise HTTPException(status_code=500, detail="Audio extraction failed.")

        t_tx = time.time()
        segments = _transcribe_local_audio(audio_path, temp_dir, job_id=job_id)
        logger.info("[timing] groq whisper transcription (ffmpeg+API): %.2fs", time.time() - t_tx)
        translated, _engine = translate_segments(client, segments, target_language, job_id=job_id)
        return translated


def transcribe_uploaded_media(
    filename: str,
    data: bytes,
    target_language: str,
    duration_seconds: Optional[float] = None,
    job_id: str = "",
) -> List[dict]:
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    file_hash = hashlib.sha256(data).hexdigest()
    cache_key = f"upload:v2:{file_hash}:{(target_language or 'auto').lower()}:{int(float(duration_seconds or 0))}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        progress.finish(job_id, "Loaded from cache")
        return cached["payload"]["segments"]

    progress.set_stage(job_id, "extract", "Reading your file")
    with tempfile.TemporaryDirectory() as temp_dir:
        source_path = _save_uploaded_source(filename, data, temp_dir)
        segments = _transcribe_local_audio(source_path, temp_dir, duration_seconds, job_id=job_id)

    client = transcription_client()
    translated, _engine = translate_segments(client, segments, target_language, job_id=job_id)
    config.cache_put(cache_key, {"source": "groq_whisper", "language": target_language, "segments": translated})
    return translated
