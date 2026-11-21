import { useEffect, useRef, type ReactNode } from 'react'

export default function Sheet({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onCerrar])
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="row between">
          <h2>{titulo}</h2>
          <button className="btn-ghost" aria-label="Cerrar" onClick={onCerrar}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
