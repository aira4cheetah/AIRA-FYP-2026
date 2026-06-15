import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from routes import analysis, file_upload, progress, settings, translate, tts, youtube

import os
import base64

# Automatically reconstruct the cookies file on the server at startup
encoded_cookies = os.getenv("YTDL_COOKIES_BASE64")
if encoded_cookies:
    try:
        decoded_bytes = base64.b64decode(encoded_cookies)
        with open("cookies.txt", "wb") as f:
            f.write(decoded_bytes)
        # Tell yt-dlp exactly where to find the generated file automatically
        os.environ["YT_DLP_COOKIES_FILE"] = "cookies.txt"
    except Exception as e:
        print(f"Cookie decoding failed: {e}")


logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

app = FastAPI(title=config.API_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(youtube.router)
app.include_router(file_upload.router)
app.include_router(analysis.router)
app.include_router(translate.router)
app.include_router(tts.router)
app.include_router(settings.router)
app.include_router(progress.router)


@app.get("/health")
def health():
    return {"ok": True, "service": config.API_TITLE}
