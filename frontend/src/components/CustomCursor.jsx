import { useEffect, useRef } from 'react'

/*
 * Faithful port of the custom cursor used across all pages.
 * `hover` (optional): { selectors, cur:[big,small], ring:[big,small] } enables
 * the hover-scale behaviour the Home and Project pages use. Contact omits it.
 */
export default function CustomCursor({ hover = null }) {
  const curRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const cur = curRef.current
    const ring = ringRef.current
    if (!cur || !ring) return

    document.body.classList.add('has-custom-cursor')

    let mx = 0, my = 0, rx = 0, ry = 0, raf = 0
    let hidden = false

    // mousemove never fires over iframes (YouTube embed) or outside the
    // window, so without this the cursor dot freezes at the last position.
    const setHidden = (v) => {
      if (hidden === v) return
      hidden = v
      const op = v ? '0' : '1'
      cur.style.opacity = op
      ring.style.opacity = op
      if (!v) { rx = mx; ry = my }
    }

    const onMove = (e) => {
      mx = e.clientX; my = e.clientY
      cur.style.left = mx + 'px'; cur.style.top = my + 'px'
      setHidden(false)
    }
    document.addEventListener('mousemove', onMove)

    const onDocLeave = () => setHidden(true)
    const onDocEnter = () => setHidden(false)
    const onBlur = () => setHidden(true)
    const onOut = (e) => {
      const to = e.relatedTarget
      if (!to || (to.tagName && to.tagName === 'IFRAME')) setHidden(true)
    }
    document.documentElement.addEventListener('mouseleave', onDocLeave)
    document.documentElement.addEventListener('mouseenter', onDocEnter)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mouseout', onOut)

    const animRing = () => {
      rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px'
      raf = requestAnimationFrame(animRing)
    }
    animRing()

    const cleanups = []
    if (hover) {
      const [curBig, curSmall] = hover.cur
      const [ringBig, ringSmall] = hover.ring
      const els = document.querySelectorAll(hover.selectors)
      els.forEach((el) => {
        const enter = () => {
          cur.style.width = curBig + 'px'; cur.style.height = curBig + 'px'
          ring.style.width = ringBig + 'px'; ring.style.height = ringBig + 'px'
        }
        const leave = () => {
          cur.style.width = curSmall + 'px'; cur.style.height = curSmall + 'px'
          ring.style.width = ringSmall + 'px'; ring.style.height = ringSmall + 'px'
        }
        el.addEventListener('mouseenter', enter)
        el.addEventListener('mouseleave', leave)
        cleanups.push(() => {
          el.removeEventListener('mouseenter', enter)
          el.removeEventListener('mouseleave', leave)
        })
      })
    }

    return () => {
      document.body.classList.remove('has-custom-cursor')
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onDocLeave)
      document.documentElement.removeEventListener('mouseenter', onDocEnter)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mouseout', onOut)
      cancelAnimationFrame(raf)
      cleanups.forEach((fn) => fn())
    }
  }, [hover])

  return (
    <>
      <div className="cursor" id="cursor" ref={curRef}></div>
      <div className="cursor-ring" id="cursorRing" ref={ringRef}></div>
    </>
  )
}
