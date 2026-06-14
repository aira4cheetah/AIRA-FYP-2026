from typing import List, Optional

from pydantic import BaseModel

from models.transcript import ChapterSegmentInput


class SummaryRequest(BaseModel):
    transcript: str
    mode: str = "general"
    keyword: str = ""
    length: str = "medium"
    language: str = "en"


class SummaryResponse(BaseModel):
    summary: str
    mode: str
    keyword: str
    length: str
    language: str


class TopicRequest(BaseModel):
    transcript: str
    max_topics: int = 6


class TopicResponse(BaseModel):
    topics: List[str]


class ChapterItem(BaseModel):
    start: int
    end: int
    start_t: str
    end_t: str
    title: str


class ChapterRequest(BaseModel):
    segments: List[ChapterSegmentInput]
    duration_seconds: Optional[int] = None
    max_chapters: int = 6


class ChapterResponse(BaseModel):
    chapters: List[ChapterItem]


class QARequest(BaseModel):
    segments: List[ChapterSegmentInput]
    question: str
    max_context: int = 12
    history: List[dict] = []


class QAResponse(BaseModel):
    answer: str
    timestamp_s: int
    timestamp_t: str
    evidence: List[dict]
