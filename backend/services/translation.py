import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

import requests
from fastapi import HTTPException
from groq import Groq

import config
from services import progress
from services.groq_clients import pick_translation_client
from utils.formatting import fmt

logger = logging.getLogger(__name__)


_RATE_LOCK = threading.Lock()
_TOKEN_LOG: List[tuple] = []  # (timestamp, tokens) within the trailing 60s


def _throttle(est_tokens: int) -> None:
    """Globally pace outgoing Groq calls to stay under the free-tier
    tokens-per-minute limit. Blocks until sending `est_tokens` more tokens
    would keep the trailing-60s total under TRANSLATION_TOKENS_PER_MIN."""
    cap = max(1000, int(getattr(config, "TRANSLATION_TOKENS_PER_MIN", 10000)))
    est = max(1, int(est_tokens))
    with _RATE_LOCK:
        while True:
            now = time.monotonic()
            cutoff = now - 60.0
            while _TOKEN_LOG and _TOKEN_LOG[0][0] < cutoff:
                _TOKEN_LOG.pop(0)
            used = sum(tok for _, tok in _TOKEN_LOG)
            if not _TOKEN_LOG or used + est <= cap:
                _TOKEN_LOG.append((now, est))
                return
            wait = (_TOKEN_LOG[0][0] + 60.0) - now
            time.sleep(max(0.2, min(wait, 5.0)))


def _is_rate_limit_error(exc: Exception) -> bool:
    name = exc.__class__.__name__.lower()
    msg = str(exc).lower()
    return "ratelimit" in name or "rate limit" in msg or "rate_limit_exceeded" in msg or "429" in msg


def _backoff_seconds(exc: Exception, attempt: int) -> float:
    msg = str(exc)
    m = re.search(r"try again in\s*([0-9.]+)s", msg, flags=re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return min(20.0, 1.5 * (attempt + 1))


def _clean_translation_line(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"^\s*(current|translation|translated|output|target)\s*[:\-–]\s*", "", t, flags=re.IGNORECASE)
    parts = [ln.strip() for ln in t.splitlines() if ln.strip()]
    t = " ".join(parts)
    if len(t) >= 2 and t[0] in "\"'“”«»" and t[-1] in "\"'“”«»":
        t = t[1:-1].strip()
    return t


def _translate_one_line(prev_tx: str, cur_tx: str, next_tx: str, lang: str, max_attempts: int = 4) -> str:
    last_exc: Optional[Exception] = None
    max_tokens = min(900, 120 + len(cur_tx) * 3)
    est_tokens = (len(prev_tx) + len(cur_tx) + len(next_tx)) // 4 + max_tokens + 150
    for attempt in range(max_attempts):
        try:
            _throttle(est_tokens)
            client = pick_translation_client()
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a subtitle translator. You are given the PREVIOUS line, the CURRENT line"
                            " and the NEXT line of a transcript. Use the previous and next lines ONLY as context"
                            " to resolve pronouns, names and ambiguous words. Translate ONLY the CURRENT line into"
                            " the requested target language. Output just the translation of the CURRENT line and"
                            " nothing else: no quotes, no labels, no notes, no romanization. Do NOT include any"
                            " word, number or information that appears only in the previous or next lines. Keep the"
                            " same meaning and roughly the same length as the current line; never add, expand or"
                            " invent information."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Target language code: {lang}\n\n"
                            f"PREVIOUS: {prev_tx or '(none)'}\n"
                            f"CURRENT: {cur_tx}\n"
                            f"NEXT: {next_tx or '(none)'}"
                        ),
                    },
                ],
                top_p=1,
                max_completion_tokens=max_tokens,
            )
            out = _clean_translation_line(completion.choices[0].message.content or "")
            return out or cur_tx
        except Exception as exc:
            last_exc = exc
            if not _is_rate_limit_error(exc) or attempt >= max_attempts - 1:
                raise
            time.sleep(_backoff_seconds(exc, attempt))
    if last_exc:
        raise last_exc
    return cur_tx


