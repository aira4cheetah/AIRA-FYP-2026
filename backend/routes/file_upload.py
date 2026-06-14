from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.transcript import YouTubeTranscriptResponse
from services import progress
from services.transcription import transcribe_uploaded_media

router = APIRouter()

UPLOAD_STAGES = ["extract", "transcribe", "translate"]


@router.post("/file/transcript", response_model=YouTubeTranscriptResponse)
async def file_transcript(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    duration_seconds: Optional[float] = Form(None),
    job: str = Form(""),
):
    progress.start(job, UPLOAD_STAGES)
    try:
        data = await file.read()
        segments = transcribe_uploaded_media(
            file.filename or "upload.webm",
            data,
            language,
            duration_seconds,
            job_id=job,
        )
        progress.finish(job)
        return {"source": "groq_whisper", "language": language, "segments": segments}
    except HTTPException as exc:
        progress.fail(job, str(exc.detail))
        raise
    except Exception as exc:
        progress.fail(job, "Transcription failed")
        raise HTTPException(status_code=502, detail=f"Uploaded media transcription failed: {exc}") from exc
