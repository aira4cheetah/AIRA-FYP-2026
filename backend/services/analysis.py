import hashlib
import json
import re
import time
from collections import Counter
from typing import List, Optional

from fastapi import HTTPException

import config
from models.transcript import ChapterSegmentInput
from services.groq_clients import analysis_client, summary_client
from utils.formatting import fmt


def _filter_for_keyword(transcript: str, keyword: str) -> str:
    kw = (keyword or "").strip().lower()
    if not kw:
        return transcript
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", transcript or "") if s.strip()]
    return " ".join(s for s in sentences if kw in s.lower())


def generate_summary(
    transcript: str,
    mode: str = "general",
    keyword: str = "",
    length: str = "medium",
    language: str = "en",
) -> str:
    normalized_mode = (mode or "general").strip().lower()
    normalized_length = (length or "medium").strip().lower()
    normalized_language = (language or "en").strip().lower()
    raw_text = (transcript or "").strip()

    if not raw_text:
        raise HTTPException(status_code=400, detail="Transcript is empty.")
    if normalized_mode not in {"general", "keyword"}:
        raise HTTPException(status_code=400, detail="Invalid summary mode. Use 'general' or 'keyword'.")
    if normalized_length not in {"short", "medium", "detailed"}:
        raise HTTPException(status_code=400, detail="Invalid summary length. Use 'short', 'medium', or 'detailed'.")
    if normalized_language not in {"en", "ur", "ar"}:
        raise HTTPException(status_code=400, detail="Invalid summary language. Use 'en', 'ur', or 'ar'.")

    target_words = {"short": 50, "medium": 150, "detailed": 300}[normalized_length]
    language_name = {"en": "English", "ur": "Urdu", "ar": "Arabic"}[normalized_language]

    text_for_model = raw_text
    prompt = f"Summarize this video transcript in around {target_words} words."
    normalized_keyword = (keyword or "").strip()

    if normalized_mode == "keyword":
        if not normalized_keyword:
            raise HTTPException(status_code=400, detail="Keyword is required for keyword summary.")
        filtered = _filter_for_keyword(raw_text, normalized_keyword)
        if not filtered:
            return f"No transcript lines found for keyword '{normalized_keyword}'."
        text_for_model = filtered
        prompt = (
            f"Summarize only the parts about '{normalized_keyword}' from this transcript "
            f"in around {target_words} words."
        )

    if len(text_for_model) > 28000:
        text_for_model = text_for_model[:28000]

    cache_key = (
        f"summary:{hashlib.sha256(text_for_model.encode('utf-8')).hexdigest()}:"
        f"{normalized_mode}:{normalized_keyword.lower()}:{normalized_length}:{normalized_language}"
    )
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        return cached["payload"]["summary"]

    client = summary_client()
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You summarize transcripts. Keep output factual and clear. "
                    f"Target approximately {target_words} words. "
                    f"Output language must be {language_name}. "
                    "Do not include bullet points."
                ),
            },
            {"role": "user", "content": f"{prompt}\n\nTranscript:\n{text_for_model}"},
        ],
        temperature=0.3,
        max_completion_tokens=520,
        top_p=1,
    )
    summary = (completion.choices[0].message.content or "").strip()
    if not summary:
        raise HTTPException(status_code=502, detail="Summary generation returned empty output.")
    words = summary.split()
    if len(words) > int(target_words * 1.5):
        summary = " ".join(words[: int(target_words * 1.5)])
    config.cache_put(cache_key, {"summary": summary})
    return summary


