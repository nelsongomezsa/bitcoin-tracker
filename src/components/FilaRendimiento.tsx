import { useMemo } from 'react'
import { useVista } from '../state/vista'
import { PERIODOS, rendimiento } from '../lib/velas'
import { claseSigno, flecha, porcentajeConSigno } from '../lib/format'

/** Hoy, 7 d, 30 d, 90 d, 180 d y 1 año (o los que se pidan), en verde o rojo con ▲/▼. */
export default function FilaRendimiento({ dias, cambio24h }: { dias?: number[]; cambio24h: number }) {
  const v = useVista()
  const filas = useMemo(
    () => PERIODOS.filter(([, d]) => !dias || dias.includes(d)).map(([l, d]) => [l, d === 1 ? cambio24h : rendimiento(v.historico, v.precios?.EUR ?? 0, d)] as const),
    [v.historico, v.precios, cambio24h, dias],
  )
  return (
    <div className="rend-fila" role="list" aria-label="Rendimiento por periodos">
      {filas.map(([l, r]) => (
        <div key={l} className="stat" role="listitem"><span className="muted" style={{ fontSize: 12 }}>{l}</span>
          <span className={`num ${r == null ? '' : claseSigno(r)}`}>{r == null ? '—' : `${flecha(r)} ${porcentajeConSigno(r, 1)}`}</span></div>
      ))}
    </div>
  )
}