_GOOGLE_BATCH_ENDPOINT = "https://translate.googleapis.com/translate_a/t"
_GOOGLE_PACE_LOCK = threading.Lock()
_GOOGLE_NEXT_SLOT = [0.0]
_GOOGLE_BLOCKED_UNTIL = [0.0]


def _google_target(lang: str) -> str:
    return "zh-CN" if lang == "zh" else lang


def _google_pace() -> None:
    """Keep a polite floor between outgoing Google requests across all worker
    threads so bursts don't get the server IP rate-limited or captcha-blocked."""
    import random

    min_interval = max(0.0, float(getattr(config, "GOOGLE_TRANSLATE_MIN_INTERVAL_MS", 150)) / 1000.0)
    with _GOOGLE_PACE_LOCK:
        now = time.monotonic()
        slot = max(now, _GOOGLE_NEXT_SLOT[0])
        _GOOGLE_NEXT_SLOT[0] = slot + min_interval
    delay = slot - now + random.uniform(0.0, 0.05)
    if delay > 0:
        time.sleep(delay)


def _google_blocked() -> bool:
    return time.monotonic() < _GOOGLE_BLOCKED_UNTIL[0]


def _google_trip_circuit(seconds: float) -> None:
    _GOOGLE_BLOCKED_UNTIL[0] = max(_GOOGLE_BLOCKED_UNTIL[0], time.monotonic() + seconds)
    logger.warning("[translate] google circuit OPEN for %.0fs (rate-limit/captcha suspected)", seconds)


def _google_request_chunk(lines: List[str], lang: str) -> Optional[List[str]]:
    """One HTTP request translating many lines at once, aligned 1:1 by `q`
    parameter. Returns None if the request fails or the shape is wrong."""
    if _google_blocked():
        return None
    for attempt in range(2):
        _google_pace()
        try:
            resp = requests.post(
                _GOOGLE_BATCH_ENDPOINT,
                params={"client": "gtx", "sl": "auto", "tl": _google_target(lang), "format": "text"},
                data=[("q", line) for line in lines],
                headers={"User-Agent": os.getenv("HTTP_USER_AGENT", "Mozilla/5.0")},
                timeout=(10, 90),
            )
        except requests.RequestException:
            if attempt == 0:
                time.sleep(1.0)
                continue
            logger.warning("[translate] google batch request failed twice for %d lines (lang=%s)", len(lines), lang)
            return None

        if resp.status_code in (403, 429):
            _google_trip_circuit(90.0)
            return None
        if not resp.ok:
            logger.warning("[translate] google batch endpoint HTTP %s for %d lines", resp.status_code, len(lines))
            if attempt == 0 and resp.status_code >= 500:
                time.sleep(1.0)
                continue
            return None
        try:
            data = resp.json()
        except ValueError:
            # HTML instead of JSON usually means a captcha interstitial.
            _google_trip_circuit(120.0)
            return None
        break

    if isinstance(data, str):
        data = [data]
    if not isinstance(data, list) or len(data) != len(lines):
        logger.warning(
            "[translate] google batch returned %s items for %d lines",
            (len(data) if isinstance(data, list) else type(data).__name__), len(lines),
        )
        return None

    out: List[str] = []
    for src, item in zip(lines, data):
        if isinstance(item, list):
            item = item[0] if item else ""
        text = str(item or "").strip()
        out.append(text or src)
    return out


def _google_translate_lines_slow(lines: List[str], lang: str) -> Optional[List[str]]:
    """Old deep-translator path (one request per line). Kept only as a fallback
    when the batch endpoint misbehaves, and skipped while the circuit is open."""
    if _google_blocked():
        return None
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source="auto", target=_google_target(lang))
        out = translator.translate_batch(list(lines))
        if isinstance(out, list) and len(out) == len(lines):
            return [(out[i] or lines[i]) for i in range(len(lines))]
        logger.warning(
            "[translate] google returned unexpected shape: got %s for %d lines",
            (len(out) if isinstance(out, list) else type(out).__name__), len(lines),
        )
        return None
    except Exception:
        logger.exception("[translate] google batch failed for %d lines (lang=%s)", len(lines), lang)
        return None


