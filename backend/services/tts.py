import io
import logging

logger = logging.getLogger(__name__)

# One neural voice per language (Microsoft Edge TTS). Generation is a single
# streamed websocket session — far faster and more reliable than gTTS, which
# issues one HTTP request per ~100 characters of text.
EDGE_VOICES = {
    "en": "en-US-AriaNeural",
    "ur": "ur-PK-UzmaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "fa": "fa-IR-DilaraNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "hi": "hi-IN-SwaraNeural",
    "tr": "tr-TR-EmelNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ja": "ja-JP-NanamiNeural",
    "pt": "pt-BR-FranciscaNeural",
    "ko": "ko-KR-SunHiNeural",
}


def tts_lang_code(code: str) -> str:
    c = (code or "en").strip().lower()
    if c == "zh":
        return "zh-CN"
    if c in {"pt", "pt-br"}:
        return "pt"
    return c


def edge_voice_for(language: str) -> str:
    base = (language or "en").strip().lower().split("-")[0]
    return EDGE_VOICES.get(base, "")


async def synthesize_edge(text: str, voice: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            buf.write(chunk["data"])
    data = buf.getvalue()
    if not data:
        raise RuntimeError("edge-tts returned no audio")
    return data


def synthesize_gtts(text: str, language: str) -> bytes:
    from gtts import gTTS

    tts = gTTS(text=text, lang=language, slow=False)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    data = buf.getvalue()
    if not data:
        raise RuntimeError("gTTS returned no audio")
    return data
