import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/*
 * Shared navbar.
 *  - active: 'home' | 'project' | 'contact'  (adds the underline pill)
 *  - scrollStuck: when true (Home), toggles `.stuck` on scroll past 50px.
 *    When false, the bar is always stuck (Project / Contact).
 *  - right: optional node replacing the default "Launch App" CTA (Project uses this).
 */
export default function Navbar({ active = 'home', scrollStuck = false, right = null }) {
  const [stuck, setStuck] = useState(!scrollStuck)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!scrollStuck) return
    const onScroll = () => setStuck(window.scrollY > 50)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [scrollStuck])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const linkClass = (id) => (active === id ? 'active' : undefined)
  const close = () => setMenuOpen(false)

  return (
    <nav className={'nav' + (stuck ? ' stuck' : '')}>
      <Link to="/" className="logo" onClick={close}>
        <img src="/images/logo.png" alt="SpeechFindr" className="logo-img" />
      </Link>

      <ul className="nav-links">
        <li><Link to="/" className={linkClass('home')}>Home</Link></li>
        <li><Link to="/project" className={linkClass('project')}>Project</Link></li>
        <li><Link to="/contact" className={linkClass('contact')}>Contact</Link></li>
      </ul>

      {right !== null ? right : (
        <Link to="/project" className="nav-cta">Launch App <span aria-hidden="true">→</span></Link>
      )}

      <button
        type="button"
        className={'nav-burger' + (menuOpen ? ' open' : '')}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span></span><span></span><span></span>
      </button>

      <div id="mobile-menu" className={'nav-mobile' + (menuOpen ? ' open' : '')} hidden={!menuOpen}>
        <Link to="/" className={linkClass('home')} onClick={close}>Home</Link>
        <Link to="/project" className={linkClass('project')} onClick={close}>Project</Link>
        <Link to="/contact" className={linkClass('contact')} onClick={close}>Contact</Link>
        <Link to="/project" className="btn btn-primary" onClick={close}>Launch App</Link>
      </div>
      <div
        className={'nav-scrim' + (menuOpen ? ' open' : '')}
        onClick={close}
        aria-hidden="true"
      ></div>
    </nav>
  )
}