def detect_topics(transcript: str, max_topics: int = 6) -> List[str]:
    text = (transcript or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Transcript is empty.")

    limit = max(3, min(int(max_topics or 6), 12))
    text_for_model = text[:22000] if len(text) > 22000 else text
    cache_key = f"topics:{hashlib.sha256(text_for_model.encode('utf-8')).hexdigest()}:{limit}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        return cached["payload"]["topics"]

    client = analysis_client()
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "Extract concise topic tags from transcript text. Return ONLY a JSON array of short strings with no explanations.",
            },
            {
                "role": "user",
                "content": (
                    f"Find the top {limit} topics in this transcript. "
                    "Each topic should be 1-3 words.\n\n"
                    f"Transcript:\n{text_for_model}"
                ),
            },
        ],
        temperature=0.1,
        max_completion_tokens=220,
        top_p=1,
    )
    raw = (completion.choices[0].message.content or "").strip()
    topics: List[str] = []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            topics = [str(item).strip() for item in parsed if str(item).strip()]
    except Exception:
        tokens = re.split(r"[,|\n]+", raw)
        topics = [t.strip(" -•\t\r\"'") for t in tokens if t.strip(" -•\t\r\"'")]

    normalized: List[str] = []
    seen = set()
    for topic in topics:
        cleaned = re.sub(r"\s+", " ", topic).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned)
        if len(normalized) >= limit:
            break

    config.cache_put(cache_key, {"topics": normalized})
    return normalized


def detect_chapters(
    segments: List[ChapterSegmentInput],
    duration_seconds: Optional[int] = None,
    max_chapters: int = 6,
) -> List[dict]:
    clean_segments = [
        {"s": max(0, int(seg.s)), "tx": (seg.tx or "").strip()}
        for seg in segments
        if (seg.tx or "").strip()
    ]
    if not clean_segments:
        raise HTTPException(status_code=400, detail="Transcript segments are empty.")

    clean_segments.sort(key=lambda x: x["s"])
    max_items = max(40, min(len(clean_segments), 260))
    sampled = clean_segments[:max_items]
    transcript_for_model = "\n".join([f"[{fmt(item['s'])}] {item['tx']}" for item in sampled])

    chapter_limit = max(3, min(int(max_chapters or 6), 12))
    effective_duration = int(duration_seconds or clean_segments[-1]["s"] + 30)
    cache_key = (
        f"chapters:{hashlib.sha256(transcript_for_model.encode('utf-8')).hexdigest()}:"
        f"{chapter_limit}:{effective_duration}"
    )
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        return cached["payload"]["chapters"]

    client = analysis_client()
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You create chapter markers for transcripts. "
                    "Return ONLY a JSON array. Each item must be "
                    '{"start":"MM:SS","title":"short chapter title"}.'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Create up to {chapter_limit} chapter markers from this transcript.\n"
                    "Rules: chapter titles 2-5 words, start times in ascending order, no overlaps.\n\n"
                    f"Transcript:\n{transcript_for_model}"
                ),
            },
        ],
        temperature=0.1,
        max_completion_tokens=420,
        top_p=1,
    )
    raw = (completion.choices[0].message.content or "").strip()

    parsed_items: List[dict] = []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    parsed_items.append(item)
    except Exception:
        parsed_items = []

    starts: List[dict] = []
    for item in parsed_items:
        start_raw = str(item.get("start", "")).strip()
        title = re.sub(r"\s+", " ", str(item.get("title", "")).strip())
        if not title:
            continue
        m = re.match(r"^(\d{1,2}):(\d{2})$", start_raw)
        if not m:
            continue
        sec = int(m.group(1)) * 60 + int(m.group(2))
        if sec >= 0:
            starts.append({"start": sec, "title": title})

    if not starts:
        approx = max(3, min(chapter_limit, 6))
        step = max(60, int(effective_duration / approx))
        starts = [{"start": i * step, "title": f"Chapter {i+1}"} for i in range(approx)]

    starts = sorted(starts, key=lambda x: x["start"])
    deduped: List[dict] = []
    seen_starts: set = set()
    for row in starts:
        s = min(max(0, int(row["start"])), max(0, effective_duration - 1))
        if s in seen_starts:
            continue
        seen_starts.add(s)
        deduped.append({"start": s, "title": row["title"]})
        if len(deduped) >= chapter_limit:
            break

    chapters: List[dict] = []
    for idx, row in enumerate(deduped):
        start = row["start"]
        end = deduped[idx + 1]["start"] if idx + 1 < len(deduped) else effective_duration
        if end <= start:
            end = min(effective_duration, start + 60)
        chapters.append({
            "start": start,
            "end": end,
            "start_t": fmt(start),
            "end_t": fmt(end),
            "title": row["title"],
        })

    config.cache_put(cache_key, {"chapters": chapters})
    return chapters


