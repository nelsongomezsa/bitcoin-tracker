import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Título de pantalla; al hacer scroll la cabecera se vuelve de cristal. */
export default function Cabecera({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div ref={sentinel} className="cabecera-sentinel" aria-hidden="true" />
      <header className={`cabecera ${scrolled ? 'scrolled' : ''}`}>
        <h1>{titulo}</h1>
        {children && <div className="row">{children}</div>}
      </header>
    </>
  )
}
