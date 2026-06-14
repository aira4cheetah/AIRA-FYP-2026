/* eslint-disable no-empty, no-unused-vars, no-useless-assignment, no-misleading-character-class */
/*
 * SpeechFindr — App page logic.
 *
 * This is a near-verbatim port of the original project.html <script>. It runs
 * against the DOM that AppPage.jsx renders (same element IDs, classes and
 * data-attributes), so behaviour is identical to the static page.
 *
 * Differences from the original, all behaviour-preserving:
 *  - Wrapped in a factory so each mount gets fresh state (React StrictMode safe).
 *  - The custom-cursor block lives in <CustomCursor/> instead of here.
 *  - Listeners that the original attached imperatively (url input, tgtLang
 *    change, drag & drop) are exposed as handlers and wired from JSX.
 *  - genAudio() selects the generate button via [data-genaudio] instead of the
 *    old [onclick="genAudio()"] attribute selector.
 *  - jumpTo is published on window so the innerHTML-built search rows can call it.
 */
export default function createAppLogic() {
  let TRANSCRIPT = []
  let CAPTIONS = null
  let CURRENT_FILE = null
  let TOPICS = []
  let CHAPTERS = []
  let LAST_QA_TS = 0
  let videoDuration = 0
  let durationReady = false
  let timestampMode = 'full'
  let SOURCE_LANG = 'auto'
  const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || 'http://127.0.0.1:8001'
  let TRANSCRIPT_SOURCE = 'none'
  let ACTIVE_RUN_ID = 0
  let LAST_TRANSLATION = null
  let PROC_POLL = null
  let CURRENT_JOB = ''
  let PARTIAL_SEGS = []
  let PARTIAL_FROM = 0
  const STAGE_META = {
    analyze: ['🔍', 'Analyze', 'Fetching video info', 'Reading metadata'],
    captions: ['💬', 'Captions', 'Checking captions', 'Looking for existing subtitles'],
    download: ['⬇️', 'Download', 'Downloading audio', 'Grabbing the audio stream'],
    extract: ['🎞️', 'Extract', 'Extracting audio', 'Reading your file'],
    transcribe: ['🎙️', 'Transcribe', 'Transcribing speech', 'Whisper AI is listening'],
    translate: ['🌐', 'Translate', 'Translating transcript', 'Converting to your language'],
  }
  const TRANS = {
    ur: 'مشین لرننگ مصنوعی ذہانت کی ایک شاخ ہے جو سسٹمز کو خود بخود سیکھنے کی صلاحیت دیتی ہے۔ نیورل نیٹ ورکس انسانی دماغ کے حیاتیاتی نیورل نیٹ ورکس سے متاثر ہیں۔ گہری سیکھ میں پیچیدہ نمونوں کی شناخت کے لیے بہت سی پوشیدہ تہوں والے نیورل نیٹ ورکس شامل ہیں۔',
    ar: 'التعلم الآلي هو فرع من فروع الذكاء الاصطناعي الذي يمكّن الأنظمة من التعلم تلقائياً. الشبكات العصبية مستوحاة من الشبكات العصبية البيولوجية في الدماغ البشري.',
    fr: "L'apprentissage automatique est une branche de l'IA qui permet aux systèmes d'apprendre automatiquement. Les réseaux de neurones s'inspirent des réseaux neuronaux biologiques du cerveau humain.",
    de: 'Maschinelles Lernen ist ein Teilbereich der KI, der es Systemen ermöglicht, automatisch zu lernen. Neuronale Netze sind inspiriert von den biologischen neuronalen Netzen im menschlichen Gehirn.',
    es: 'El aprendizaje automático es una rama de la IA que permite a los sistemas aprender automáticamente. Las redes neuronales se inspiran en las redes neuronales biológicas del cerebro humano.',
    zh: '机器学习是人工智能的一个分支，使系统能够自动学习。神经网络受到人类大脑中生物神经网络的启发。',
    hi: 'मशीन लर्निंग आर्टिफिशियल इंटेलिजेंस की एक शाखा है जो सिस्टम को स्वचालित रूप से सीखने में सक्षम बनाती है।',
    tr: 'Makine öğrenmesi, sistemlerin otomatik olarak öğrenmesini sağlayan yapay zekanın bir dalıdır.',
    ru: 'Машинное обучение — раздел ИИ, позволяющий системам учиться автоматически. Нейронные сети вдохновлены биологическими нейронными сетями мозга.',
    ja: '機械学習は、システムが自動的に学習できるようにする人工知能の一分野です。',
    pt: 'O aprendizado de máquina é um ramo da IA que permite que os sistemas aprendam automaticamente.',
    ko: '머신 러닝은 시스템이 자동으로 학습할 수 있게 하는 인공 지능의 한 분야입니다.',
  }
  const SUMMARY = {
    g: 'This video provides a comprehensive overview of machine learning fundamentals — covering neural networks, deep learning architectures, supervised learning, backpropagation, gradient descent, NLP, and the future of AI research.',
    k: 'Based on your search, the video focuses on neural networks extensively — discussing their biological inspiration, layered architecture, training via backpropagation, and specialized forms like CNNs and RNNs.',
  }

  let ready = false, playing = false, aInterval = null, aProgress = 0, sumMode = 'g'
  let SUMMARY_RENDER_TOKEN = 0
  let sumLengthMode = 'medium'
  let sumLanguageMode = 'en'
  let TOPIC_RENDER_TOKEN = 0
  let CHAPTER_RENDER_TOKEN = 0
  let QA_RENDER_TOKEN = 0
  let QA_CHAT = []
  let AUDIO = null
  let AUDIO_URL = null
  let PREVIEW_URL = null
  let AUDIO_UI_TICK = null
  let AUDIO_SYNC_SOURCE_SEGMENTS = []
  let AUDIO_SYNC_SEGMENTS = []
  let AUDIO_SYNC_TIMELINE = []
  let AUDIO_ACTIVE_TS = null
  let AUDIO_FOLLOW_SYNC = true

  function buildTranscript(duration, mode = 'full', captions = null) {
    if (duration <= 0) return []
    if (captions && captions.length > 0) return captions
    return []
  }

  function parseVtt(vtt) {
    const lines = vtt.split('\n')
    const captions = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line === 'WEBVTT' || /^\d+$/.test(line)) continue
      if (line.includes('-->')) {
        const times = line.split(' --> ')
        if (times.length !== 2) continue
        const start = timeToSec(times[0].trim())
        const cueLines = []
        let j = i + 1
        while (j < lines.length) {
          const cueLine = (lines[j] || '').trim()
          if (!cueLine) break
          if (!cueLine.includes('NOTE')) cueLines.push(cueLine)
          j++
        }
        i = j
        const text = cueLines.join(' ').replace(/<[^>]*>/g, '').trim()
        if (text) {
          captions.push({ t: fmt(start), s: start, tx: text })
        }
      }
    }
    return captions
  }

  async function tryCaptionUrl(url) {
    const resp = await fetchTextWithTimeout(url, 12000)
    if (!resp.ok) return null
    const vtt = await resp.text()
    const parsed = parseVtt(vtt)
    return parsed.length ? parsed : null
  }

  async function fetchYouTubeTranscript(videoId, wantedLang = 'auto') {
    try {
      const lang = (wantedLang || 'auto').toLowerCase()
      const candidates = []
      if (lang !== 'auto') {
        candidates.push(
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=vtt`,
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&kind=asr&fmt=vtt`
        )
      }
      candidates.push(
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=vtt`,
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=vtt`
      )
      for (const url of candidates) {
        const found = await tryCaptionUrl(url)
        if (found) return found
      }
      return null
    } catch (e) {
      console.log('Caption fetch failed:', e.message)
      return null
    }
  }

  async function fetchTextWithTimeout(url, timeoutMs = 12000) {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      return await fetch(url, { signal: ctrl.signal })
    } finally {
      clearTimeout(to)
    }
  }

  async function fetchTranscriptFromBackend(url, wantedLang = 'auto') {
    try {
      const qs = new URLSearchParams({
        url,
        language: wantedLang || 'auto',
        job: CURRENT_JOB || '',
      })
      const resp = await fetch(`${API_BASE}/youtube/transcript?${qs.toString()}`)
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        console.log('Backend transcript HTTP error:', resp.status, errBody)
        return null
      }
      const data = await resp.json()
      const segments = Array.isArray(data.segments) ? data.segments : []
      return {
        source: data.source || 'backend',
        segments: segments.map((s) => ({
          t: s.t || fmt(s.s || 0),
          s: Number.isFinite(s.s) ? s.s : 0,
          tx: s.tx || '',
        })).filter((s) => s.tx),
      }
    } catch (e) {
      console.log('Backend transcript failed:', e.message)
      return null
    }
  }

  async function fetchUploadedTranscriptFromBackend(file, wantedLang = 'auto') {
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('language', wantedLang || 'auto')
      if (videoDuration > 0) fd.append('duration_seconds', String(videoDuration))
      if (CURRENT_JOB) fd.append('job', CURRENT_JOB)
      const resp = await fetch(`${API_BASE}/file/transcript`, {
        method: 'POST',
        body: fd,
      })
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        console.log('Backend upload transcript HTTP error:', resp.status, errBody)
        let detail = 'Upload transcription failed.'
        try {
          const parsed = JSON.parse(errBody)
          detail = parsed.detail || detail
        } catch (e) {
          if (errBody) detail = errBody
        }
        return { error: detail, source: 'unavailable', segments: [] }
      }
      const data = await resp.json()
      const segments = Array.isArray(data.segments) ? data.segments : []
      return {
        source: data.source || 'groq_whisper',
        segments: segments.map((s) => ({
          t: s.t || fmt(s.s || 0),
          s: Number.isFinite(s.s) ? s.s : 0,
          tx: s.tx || '',
        })).filter((s) => s.tx),
      }
    } catch (e) {
      console.log('Backend upload transcript failed:', e.message)
      return { error: e.message || 'Upload transcription failed.', source: 'unavailable', segments: [] }
    }
  }

  async function fetchSummaryFromBackend(mode, keyword = '') {
    try {
      if (!Array.isArray(TRANSCRIPT) || !TRANSCRIPT.length) {
        return { error: 'Transcript is empty. Process video first.' }
      }
      const transcriptText = TRANSCRIPT.map((s) => s.tx || '').filter(Boolean).join(' ')
      const resp = await fetch(`${API_BASE}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          mode,
          keyword: keyword || '',
          length: sumLengthMode,
          language: sumLanguageMode,
        }),
      })
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        let detail = 'Summary generation failed.'
        try {
          const parsed = JSON.parse(errBody)
          detail = parsed.detail || detail
        } catch (e) {
          if (errBody) detail = errBody
        }
        return { error: detail }
      }
      const data = await resp.json()
      return { summary: (data.summary || '').trim() }
    } catch (e) {
      return { error: e.message || 'Summary generation failed.' }
    }
  }

  async function fetchTopicsFromBackend(maxTopics = 6) {
    try {
      if (!Array.isArray(TRANSCRIPT) || !TRANSCRIPT.length) {
        return { error: 'Transcript is empty. Process video first.' }
      }
      const transcriptText = TRANSCRIPT.map((s) => s.tx || '').filter(Boolean).join(' ')
      const resp = await fetch(`${API_BASE}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          max_topics: maxTopics,
        }),
      })
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        let detail = 'Topic detection failed.'
        try {
          const parsed = JSON.parse(errBody)
          detail = parsed.detail || detail
        } catch (e) {
          if (errBody) detail = errBody
        }
        return { error: detail }
      }
      const data = await resp.json()
      const topics = Array.isArray(data.topics) ? data.topics : []
      return { topics: topics.filter(Boolean).slice(0, 12) }
    } catch (e) {
      return { error: e.message || 'Topic detection failed.' }
    }
  }

  async function fetchChaptersFromBackend(maxChapters = 6) {
    try {
      if (!Array.isArray(TRANSCRIPT) || !TRANSCRIPT.length) {
        return { error: 'Transcript is empty. Process video first.' }
      }
      const payloadSegments = TRANSCRIPT
        .map((s) => ({ s: Number.isFinite(s.s) ? s.s : 0, tx: s.tx || '' }))
        .filter((s) => s.tx)
      const resp = await fetch(`${API_BASE}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: payloadSegments,
          duration_seconds: getVideoDurationEstimate(),
          max_chapters: maxChapters,
        }),
      })
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        let detail = 'Chapter detection failed.'
        try {
          const parsed = JSON.parse(errBody)
          detail = parsed.detail || detail
        } catch (e) {
          if (errBody) detail = errBody
        }
        return { error: detail }
      }
      const data = await resp.json()
      const chapters = Array.isArray(data.chapters) ? data.chapters : []
      return { chapters: chapters.filter((c) => Number.isFinite(c.start) && c.title).slice(0, 12) }
    } catch (e) {
      return { error: e.message || 'Chapter detection failed.' }
    }
  }

  async function fetchQaFromBackend(question) {
    try {
      if (!Array.isArray(TRANSCRIPT) || !TRANSCRIPT.length) {
        return { error: 'Transcript is empty. Process video first.' }
      }
      const segs = TRANSCRIPT
        .map((s) => ({ s: Number.isFinite(s.s) ? s.s : 0, tx: s.tx || '' }))
        .filter((s) => s.tx)
      const maxSend = 420
      const sampled = segs.length <= maxSend ? segs : segs.filter((_, i) => i % (Math.ceil(segs.length / maxSend)) === 0)
      const resp = await fetch(`${API_BASE}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: sampled,
          question: String(question || ''),
          max_context: 12,
          history: QA_CHAT.slice(-6),
        }),
      })
      if (!resp.ok) {
        let errBody = ''
        try { errBody = await resp.text() } catch (e) {}
        let detail = 'Q&A failed.'
        try {
          const parsed = JSON.parse(errBody)
          detail = parsed.detail || detail
        } catch (e) {
          if (errBody) detail = errBody
        }
        return { error: detail }
      }
      const data = await resp.json()
      return {
        answer: (data.answer || '').trim(),
        timestamp_s: Number.isFinite(data.timestamp_s) ? data.timestamp_s : 0,
        timestamp_t: (data.timestamp_t || fmt(Number.isFinite(data.timestamp_s) ? data.timestamp_s : 0)),
        evidence: Array.isArray(data.evidence) ? data.evidence : [],
      }
    } catch (e) {
      return { error: e.message || 'Q&A failed.' }
    }
  }

  async function animateQaText(el, text, token) {
    const full = String(text || '').trim()
    el.textContent = ''
    const step = Math.max(2, Math.ceil(full.length / 260))
    for (let i = 0; i < full.length; i += step) {
      if (token !== QA_RENDER_TOKEN) return
      el.textContent = full.slice(0, i + step)
      await new Promise((r) => setTimeout(r, 12))
    }
    if (token === QA_RENDER_TOKEN) el.textContent = full
  }

  function renderQaChat() {
    const chat = document.getElementById('qaChat')
    chat.innerHTML = ''
    if (!QA_CHAT.length) {
      chat.textContent = ready ? 'Ask a question above to get an answer with timestamp.' : 'Process a video first to ask questions…'
      return
    }
    QA_CHAT.slice(-10).forEach((m) => {
      const div = document.createElement('div')
      div.className = 'qa-msg ' + (m.role === 'user' ? 'user' : 'bot')
      div.textContent = m.content
      chat.appendChild(div)
    })
  }

  function renderQaEvidence(evidence) {
    const wrap = document.getElementById('qaEvidence')
    const meta = document.getElementById('qaMeta')
    wrap.innerHTML = ''
    const rows = (Array.isArray(evidence) ? evidence : []).filter((r) => r && r.tx)
    if (!rows.length) {
      meta.style.display = 'none'
      return
    }
    meta.style.display = 'block'
    rows.slice(0, 6).forEach((r) => {
      const el = document.createElement('div')
      el.className = 'qa-ev'
      const s = Number.isFinite(r.s) ? r.s : 0
      const t = r.t || fmt(s)
      el.onclick = () => jumpTo(s)
      el.innerHTML = `<span class="t">${t}</span><span class="tx">${esc(String(r.tx))}</span>`
      wrap.appendChild(el)
    })
  }

  function askVideo() {
    if (!ready) { toast('err', '⚠️ Process a video first'); return }
    const q = document.getElementById('qaInp').value.trim()
    if (!q) { toast('err', '⚠️ Type a question first'); return }
    const jumpBtn = document.getElementById('qaJump')
    QA_RENDER_TOKEN++
    const token = QA_RENDER_TOKEN
    jumpBtn.style.display = 'none'
    QA_CHAT.push({ role: 'user', content: q })
    renderQaChat()
    renderQaEvidence([])
    const chat = document.getElementById('qaChat')
    const thinking = document.createElement('div')
    thinking.className = 'qa-msg bot'
    thinking.style.color = 'var(--dim)'
    thinking.textContent = 'Thinking...'
    chat.appendChild(thinking)
    fetchQaFromBackend(q).then(async (res) => {
      if (token !== QA_RENDER_TOKEN) return
      if (res?.answer) {
        LAST_QA_TS = res.timestamp_s || 0
        const answerText = res.answer
        QA_CHAT.push({ role: 'assistant', content: answerText })
        thinking.textContent = ''
        await animateQaText(thinking, answerText, token)
        if (token !== QA_RENDER_TOKEN) return
        thinking.style.color = 'var(--muted)'
        renderQaEvidence(res.evidence || [])
        if (Number.isFinite(LAST_QA_TS) && LAST_QA_TS > 0) {
          jumpBtn.textContent = `Jump · ${res.timestamp_t || fmt(LAST_QA_TS)}`
          jumpBtn.style.display = 'inline-block'
        }
        toast('ok', '✅ Answer ready')
      } else {
        thinking.textContent = 'Could not answer right now.'
        thinking.style.color = 'var(--muted)'
        toast('err', '❌ ' + String(res?.error || 'Q&A failed.').slice(0, 180))
      }
    })
  }

  function renderTopicTags(topics) {
    const list = document.getElementById('topicList')
    const meta = document.getElementById('topicMeta')
    list.innerHTML = ''
    const clean = (Array.isArray(topics) ? topics : []).filter(Boolean)
    if (!clean.length) {
      meta.textContent = 'No topics found yet.'
      return
    }
    clean.forEach((topic) => {
      const chip = document.createElement('span')
      chip.className = 'topic-chip'
      chip.textContent = '🏷️ ' + topic
      list.appendChild(chip)
    })
    meta.textContent = `${clean.length} topic${clean.length !== 1 ? 's' : ''} detected`
  }

  function renderChapterList(chapters) {
    const list = document.getElementById('chapterList')
    const meta = document.getElementById('chapterMeta')
    list.innerHTML = ''
    const rows = (Array.isArray(chapters) ? chapters : []).filter((c) => Number.isFinite(c.start) && c.title)
    if (!rows.length) {
      meta.textContent = 'No chapters found yet.'
      return
    }
    rows.forEach((ch) => {
      const item = document.createElement('div')
      item.className = 'chapter-item'
      item.onclick = () => jumpTo(ch.start)
      const startTxt = ch.start_t || fmt(ch.start || 0)
      const endTxt = ch.end_t || fmt(ch.end || 0)
      item.innerHTML = `<span class="chapter-time">${startTxt} - ${endTxt}</span><span class="chapter-title">${esc(ch.title || 'Chapter')}</span>`
      list.appendChild(item)
    })
    meta.textContent = `${rows.length} chapter${rows.length !== 1 ? 's' : ''} detected`
  }

  async function autoDetectTopics(runId) {
    TOPIC_RENDER_TOKEN++
    const token = TOPIC_RENDER_TOKEN
    const meta = document.getElementById('topicMeta')
    meta.textContent = 'Detecting topics...'
    const result = await fetchTopicsFromBackend(6)
    if (runId !== ACTIVE_RUN_ID || token !== TOPIC_RENDER_TOKEN) return
    if (result?.topics?.length) {
      TOPICS = result.topics
      renderTopicTags(TOPICS)
    } else {
      TOPICS = []
      renderTopicTags([])
    }
  }

  async function autoDetectChapters(runId) {
    CHAPTER_RENDER_TOKEN++
    const token = CHAPTER_RENDER_TOKEN
    const meta = document.getElementById('chapterMeta')
    meta.textContent = 'Detecting chapters...'
    const result = await fetchChaptersFromBackend(6)
    if (runId !== ACTIVE_RUN_ID || token !== CHAPTER_RENDER_TOKEN) return
    if (result?.chapters?.length) {
      CHAPTERS = result.chapters
      renderChapterList(CHAPTERS)
    } else {
      CHAPTERS = []
      renderChapterList([])
    }
  }

  function timeToSec(timeStr) {
    const parts = timeStr.split(':')
    if (parts.length !== 3) return 0
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
  }
  function getVideoDurationEstimate() {
    if (videoDuration > 0) return videoDuration
    if (Array.isArray(TRANSCRIPT) && TRANSCRIPT.length) {
      const last = TRANSCRIPT[TRANSCRIPT.length - 1]
      const lastS = Number.isFinite(last?.s) ? last.s : 0
      if (lastS > 0) return Math.ceil(lastS + 5)
    }
    return /youtube/.test(document.getElementById('urlInp').value) ? 7200 : 1800
  }

  function finalizeTranscriptRun(runId) {
    if (runId !== ACTIVE_RUN_ID) return
    SUMMARY_RENDER_TOKEN++
    TOPIC_RENDER_TOKEN++
    CHAPTER_RENDER_TOKEN++
    QA_RENDER_TOKEN++
    TRANSCRIPT = buildTranscript(getVideoDurationEstimate(), timestampMode, CAPTIONS)
    document.getElementById('txCount').textContent = TRANSCRIPT.length + ' segments'
    setTranscriptSourceLabel(TRANSCRIPT_SOURCE || 'none')
    renderSourceLanguageDetection()
    document.getElementById('inputMeta').textContent = 'Loaded'
    document.getElementById('appBadge').innerHTML = '<div class="dot"></div>Done'
    document.getElementById('stProc').textContent = 'Processed ✓'
    document.getElementById('sumTxt').textContent = 'Click "Generate Summary" to create AI summary.'
    if (TRANSCRIPT.length) {
      document.getElementById('txPh').style.display = 'none'
      document.getElementById('srchWrap').style.display = 'block'
      document.getElementById('tsResults').style.display = 'block'
      document.getElementById('txList').innerHTML = ''
      renderTx(TRANSCRIPT, '')
      autoDetectTopics(runId)
      autoDetectChapters(runId)
      QA_CHAT = []
      renderQaChat()
      renderQaEvidence([])
      document.getElementById('qaJump').style.display = 'none'
    } else {
      document.getElementById('srchWrap').style.display = 'none'
      document.getElementById('tsResults').style.display = 'none'
      document.getElementById('txList').style.display = 'none'
      document.getElementById('txPh').style.display = 'flex'
      document.getElementById('txPh').innerHTML = '<div class="ico">⚠️</div><p>Couldn\'t get a transcript for this video.<br>It may have no captions, be private/age-restricted, or be too long to transcribe in time.<br>Try another video, or upload the file directly.</p>'
      TOPICS = []
      renderTopicTags([])
      CHAPTERS = []
      renderChapterList([])
      QA_CHAT = []
      renderQaChat()
      renderQaEvidence([])
      document.getElementById('qaJump').style.display = 'none'
    }
  }

  function finalizeTranscriptWith(runId, segments, source) {
    if (runId !== ACTIVE_RUN_ID) return
    CAPTIONS = (segments && segments.length) ? segments : null
    TRANSCRIPT_SOURCE = source || 'none'
  }

  function setTranscriptSourceLabel(source) {
    const label = document.getElementById('txSource')
    if (!label) return
    const map = {
      youtube_captions: '📺 YouTube captions',
      groq_whisper: '🤖 AI transcription',
      backend: '🤖 AI transcription',
    }
    const text = map[String(source || '').toLowerCase()]
    if (text) {
      label.textContent = text
      label.style.display = ''
    } else {
      label.textContent = ''
      label.style.display = 'none'
    }
  }

  function setTranslationEngineLabel(engine) {
    const el = document.getElementById('transEngine')
    if (!el) return
    const map = {
      groq: '🤖 Groq AI',
      google: '🌐 Google Translate',
      mixed: '🤖 Groq + 🌐 Google',
    }
    const text = map[String(engine || '').toLowerCase()]
    if (text) {
      el.textContent = text
      el.style.display = ''
    } else {
      el.textContent = ''
      el.style.display = 'none'
    }
  }

  function setTimeBadge(elId, seconds) {
    const el = document.getElementById(elId)
    if (!el) return
    if (seconds == null || !isFinite(seconds)) {
      el.textContent = ''
      el.style.display = 'none'
      return
    }
    const label = seconds >= 60
      ? `⏱ ${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
      : `⏱ ${seconds.toFixed(1)}s`
    el.textContent = label
    el.style.display = ''
  }

  function setTranslationTimeLabel(seconds) {
    setTimeBadge('transTime', seconds)
  }

  function setAudioTimeLabel(seconds) {
    setTimeBadge('audioTime', seconds)
  }

  function detectSourceLanguageCode(text) {
    const t = String(text || '')
    if (!t.trim()) return 'auto'

    const hasArabic = /[؀-ۿݐ-ݿ]/.test(t)
    if (hasArabic) {
      if (/[پچگںٹڈڑےؤئژٖ]+/.test(t) || /آ/.test(t)) return 'ur'
      return 'ar'
    }
    if (/[ऀ-ॿ]/.test(t)) return 'hi'
    if (/[一-鿿]/.test(t)) return 'zh'
    if (/[぀-ヿ]/.test(t)) return 'ja'
    if (/[가-힯]/.test(t)) return 'ko'
    if (/[Ѐ-ӿ]/.test(t)) return 'ru'
    if (/[A-Za-z]/.test(t)) return 'en'
    return 'auto'
  }

  function renderSourceLanguageDetection() {
    const labelEl = document.getElementById('srcDetectLabel')
    if (!labelEl) return
    const text = (Array.isArray(TRANSCRIPT) ? TRANSCRIPT.map((s) => (s && s.tx ? s.tx : '')).join(' ') : '')
    const code = detectSourceLanguageCode(text)
    const labels = {
      en: 'English',
      ur: 'Urdu',
      ar: 'Arabic',
      zh: 'Chinese',
      hi: 'Hindi',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      tr: 'Turkish',
      pt: 'Portuguese',
      ru: 'Russian',
      ja: 'Japanese',
      ko: 'Korean',
    }
    const label = labels[code] || 'Unknown'
    labelEl.textContent = `Detected: ${label}`
  }

  function isRtlLang(code) {
    const c = String(code || '').toLowerCase()
    return c === 'ur' || c === 'ar' || c === 'fa'
  }

  function applyTranslationDirectionAndFont(lang) {
    const box = document.getElementById('transBox')
    if (!box) return
    const rtl = isRtlLang(lang)
    box.classList.remove('rtl', 'font-ar', 'font-ur')
    if (rtl) {
      box.classList.add('rtl')
      if (String(lang).toLowerCase() === 'ur') {
        box.classList.add('font-ur')
      } else {
        box.classList.add('font-ar')
      }
    }
  }

  function renderTranslationSideBySide(originalSegs, translatedSegs, lang) {
    const box = document.getElementById('transBox')
    if (!box) return
    applyTranslationDirectionAndFont(lang)
    const rtl = isRtlLang(lang)
    box.style.direction = 'ltr'
    box.innerHTML = ''

    const sideWrap = document.createElement('div')
    sideWrap.className = 'trans-side'

    const head = document.createElement('div')
    head.className = 'trans-side-head'
    const tsHead = document.createElement('div')
    tsHead.className = 'h trans-side-ts'
    tsHead.textContent = 'Time'
    const origHead = document.createElement('div')
    origHead.className = 'h trans-side-ts'
    origHead.textContent = 'Original'
    const transHead = document.createElement('div')
    transHead.className = 'h trans-side-ts'
    transHead.textContent = 'Translated'
    head.appendChild(tsHead)
    head.appendChild(origHead)
    head.appendChild(transHead)
    sideWrap.appendChild(head)

    const maxRender = 5000
    const renderCount = Math.min(translatedSegs.length, maxRender, originalSegs.length || translatedSegs.length)
    for (let i = 0; i < renderCount; i++) {
      const tr = translatedSegs[i]
      const or = originalSegs[i] || null

      const row = document.createElement('div')
      row.className = 'trans-side-row'

      const ts = document.createElement('div')
      ts.className = 'trans-side-ts'
      ts.textContent = tr?.t || (Number.isFinite(tr?.s) ? fmt(tr.s) : '')

      const left = document.createElement('div')
      left.className = 'trans-side-text'
      left.style.direction = 'ltr'
      left.style.textAlign = 'left'
      left.textContent = or?.tx || ''

      const right = document.createElement('div')
      right.className = 'trans-side-text translated'
      right.style.direction = rtl ? 'rtl' : 'ltr'
      right.style.textAlign = rtl ? 'right' : 'left'
      right.textContent = tr?.tx || ''

      row.appendChild(ts)
      row.appendChild(left)
      row.appendChild(right)
      sideWrap.appendChild(row)
    }

    if (translatedSegs.length > renderCount) {
      const warn = document.createElement('div')
      warn.className = 'topic-muted'
      warn.style.marginTop = '8px'
      warn.textContent = `Showing ${renderCount} / ${translatedSegs.length} lines for performance.`
      sideWrap.appendChild(warn)
    }
    box.appendChild(sideWrap)
  }

  function setFileDuration(file) {
    CURRENT_FILE = file
    const vid = document.getElementById('fileVid')
    vid.src = URL.createObjectURL(file)
    vid.onloadedmetadata = () => {
      videoDuration = Math.floor(vid.duration)
      durationReady = true
      document.getElementById('procBtn').disabled = false
      toast('ok', `⏱ Duration detected: ${fmt(videoDuration)}`)
      URL.revokeObjectURL(vid.src)
      if (ready) {
        TRANSCRIPT = buildTranscript(videoDuration, timestampMode, CAPTIONS)
        renderTx(TRANSCRIPT, document.getElementById('srchInp').value.trim())
        document.getElementById('txCount').textContent = TRANSCRIPT.length + ' segments'
      }
    }
  }

  async function animateSummaryText(el, text, token) {
    const full = String(text || '').trim()
    if (!full) {
      el.textContent = ''
      return
    }
    el.textContent = ''
    const step = Math.max(2, Math.ceil(full.length / 220))
    for (let i = 0; i < full.length; i += step) {
      if (token !== SUMMARY_RENDER_TOKEN) return
      el.textContent = full.slice(0, i + step)
      await new Promise((r) => setTimeout(r, 14))
    }
    if (token === SUMMARY_RENDER_TOKEN) el.textContent = full
  }

  function resetProcButtonState() {
    const proc = document.getElementById('procState')
    if (proc && proc.classList.contains('show')) return
    const btn = document.getElementById('procBtn')
    if (!btn) return
    if (btn.innerHTML.includes('Processed')) {
      btn.innerHTML = 'Process video'
      btn.style.background = ''
    }
  }
  function onUrlInput(el) {
    document.getElementById('urlX').style.display = el.value ? 'block' : 'none'
    document.getElementById('urlBox').style.borderColor = ''
    resetProcButtonState()
    if (el.value) {
      document.getElementById('procBtn').disabled = false
      document.getElementById('fileInp').value = ''
      document.getElementById('dz').innerHTML = '<span class="dz-icon">＋</span><span>Click or drag &amp; drop a file</span><small>MP4 · MKV · AVI · MP3 · WAV — up to 500MB</small>'
      document.getElementById('dz').style.borderColor = ''
      videoDuration = 0
      durationReady = false
    }
  }
  function clearUrl() {
    document.getElementById('urlInp').value = ''
    document.getElementById('urlX').style.display = 'none'
    resetProcButtonState()
  }
  function onFile(inp) {
    if (inp.files[0]) {
      const f = inp.files[0]
      resetProcButtonState()
      document.getElementById('dz').innerHTML = `<span class="dz-icon ok">✓</span><span>${f.name}</span><small>${(f.size / 1024 / 1024).toFixed(1)} MB</small>`
      document.getElementById('dz').style.borderColor = 'rgba(59,130,246,0.4)'
      document.getElementById('urlInp').value = ''
      document.getElementById('urlX').style.display = 'none'
      toast('ok', '📁 File loaded: ' + f.name)
      durationReady = false
      videoDuration = 0
      document.getElementById('procBtn').disabled = true
      setFileDuration(f)
    }
  }

  function setVideoPlaceholder() {
    if (PREVIEW_URL) { try { URL.revokeObjectURL(PREVIEW_URL) } catch (e) {} PREVIEW_URL = null }
    const vc = document.getElementById('vc')
    vc.innerHTML = `<div class="vc-ph" id="vcPh"><div class="play-orb">▶</div><p>Paste a URL or upload a<br>video to start</p></div><iframe id="ytFrame" allowfullscreen allow="autoplay; encrypted-media" style="display:none"></iframe>`
  }

  function ensurePlayerShell() {
    const vc = document.getElementById('vc')
    if (!vc) return
    const hasPlaceholder = !!document.getElementById('vcPh')
    const hasFrame = !!document.getElementById('ytFrame')
    if (!hasPlaceholder || !hasFrame) {
      setVideoPlaceholder()
    }
  }

  function startProc() {
    const runId = ++ACTIVE_RUN_ID
    const url = document.getElementById('urlInp').value.trim()
    const file = document.getElementById('fileInp').files.length
    if (!url && !file) {
      toast('err', '⚠️ Please enter a YouTube URL or upload a file')
      document.getElementById('urlBox').style.borderColor = 'rgba(239,68,68,0.4)'
      setTimeout(() => document.getElementById('urlBox').style.borderColor = '', 2000)
      return
    }
    if (file && !durationReady) {
      toast('err', '⏳ Please wait for the uploaded video duration to finish loading')
      return
    }
    const isYouTubeInput = url && (url.includes('youtube') || url.includes('youtu.be'))
    if (isYouTubeInput && !ytId(url)) {
      toast('err', '⚠️ Invalid YouTube URL. Please paste a full valid video link.')
      document.getElementById('urlBox').style.borderColor = 'rgba(239,68,68,0.4)'
      setTimeout(() => document.getElementById('urlBox').style.borderColor = '', 2200)
      return
    }
    document.getElementById('procBtn').disabled = true
    document.getElementById('procBtn').textContent = 'Processing…'
    document.getElementById('procBtn').style.background = ''
    document.getElementById('txPh').style.display = 'none'
    document.getElementById('procState').classList.add('show')
    document.getElementById('srchWrap').style.display = 'none'
    document.getElementById('tsResults').style.display = 'none'
    document.getElementById('txList').style.display = 'none'
    document.getElementById('appBadge').innerHTML = '<div class="dot"></div>Processing'
    document.getElementById('stProc').textContent = 'Processing...'
    CAPTIONS = null
    TRANSCRIPT = []
    TRANSCRIPT_SOURCE = 'none'
    TOPICS = []
    CHAPTERS = []
    LAST_TRANSLATION = null
    AUDIO_SYNC_SOURCE_SEGMENTS = []
    AUDIO_SYNC_SEGMENTS = []
    AUDIO_SYNC_TIMELINE = []
    clearAudioTranscriptHighlight()
    const transBoxReset = document.getElementById('transBox')
    if (transBoxReset) {
      transBoxReset.classList.remove('rtl', 'font-ar', 'font-ur')
      transBoxReset.style.direction = 'ltr'
      transBoxReset.innerHTML = ''
      transBoxReset.textContent = 'Translation appears here after processing...'
    }
    setTranslationEngineLabel(null)
    setTranslationTimeLabel(null)
    setAudioTimeLabel(null)
    const dlBtnReset = document.getElementById('downloadAudioBtn')
    if (dlBtnReset) dlBtnReset.style.display = 'none'
    ready = false

    // Fully reset audio playback so the previous clip never carries over.
    SUMMARY_RENDER_TOKEN++
    QA_RENDER_TOKEN++
    initAudio()
    try { AUDIO.pause() } catch (e) {}
    playing = false
    if (AUDIO_UI_TICK) { cancelAnimationFrame(AUDIO_UI_TICK); AUDIO_UI_TICK = null }
    if (AUDIO_URL) { try { URL.revokeObjectURL(AUDIO_URL) } catch (e) {} AUDIO_URL = null }
    if (AUDIO) AUDIO.src = ''
    document.getElementById('playBtn').textContent = '▶'
    document.getElementById('aFill').style.width = '0%'
    document.getElementById('aCur').textContent = '0:00'
    document.getElementById('aDur').textContent = '0:00'
    const audioStatusReset = document.getElementById('audioStatus')
    if (audioStatusReset) audioStatusReset.style.display = 'none'

    // Reset the AI summary and Q&A panels for the new run.
    document.getElementById('sumTxt').textContent = 'Process a video first to generate a summary...'
    QA_CHAT = []
    renderQaChat()
    renderQaEvidence([])
    document.getElementById('qaInp').value = ''
    document.getElementById('qaJump').style.display = 'none'

    document.getElementById('txList').innerHTML = ''
    document.getElementById('txCount').textContent = '—'
    document.getElementById('topicMeta').textContent = 'Topics appear after processing transcript'
    document.getElementById('topicList').innerHTML = ''
    document.getElementById('chapterMeta').textContent = 'Chapters appear after processing transcript'
    document.getElementById('chapterList').innerHTML = ''
    setTranscriptSourceLabel('processing')
    setTranscriptSourceLabel('fetching')

    try {
      const isFile = file > 0
      SOURCE_LANG = 'auto'
      ensurePlayerShell()
      if (isFile) {
        const ph = document.getElementById('vcPh')
        if (ph) ph.style.display = 'none'
        const preview = document.getElementById('ytFrame')
        if (preview) preview.style.display = 'none'
        const vc = document.getElementById('vc')
        if (CURRENT_FILE) {
          if (PREVIEW_URL) { try { URL.revokeObjectURL(PREVIEW_URL) } catch (e) {} }
          PREVIEW_URL = URL.createObjectURL(CURRENT_FILE)
          vc.innerHTML = `<video id="fileVidPreview" style="width:100%;height:100%;object-fit:contain;background:#000;border-radius:12px" controls><source src="${PREVIEW_URL}" type="${CURRENT_FILE.type}"></video>`
        }
        const f = document.getElementById('fileInp').files[0]
        document.getElementById('vidMeta').textContent = f.name + ' (' + fmt(videoDuration) + ')'
      } else if (url && (url.includes('youtube') || url.includes('youtu.be'))) {
        const id = ytId(url)
        if (id) {
          ensurePlayerShell()
          const ph = document.getElementById('vcPh')
          if (ph) ph.style.display = 'none'
          const frame = document.getElementById('ytFrame')
          if (frame) {
            frame.src = `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
            frame.style.display = 'block'
          }
          document.getElementById('vidMeta').textContent = 'YouTube Video'
        }
      }
    } catch (e) {
      console.log('Player setup failed:', e.message)
      document.getElementById('txPh').style.display = 'flex'
      document.getElementById('procState').classList.remove('show')
      document.getElementById('procBtn').disabled = false
      document.getElementById('procBtn').textContent = 'Process video'
      toast('warn', '⚠️ Player preview failed, transcript remains available.')
    }

    document.getElementById('procTxt').textContent = 'Preparing transcript...'
    document.getElementById('procSub').textContent = 'Connecting to source'
    document.getElementById('progFill').style.width = '4%'
    const stepsReset = document.getElementById('procSteps')
    if (stepsReset) stepsReset.innerHTML = ''
    const pctReset = document.getElementById('procPct')
    if (pctReset) pctReset.textContent = ''
    CURRENT_JOB = newJobId()
    startProgressPolling(CURRENT_JOB, runId)
    setTimeout(() => doneProc(runId), 0)
  }

  function ytId(rawUrl) {
    const urlText = (rawUrl || '').trim()
    if (!urlText) return null
    try {
      const u = new URL(urlText)
      const host = u.hostname.replace(/^www\./, '')

      if (host === 'youtu.be') {
        const shortId = u.pathname.split('/').filter(Boolean)[0]
        return /^[a-zA-Z0-9_-]{11}$/.test(shortId || '') ? shortId : null
      }

      if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        const v = u.searchParams.get('v')
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
        const parts = u.pathname.split('/').filter(Boolean)
        const keyIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live')
        if (keyIdx !== -1 && parts[keyIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[keyIdx + 1])) {
          return parts[keyIdx + 1]
        }
      }
    } catch (e) {
      // Fallback regex below for loosely pasted text.
    }
    const m = urlText.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
  }

  async function doneProc(runId) {
    if (runId !== ACTIVE_RUN_ID) return
    ready = true
    document.getElementById('procTxt').textContent = 'Fetching transcript...'
    document.getElementById('procSub').textContent = 'Transcribing speech with AI — this can take a moment'
    document.getElementById('progFill').style.width = '8%'

    const url = document.getElementById('urlInp').value.trim()
    CAPTIONS = null
    TRANSCRIPT_SOURCE = 'none'

    try {
      if (url && (url.includes('youtube') || url.includes('youtu.be'))) {
        toast('info', '🎙️ Fetching real transcript...')
        const backendResult = await fetchTranscriptFromBackend(url, SOURCE_LANG)
        if (runId !== ACTIVE_RUN_ID) return
        if (backendResult?.segments?.length) {
          finalizeTranscriptWith(runId, backendResult.segments, backendResult.source || 'backend')
          toast('ok', backendResult.source === 'youtube_captions' ? '✅ YouTube captions loaded' : '✅ Transcript loaded')
        } else {
          CAPTIONS = null
          TRANSCRIPT_SOURCE = 'none'
          toast('err', '❌ No transcript available for this video.')
        }
      } else if (CURRENT_FILE) {
        toast('info', '🎙️ Generating transcript with Groq...')
        const backendResult = await fetchUploadedTranscriptFromBackend(CURRENT_FILE, SOURCE_LANG)
        if (runId !== ACTIVE_RUN_ID) return
        if (backendResult?.segments?.length) {
          finalizeTranscriptWith(runId, backendResult.segments, backendResult.source || 'groq_whisper')
          toast('ok', '✅ Uploaded file transcribed with Groq')
        } else {
          CAPTIONS = null
          TRANSCRIPT_SOURCE = 'none'
          toast('err', '❌ ' + String(backendResult?.error || 'Transcription failed.').slice(0, 180))
        }
      }
    } catch (e) {
      console.log('Transcript pipeline error:', e.message)
      TRANSCRIPT_SOURCE = 'none'
      CAPTIONS = null
      toast('err', '❌ Could not fetch real transcript.')
    } finally {
      if (runId === ACTIVE_RUN_ID) stopProgressPolling()
      finalizeTranscriptRun(runId)
      if (runId === ACTIVE_RUN_ID) {
        document.getElementById('procState').classList.remove('show')
        document.getElementById('procBtn').disabled = false
        document.getElementById('progFill').style.width = '100%'
        if (Array.isArray(TRANSCRIPT) && TRANSCRIPT.length) {
          document.getElementById('procBtn').innerHTML = '✓ Processed'
          document.getElementById('procBtn').style.background = 'linear-gradient(135deg,#16A34A,#15803D)'
        } else {
          document.getElementById('procBtn').innerHTML = 'Process video'
          document.getElementById('procBtn').style.background = ''
        }
      }
    }
  }

  function setTimestampMode(mode) {
    timestampMode = mode
    if (ready) {
      TRANSCRIPT = CAPTIONS && CAPTIONS.length ? CAPTIONS : []
      document.getElementById('txCount').textContent = TRANSCRIPT.length + ' segments'
      if (TRANSCRIPT.length) {
        renderTx(TRANSCRIPT, document.getElementById('srchInp').value.trim())
        toast('ok', mode === 'full' ? '✅ Unlimited timestamps enabled' : '✅ Compact timestamps enabled')
      } else {
        document.getElementById('txList').style.display = 'none'
        document.getElementById('txPh').style.display = 'flex'
      }
    }
  }

  function renderTx(data, kw) {
    const c = document.getElementById('txList')
    c.innerHTML = ''
    data.forEach((l) => {
      const d = document.createElement('div')
      d.className = 'tx-line'
      d.dataset.s = String(Number.isFinite(l.s) ? l.s : 0)
      d.onclick = () => jumpTo(l.s)
      let tx = esc(l.tx)
      if (kw) { const re = new RegExp('(' + escRe(kw) + ')', 'gi'); tx = tx.replace(re, '<mark>$1</mark>'); if (re.test(l.tx)) d.classList.add('hi') }
      d.innerHTML = `<span class="tx-ts">${l.t}</span><span class="tx-txt">${tx}</span>`
      c.appendChild(d)
    })
    c.style.display = 'flex'
  }

  function clearAudioTranscriptHighlight() {
    document.querySelectorAll('.tx-line.audio-now').forEach((el) => el.classList.remove('audio-now'))
    AUDIO_ACTIVE_TS = null
  }

  function highlightTranscriptByTimestamp(ts) {
    if (!Number.isFinite(ts)) return
    if (AUDIO_ACTIVE_TS === ts) return
    const list = document.getElementById('txList')
    if (!list || list.style.display === 'none') return
    const target = list.querySelector(`.tx-line[data-s="${ts}"]`)
    if (!target) return
    clearAudioTranscriptHighlight()
    target.classList.add('audio-now')
    AUDIO_ACTIVE_TS = ts
    if (AUDIO_FOLLOW_SYNC) {
      scrollLineWithinList(list, target)
    }
  }

  // Scroll ONLY the transcript box, never the whole page. The old
  // target.scrollIntoView() bubbled up to the window and dragged the user's
  // viewport (and felt "stuck") whenever the audio advanced a line.
  function scrollLineWithinList(list, target) {
    const lr = list.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    const delta = (tr.top - lr.top) - (list.clientHeight / 2) + (target.clientHeight / 2)
    if (Math.abs(delta) < 4) return
    list.scrollTo({ top: list.scrollTop + delta, behavior: 'smooth' })
  }

  function toggleFollowSync() {
    AUDIO_FOLLOW_SYNC = !AUDIO_FOLLOW_SYNC
    const btn = document.getElementById('followSyncBtn')
    if (!btn) return
    btn.classList.toggle('on', AUDIO_FOLLOW_SYNC)
    btn.textContent = AUDIO_FOLLOW_SYNC ? 'ON' : 'OFF'
  }

  function _audioSegmentWeight(seg) {
    const text = String(seg?.translated_tx || seg?.tx || '').trim()
    if (!text) return 1
    const letters = (text.match(/[\p{L}\p{N}]/gu) || []).length
    const spaces = (text.match(/\s/g) || []).length
    const punct = (text.match(/[.,!?;:،۔]/g) || []).length
    return Math.max(1, letters + (spaces * 0.35) + (punct * 2.2))
  }

  function buildAudioSyncTimeline(durationSec) {
    const segs = Array.isArray(AUDIO_SYNC_SEGMENTS) ? AUDIO_SYNC_SEGMENTS : []
    AUDIO_SYNC_TIMELINE = []
    if (!segs.length || !Number.isFinite(durationSec) || durationSec <= 0) return

    const weights = segs.map(_audioSegmentWeight)
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
    let cursor = 0
    for (let i = 0; i < segs.length; i++) {
      const span = Math.max(0.07, (weights[i] / totalWeight) * durationSec)
      const start = cursor
      const end = (i === segs.length - 1) ? durationSec : (cursor + span)
      AUDIO_SYNC_TIMELINE.push({
        start,
        end,
        s: Number.isFinite(segs[i]?.s) ? segs[i].s : 0,
      })
      cursor = end
    }
  }

  function syncTranscriptWithAudio(currentSec, durationSec) {
    if (!Number.isFinite(currentSec) || !Number.isFinite(durationSec) || durationSec <= 0) return
    if (AUDIO_SYNC_TIMELINE.length) {
      let activeTs = AUDIO_SYNC_TIMELINE[0].s
      for (let i = 0; i < AUDIO_SYNC_TIMELINE.length; i++) {
        const row = AUDIO_SYNC_TIMELINE[i]
        if (currentSec >= row.start && currentSec <= row.end) {
          activeTs = row.s
          break
        }
        if (currentSec > row.end) activeTs = row.s
      }
      highlightTranscriptByTimestamp(activeTs)
      return
    }

    const segs = Array.isArray(AUDIO_SYNC_SOURCE_SEGMENTS) ? AUDIO_SYNC_SOURCE_SEGMENTS : []
    if (segs.length) {
      const lastTs = Math.max(1, Number.isFinite(segs[segs.length - 1]?.s) ? segs[segs.length - 1].s : 1)
      const pseudoTime = (currentSec / durationSec) * lastTs
      let activeTs = Number.isFinite(segs[0]?.s) ? segs[0].s : 0
      for (let i = 0; i < segs.length; i++) {
        const s = Number.isFinite(segs[i]?.s) ? segs[i].s : 0
        if (s <= pseudoTime) activeTs = s
        else break
      }
      highlightTranscriptByTimestamp(activeTs)
    }
  }

  function doSearch(kw) {
    document.getElementById('srchX').style.display = kw ? 'block' : 'none'
    if (!ready) return
    if (!kw.trim()) {
      renderTx(TRANSCRIPT, '')
      document.getElementById('tsList').style.display = 'none'
      document.getElementById('tsEmpty').style.display = 'block'
      document.getElementById('tsCount').textContent = '0 results'
      return
    }
    const hits = TRANSCRIPT.filter((l) => l.tx.toLowerCase().includes(kw.toLowerCase()))
    renderTx(TRANSCRIPT, kw)
    const list = document.getElementById('tsList'), empty = document.getElementById('tsEmpty')
    if (hits.length) {
      list.innerHTML = hits.map((l) => {
        const h = esc(l.tx).replace(new RegExp('(' + escRe(kw) + ')', 'gi'), '<mark>$1</mark>')
        return `<div class="ts-item" onclick="jumpTo(${l.s})"><span class="jump-t">${l.t}</span><span class="jump-c">${h}</span><span class="jump-arr">↗</span></div>`
      }).join('')
      list.style.display = 'flex'; empty.style.display = 'none'
      document.getElementById('tsCount').textContent = hits.length + ' result' + (hits.length !== 1 ? 's' : '')
    } else {
      list.style.display = 'none'; empty.style.display = 'block'
      empty.textContent = `No results for "${kw}"`
      document.getElementById('tsCount').textContent = '0 results'
    }
  }

  function clearSearch() {
    document.getElementById('srchInp').value = ''
    document.getElementById('srchX').style.display = 'none'
    if (ready) { renderTx(TRANSCRIPT, ''); document.getElementById('tsList').style.display = 'none'; document.getElementById('tsEmpty').style.display = 'block'; document.getElementById('tsEmpty').textContent = 'Search a keyword above to see results here'; document.getElementById('tsCount').textContent = '0 results' }
  }

  // The translated TTS clip and the original video are separate players.
  // Pause one before starting the other so they never play over each other.
  function pauseTranslatedAudio() {
    if (AUDIO && !AUDIO.paused) {
      try { AUDIO.pause() } catch (e) {}
    }
    playing = false
    if (AUDIO_UI_TICK) { cancelAnimationFrame(AUDIO_UI_TICK); AUDIO_UI_TICK = null }
    const playBtn = document.getElementById('playBtn')
    if (playBtn) playBtn.textContent = '▶'
  }

  function pauseOriginalVideo() {
    const vid = document.getElementById('fileVidPreview')
    if (vid && !vid.paused) {
      try { vid.pause() } catch (e) {}
    }
    const fr = document.getElementById('ytFrame')
    if (fr && fr.style.display !== 'none' && fr.contentWindow) {
      try {
        fr.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*')
      } catch (e) {}
    }
  }

  function jumpTo(sec) {
    // Clicking a timestamp means "watch the original here" — stop the translated audio.
    pauseTranslatedAudio()
    const fr = document.getElementById('ytFrame')
    if (fr && fr.style.display !== 'none') {
      const base = fr.src.split('?')[0]
      fr.src = base + `?start=${sec}&autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
    } else {
      const vid = document.getElementById('fileVidPreview')
      if (vid) {
        vid.currentTime = sec
        vid.play()
      }
    }
    toast('ok', '⏱ Jumping to ' + fmt(sec))
    const lines = document.querySelectorAll('.tx-line')
    TRANSCRIPT.forEach((l, i) => { if (l.s === sec && lines[i]) { lines[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); lines[i].style.background = 'rgba(59,130,246,0.1)'; setTimeout(() => { if (lines[i]) lines[i].style.background = '' }, 1400) } })
  }

  async function doTranslate() {
    if (!ready) { toast('err', '⚠️ Process a video first'); return }
    const lang = document.getElementById('tgtLang').value
    const box = document.getElementById('transBox')
    const btn = document.getElementById('transBtn')
    box.style.color = 'var(--dim)'
    box.innerHTML = inlineLoaderHTML('Translating…', 'Sending transcript to the translator')
    setTranslationEngineLabel(null)
    setTranslationTimeLabel(null)
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Translating…'
    }

    applyTranslationDirectionAndFont(lang)
    box.style.direction = 'ltr'
    box.style.fontStyle = 'normal'

    const startedAt = performance.now()
    const tJob = newJobId()
    const transPoll = setInterval(async () => {
      try {
        const presp = await fetchTextWithTimeout(`${API_BASE}/progress/${tJob}`, 3000)
        if (!presp.ok) return
        const p = await presp.json()
        if (p.status === 'unknown' || !p.detail) return
        const sub = box.querySelector('.box-loader small')
        if (sub) sub.textContent = p.detail + (Number.isFinite(p.percent) && p.percent > 0 && p.percent < 100 ? ` — ${Math.round(p.percent)}%` : '')
      } catch (e) {}
    }, 800)
    try {
      const resp = await fetch(`${API_BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: (TRANSCRIPT || []).filter((s) => s && s.tx).map((s) => ({ t: s.t, s: s.s, tx: s.tx })),
          target_language: lang,
          job: tJob,
        }),
      })
      if (!resp.ok) {
        let detail = 'Translation failed.'
        try {
          const err = await resp.json()
          detail = err?.detail || err?.message || detail
        } catch (e) {
          // ignore json parse error
        }
        throw new Error(detail)
      }
      const data = await resp.json()
      const segs = Array.isArray(data?.translated_segments) ? data.translated_segments : []
      const grouped = segs.some((s) => s && typeof s.src === 'string' && s.src.length > 0)
      const cueSegments = (TRANSCRIPT || []).filter((s) => s && s.tx).map((s) => ({ t: s.t, s: s.s, tx: s.tx }))
      const originalSegments = grouped
        ? segs.map((s) => ({ t: s.t, s: s.s, tx: s.src || '' }))
        : cueSegments

      if (segs.length) {
        LAST_TRANSLATION = { lang, translated_segments: segs, original_segments: originalSegments, cue_segments: cueSegments }
        renderTranslationSideBySide(originalSegments, segs, lang)
      } else {
        const text = String(data?.translated_text || '').trim()
        box.textContent = text || 'Translation unavailable.'
      }
      box.style.color = 'var(--muted)'
      setTranslationEngineLabel(data?.engine)
      setTranslationTimeLabel((performance.now() - startedAt) / 1000)
      toast('ok', '🌍 Translated!')
    } catch (e) {
      box.textContent = 'Could not translate right now.'
      box.style.color = 'var(--muted)'
      setTranslationEngineLabel(null)
      setTranslationTimeLabel(null)
      toast('err', '❌ ' + String(e?.message || e).slice(0, 180))
    } finally {
      clearInterval(transPoll)
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Translate'
      }
    }
  }

  function genAudio() {
    if (!ready) { toast('err', '⚠️ Process a video first'); return }
    if (!LAST_TRANSLATION || !LAST_TRANSLATION.translated_segments || !LAST_TRANSLATION.translated_segments.length) {
      toast('err', '⚠️ Translate first, then generate audio')
      return
    }
    initAudio()

    const lang = (LAST_TRANSLATION.lang || document.getElementById('tgtLang').value || 'en')
    const text = LAST_TRANSLATION.translated_segments.map((s) => (s && s.tx ? s.tx : '')).filter(Boolean).join(' ')
    const syncCues = ((LAST_TRANSLATION?.cue_segments && LAST_TRANSLATION.cue_segments.length)
      ? LAST_TRANSLATION.cue_segments
      : (LAST_TRANSLATION?.original_segments || []))
      .filter((s) => s && Number.isFinite(s.s))
      .map((s) => ({ s: s.s, t: s.t || fmt(s.s), tx: s.tx || '' }))
      .sort((a, b) => a.s - b.s)
    AUDIO_SYNC_SOURCE_SEGMENTS = syncCues
    AUDIO_SYNC_SEGMENTS = syncCues.map((s) => ({ s: s.s, t: s.t, tx: s.tx, translated_tx: '' }))
    AUDIO_SYNC_TIMELINE = []
    if (!text.trim()) {
      toast('err', '⚠️ No translated text found')
      return
    }

    const btns = document.querySelectorAll('[data-genaudio]')
    const dlBtn = document.getElementById('downloadAudioBtn')
    const aStatus = document.getElementById('audioStatus')
    if (dlBtn) dlBtn.style.display = 'none'
    if (aStatus) aStatus.style.display = 'flex'
    setAudioTimeLabel(null)
    btns.forEach((b) => { try { b.disabled = true; b.textContent = 'Generating…' } catch (e) {} })
    document.getElementById('aCur').textContent = '0:00'
    document.getElementById('aDur').textContent = '0:00'
    document.getElementById('aFill').style.width = '0%'

    const audioStartedAt = performance.now()
    fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
    }).then(async (resp) => {
      if (!resp.ok) {
        let detail = 'Audio generation failed.'
        try {
          const err = await resp.json()
          detail = err?.detail || err?.message || detail
        } catch (e) {}
        throw new Error(detail)
      }
      return await resp.blob()
    }).then((blob) => {
      if (AUDIO_URL) URL.revokeObjectURL(AUDIO_URL)
      AUDIO_URL = URL.createObjectURL(blob)
      AUDIO.src = AUDIO_URL
      AUDIO.currentTime = 0
      if (dlBtn) dlBtn.style.display = 'block'
      clearAudioTranscriptHighlight()
      if (AUDIO_SYNC_SOURCE_SEGMENTS.length) {
        highlightTranscriptByTimestamp(AUDIO_SYNC_SOURCE_SEGMENTS[0].s)
      }
      const onBtn = document.querySelector('.spd-btn.on')
      const spdText = (onBtn?.textContent || '1×').replace('×', '')
      const spd = parseFloat(spdText) || 1
      AUDIO.playbackRate = spd
      setAudioTimeLabel((performance.now() - audioStartedAt) / 1000)
      toast('ok', '🎙 Audio ready — press play!')
    }).catch((e) => {
      setAudioTimeLabel(null)
      toast('err', '❌ ' + String(e?.message || e).slice(0, 180))
    }).finally(() => {
      if (aStatus) aStatus.style.display = 'none'
      btns.forEach((b) => { try { b.disabled = false; b.textContent = 'Generate audio' } catch (e) {} })
    })
  }

  function downloadAudio() {
    if (!AUDIO_URL) {
      toast('err', '⚠️ Generate audio first')
      return
    }
    const lang = (LAST_TRANSLATION?.lang || document.getElementById('tgtLang')?.value || 'audio').toLowerCase()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `speechfindr-${lang}-${stamp}.mp3`
    const a = document.createElement('a')
    a.href = AUDIO_URL
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const PDF_PRINT_CSS = `
    @page { margin: 2cm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; line-height: 1.6; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 18px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .row { display: flex; gap: 10px; padding: 3px 0; font-size: 12.5px; page-break-inside: avoid; }
    .row .t { color: #2563eb; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .row .tx { flex: 1; }
    .rtl { direction: rtl; text-align: right; }
    .rtl .row { flex-direction: row-reverse; }
    .qa { page-break-inside: avoid; margin-bottom: 16px; }
    .qa .q { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .qa .q::before { content: "Q: "; color: #2563eb; }
    .qa .a { font-size: 12.5px; white-space: pre-wrap; }
    .qa .a::before { content: "A: "; color: #059669; font-weight: 700; }
  `
  const PDF_LANG_NAMES = { ur: 'Urdu', ar: 'Arabic', fa: 'Persian', fr: 'French', de: 'German', es: 'Spanish', zh: 'Chinese', hi: 'Hindi', tr: 'Turkish', ru: 'Russian', ja: 'Japanese', pt: 'Portuguese', ko: 'Korean', en: 'English' }
  const PDF_RTL_LANGS = new Set(['ur', 'ar', 'fa'])

  function _printPdf(title, bodyHtml) {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PDF_PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`)
    doc.close()
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch (e) {}
      setTimeout(() => { try { iframe.remove() } catch (e) {} }, 1500)
    }, 250)
    toast('ok', '🖨️ Opening print dialog — choose "Save as PDF"')
  }

  function _segmentRows(segs) {
    return segs.map((s) => `<div class="row"><span class="t">${esc(String(s.t || fmt(s.s || 0)))}</span><span class="tx">${esc(String(s.tx || ''))}</span></div>`).join('')
  }

  function exportTranscriptPdf() {
    if (!Array.isArray(TRANSCRIPT) || !TRANSCRIPT.length) { toast('err', '⚠️ Process a video first'); return }
    const stamp = new Date().toISOString().slice(0, 10)
    const body = `<h1>Transcript</h1><div class="meta">SpeechFindr · ${TRANSCRIPT.length} segments · ${stamp}</div>${_segmentRows(TRANSCRIPT)}`
    _printPdf(`SpeechFindr Transcript — ${stamp}`, body)
  }

  function exportTranslationPdf() {
    const segs = LAST_TRANSLATION && LAST_TRANSLATION.translated_segments
    if (!segs || !segs.length) { toast('err', '⚠️ Translate the transcript first'); return }
    const lang = (LAST_TRANSLATION.lang || 'en').toLowerCase()
    const name = PDF_LANG_NAMES[lang] || lang.toUpperCase()
    const cls = PDF_RTL_LANGS.has(lang) ? ' class="rtl"' : ''
    const stamp = new Date().toISOString().slice(0, 10)
    const body = `<h1>Translated Transcript — ${esc(name)}</h1><div class="meta">SpeechFindr · ${segs.length} segments · ${stamp}</div><div${cls}>${_segmentRows(segs)}</div>`
    _printPdf(`SpeechFindr Translation (${name}) — ${stamp}`, body)
  }

  function exportQaPdf() {
    if (!QA_CHAT.length) { toast('err', '⚠️ Ask a question first'); return }
    const stamp = new Date().toISOString().slice(0, 10)
    const blocks = []
    for (let i = 0; i < QA_CHAT.length; i++) {
      const m = QA_CHAT[i]
      if (m.role !== 'user') continue
      const next = QA_CHAT[i + 1]
      const ans = (next && next.role === 'assistant') ? next.content : ''
      blocks.push(`<div class="qa"><div class="q">${esc(String(m.content || ''))}</div><div class="a">${esc(String(ans || '—'))}</div></div>`)
    }
    if (!blocks.length) { toast('err', '⚠️ Ask a question first'); return }
    const body = `<h1>Questions &amp; Answers</h1><div class="meta">SpeechFindr · ${blocks.length} question(s) · ${stamp}</div>${blocks.join('')}`
    _printPdf(`SpeechFindr Q&A — ${stamp}`, body)
  }

  function togglePlay() {
    initAudio()
    if (!AUDIO || !AUDIO.src) {
      toast('err', '⚠️ Generate audio first')
      return
    }
    if (!playing) {
      // Starting the translated clip — silence the original video first.
      pauseOriginalVideo()
      AUDIO.play().then(() => {
        playing = true
        document.getElementById('playBtn').textContent = '⏸'
        if (!AUDIO_UI_TICK) tickAudioUi()
      }).catch((e) => {
        toast('err', '❌ ' + String(e?.message || e).slice(0, 160))
      })
    } else {
      AUDIO.pause()
      playing = false
      document.getElementById('playBtn').textContent = '▶'
    }
  }

  function setSpd(s, btn) {
    document.querySelectorAll('.spd-btn').forEach((b) => b.classList.remove('on'))
    btn.classList.add('on')
    initAudio()
    if (AUDIO) AUDIO.playbackRate = Number(s) || 1
  }

  function setSumTab(t, btn) { sumMode = t; document.querySelectorAll('[data-summode]').forEach((b) => b.classList.remove('on')); btn.classList.add('on') }
  function setSumLength(mode, btn) {
    sumLengthMode = mode
    document.querySelectorAll('[data-sumlen]').forEach((b) => b.classList.remove('on'))
    if (btn) btn.classList.add('on')
  }
  function setSumLanguage(lang, btn) {
    sumLanguageMode = lang
    document.querySelectorAll('[data-sumlang]').forEach((b) => b.classList.remove('on'))
    if (btn) btn.classList.add('on')
  }

  function genSum() {
    if (!ready) { toast('err', '⚠️ Process a video first'); return }
    const el = document.getElementById('sumTxt')
    const sumBtn = document.getElementById('sumBtn')
    SUMMARY_RENDER_TOKEN++
    const myToken = SUMMARY_RENDER_TOKEN
    el.style.color = 'var(--dim)'; el.innerHTML = inlineLoaderHTML('Generating summary…', 'Analyzing the transcript')
    if (sumBtn) { sumBtn.disabled = true; sumBtn.textContent = 'Generating…' }
    const kw = document.getElementById('srchInp').value.trim()
    const mode = sumMode === 'k' ? 'keyword' : 'general'
    fetchSummaryFromBackend(mode, kw).then(async (result) => {
      if (myToken !== SUMMARY_RENDER_TOKEN) return
      if (result?.summary) {
        await animateSummaryText(el, result.summary, myToken)
        if (myToken !== SUMMARY_RENDER_TOKEN) return
        el.style.color = 'var(--muted)'
        toast('ok', mode === 'keyword' ? '✅ Keyword summary ready!' : '✅ General summary ready!')
      } else {
        el.textContent = 'Could not generate summary right now.'
        el.style.color = 'var(--muted)'
        toast('err', '❌ ' + String(result?.error || 'Summary generation failed.').slice(0, 180))
      }
    }).finally(() => {
      if (sumBtn) { sumBtn.disabled = false; sumBtn.innerHTML = 'Generate summary' }
    })
  }

  function resetAll() {
    stopProgressPolling()
    CURRENT_JOB = ''
    PARTIAL_SEGS = []
    const stepsEl = document.getElementById('procSteps')
    if (stepsEl) stepsEl.innerHTML = ''
    const pctEl = document.getElementById('procPct')
    if (pctEl) pctEl.textContent = ''
    SUMMARY_RENDER_TOKEN++
    TOPIC_RENDER_TOKEN++
    CHAPTER_RENDER_TOKEN++
    QA_RENDER_TOKEN++
    ready = false
    sumMode = 'g'
    sumLengthMode = 'medium'
    sumLanguageMode = 'en'
    document.querySelectorAll('[data-summode]').forEach((b) => b.classList.remove('on'))
    const modeBtns = document.querySelectorAll('[data-summode]')
    if (modeBtns[0]) modeBtns[0].classList.add('on')
    document.querySelectorAll('[data-sumlen]').forEach((b) => b.classList.remove('on'))
    const lenBtns = document.querySelectorAll('[data-sumlen]')
    if (lenBtns[1]) lenBtns[1].classList.add('on')
    document.querySelectorAll('[data-sumlang]').forEach((b) => b.classList.remove('on'))
    const langBtns = document.querySelectorAll('[data-sumlang]')
    if (langBtns[0]) langBtns[0].classList.add('on')
    videoDuration = 0
    durationReady = false
    CAPTIONS = null
    TOPICS = []
    CHAPTERS = []
    LAST_QA_TS = 0
    QA_CHAT = []
    document.getElementById('urlInp').value = ''
    document.getElementById('urlX').style.display = 'none'
    document.getElementById('urlBox').style.borderColor = ''
    document.getElementById('fileInp').value = ''
    document.getElementById('dz').innerHTML = '<span class="dz-icon">＋</span><span>Click or drag &amp; drop a file</span><small>MP4 · MKV · AVI · MP3 · WAV — up to 500MB</small>'
    document.getElementById('dz').style.borderColor = ''
    document.getElementById('procBtn').disabled = false
    document.getElementById('procBtn').innerHTML = '⚡ Process Video'
    document.getElementById('procBtn').style.background = ''
    document.getElementById('procState').classList.remove('show')
    document.getElementById('txPh').style.display = 'flex'
    document.getElementById('txList').style.display = 'none'
    document.getElementById('txList').innerHTML = ''
    document.getElementById('srchWrap').style.display = 'none'
    document.getElementById('tsResults').style.display = 'none'
    document.getElementById('srchInp').value = ''
    SOURCE_LANG = 'auto'
    TRANSCRIPT = []
    document.getElementById('tsList').style.display = 'none'
    document.getElementById('tsEmpty').style.display = 'block'
    document.getElementById('tsEmpty').textContent = 'Search a keyword above to see results here'
    document.getElementById('tsCount').textContent = '0 results'
    document.getElementById('txCount').textContent = '—'
    setTranscriptSourceLabel('—')
    document.getElementById('inputMeta').textContent = 'No video'
    document.getElementById('vidMeta').textContent = 'No video loaded'
    setVideoPlaceholder()
    const ytFrame = document.getElementById('ytFrame')
    ytFrame.src = ''
    ytFrame.style.display = 'none'
    document.getElementById('transBox').textContent = 'Translation appears here after processing...'
    setTranslationEngineLabel(null)
    setTranslationTimeLabel(null)
    setAudioTimeLabel(null)
    LAST_TRANSLATION = null
    const det = document.getElementById('srcDetectLabel')
    if (det) det.textContent = 'Detected: —'
    document.getElementById('sumTxt').textContent = 'Process a video first to generate a summary...'
    document.getElementById('topicMeta').textContent = 'Topics appear after processing transcript'
    document.getElementById('topicList').innerHTML = ''
    document.getElementById('chapterMeta').textContent = 'Chapters appear after processing transcript'
    document.getElementById('chapterList').innerHTML = ''
    document.getElementById('qaInp').value = ''
    renderQaChat()
    renderQaEvidence([])
    document.getElementById('qaJump').style.display = 'none'
    document.getElementById('progFill').style.width = '0%'
    document.getElementById('appBadge').innerHTML = '<div class="dot"></div>Ready'
    document.getElementById('stProc').textContent = 'Idle'
    initAudio()
    try { AUDIO.pause() } catch (e) {}
    playing = false
    document.getElementById('playBtn').textContent = '▶'
    document.getElementById('aFill').style.width = '0%'
    document.getElementById('aCur').textContent = '0:00'
    document.getElementById('aDur').textContent = '0:00'
    if (AUDIO_URL) { try { URL.revokeObjectURL(AUDIO_URL) } catch (e) {} }
    AUDIO_URL = null
    if (PREVIEW_URL) { try { URL.revokeObjectURL(PREVIEW_URL) } catch (e) {} PREVIEW_URL = null }
    const dlBtn = document.getElementById('downloadAudioBtn')
    if (dlBtn) dlBtn.style.display = 'none'
    AUDIO_SYNC_SOURCE_SEGMENTS = []
    AUDIO_SYNC_SEGMENTS = []
    AUDIO_SYNC_TIMELINE = []
    AUDIO_FOLLOW_SYNC = true
    clearAudioTranscriptHighlight()
    if (AUDIO) { AUDIO.src = '' }
    const fsBtn = document.getElementById('followSyncBtn')
    if (fsBtn) {
      fsBtn.classList.add('on')
      fsBtn.textContent = 'ON'
    }
    toast('ok', '↺ App reset')
  }

  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  function inlineLoaderHTML(title, sub) {
    const t = esc(String(title || 'Loading…'))
    const s = sub ? `<small>${esc(String(sub))}</small>` : ''
    return `<div class="box-loader"><div class="wave wave-sm"><span></span><span></span><span></span><span></span><span></span></div><span>${t}</span>${s}</div>`
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  function initAudio() {
    if (AUDIO) return
    AUDIO = new Audio()
    AUDIO.preload = 'auto'

    AUDIO.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(AUDIO.duration) ? Math.floor(AUDIO.duration) : 0
      document.getElementById('aDur').textContent = fmt(dur || 0)
      buildAudioSyncTimeline(Number.isFinite(AUDIO.duration) ? AUDIO.duration : 0)
    })
    AUDIO.addEventListener('ended', () => {
      playing = false
      document.getElementById('playBtn').textContent = '▶'
      if (AUDIO_UI_TICK) cancelAnimationFrame(AUDIO_UI_TICK)
      AUDIO_UI_TICK = null
      document.getElementById('aFill').style.width = '0%'
      document.getElementById('aCur').textContent = '0:00'
      clearAudioTranscriptHighlight()
    })
  }

  function tickAudioUi() {
    if (!AUDIO) return
    const cur = Number.isFinite(AUDIO.currentTime) ? AUDIO.currentTime : 0
    const dur = Number.isFinite(AUDIO.duration) ? AUDIO.duration : 0
    document.getElementById('aCur').textContent = fmt(Math.floor(cur))
    const pct = (dur > 0) ? Math.min(100, (cur / dur) * 100) : 0
    document.getElementById('aFill').style.width = pct.toFixed(2) + '%'
    syncTranscriptWithAudio(cur, dur)
    if (playing) {
      AUDIO_UI_TICK = requestAnimationFrame(tickAudioUi)
    } else {
      AUDIO_UI_TICK = null
    }
  }

  function toast(type, msg) {
    const c = document.getElementById('toasts')
    if (!c) return
    const el = document.createElement('div')
    el.className = 'toast ' + type; el.textContent = msg; c.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = 'all .3s'; setTimeout(() => el.remove(), 300) }, 3000)
  }

  /* ── drag & drop (wired from JSX) ── */
  function onDragOver(e) {
    const dz = document.getElementById('dz')
    e.preventDefault(); dz.style.borderColor = 'rgba(59,130,246,0.5)'; dz.style.background = 'rgba(59,130,246,0.06)'
  }
  function onDragLeave() {
    const dz = document.getElementById('dz')
    dz.style.borderColor = ''; dz.style.background = ''
  }
  function onDrop(e) {
    const dz = document.getElementById('dz')
    e.preventDefault(); dz.style.borderColor = ''; dz.style.background = ''
    const f = e.dataTransfer.files[0]
    if (f) {
      const inp = document.getElementById('fileInp')
      const dt = new DataTransfer()
      dt.items.add(f)
      inp.files = dt.files
      onFile(inp)
      toast('ok', '📁 Dropped: ' + f.name)
    }
  }

  /* ── tgtLang change (wired from JSX) ── */
  function onTgtLangChange(el) {
    const lang = el.value
    applyTranslationDirectionAndFont(lang)
    if (LAST_TRANSLATION && LAST_TRANSLATION.translated_segments) {
      renderTranslationSideBySide(
        LAST_TRANSLATION.original_segments || [],
        LAST_TRANSLATION.translated_segments || [],
        lang
      )
    }
  }

  function qaJumpClick() { jumpTo(LAST_QA_TS) }

  /* ── live progress tracking (real stages from the backend) ── */
  function newJobId() {
    return 'job_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  }

  function stopProgressPolling() {
    if (PROC_POLL) { clearInterval(PROC_POLL); PROC_POLL = null }
  }

  function renderProcProgress(p) {
    const stages = Array.isArray(p.stages) ? p.stages : []
    const idx = Math.max(0, stages.indexOf(p.stage))
    const meta = STAGE_META[p.stage] || ['⚙️', 'Working', 'Processing', '']
    const txtEl = document.getElementById('procTxt')
    const subEl = document.getElementById('procSub')
    if (txtEl) txtEl.textContent = meta[2] + '…'
    if (subEl) subEl.textContent = p.detail || meta[3] || ''
    const stagePct = Number.isFinite(p.percent) ? p.percent : 0
    let overall = stages.length ? ((idx + stagePct / 100) / stages.length) * 100 : stagePct
    if (p.status === 'done') overall = 100
    const fill = document.getElementById('progFill')
    if (fill) fill.style.width = overall.toFixed(1) + '%'
    const pctEl = document.getElementById('procPct')
    if (pctEl) pctEl.textContent = Math.round(overall) + '%'
    const stepsEl = document.getElementById('procSteps')
    if (stepsEl) {
      stepsEl.innerHTML = stages.map((key, i) => {
        const m = STAGE_META[key] || ['⚙️', key, '', '']
        const done = p.status === 'done' || i < idx
        const cls = done ? 'done' : (i === idx ? 'active' : '')
        return `<span class="proc-step ${cls}"><span class="proc-step-ico">${done ? '✓' : m[0]}</span>${m[1]}</span>`
      }).join('<span class="proc-step-arrow">›</span>')
    }
  }

  function renderPartialTranscript() {
    if (!PARTIAL_SEGS.length) return
    const sorted = [...PARTIAL_SEGS]
      .map((s) => ({ t: s.t || fmt(s.s || 0), s: Number.isFinite(s.s) ? s.s : 0, tx: s.tx || '' }))
      .filter((s) => s.tx)
      .sort((a, b) => a.s - b.s)
    renderTx(sorted.slice(0, 4000), '')
    const countEl = document.getElementById('txCount')
    if (countEl) countEl.textContent = sorted.length + ' lines · transcribing…'
  }

  function startProgressPolling(jobId, runId) {
    stopProgressPolling()
    PARTIAL_SEGS = []
    PARTIAL_FROM = 0
    let busy = false
    PROC_POLL = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        const resp = await fetchTextWithTimeout(`${API_BASE}/progress/${jobId}?from=${PARTIAL_FROM}`, 4000)
        if (!resp.ok) return
        const p = await resp.json()
        if (runId !== ACTIVE_RUN_ID || jobId !== CURRENT_JOB) { stopProgressPolling(); return }
        if (p.status === 'unknown') return
        renderProcProgress(p)
        if (Array.isArray(p.partial) && p.partial.length) {
          PARTIAL_FROM += p.partial.length
          PARTIAL_SEGS.push(...p.partial)
          renderPartialTranscript()
        }
        if (p.status === 'done' || p.status === 'error') stopProgressPolling()
      } catch (e) {
        // polling is best-effort; the main request drives completion
      } finally {
        busy = false
      }
    }, 700)
  }

  /* ── free/paid API tier toggle ── */
  let API_TIER = 'free'
  let PAID_KEY_AVAILABLE = false

  function renderTierToggle() {
    const btn = document.getElementById('tierToggle')
    if (!btn) return
    btn.classList.toggle('paid', API_TIER === 'paid')
    btn.textContent = API_TIER === 'paid' ? '⚡ API: Paid' : '🆓 API: Free'
    btn.title = PAID_KEY_AVAILABLE
      ? 'Click to switch between the free and paid Groq API'
      : 'Free Groq API in use — add GROQ_PAID_API_KEY in backend/.env to enable paid mode'
  }

  async function fetchSettings() {
    try {
      const resp = await fetchTextWithTimeout(`${API_BASE}/settings`, 5000)
      if (!resp.ok) return
      const data = await resp.json()
      API_TIER = data.tier || 'free'
      PAID_KEY_AVAILABLE = !!data.paid_key_configured
      renderTierToggle()
    } catch (e) {
      console.log('Settings fetch failed:', e.message)
    }
  }

  async function toggleTier() {
    const next = API_TIER === 'paid' ? 'free' : 'paid'
    try {
      const resp = await fetch(`${API_BASE}/settings/tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: next }),
      })
      if (!resp.ok) {
        let detail = 'Could not switch API tier.'
        try {
          const err = await resp.json()
          detail = err?.detail || detail
        } catch (e) {}
        throw new Error(detail)
      }
      const data = await resp.json()
      API_TIER = data.tier || next
      PAID_KEY_AVAILABLE = !!data.paid_key_configured
      renderTierToggle()
      toast('ok', API_TIER === 'paid' ? '⚡ Paid API mode — higher limits unlocked' : '🆓 Free API mode')
    } catch (e) {
      toast('err', '❌ ' + String(e?.message || e).slice(0, 160))
    }
  }

  async function pingHealth() {
    const dot = document.getElementById('connDot')
    const label = document.getElementById('stConn')
    try {
      const resp = await fetchTextWithTimeout(`${API_BASE}/health`, 5000)
      const ok = resp.ok
      if (label) label.textContent = ok ? 'Connected' : 'Disconnected'
      if (dot) dot.classList.toggle('off', !ok)
    } catch (e) {
      if (label) label.textContent = 'Disconnected'
      if (dot) dot.classList.add('off')
    }
  }

  let _welcomeTimer = null
  let _errHandler = null
  let _healthTimer = null
  function init() {
    // Published so the innerHTML-built search rows (onclick="jumpTo(...)") resolve.
    window.jumpTo = jumpTo
    pingHealth()
    fetchSettings()
    _healthTimer = setInterval(pingHealth, 10000)
    _welcomeTimer = setTimeout(() => toast('ok', '👋 Paste a YouTube URL and click Process!'), 800)
    _errHandler = (e) => { console.log('Unhandled JS error:', e.message) }
    window.addEventListener('error', _errHandler)
  }
  function destroy() {
    stopProgressPolling()
    if (_welcomeTimer) clearTimeout(_welcomeTimer)
    if (_healthTimer) clearInterval(_healthTimer)
    if (_errHandler) window.removeEventListener('error', _errHandler)
    if (AUDIO_UI_TICK) cancelAnimationFrame(AUDIO_UI_TICK)
    try { if (AUDIO) AUDIO.pause() } catch (e) {}
    if (AUDIO_URL) { try { URL.revokeObjectURL(AUDIO_URL) } catch (e) {} }
    if (PREVIEW_URL) { try { URL.revokeObjectURL(PREVIEW_URL) } catch (e) {} PREVIEW_URL = null }
    if (window.jumpTo === jumpTo) { try { delete window.jumpTo } catch (e) { window.jumpTo = undefined } }
  }

  return {
    init, destroy,
    startProc, resetAll,
    clearUrl, onFile, onUrlInput,
    doSearch, clearSearch, setTimestampMode,
    onTgtLangChange, doTranslate, toggleTier,
    togglePlay, setSpd, toggleFollowSync, genAudio, downloadAudio,
    setSumTab, setSumLength, setSumLanguage, genSum,
    askVideo, qaJumpClick, jumpTo,
    exportTranscriptPdf, exportTranslationPdf, exportQaPdf,
    onDragOver, onDragLeave, onDrop,
  }
}