def _tokenize(text: str) -> List[str]:
    t = re.sub(r"[^a-zA-Z0-9\s]", " ", (text or "").lower())
    return [w for w in t.split() if len(w) >= 3]


def answer_question(
    segments: List[ChapterSegmentInput],
    question: str,
    max_context: int = 12,
    history: Optional[List[dict]] = None,
) -> dict:
    q = (question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Question is empty.")

    clean = [
        {"s": max(0, int(seg.s)), "tx": (seg.tx or "").strip()}
        for seg in segments
        if (seg.tx or "").strip()
    ]
    if not clean:
        raise HTTPException(status_code=400, detail="Transcript segments are empty.")

    q_tokens = _tokenize(q)
    q_counts = Counter(q_tokens)
    scored = []
    for row in clean:
        tokens = _tokenize(row["tx"])
        if not tokens:
            continue
        counts = Counter(tokens)
        score = sum(wt * min(3, counts[tok]) for tok, wt in q_counts.items() if tok in counts)
        if score > 0:
            scored.append((score, row["s"], row["tx"]))

    scored.sort(key=lambda x: (-x[0], x[1]))
    k = max(6, min(int(max_context or 12), 24))
    top = scored[:k] if scored else [(0, r["s"], r["tx"]) for r in clean[:k]]

    context_lines = "\n".join([f"[{fmt(s)}] {tx}" for _, s, tx in top])
    history = history or []
    history_trimmed = history[-6:] if len(history) > 6 else history
    history_text = "\n".join([
        f"{'User' if m.get('role') == 'user' else 'Assistant'}: {str(m.get('content', '')).strip()}"
        for m in history_trimmed
        if str(m.get("content", "")).strip()
    ])

    cache_key = f"qa:{hashlib.sha256((q + '|' + context_lines + '|' + history_text).encode('utf-8')).hexdigest()}"
    now = time.time()
    cached = config.TRANSCRIPT_CACHE.get(cache_key)
    if cached and (now - cached["ts"]) < config.CACHE_TTL_SECONDS:
        return cached["payload"]

    client = analysis_client()
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You answer questions about a video using ONLY the provided transcript excerpts. "
                    "If unsure, say you cannot find it in the provided transcript. "
                    "Always include one best timestamp in the format 'Timestamp: MM:SS'. "
                    "Keep the answer concise (2-5 sentences)."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation so far (may be empty):\n{history_text}\n\n"
                    f"Question: {q}\n\nTranscript excerpts:\n{context_lines}"
                ),
            },
        ],
        temperature=0.2,
        max_completion_tokens=220,
        top_p=1,
    )
    answer = (completion.choices[0].message.content or "").strip()
    if not answer:
        raise HTTPException(status_code=502, detail="Q&A returned empty output.")

    m = re.search(r"Timestamp:\s*(\d{1,2}):(\d{2})", answer)
    ts_s = top[0][1] if top else 0
    if m:
        ts_s = int(m.group(1)) * 60 + int(m.group(2))

    evidence = [{"s": s, "t": fmt(s), "tx": tx} for _, s, tx in top[: min(6, len(top))]]
    payload = {"answer": answer, "timestamp_s": int(ts_s), "timestamp_t": fmt(ts_s), "evidence": evidence}
    config.cache_put(cache_key, payload)
    return payload
