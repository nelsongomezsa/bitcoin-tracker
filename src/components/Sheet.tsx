import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'

export default function Sheet({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reducir = useReducedMotion()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onCerrar])
  return (
    <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <motion.div
        className="sheet stack" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}
        initial={reducir ? { opacity: 0 } : { y: '100%' }} animate={reducir ? { opacity: 1 } : { y: 0 }}
        transition={reducir ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 26 }}
      >
        <div className="row between">
          <h2>{titulo}</h2>
          <button className="btn-ghost" aria-label="Cerrar" onClick={onCerrar}><X size={20} strokeWidth={1.75} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
