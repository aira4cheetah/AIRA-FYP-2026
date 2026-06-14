import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import Footer from '../components/Footer.jsx'
import CustomCursor from '../components/CustomCursor.jsx'
import useReveal from '../hooks/useReveal.js'
import '../styles/home.css'

const CURSOR_HOVER = {
  selectors: 'a,button,.how-item,[role="button"]',
  cur: [20, 12],
  ring: [52, 36],
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const MARQUEE_ITEMS = [
  { ico: '🎤', label: 'Speech-to-Text' },
  { ico: '🔍', label: 'Keyword Search' },
  { ico: '🌍', label: '50+ Languages' },
  { ico: '⏱', label: 'Timestamps' },
  { ico: '🔊', label: 'Audio Playback' },
  { ico: '✂️', label: 'AI Summaries' },
  { ico: '📹', label: 'YouTube Support' },
  { ico: '🧠', label: 'Groq Whisper' },
]

const PIPE_STEPS = [
  { orb: '📥', n: ['Input', 'Video'] },
  { orb: '🎙', n: ['Extract', 'Speech'] },
  { orb: '🧠', n: ['AI', 'Transcribe'] },
  { orb: '🔍', n: ['Keyword', 'Detect'] },
  { orb: '⏱', n: ['Timestamp', 'Extract'] },
  { orb: '🌍', n: ['Translate', '& Summarize'] },
]

const FEATURES = [
  { cls: 'fi-blue', ico: '🎤', h: 'Speech-to-Text', p: "Powered by Groq's Whisper (large-v3-turbo) — extracts every spoken word with precise timestamps, handling accents and noisy audio." },
  { cls: 'fi-cyan', ico: '🔍', h: 'Smart Keyword Search', p: 'Instantly locate any word or phrase across the full transcript with highlighted context and surrounding text for quick comprehension.' },
  { cls: 'fi-sky', ico: '🌍', h: 'Multi-Language Translation', p: 'Translate full transcripts into 50+ languages in real-time using neural translation models for natural, idiomatic output.' },
  { cls: 'fi-blue', ico: '🔊', h: 'Audio Playback', p: 'Convert any translated text back to natural-sounding speech. Multiple voices and playback speeds for optimal accessibility.' },
  { cls: 'fi-cyan', ico: '✂️', h: 'AI Summary Generation', p: 'Generate intelligent summaries of entire videos or keyword-focused segments — get the essence of a 2-hour lecture in 30 seconds.' },
  { cls: 'fi-sky', ico: '⏱', h: 'Timestamp Navigation', p: 'Click any search result to jump directly to that exact video moment. Zero seeking, zero scrubbing — pure precision navigation.' },
]

const HOW_STEPS = [
  { num: '01', h: 'Paste a URL or Upload', p: 'Drop any YouTube link or upload an MP4/MP3 file directly. No accounts, no API keys needed.' },
  { num: '02', h: 'AI Extracts the Audio', p: 'Deep learning models isolate speech from background music, noise, and silence with 99%+ accuracy.' },
  { num: '03', h: 'Whisper Transcribes Everything', p: "Groq's Whisper (large-v3-turbo) converts speech to text with precise timestamps. Every word, every moment." },
  { num: '04', h: 'Search, Translate & Summarize', p: 'Full-text keyword search, 50+ language translation, AI-powered summaries — all in one click.' },
]

const TEAM = [
  { name: 'Awaab Mubashar Siddique', roll: 'IU09-0122-9036' },
  { name: 'Anas Tanveer', roll: 'IU09-0122-9039' },
  { name: 'Abdul Rafay Khan', roll: 'IU09-0122-9037' },
  { name: 'Muhammad Ismail', roll: 'IU09-0122-9041' },
]

const ACCORDION = [
  { head: '🎯 Problem Statement', body: "Long educational and professional videos contain critical knowledge buried inside hours of footage. There's no native way to search inside video content — users must manually scrub through recordings to find what they need. When subtitles exist, they're rarely searchable, translatable, or timestamped in real-time. SpeechFindr solves this completely." },
  { head: '💡 Proposed Solution', body: 'SpeechFindr automatically extracts audio from any video source, transcribes it using AI speech recognition with full timestamps, enables real-time keyword search with clickable navigation, translates to 50+ languages, and generates intelligent summaries — making every video instantly searchable and accessible to anyone, anywhere.' },
  { head: '🛠 Technologies Used', tags: ['Python 3.11', 'FastAPI', 'Groq Whisper (large-v3-turbo)', 'Llama 3.3 70B', 'yt-dlp', 'FFmpeg', 'Google Translate', 'edge-tts', 'gTTS', 'React', 'Vite', 'Three.js'], body: 'Built on a modern AI-first stack.' },
  { head: '🚀 Future Scope', body: 'Planned: live video transcription in real-time, speaker diarization (who said what), emotion detection in speech, exportable study notes and auto-generated quizzes, LMS platform integration, iOS & Android apps, and a browser extension for instant transcription on any webpage.' },
]

export default function Home() {
  useReveal(0.1)
  const auroraRef = useRef(null)
  const waveRef = useRef(null)
  const howStepRef = useRef(0)
  const [litStep, setLitStep] = useState(0)
  const [howStep, setHowStep] = useState(0)
  const [openAcc, setOpenAcc] = useState(0)

  // Keep a ref in sync so the waveform draw loop can react to the selected step.
  useEffect(() => { howStepRef.current = howStep }, [howStep])

  // Pipeline step cycler
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => {
      setLitStep((i) => (i + 1) % PIPE_STEPS.length)
    }, 1300)
    return () => clearInterval(id)
  }, [])

  // Three.js aurora background
  useEffect(() => {
    if (prefersReducedMotion()) return
    const THREE = window.THREE
    const cv = auroraRef.current
    if (!THREE || !cv) return

    const W = () => window.innerWidth, H = () => window.innerHeight
    const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W(), H())
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 1000)
    cam.position.z = 28

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32)
    const orbs = [
      { pos: [18, 8, -10], color: 0x3B82F6, size: 9, spd: 0.0004 },
      { pos: [-20, -6, -15], color: 0x06B6D4, size: 7, spd: 0.0006 },
      { pos: [4, 14, -20], color: 0x0EA5E9, size: 11, spd: 0.0003 },
      { pos: [-8, -14, -8], color: 0x60A5FA, size: 6, spd: 0.0007 },
    ]
    const meshes = orbs.map((o) => {
      const mat = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.13 })
      const m = new THREE.Mesh(sphereGeo, mat)
      m.scale.setScalar(o.size)
      m.position.set(...o.pos)
      scene.add(m)
      return { mesh: m, ...o }
    })

    const N = 150
    const pPos = new Float32Array(N * 3)
    const pVel = []
    for (let i = 0; i < N; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 80
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 50
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 20
      pVel.push({ x: (Math.random() - 0.5) * 0.015, y: (Math.random() - 0.5) * 0.01 })
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const pMat = new THREE.PointsMaterial({ color: 0x60A5FA, size: 0.22, transparent: true, opacity: 0.55, sizeAttenuation: true })
    scene.add(new THREE.Points(pGeo, pMat))

    const lMat = new THREE.LineBasicMaterial({ color: 0x3B82F6, transparent: true, opacity: 0.06 })
    const lGeo = new THREE.BufferGeometry()
    const lPos = new Float32Array(N * N * 6)
    lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3))
    scene.add(new THREE.LineSegments(lGeo, lMat))

    let mx2 = 0, my2 = 0, t = 0, raf = 0
    const onMove = (e) => { mx2 = (e.clientX / W() - 0.5) * 0.4; my2 = (e.clientY / H() - 0.5) * 0.25 }
    document.addEventListener('mousemove', onMove)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      t += 0.008
      meshes.forEach((o) => {
        o.mesh.position.x = o.pos[0] + Math.sin(t * o.spd * 1000 + 1) * 3
        o.mesh.position.y = o.pos[1] + Math.cos(t * o.spd * 1000 + 2) * 2
      })
      const pp = pGeo.attributes.position.array
      for (let i = 0; i < N; i++) {
        pp[i * 3] += pVel[i].x; pp[i * 3 + 1] += pVel[i].y
        if (pp[i * 3] > 40 || pp[i * 3] < -40) pVel[i].x *= -1
        if (pp[i * 3 + 1] > 25 || pp[i * 3 + 1] < -25) pVel[i].y *= -1
      }
      pGeo.attributes.position.needsUpdate = true
      let li = 0; const la = lGeo.attributes.position.array
      for (let a = 0; a < N; a++) {
        for (let b = a + 1; b < N; b++) {
          const dx = pp[a * 3] - pp[b * 3], dy = pp[a * 3 + 1] - pp[b * 3 + 1]
          if (dx * dx + dy * dy < 140 && li < lPos.length - 6) {
            la[li++] = pp[a * 3]; la[li++] = pp[a * 3 + 1]; la[li++] = 0
            la[li++] = pp[b * 3]; la[li++] = pp[b * 3 + 1]; la[li++] = 0
          }
        }
      }
      while (li < la.length) la[li++] = 0
      lGeo.attributes.position.needsUpdate = true
      cam.position.x += (mx2 * 4 - cam.position.x) * 0.04
      cam.position.y += (-my2 * 2.5 - cam.position.y) * 0.04
      cam.lookAt(scene.position)
      renderer.render(scene, cam)
    }
    tick()
    const onResize = () => {
      cam.aspect = W() / H(); cam.updateProjectionMatrix()
      renderer.setSize(W(), H())
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
    }
  }, [])

  // How-it-works waveform canvas — reacts to the selected step (howStepRef).
  useEffect(() => {
    const cv = waveRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const reduce = prefersReducedMotion()
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight }
    resize(); window.addEventListener('resize', resize)
    let t = 0, raf = 0
    const draw = () => {
      if (!reduce) {
        raf = requestAnimationFrame(draw)
        if (document.hidden) return
        t += 0.016
      }
      // Later steps drive a busier, higher-energy waveform.
      const step = howStepRef.current
      const fMul = 1 + step * 0.32
      const aMul = 1 + step * 0.16
      const dots = 7 + step
      const w = cv.width, h = cv.height
      ctx.clearRect(0, 0, w, h)
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      g.addColorStop(0, 'rgba(59,130,246,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ;[
        { c: '#3B82F6', a: 44, f: 2.2, ph: 0, op: 0.85, lw: 2.5 },
        { c: '#06B6D4', a: 30, f: 3.1, ph: 1.3, op: 0.55, lw: 1.8 },
        { c: '#60A5FA', a: 20, f: 1.5, ph: 2.6, op: 0.35, lw: 1.2 },
      ].forEach(({ c, a, f, ph, op, lw }) => {
        ctx.beginPath()
        ctx.strokeStyle = c; ctx.globalAlpha = op; ctx.lineWidth = lw
        ctx.shadowBlur = 16; ctx.shadowColor = c
        for (let x = 0; x <= w; x += 2) {
          const y = h / 2 + Math.sin(x / w * Math.PI * f * fMul * 2 + t + ph) * a * aMul * Math.sin(x / w * Math.PI)
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
      ctx.shadowBlur = 0
      for (let i = 0; i < dots; i++) {
        const xf = i / (dots - 1), x = xf * w
        const y = h / 2 + Math.sin(x / w * Math.PI * 2 * 2.2 * fMul + t) * 44 * aMul * Math.sin(x / w * Math.PI)
        const p = reduce ? 1 : 0.5 + 0.5 * Math.sin(t * 2.5 + i * 1.2)
        ctx.beginPath(); ctx.arc(x, y, 4.5 * p, 0, Math.PI * 2)
        ctx.fillStyle = '#60A5FA'; ctx.globalAlpha = 0.9 * p; ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    draw()
    // Redraw immediately when the user picks a different step (static-motion case).
    const onStep = () => { if (reduce) draw() }
    cv.addEventListener('redraw-step', onStep)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      cv.removeEventListener('redraw-step', onStep)
    }
  }, [])

  const togAcc = (i) => setOpenAcc((cur) => (cur === i ? -1 : i))

  const selectHowStep = (i) => {
    setHowStep(i)
    howStepRef.current = i
    waveRef.current?.dispatchEvent(new Event('redraw-step'))
  }

  const onKeyActivate = (fn) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
  }

  return (
    <>
      <CustomCursor hover={CURSOR_HOVER} />
      <Navbar active="home" scrollStuck />

      {/* HERO */}
      <section className="hero" id="home">
        <canvas id="aurora-canvas" ref={auroraRef}></canvas>
        <div className="hero-noise"></div>

        <div className="hero-inner">
          <div className="hero-badge"><div className="dot"></div>AI-Powered Speech Intelligence · FYP 2025–2026</div>

          <h1 className="hero-h">
            Search Inside Videos.
            <em>Instantly.</em>
          </h1>

          <p className="hero-p">
            Drop a YouTube link — our AI extracts every spoken word, timestamps it,
            lets you search, translate into 50+ languages, and jump to any moment in seconds.
          </p>

          <div className="hero-btns">
            <Link to="/project" className="btn btn-primary" style={{ fontSize: '1rem', padding: '16px 34px' }}>🚀 Try the App</Link>
            <a href="#pipeline" className="btn btn-ghost" style={{ fontSize: '1rem', padding: '16px 34px' }}>See the Pipeline</a>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((m, i) => (
            <div className="marquee-item" key={i}><span className="ico" aria-hidden="true">{m.ico}</span>{m.label}</div>
          ))}
        </div>
      </div>

      {/* PIPELINE */}
      <section className="pipeline-section" id="pipeline">
        <div className="pipeline-box reveal">
          <div className="pipe-header">
            <div className="label-pill" style={{ justifyContent: 'center' }}>Under the Hood</div>
            <h2 className="h-xl" style={{ textAlign: 'center', marginBottom: '14px' }}>The AI Pipeline</h2>
            <p className="sub" style={{ textAlign: 'center', margin: '0 auto' }}>Six intelligent steps that turn any video into searchable, translatable knowledge.</p>
          </div>
          <div className="pipe-steps">
            {PIPE_STEPS.map((s, i) => (
              <div className={'pipe-step' + (i === litStep || prefersReducedMotion() ? ' lit' : '')} key={i}>
                <div className="step-orb" aria-hidden="true">{s.orb}</div>
                <div className="step-n">{s.n[0]}<br />{s.n[1]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="feat-section" id="features">
        <div className="feat-header">
          <div className="label-pill reveal">Core Features</div>
          <h2 className="h-xl reveal" style={{ marginBottom: '14px' }}>Everything You Need,<br /><span className="grad">In One Place</span></h2>
          <p className="sub reveal">Six powerful AI capabilities — zero setup required.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <div className={`feat-card reveal d${i + 1}`} key={i}>
              <div className={`feat-icon-wrap ${f.cls}`} aria-hidden="true">{f.ico}</div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-section" id="how">
        <div className="how-grid">
          <div>
            <div className="label-pill reveal">Workflow</div>
            <h2 className="h-xl reveal" style={{ marginBottom: '14px' }}>From Raw Video<br /><span className="grad">to Pure Insight</span></h2>
            <p className="sub reveal" style={{ marginBottom: '40px' }}>Four steps — fully automated from the moment you paste a link.</p>
            <div className="how-steps reveal">
              {HOW_STEPS.map((s, i) => (
                <div
                  className={'how-item' + (i === howStep ? ' on' : '')}
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-pressed={i === howStep}
                  onClick={() => selectHowStep(i)}
                  onKeyDown={onKeyActivate(() => selectHowStep(i))}
                >
                  <div className="how-num" aria-hidden="true">{s.num}</div>
                  <div className="how-txt">
                    <h4>{s.h}</h4>
                    <p>{s.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="how-vis reveal">
            <canvas id="waveCanvas" ref={waveRef}></canvas>
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="team-section" id="team">
        <div className="label-pill reveal">The Team</div>
        <h2 className="h-xl reveal" style={{ marginBottom: '12px' }}>Group Members</h2>
        <p className="sub reveal">Final Year Project · Iqra University, Karachi · B.S. Computer Science</p>
        <div className="team-grid">
          {TEAM.map((m, i) => (
            <div className={`team-card reveal d${i + 1}`} key={i}>
              <div className="team-ava" aria-hidden="true">👤</div>
              <h3>{m.name}</h3>
              <p className="role">{m.roll}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="about-section" id="about">
        <div className="about-grid">
          <div>
            <div className="label-pill reveal">About the Project</div>
            <h2 className="h-xl reveal" style={{ marginBottom: '14px' }}>Project <span className="grad">Deep Dive</span></h2>
            <p className="sub reveal" style={{ marginBottom: '36px' }}>Everything about SpeechFindr — from the problem we're solving to how we built it.</p>
            <div className="acc reveal">
              {ACCORDION.map((a, i) => (
                <div className={'acc-item' + (openAcc === i ? ' open' : '')} key={i}>
                  <button type="button" className="acc-head" aria-expanded={openAcc === i} onClick={() => togAcc(i)}>
                    {a.head} <span className="acc-chevron" aria-hidden="true">+</span>
                  </button>
                  <div className="acc-body"><div className="acc-inner">
                    {a.body}
                    {a.tags && (
                      <div className="tag-row">
                        {a.tags.map((t, j) => <span className="tag" key={j}>{t}</span>)}
                      </div>
                    )}
                  </div></div>
                </div>
              ))}
            </div>
          </div>

          <div className="about-right reveal">
            <div className="sup-card">
              <p>
                <strong>Supervised by:</strong><br />Hafiz Syed Muhammad Rafi<br />
                Senior Lecturer<br />
                Department of Computer Science<br />
                Iqra University, M9 Campus, Karachi<br /><br />
                <strong>Academic Year:</strong> 2025–2026
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-wrap">
        <div className="cta-box reveal">
          <div className="cta-ring"></div>
          <div className="cta-ring cta-ring2"></div>
          <h2>Ready to Search Inside<br /><span className="grad">Any Video?</span></h2>
          <p>No account needed. Just paste a YouTube link and let the AI do the rest.</p>
          <div className="cta-btns">
            <Link to="/project" className="btn btn-primary" style={{ fontSize: '1rem', padding: '16px 36px' }}>🚀 Launch App</Link>
            <Link to="/contact" className="btn btn-ghost" style={{ fontSize: '1rem', padding: '16px 36px' }}>Contact Team</Link>
          </div>
        </div>
      </div>

      <Footer />
    </>
  )
}
