from fastapi import APIRouter, Query

from services import progress

router = APIRouter()


@router.get("/progress/{job_id}")
def get_progress(job_id: str, from_index: int = Query(0, alias="from")):
    return progress.snapshot(job_id, from_index)
