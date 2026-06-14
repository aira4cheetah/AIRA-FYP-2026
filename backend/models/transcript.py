from typing import List

from pydantic import BaseModel


class TranscriptSegment(BaseModel):
    t: str
    s: int
    tx: str


class YouTubeTranscriptRequest(BaseModel):
    url: str
    language: str = "auto"
    job: str = ""


class YouTubeTranscriptResponse(BaseModel):
    source: str
    language: str
    segments: List[TranscriptSegment]


class ChapterSegmentInput(BaseModel):
    s: int
    tx: str
