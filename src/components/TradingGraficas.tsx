import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { FilaTrade } from '../lib/trading'
import { fechaCorta } from '../lib/format'

/** Ancho real del contenedor, para dibujar sin estirar. */
function useAncho() {
  const caja = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(320)
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { caja, W }
}

const nf = (n: number, d = 4) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(n)

/** Total de BTC ganados acumulado trade a trade, en línea escalonada (como en el Excel), y barras con el % de cada trade. */
export default function TradingGraficas({ filas }: { filas: FilaTrade[] }) {
  const reducir = useReducedMotion()
  const a = useAncho()
  const b = useAncho()
  const cerrados = filas.filter((f) => !f.calculo.abierto)
  if (cerrados.length < 2) return <section className="card"><p className="muted">Las gráficas aparecen cuando hay al menos dos trades cerrados.</p></section>

  // ── Escalonada ──
  const H = 150, pad = { l: 8, r: 8, t: 12, b: 18 }
  const acum = cerrados.map((f) => f.acumulado ?? 0)
  const lo = Math.min(0, ...acum), hi = Math.max(0, ...acum), rg = hi - lo || 1
  const x = (i: number) => pad.l + (i / (cerrados.length - 1)) * (a.W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / rg) * (H - pad.t - pad.b)
  let d = `M${x(0)},${y(0)} L${x(0)},${y(acum[0])}`
  for (let i = 1; i < acum.length; i++) d += ` L${x(i)},${y(acum[i - 1])} L${x(i)},${y(acum[i])}`
  const final = acum[acum.length - 1]
  const color = final >= 0 ? 'var(--gain)' : 'var(--loss)'

  // ── Barras ──
  const H2 = 110
  const pcts = cerrados.map((f) => f.calculo.pct)
  const m = Math.max(0.0001, ...pcts.map(Math.abs))
  const bw = Math.max(2, Math.min(18, (b.W - 16) / pcts.length - 3))
  const cx = (i: number) => 8 + ((i + 0.5) / pcts.length) * (b.W - 16)
  const mid = H2 / 2

  return (
    <section className="card stack" aria-label="Gráficas de trading">
      <h2>BTC ganados, acumulado</h2>
      <div ref={a.caja} style={{ width: '100%' }}>
        <svg width={a.W} height={H} viewBox={`0 0 ${a.W} ${H}`} role="img" aria-label={`Total de BTC ganados acumulado trade a trade: de ${nf(acum[0])} a ${nf(final)} BTC`} style={{ display: 'block' }}>
          <line x1={pad.l} x2={a.W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeDasharray="3 4" />
          <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" initial={{ pathLength: reducir ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
          <text x={pad.l} y={H - 4} fill="var(--muted)" fontSize="10" fontFamily="var(--mono)">{fechaCorta(cerrados[0].trade.fechaCierre ?? cerrados[0].trade.fechaInicio)}</text>
          <text x={a.W - pad.r} y={H - 4} fill="var(--muted)" fontSize="10" fontFamily="var(--mono)" textAnchor="end">{fechaCorta(cerrados[cerrados.length - 1].trade.fechaCierre ?? cerrados[cerrados.length - 1].trade.fechaInicio)}</text>
          <text x={pad.l} y={11} fill={color} fontSize="11" fontFamily="var(--mono)">{final > 0 ? '▲ +' : final < 0 ? '▼ −' : ''}{nf(Math.abs(final))} BTC</text>
        </svg>
      </div>

      <h2>% de cada trade</h2>
      <div ref={b.caja} style={{ width: '100%' }}>
        <svg width={b.W} height={H2} viewBox={`0 0 ${b.W} ${H2}`} role="img" aria-label="Porcentaje de ganancia de cada trade cerrado" style={{ display: 'block' }}>
          <line x1={8} x2={b.W - 8} y1={mid} y2={mid} stroke="var(--border-strong)" />
          {pcts.map((p, i) => {
            const h = Math.max(1.5, (Math.abs(p) / m) * (mid - 6))
            return (
              <motion.rect key={cerrados[i].trade.id} x={cx(i) - bw / 2} width={bw} rx={2} y={p >= 0 ? mid - h : mid} height={h} fill={p >= 0 ? 'var(--gain)' : 'var(--loss)'}
                initial={{ opacity: reducir ? 1 : 0, scaleY: reducir ? 1 : 0.2 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ delay: reducir ? 0 : i * 0.02, duration: 0.25 }}
                style={{ transformBox: 'fill-box', transformOrigin: p >= 0 ? 'bottom' : 'top' }}>
                <title>{`${fechaCorta(cerrados[i].trade.fechaCierre ?? cerrados[i].trade.fechaInicio)}: ${p >= 0 ? '+' : '−'}${nf(Math.abs(p) * 100, 2)} %`}</title>
              </motion.rect>
            )
          })}
        </svg>
      </div>
      <p className="notice">Verde ▲ ganancia, rojo ▼ pérdida. Cada barra es un trade cerrado.</p>
    </section>
  )
}
