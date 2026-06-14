import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import Footer from '../components/Footer.jsx'
import CustomCursor from '../components/CustomCursor.jsx'
import useReveal from '../hooks/useReveal.js'
import '../styles/contact.css'

const ERR_BORDER = 'rgba(239,68,68,0.5)'

export default function Contact() {
  useReveal(0.08)
  const [fields, setFields] = useState({ fName: '', lName: '', fEmail: '', fSubj: '', fMsg: '' })
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)

  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }))
  const clearErr = (k) => setErrors((e) => (e[k] ? { ...e, [k]: false } : e))

  const submitForm = () => {
    const first = fields.fName.trim()
    const email = fields.fEmail.trim()
    const msg = fields.fMsg.trim()
    const next = {}
    if (!first) next.fName = true
    if (!email || !email.includes('@')) next.fEmail = true
    if (!msg) next.fMsg = true
    setErrors(next)
    if (Object.keys(next).length) return
    setSent(true)
  }

  const resetForm = () => {
    setFields({ fName: '', lName: '', fEmail: '', fSubj: '', fMsg: '' })
    setErrors({})
    setSent(false)
  }

  const ctrlStyle = (k) => (errors[k] ? { borderColor: ERR_BORDER } : undefined)

  return (
    <>
      <CustomCursor />
      <Navbar active="contact" />

      <div className="contact-shell">
        <div className="bg-blobs"><div className="blob blob1"></div><div className="blob blob2"></div><div className="blob blob3"></div></div>
        <div className="grid-bg"></div>

        {/* Hero */}
        <div className="c-hero reveal">
          <div className="label-pill" style={{ justifyContent: 'center', marginBottom: '18px' }}>Get In Touch</div>
          <h1>Contact <span className="grad">Our Team</span></h1>
          <p>Questions about our FYP, want to collaborate, or just want to say hi? We'd love to hear from you.</p>
        </div>

        {/* Grid */}
        <div className="c-grid">

          {/* FORM */}
          <div className="form-card reveal">
            <h2>Send a Message</h2>
            <p className="sub-desc">Fill out the form and we'll get back to you within 24 hours.</p>

            {!sent && (
              <div id="theForm">
                <div className="f-row">
                  <div className="f-group"><label>First Name</label><input type="text" className="f-ctrl" placeholder="John" value={fields.fName} style={ctrlStyle('fName')} onFocus={() => clearErr('fName')} onChange={(e) => setField('fName', e.target.value)} /></div>
                  <div className="f-group"><label>Last Name</label><input type="text" className="f-ctrl" placeholder="Doe" value={fields.lName} onFocus={() => clearErr('lName')} onChange={(e) => setField('lName', e.target.value)} /></div>
                </div>
                <div className="f-group"><label>Email Address</label><input type="email" className="f-ctrl" placeholder="john@example.com" value={fields.fEmail} style={ctrlStyle('fEmail')} onFocus={() => clearErr('fEmail')} onChange={(e) => setField('fEmail', e.target.value)} /></div>
                <div className="f-group">
                  <label>Subject</label>
                  <select className="f-ctrl" value={fields.fSubj} onFocus={() => clearErr('fSubj')} onChange={(e) => setField('fSubj', e.target.value)}>
                    <option value="">Select a subject...</option>
                    <option>FYP Inquiry</option><option>Collaboration</option>
                    <option>Technical Question</option><option>Supervisor Contact</option><option>Other</option>
                  </select>
                </div>
                <div className="f-group"><label>Message</label><textarea className="f-ctrl" placeholder="Write your message here..." value={fields.fMsg} style={ctrlStyle('fMsg')} onFocus={() => clearErr('fMsg')} onChange={(e) => setField('fMsg', e.target.value)}></textarea></div>
                <button className="sub-btn" onClick={submitForm}>📨 Send Message</button>
              </div>
            )}

            <div className={'success-panel' + (sent ? ' show' : '')} id="successPanel">
              <div className="s-check">✅</div>
              <h3>Message Sent!</h3>
              <p>Thanks for reaching out. We'll reply within 24 hours.</p>
              <button onClick={resetForm} className="btn btn-ghost" style={{ marginTop: '6px', fontSize: '.85rem', padding: '10px 22px' }}>Send Another →</button>
            </div>
          </div>

          {/* INFO */}
          <div className="info-col">

            <div className="info-card reveal d1">
              <h4>🏛 Project Info</h4>
              <div className="c-item">
                <div className="c-ico">🎓</div>
                <div className="c-det"><strong>University</strong><span>Iqra University — M9 Campus, Karachi</span></div>
              </div>
              <div className="c-item">
                <div className="c-ico c">📚</div>
                <div className="c-det"><strong>Department</strong><span>B.S. Computer Science</span></div>
              </div>
              <div className="c-item">
                <div className="c-ico">👨‍🏫</div>
                <div className="c-det"><strong>Supervisor</strong><span>Hafiz Syed Muhammad Rafi (Senior Lecturer)</span></div>
              </div>
              <div className="c-item">
                <div className="c-ico">🗓</div>
                <div className="c-det"><strong>Year</strong><span>Final Year Project 2025–2026 · Batch 22</span></div>
              </div>
            </div>

            <div className="info-card reveal d2">
              <h4>👥 Team Members</h4>
              <div className="team-mini">
                <div className="tm-card"><strong>Awaab Mubashar Siddique</strong><span>IU09-0122-9036</span></div>
                <div className="tm-card"><strong>Anas Tanveer</strong><span>IU09-0122-9039</span></div>
                <div className="tm-card"><strong>Abdul Rafay Khan</strong><span>IU09-0122-9037</span></div>
                <div className="tm-card"><strong>Muhammad Ismail</strong><span>IU09-0122-9041</span></div>
              </div>
            </div>

            <div className="info-card reveal d3">
              <h4>🔗 Connect</h4>
              <div className="soc-grid">
                <Link to="/" className="soc-card"><div className="soc-ico">🌐</div>Website</Link>
              </div>
            </div>

            <div className="loc-card reveal d4">
              <div className="loc-map">Iqra University, M9 Campus, Karachi</div>
              <div className="loc-info"><strong>Iqra University</strong><br />M9 Campus,<br />Karachi, Pakistan</div>
            </div>

          </div>
        </div>
      </div>

      <Footer />

      <div className="toasts" id="toasts"></div>
    </>
  )
}
