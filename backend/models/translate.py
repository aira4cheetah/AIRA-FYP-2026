from typing import List

from pydantic import BaseModel


class TranslationSegmentInput(BaseModel):
    t: str
    s: int
    tx: str
    src: str = ""


class TranslateRequest(BaseModel):
    segments: List[TranslationSegmentInput]
    target_language: str
    job: str = ""


class TranslateResponse(BaseModel):
    translated_text: str
    translated_segments: List[TranslationSegmentInput]
    engine: str = "groq"


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str = "neutral"  # neutral | male | female
