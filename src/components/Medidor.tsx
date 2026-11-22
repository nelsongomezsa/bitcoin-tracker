import { motion, useReducedMotion } from 'motion/react'
import { ZONAS } from '../shared/avisosCatalogo.mjs'

const COL = ['#FF5C6C', '#F7931A', '#8A94A6', '#7CC4FF', '#2EE6A6']
const R = 78, CX = 100, CY = 100

const punto = (frac: number, r = R) => {
  const a = Math.PI * (1 - frac)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

/** Medidor semicircular del índice de miedo y codicia (0-100). */
export default function Medidor({ valor, clasificacion }: { valor: number; clasificacion?: string }) {
  const reducir = useReducedMotion()
  const arcos = ZONAS.map((z, i) => {
    const desde = i === 0 ? 0 : ZONAS[i - 1].hasta + 1
    const [x1, y1] = punto(desde / 100), [x2, y2] = punto((z.hasta + 1) / 100)
    return <path key={z.id} d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`} stroke={COL[i]} strokeWidth="12" fill="none" opacity="0.9" />
  })
  return (
    <svg className="gauge" viewBox="0 0 200 124" width="100%" style={{ maxWidth: 280 }} role="img" aria-label={`Índice de miedo y codicia: ${valor}${clasificacion ? `, ${clasificacion}` : ''}`}>
      {arcos}
      <motion.g initial={{ rotate: reducir ? (valor / 100) * 180 - 90 : -90 }} animate={{ rotate: (valor / 100) * 180 - 90 }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} style={{ originX: `${CX}px`, originY: `${CY}px` }}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + 8} stroke="#E8ECF2" strokeWidth="3" strokeLinecap="round" />
      </motion.g>
      <circle cx={CX} cy={CY} r="6" fill="#E8ECF2" />
      <text x={CX} y={CY + 22} textAnchor="middle" fill="#E8ECF2" fontSize="22" fontWeight="700">{valor}</text>
    </svg>
  )
}
