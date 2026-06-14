import os

from fastapi import HTTPException
from groq import Groq

import config


def _paid_key() -> str:
    # A single paid key, when set, is used for every Groq feature so the
    # per-feature free keys below become optional.
    return (os.getenv("GROQ_PAID_API_KEY") or "").strip()


def transcription_client() -> Groq:
    key = _paid_key() or os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")
    return Groq(api_key=key)


def summary_client() -> Groq:
    key = _paid_key() or os.getenv("GROQ_SUMMARY_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_SUMMARY_API_KEY is not configured.")
    return Groq(api_key=key)


def analysis_client() -> Groq:
    key = (_paid_key() or os.getenv("GROQ_ANALYSIS_API_KEY") or os.getenv("GROQ_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_ANALYSIS_API_KEY (or GROQ_API_KEY) is not configured.")
    return Groq(api_key=key)


def _translation_client_1() -> Groq:
    key = (os.getenv("GROQ_TRANSLATION_API_KEY_1") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_TRANSLATION_API_KEY_1 is not configured.")
    return Groq(api_key=key)


def _translation_client_2() -> Groq:
    key = (os.getenv("GROQ_TRANSLATION_API_KEY_2") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_TRANSLATION_API_KEY_2 is not configured.")
    return Groq(api_key=key)


def pick_translation_client() -> Groq:
    paid = _paid_key()
    if paid:
        return Groq(api_key=paid)
    with config.TRANSLATION_LOCK:
        config.TRANSLATION_TOGGLE += 1
        use_first = (config.TRANSLATION_TOGGLE % 2) == 1
    return _translation_client_1() if use_first else _translation_client_2()
