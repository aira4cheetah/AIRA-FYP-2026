import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer>
      <div className="ft-grid">
        <div className="ft-brand">
          <Link to="/" className="logo" style={{ textDecoration: 'none' }}><div className="logo-mark">🎤</div>Speech<span>Findr</span></Link>
          <p>AI-powered speech recognition — find exactly what you need inside any video. Instantly, accurately.</p>
        </div>
        <div className="ft-col"><h5>Pages</h5><Link to="/">Home</Link><Link to="/project">Project</Link><Link to="/contact">Contact</Link></div>
        <div className="ft-col"><h5>Features</h5><Link to="/project">Speech-to-Text</Link><Link to="/project">Search</Link><Link to="/project">Translation</Link><Link to="/project">Summaries</Link></div>
        <div className="ft-col"><h5>Project</h5><a href="#">Iqra University</a><Link to="/contact">Team</Link></div>
      </div>
      <div className="ft-bot">
        <p>© 2025–2026 SpeechFindr — FYP, Iqra University Karachi</p>
      </div>
    </footer>
  )
}
