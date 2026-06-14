import html
import re
from typing import List


def fmt(seconds: float) -> str:
    value = max(0, int(seconds))
    return f"{value // 60}:{value % 60:02d}"


def to_seconds(raw: str) -> float:
    parts = raw.split(":")
    if len(parts) != 3:
        return 0.0
    try:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2].replace(",", "."))
    except ValueError:
        return 0.0


def _clean_cue_line(raw: str) -> str:
    stripped = re.sub(r"<[^>]*>", "", raw)
    stripped = html.unescape(stripped)
    return re.sub(r"\s+", " ", stripped).strip()


def parse_vtt(vtt: str) -> List[dict]:
    lines = vtt.splitlines()
    raw_cues: List[tuple] = []
    i = 0
    while i < len(lines):
        line = (lines[i] or "").strip()
        if "-->" in line:
            start_raw = line.split(" --> ")[0].strip()
            sec = int(to_seconds(start_raw))
            i += 1
            while i < len(lines):
                cue = (lines[i] or "").strip()
                if not cue or "-->" in cue:
                    break
                cleaned = _clean_cue_line(cue)
                if cleaned:
                    raw_cues.append((sec, cleaned))
                i += 1
            continue
        i += 1

    segments: List[dict] = []
    prev = ""
    for sec, text in raw_cues:
        if not text or text == prev:
            continue
        if prev and text.startswith(prev + " "):
            if segments:
                segments[-1]["tx"] = text
            prev = text
            continue
        if prev and prev.startswith(text + " "):
            continue
        segments.append({"t": fmt(sec), "s": sec, "tx": text})
        prev = text
    return segments
