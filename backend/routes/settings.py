import logging
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config

router = APIRouter()
logger = logging.getLogger(__name__)


class TierRequest(BaseModel):
    tier: str


def _paid_key_configured() -> bool:
    return bool((os.getenv("GROQ_PAID_API_KEY") or "").strip())


def _settings_payload() -> dict:
    return {
        "tier": "paid" if config.IS_PAID_TIER else "free",
        "paid_key_configured": _paid_key_configured(),
        "upload_max_parallel": config.UPLOAD_MAX_PARALLEL,
        "translation_prefer_google": config.TRANSLATION_PREFER_GOOGLE,
        "tts_engine": config.TTS_ENGINE,
    }


@router.get("/settings")
def get_settings():
    return _settings_payload()


@router.post("/settings/tier")
def set_tier(payload: TierRequest):
    tier = (payload.tier or "").strip().lower()
    if tier not in ("free", "paid"):
        raise HTTPException(status_code=400, detail="Invalid tier. Use 'free' or 'paid'.")
    if tier == "paid" and not _paid_key_configured():
        raise HTTPException(
            status_code=400,
            detail="No paid key configured. Add GROQ_PAID_API_KEY to backend/.env first.",
        )
    config.apply_tier(tier)
    logger.info("[settings] tier switched to %s", tier)
    return _settings_payload()
