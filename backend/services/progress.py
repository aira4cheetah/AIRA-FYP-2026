import threading
import time
from typing import List, Optional

_LOCK = threading.Lock()
_JOBS: dict = {}
_TTL_SECONDS = 1800
_MAX_JOBS = 64


def _evict_locked() -> None:
    now = time.time()
    dead = [k for k, v in _JOBS.items() if now - v["updated"] > _TTL_SECONDS]
    for k in dead:
        _JOBS.pop(k, None)
    overflow = len(_JOBS) - _MAX_JOBS
    if overflow > 0:
        for k in sorted(_JOBS, key=lambda k: _JOBS[k]["updated"])[:overflow]:
            _JOBS.pop(k, None)


def start(job_id: str, stages: List[str]) -> None:
    if not job_id:
        return
    with _LOCK:
        _evict_locked()
        _JOBS[job_id] = {
            "status": "running",
            "stages": list(stages),
            "stage": stages[0] if stages else "",
            "percent": 0.0,
            "detail": "",
            "chunks_done": 0,
            "chunks_total": 0,
            "partial": [],
            "updated": time.time(),
        }


def _job(job_id: str) -> Optional[dict]:
    return _JOBS.get(job_id) if job_id else None


def set_stage(job_id: str, stage: str, detail: str = "") -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["stage"] = stage
        job["percent"] = 0.0
        job["detail"] = detail
        job["updated"] = time.time()


def set_percent(job_id: str, percent: float, detail: Optional[str] = None) -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["percent"] = max(0.0, min(100.0, float(percent)))
        if detail is not None:
            job["detail"] = detail
        job["updated"] = time.time()


def set_chunks(job_id: str, done: int, total: int) -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["chunks_done"] = int(done)
        job["chunks_total"] = int(total)
        if total > 0:
            job["percent"] = max(0.0, min(100.0, done * 100.0 / total))
            job["detail"] = f"Chunk {done}/{total}"
        job["updated"] = time.time()


def chunk_done(job_id: str, partial_segments: Optional[List[dict]] = None) -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["chunks_done"] += 1
        total = job["chunks_total"]
        if total > 0:
            job["percent"] = max(0.0, min(100.0, job["chunks_done"] * 100.0 / total))
            job["detail"] = f"Chunk {job['chunks_done']}/{total}"
        if partial_segments:
            job["partial"].extend(partial_segments)
        job["updated"] = time.time()


def add_partial(job_id: str, segments: List[dict]) -> None:
    with _LOCK:
        job = _job(job_id)
        if not job or not segments:
            return
        job["partial"].extend(segments)
        job["updated"] = time.time()


def finish(job_id: str, detail: str = "") -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["status"] = "done"
        job["percent"] = 100.0
        if detail:
            job["detail"] = detail
        job["updated"] = time.time()


def fail(job_id: str, detail: str = "") -> None:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return
        job["status"] = "error"
        if detail:
            job["detail"] = detail
        job["updated"] = time.time()


def snapshot(job_id: str, from_index: int = 0) -> dict:
    with _LOCK:
        job = _job(job_id)
        if not job:
            return {"status": "unknown"}
        start_at = max(0, int(from_index))
        return {
            "status": job["status"],
            "stages": list(job["stages"]),
            "stage": job["stage"],
            "percent": job["percent"],
            "detail": job["detail"],
            "chunks_done": job["chunks_done"],
            "chunks_total": job["chunks_total"],
            "partial": job["partial"][start_at:],
            "partial_total": len(job["partial"]),
        }