def _google_translate_lines(lines: List[str], lang: str) -> Optional[List[str]]:
    """Free Google web endpoint, many lines per request. The old code issued
    one HTTP request per line, which made long transcripts take forever."""
    max_lines = max(1, int(getattr(config, "GOOGLE_TRANSLATE_CHUNK_LINES", 64)))
    max_chars = max(500, int(getattr(config, "GOOGLE_TRANSLATE_CHUNK_CHARS", 8000)))

    chunks: List[List[str]] = []
    cur: List[str] = []
    cur_chars = 0
    for line in lines:
        if cur and (len(cur) >= max_lines or cur_chars + len(line) > max_chars):
            chunks.append(cur)
            cur, cur_chars = [], 0
        cur.append(line)
        cur_chars += len(line)
    if cur:
        chunks.append(cur)

    out: List[str] = []
    any_ok = False
    for chunk in chunks:
        translated = _google_request_chunk(chunk, lang)
        if translated is None:
            translated = _google_translate_lines_slow(chunk, lang)
        if translated is None:
            out.extend(chunk)
        else:
            any_ok = True
            out.extend(translated)
    return out if any_ok else None


def _extract_translation_map(raw: str) -> Optional[dict]:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    try:
        data = json.loads(s)
    except Exception:
        return None
    if isinstance(data, dict):
        # Unwrap a single wrapper key (e.g. {"translations": {...}}) if present.
        if len(data) == 1:
            only = next(iter(data.values()))
            if isinstance(only, dict):
                data = only
        return data
    return None


def _translate_batch(lines: List[str], prev_context: str, lang: str, max_attempts: int = 4) -> List[str]:
    n = len(lines)
    total_chars = sum(len(line) for line in lines)
    max_tokens = min(8000, 500 + total_chars * 5)
    numbered = "\n".join(f"{i + 1}. {line}" for i, line in enumerate(lines))
    est_tokens = (len(numbered) + len(prev_context)) // 4 + max_tokens + 200

    last_exc: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            _throttle(est_tokens)
            client = pick_translation_client()
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a subtitle translator. You are given numbered source lines from a"
                            " transcript. Translate every line into the requested target language, keeping"
                            " the same meaning and roughly the same length as each source line. Return ONLY a"
                            " JSON object whose keys are the line numbers as strings and whose values are the"
                            " translation of that exact line, e.g. {\"1\": \"...\", \"2\": \"...\"}. Include a"
                            " key for every input number from 1 to N. Do not merge, split, reorder or drop"
                            " lines. No quotes, labels, notes, romanization or extra commentary inside the"
                            " values. Use the optional context line ONLY to resolve pronouns and names; never"
                            " translate it or include its content."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Target language code: {lang}\n"
                            f"Context (previous line, for reference only, do NOT translate): {prev_context or '(none)'}\n\n"
                            f"Translate these {n} numbered lines. Return a JSON object with a key for every"
                            f" number from 1 to {n}:\n{numbered}"
                        ),
                    },
                ],
                top_p=1,
                max_completion_tokens=max_tokens,
            )
            choice = completion.choices[0]
            raw = choice.message.content or ""
            mapping = _extract_translation_map(raw)
            if mapping is None:
                finish = getattr(choice, "finish_reason", "?")
                logger.warning(
                    "[translate] groq unparseable response | finish_reason=%s raw_len=%d tail=%r",
                    finish, len(raw), raw[-120:],
                )
                raise ValueError("translation batch returned an unparseable response")

            out: List[str] = []
            missing = 0
            for i in range(n):
                value = mapping.get(str(i + 1))
                cleaned = _clean_translation_line(str(value)) if value is not None else ""
                if cleaned:
                    out.append(cleaned)
                else:
                    out.append(lines[i])
                    missing += 1
            if missing:
                logger.warning(
                    "[translate] groq batch missing %d/%d lines (kept original for those)", missing, n
                )
            return out
        except Exception as exc:
            last_exc = exc
            if _is_rate_limit_error(exc) and attempt < max_attempts - 1:
                time.sleep(_backoff_seconds(exc, attempt))
                continue
            raise
    if last_exc:
        raise last_exc
    return list(lines)


