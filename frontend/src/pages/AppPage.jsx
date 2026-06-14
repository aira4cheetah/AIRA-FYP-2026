import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import CustomCursor from '../components/CustomCursor.jsx'
import createAppLogic from './appLogic.js'
import '../styles/app.css'

const CURSOR_HOVER = {
  selectors: 'a,button,.ts-item,.tx-line',
  cur: [18, 12],
  ring: [48, 36],
}

export default function AppPage() {
  const logicRef = useRef(null)
  const [tool, setTool] = useState('translate')

  useEffect(() => {
    const logic = createAppLogic()
    logicRef.current = logic
    logic.init()
    return () => {
      logic.destroy()
      logicRef.current = null
    }
  }, [])

  // Convenience: call a logic handler if it's ready.
  const h = (name, ...args) => logicRef.current && logicRef.current[name](...args)

  const navRight = (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <div className="tbadge" id="appBadge"><div className="dot"></div>Ready</div>
      <Link to="/" className="nav-cta" style={{ padding: '8px 16px', fontSize: '.8rem' }}>← Home</Link>
    </div>
  )

  return (
    <>
      <CustomCursor hover={CURSOR_HOVER} />
      <Navbar active="project" right={navRight} />

      <div className="app-wrap">

        {/* TOP BAR */}
        <div className="app-topbar">
          <div className="app-topbar-l">
            <h2>SpeechFindr <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.9rem' }}>Workspace</span></h2>
            <p>Add a video, search every spoken word — then translate, listen, summarize or ask.</p>
          </div>
          <div className="topbar-badges">
            <button className="tbadge tier-toggle" id="tierToggle" title="Switch between free and paid Groq API" onClick={() => h('toggleTier')}>🆓 API: Free</button>
            <span className="tbadge" style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.2)', color: 'var(--cyan-lt)' }}>Whisper AI</span>
            <span className="tbadge" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--muted)' }}>Beta v1.0</span>
          </div>
        </div>

        {/* THREE COLUMN BODY */}
        <div className="app-body">

          {/* ══════ LEFT — STEP 1: ADD ══════ */}
          <div className="pnl">
            <div className="pnl-head">
              <h3><span className="step-num">1</span>Add a video</h3>
              <span className="pnl-meta" id="inputMeta">No video</span>
            </div>
            <div className="pnl-body">

              {/* URL */}
              <div style={{ marginBottom: '16px' }}>
                <label className="lbl">YouTube link</label>
                <div className="url-box" id="urlBox">
                  <span className="url-pfx">🔗</span>
                  <input className="url-inp" id="urlInp" type="text" placeholder="https://youtube.com/watch?v=..." onInput={(e) => h('onUrlInput', e.target)} onKeyDown={(e) => { if (e.key === 'Enter') h('startProc') }} />
                  <button className="url-x" id="urlX" aria-label="Clear URL" onClick={() => h('clearUrl')}>✕</button>
                </div>
              </div>

              <div className="divider">OR</div>

              {/* Upload */}
              <div style={{ marginBottom: '16px' }}>
                <label className="lbl">Upload video / audio</label>
                <input type="file" id="fileInp" accept="video/*,audio/*" style={{ display: 'none' }} onChange={(e) => h('onFile', e.target)} />
                <div className="drop-zone" id="dz"
                  onClick={() => document.getElementById('fileInp').click()}
                  onDragOver={(e) => h('onDragOver', e)}
                  onDragLeave={() => h('onDragLeave')}
                  onDrop={(e) => h('onDrop', e)}>
                  <span className="dz-icon">＋</span>
                  <span>Click or drag &amp; drop a file</span>
                  <small>MP4 · MKV · AVI · MP3 · WAV — up to 500MB</small>
                </div>
              </div>

              {/* Detected language (auto-detected by the AI) */}
              <div style={{ marginBottom: 0 }}>
                <label className="lbl">Spoken language</label>
                <div className="pnl-meta" id="srcDetectLabel">Detected: —</div>
              </div>

              {/* Buttons */}
              <button className="proc-btn" id="procBtn" onClick={() => h('startProc')}>Process video</button>
              <button className="rst-btn" onClick={() => h('resetAll')}>Reset</button>

              {/* AUTO CHAPTERS */}
              <div className="chapters-wrap" style={{ marginTop: '22px' }}>
                <label className="lbl" style={{ marginBottom: '6px' }}>Chapters</label>
                <div className="topic-muted" id="chapterMeta">Chapters appear after processing</div>
                <div className="chapter-list" id="chapterList"></div>
              </div>

            </div>
          </div>

          {/* ══════ CENTER — STEP 2: WATCH & SEARCH ══════ */}
          <div className="center-col">

            {/* Video */}
            <div className="pnl video-pnl">
              <div className="pnl-head">
                <h3>Player</h3>
                <span className="pnl-meta" id="vidMeta" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>No video loaded</span>
              </div>
              <div className="pnl-body">
                <div className="vc" id="vc">
                  <div className="vc-ph" id="vcPh">
                    <div className="play-orb">▶</div>
                    <p>Paste a link or upload a<br />video to start</p>
                  </div>
                  <iframe id="ytFrame" allowFullScreen allow="autoplay; encrypted-media"></iframe>
                </div>
              </div>
            </div>

            {/* Transcript & keyword/timestamp search */}
            <div className="pnl ts-pnl" style={{ flex: 1 }}>
              <div className="pnl-head" style={{ alignItems: 'center', gap: '10px' }}>
                <h3><span className="step-num">2</span>Transcript</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                  <span id="txSource" className="tx-source" style={{ display: 'none' }}></span>
                  <span id="txCount" className="pnl-meta">—</span>
                  <button className="exp-btn" onClick={() => h('exportTranscriptPdf')}>⬇ PDF</button>
                </div>
              </div>
              <div className="pnl-body">

                {/* Prominent keyword search — the headline feature */}
                <div className="srch-wrap" id="srchWrap">
                  <span className="srch-ico">🔍</span>
                  <input className="srch-inp" id="srchInp" type="text" placeholder="Search the transcript — jump to any word's timestamp…" onInput={(e) => h('doSearch', e.target.value)} />
                  <button className="srch-x" id="srchX" aria-label="Clear search" onClick={() => h('clearSearch')}>✕</button>
                </div>

                {/* Timestamp matches for the current search */}
                <div className="ts-results" id="tsResults" style={{ display: 'none' }}>
                  <div className="ts-results-head">
                    <label className="lbl" style={{ margin: 0 }}>Timestamp matches</label>
                    <span className="pnl-meta" id="tsCount">0 results</span>
                  </div>
                  <div className="ts-empty" id="tsEmpty">Search a keyword above to jump to its timestamps</div>
                  <div className="ts-list" id="tsList" style={{ display: 'none' }}></div>
                </div>

                {/* Processing state: waveform + live stage tracker */}
                <div className="proc-state" id="procState">
                  <div className="wave" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <div>
                    <div className="proc-txt" id="procTxt">Fetching video...</div>
                    <div className="proc-sub" id="procSub">Connecting to source</div>
                  </div>
                  <div className="proc-steps" id="procSteps"></div>
                  <div className="prog-row">
                    <div className="prog-track"><div className="prog-fill" id="progFill"></div></div>
                    <span className="proc-pct" id="procPct"></span>
                  </div>
                </div>

                {/* Placeholder */}
                <div className="tx-empty" id="txPh">
                  <div className="ico">📄</div>
                  <p>Process a video to<br />see the transcript here</p>
                </div>

                {/* Full transcript */}
                <div className="tx-list" id="txList"></div>
              </div>
            </div>

          </div>

          {/* ══════ RIGHT — STEP 3: TOOLS (tabbed) ══════ */}
          <div className="right-col">
            <div className="pnl tool-pnl" style={{ flex: 1 }}>
              <div className="pnl-head">
                <h3><span className="step-num">3</span>Use the transcript</h3>
              </div>
              <div className="tool-tabs" role="tablist">
                <button className={`tool-tab ${tool === 'translate' ? 'on' : ''}`} onClick={() => setTool('translate')}>Translate</button>
                <button className={`tool-tab ${tool === 'listen' ? 'on' : ''}`} onClick={() => setTool('listen')}>Listen</button>
                <button className={`tool-tab ${tool === 'summary' ? 'on' : ''}`} onClick={() => setTool('summary')}>Summary</button>
                <button className={`tool-tab ${tool === 'ask' ? 'on' : ''}`} onClick={() => setTool('ask')}>Ask</button>
              </div>
              <div className="pnl-body">

                {/* — Translate — */}
                <div className={`tool-sec ${tool === 'translate' ? 'show' : ''}`}>
                  <p className="tool-hint">Translate the whole transcript into another language.</p>
                  <label className="lbl">Target language</label>
                  <select className="inp-sel" id="tgtLang" defaultValue="ur" style={{ marginBottom: '6px' }} onChange={(e) => h('onTgtLangChange', e.target)}>
                    <option value="ur">Urdu — اردو</option>
                    <option value="ar">Arabic — العربية</option>
                    <option value="fa">Persian — فارسی</option>
                    <option value="fr">French — Français</option>
                    <option value="de">German — Deutsch</option>
                    <option value="es">Spanish — Español</option>
                    <option value="zh">Chinese — 中文</option>
                    <option value="hi">Hindi — हिन्दी</option>
                    <option value="tr">Turkish — Türkçe</option>
                    <option value="ru">Russian — Русский</option>
                    <option value="ja">Japanese — 日本語</option>
                    <option value="pt">Portuguese — Português</option>
                    <option value="ko">Korean — 한국어</option>
                  </select>
                  <div className="tool-meta-row">
                    <span id="transEngine" className="tx-source" style={{ display: 'none' }}></span>
                    <span id="transTime" className="tx-source" style={{ display: 'none' }}></span>
                  </div>
                  <div className="trans-box" id="transBox">Translation appears here after processing...</div>
                  <button className="action-btn" id="transBtn" onClick={() => h('doTranslate')}>Translate</button>
                  <button className="exp-btn exp-btn-block" onClick={() => h('exportTranslationPdf')}>⬇ Export translation (PDF)</button>
                </div>

                {/* — Listen — */}
                <div className={`tool-sec ${tool === 'listen' ? 'show' : ''}`}>
                  <p className="tool-hint">Turn the translation into speech. Translate first, then generate audio.</p>
                  <div className="tool-meta-row">
                    <span id="audioTime" className="tx-source" style={{ display: 'none' }}></span>
                  </div>
                  <div className="audio-box">
                    <div className="audio-ctrls">
                      <button className="play-btn" id="playBtn" aria-label="Play or pause audio" onClick={() => h('togglePlay')}>▶</button>
                      <div className="audio-prog">
                        <div className="a-bar"><div className="a-fill" id="aFill"></div></div>
                        <div className="a-time"><span id="aCur">0:00</span><span id="aDur">0:00</span></div>
                      </div>
                    </div>
                    <div className="spd-row">
                      <button className="spd-btn" onClick={(e) => h('setSpd', 0.75, e.currentTarget)}>0.75×</button>
                      <button className="spd-btn on" onClick={(e) => h('setSpd', 1, e.currentTarget)}>1×</button>
                      <button className="spd-btn" onClick={(e) => h('setSpd', 1.5, e.currentTarget)}>1.5×</button>
                      <button className="spd-btn" onClick={(e) => h('setSpd', 2, e.currentTarget)}>2×</button>
                    </div>
                    <div className="follow-sync-row">
                      <label className="lbl">Follow sync</label>
                      <button id="followSyncBtn" className="follow-toggle on" onClick={() => h('toggleFollowSync')}>ON</button>
                    </div>
                  </div>
                  <button className="action-btn cyan" data-genaudio="" style={{ marginTop: '10px' }} onClick={() => h('genAudio')}>Generate audio</button>
                  <div className="box-loader audio-status" id="audioStatus" style={{ display: 'none' }}>
                    <div className="wave wave-sm" aria-hidden="true">
                      <span></span><span></span><span></span><span></span><span></span>
                    </div>
                    <span>Generating audio…</span>
                    <small>Converting translated text to speech</small>
                  </div>
                  <button className="action-btn download" id="downloadAudioBtn" style={{ marginTop: '8px', display: 'none' }} onClick={() => h('downloadAudio')}>Download MP3</button>
                </div>

                {/* — Summary — */}
                <div className={`tool-sec ${tool === 'summary' ? 'show' : ''}`}>
                  <p className="tool-hint">Get the gist without watching — general, or focused on your search keyword.</p>
                  <div className="sum-tabs">
                    <button className="sum-tab on" data-summode="" onClick={(e) => h('setSumTab', 'g', e.currentTarget)}>General</button>
                    <button className="sum-tab" data-summode="" onClick={(e) => h('setSumTab', 'k', e.currentTarget)}>Keyword</button>
                  </div>
                  <div className="sum-tabs" style={{ marginTop: '-2px' }}>
                    <button className="sum-tab" data-sumlen="" onClick={(e) => h('setSumLength', 'short', e.currentTarget)}>Short (50)</button>
                    <button className="sum-tab on" data-sumlen="" onClick={(e) => h('setSumLength', 'medium', e.currentTarget)}>Medium (150)</button>
                    <button className="sum-tab" data-sumlen="" onClick={(e) => h('setSumLength', 'detailed', e.currentTarget)}>Detailed (300)</button>
                  </div>
                  <div className="sum-tabs" style={{ marginTop: '-2px' }}>
                    <button className="sum-tab on" data-sumlang="" onClick={(e) => h('setSumLanguage', 'en', e.currentTarget)}>English</button>
                    <button className="sum-tab" data-sumlang="" onClick={(e) => h('setSumLanguage', 'ur', e.currentTarget)}>Urdu</button>
                  </div>
                  <div className="sum-txt" id="sumTxt">Process a video first to generate a summary...</div>
                  <button className="action-btn" id="sumBtn" style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.22)', color: 'var(--cyan-lt)' }} onClick={() => h('genSum')}>Generate summary</button>
                  <div className="topic-wrap">
                    <label className="lbl" style={{ marginTop: '12px' }}>Topics</label>
                    <div id="topicMeta" className="topic-muted">Topics appear after processing</div>
                    <div className="topic-list" id="topicList"></div>
                  </div>
                </div>

                {/* — Ask — */}
                <div className={`tool-sec ${tool === 'ask' ? 'show' : ''}`}>
                  <p className="tool-hint">Ask anything about the video — answers come with a timestamp you can jump to.</p>
                  <label className="lbl">Your question</label>
                  <input className="qa-inp" id="qaInp" type="text" placeholder="e.g. What is backpropagation?" onKeyDown={(e) => { if (e.key === 'Enter') h('askVideo') }} />
                  <div className="qa-row">
                    <button className="qa-btn" id="qaBtn" onClick={() => h('askVideo')}>Ask</button>
                    <button className="qa-jump" id="qaJump" style={{ display: 'none' }} onClick={() => h('qaJumpClick')}>Jump</button>
                  </div>
                  <div className="qa-ans">
                    <div className="qa-chat" id="qaChat">
                      Process a video first to ask questions…
                    </div>
                    <div className="qa-meta" id="qaMeta" style={{ display: 'none' }}>Evidence</div>
                    <div className="qa-evidence" id="qaEvidence"></div>
                  </div>
                  <button className="exp-btn exp-btn-block" onClick={() => h('exportQaPdf')}>⬇ Export Q&amp;A (PDF)</button>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* STATUS BAR */}
        <div className="status-bar">
          <div className="st-item"><div className="st-dot off" id="connDot"></div><span id="stConn">Checking…</span></div>
          <div className="st-item"><div className="st-dot off"></div><span>Whisper Large v3</span></div>
          <div className="st-item"><div className="st-dot off"></div><span id="stProc">Idle</span></div>
          <span style={{ marginLeft: 'auto', fontSize: '.68rem' }}>SpeechFindr v1.0 — Iqra University FYP 2025–2026</span>
        </div>

      </div>

      <div className="toasts" id="toasts"></div>
      <video id="fileVid" style={{ display: 'none' }}></video>
    </>
  )
}
