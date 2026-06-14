from fastapi import APIRouter

from models.analysis import (
    ChapterRequest,
    ChapterResponse,
    QARequest,
    QAResponse,
    SummaryRequest,
    SummaryResponse,
    TopicRequest,
    TopicResponse,
)
from services.analysis import answer_question, detect_chapters, detect_topics, generate_summary

router = APIRouter()


@router.post("/summary", response_model=SummaryResponse)
def summarize_transcript(payload: SummaryRequest):
    normalized_length = (payload.length or "medium").lower()
    normalized_language = (payload.language or "en").lower()
    summary = generate_summary(
        payload.transcript, payload.mode, payload.keyword, normalized_length, normalized_language
    )
    return {
        "summary": summary,
        "mode": (payload.mode or "general").lower(),
        "keyword": payload.keyword or "",
        "length": normalized_length,
        "language": normalized_language,
    }


@router.post("/topics", response_model=TopicResponse)
def extract_topics(payload: TopicRequest):
    topics = detect_topics(payload.transcript, payload.max_topics)
    return {"topics": topics}


@router.post("/chapters", response_model=ChapterResponse)
def extract_chapters(payload: ChapterRequest):
    chapters = detect_chapters(payload.segments, payload.duration_seconds, payload.max_chapters)
    return {"chapters": chapters}


@router.post("/qa", response_model=QAResponse)
def qa_video(payload: QARequest):
    return answer_question(payload.segments, payload.question, payload.max_context, payload.history)