_SENTENCE_END = re.compile(r"[.!?۔。！？][\"'”’»)\]}]*$")


def group_segments_into_sentences(segments: List[dict]) -> List[dict]:
    max_chars = max(60, int(getattr(config, "TRANSLATION_GROUP_MAX_CHARS", 280)))
    max_cues = max(1, int(getattr(config, "TRANSLATION_GROUP_MAX_CUES", 6)))

    groups: List[dict] = []
    parts: List[str] = []
    start_t = None
    start_s = 0

    def flush() -> None:
        nonlocal parts, start_t, start_s
        if not parts:
            return
        text = " ".join(parts).strip()
        if text:
            groups.append({"t": start_t if start_t is not None else fmt(start_s), "s": start_s, "tx": text})
        parts = []
        start_t = None

    for seg in segments:
        tx = (seg.get("tx") or "").strip()
        if not tx:
            continue
        if not parts:
            start_s = int(seg.get("s") or 0)
            start_t = seg.get("t")
        parts.append(tx)
        combined = " ".join(parts).strip()
        if _SENTENCE_END.search(combined) or len(combined) >= max_chars or len(parts) >= max_cues:
            flush()

    flush()
    return groups


def translate_segments(client: Groq, segments: List[dict], target_language: str, job_id: str = ""):
    """Translate the whole transcript with a SINGLE engine for consistent style.
    Tries Groq (LLM, higher quality) first; if Groq is rate-limited at any point,
    the entire transcript is re-translated with Google (partial Groq output is
    discarded) so the result never mixes two engines.
    Returns (segments, engine): 'groq', 'google', or 'none'."""
    lang = (target_language or "auto").lower()
    if lang in ("auto", "en"):
        return segments, "none"

    progress.set_stage(job_id, "translate", "Preparing translation")

    texts = [(seg.get("tx") or "").strip() for seg in segments]
    results: List[str] = list(texts)

    indices = [i for i, text in enumerate(texts) if text]

    def make_batches(size: int) -> List[List[int]]:
        step = max(1, int(size))
        return [indices[i:i + step] for i in range(0, len(indices), step)]

    batches = make_batches(config.TRANSLATION_BATCH_SIZE)
    workers = max(1, min(int(config.TRANSLATION_MAX_PARALLEL), max(1, len(batches))))
    google_batches = make_batches(getattr(config, "GOOGLE_TRANSLATE_BATCH_LINES", 200))
    google_workers = max(1, min(int(getattr(config, "GOOGLE_TRANSLATE_MAX_PARALLEL", 6)), max(1, len(google_batches))))
    prefer_google = bool(getattr(config, "TRANSLATION_PREFER_GOOGLE", True))

    def google_work(batch: List[int]):
        lines = [texts[i] for i in batch]
        return batch, _google_translate_lines(lines, lang)

    def _tick(done: int, total: int) -> None:
        if total > 0:
            progress.set_percent(job_id, done * 100.0 / total, f"Batch {done}/{total}")

    logger.info(
        "[translate] start: lang=%s segments=%d batches=%d workers=%d prefer_google=%s",
        lang, len(indices), len(google_batches if prefer_google else batches),
        google_workers if prefer_google else workers, prefer_google,
    )

    failed = 0
    if not indices:
        engine = "none"
    elif prefer_google:
        # Google primary: free, consistent, no token limits.
        engine = "google"
        done_batches = 0
        with ThreadPoolExecutor(max_workers=google_workers) as pool:
            for batch, g in pool.map(google_work, google_batches):
                done_batches += 1
                _tick(done_batches, len(google_batches))
                if g is not None:
                    for i, tx in zip(batch, g):
                        results[i] = tx or texts[i]
                else:
                    failed += len(batch)
        if failed == len(indices):
            # Google unreachable or blocked: rescue with Groq instead of
            # silently returning the original text.
            logger.warning("[translate] google failed for all %d lines; retrying with groq", failed)
            try:
                rescued: dict = {}

                def groq_rescue(batch: List[int]):
                    lines = [texts[i] for i in batch]
                    prev_context = texts[batch[0] - 1] if batch[0] > 0 else ""
                    return batch, _translate_batch(lines, prev_context, lang)

                with ThreadPoolExecutor(max_workers=workers) as pool:
                    for batch, out_lines in pool.map(groq_rescue, batches):
                        for i, tx in zip(batch, out_lines):
                            rescued[i] = tx or texts[i]
                if len(rescued) == len(indices):
                    for i, tx in rescued.items():
                        results[i] = tx
                    engine = "groq"
                    failed = 0
            except Exception:
                logger.exception("[translate] groq rescue failed; returning original text")
    else:
        # Groq primary with a circuit breaker: try Groq for the whole transcript;
        # the moment any batch hits a 429, stop and re-translate EVERYTHING with
        # Google so the output never mixes two engines.
        groq_blocked = {"flag": False}
        groq_results: dict = {}

        def groq_work(batch: List[int]):
            if groq_blocked["flag"]:
                return batch, None
            lines = [texts[i] for i in batch]
            prev_context = texts[batch[0] - 1] if batch[0] > 0 else ""
            try:
                return batch, _translate_batch(lines, prev_context, lang, max_attempts=1)
            except Exception as exc:
                if _is_rate_limit_error(exc):
                    groq_blocked["flag"] = True
                    logger.warning("[translate] groq rate-limited at batch starting %d: %s", batch[0], exc)
                else:
                    logger.warning("[translate] groq batch starting %d failed: %s", batch[0], exc)
                return batch, None

        done_batches = 0
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for batch, out in pool.map(groq_work, batches):
                done_batches += 1
                _tick(done_batches, len(batches))
                if out is not None:
                    for i, tx in zip(batch, out):
                        groq_results[i] = tx or texts[i]

        if len(groq_results) == len(indices):
            for i, tx in groq_results.items():
                results[i] = tx
            engine = "groq"
        else:
            logger.warning(
                "[translate] groq incomplete (%d/%d lines%s); re-translating everything with google",
                len(groq_results), len(indices), " — rate-limited" if groq_blocked["flag"] else "",
            )
            engine = "google"
            done_batches = 0
            with ThreadPoolExecutor(max_workers=google_workers) as pool:
                for batch, g in pool.map(google_work, google_batches):
                    done_batches += 1
                    _tick(done_batches, len(google_batches))
                    if g is not None:
                        for i, tx in zip(batch, g):
                            results[i] = tx or texts[i]
                    else:
                        failed += len(batch)

    translated: List[dict] = []
    for i, seg in enumerate(segments):
        tx = results[i] or seg.get("tx") or ""
        translated.append({"t": seg["t"], "s": seg["s"], "tx": tx})

    logger.info(
        "[translate] lang=%s engine=%s | segments=%d batches=%d failed=%d",
        lang, engine, len(indices), len(batches), failed,
    )
    return translated, engine


def translate_segments_with_retries(
    client: Groq,
    segments: List[dict],
    target_language: str,
    max_attempts: int = 3,
    job_id: str = "",
):
    last_exc: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            return translate_segments(client, segments, target_language, job_id=job_id)
        except Exception as exc:
            last_exc = exc
            if attempt >= max_attempts - 1 or not _is_rate_limit_error(exc):
                raise
            time.sleep(_backoff_seconds(exc, attempt))
    raise HTTPException(status_code=429, detail=f"Translation failed due to rate limiting: {last_exc}")
