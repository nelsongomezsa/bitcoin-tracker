import { useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Mini gráfico del valor en los últimos días: ocupa todo el ancho, en naranja, y la línea se dibuja al entrar. */
export default function Sparkline({ valores, alto = 56, etiqueta = 'Valor de la cartera en los últimos 7 días' }: { valores: number[]; alto?: number; etiqueta?: string }) {
  const reducir = useReducedMotion()
  const id = useId()
  const caja = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(300)
  // Se dibuja a tamaño real (sin estirar), para que el trazo no se deforme ni se corte.
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setW(Math.max(100, Math.round(el.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (valores.length < 2) return null
  const min = Math.min(...valores), max = Math.max(...valores)
  const rango = max - min || 1
  const pts = valores.map((v, i): [number, number] => [(i / (valores.length - 1)) * W, alto - 4 - ((v - min) / rango) * (alto - 10)])
  const linea = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M0,${alto} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${W},${alto} Z`
  return (
    <div ref={caja} style={{ width: '100%' }}>
      <svg width={W} height={alto} viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={etiqueta} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F7931A" stopOpacity="0.28" />
            <stop offset="1" stopColor="#F7931A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path d={area} fill={`url(#${id})`} initial={{ opacity: reducir ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: reducir ? 0 : 0.5 }} />
        <motion.polyline points={linea} fill="none" stroke="#F7931A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: reducir ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      </svg>
    </div>
  )
}
