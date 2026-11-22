import { motion, useReducedMotion } from 'motion/react'

/** Mini gráfico del valor en los últimos días; la línea se dibuja al entrar. */
export default function Sparkline({ valores, ancho = 120, alto = 36 }: { valores: number[]; ancho?: number; alto?: number }) {
  const reducir = useReducedMotion()
  if (valores.length < 2) return null
  const min = Math.min(...valores), max = Math.max(...valores)
  const rango = max - min || 1
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * ancho},${alto - 3 - ((v - min) / rango) * (alto - 6)}`)
  const sube = valores[valores.length - 1] >= valores[0]
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Valor de la cartera en los últimos 7 días">
      <motion.polyline points={pts.join(' ')} fill="none" stroke={sube ? '#2EE6A6' : '#FF5C6C'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: reducir ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
    </svg>
  )
}
