import { useState } from 'react'
import { useVista } from '../state/vista'
import Cabecera from '../components/Cabecera'
import CarteraTab from './estadisticas/CarteraTab'
import ComprasTab from './estadisticas/ComprasTab'
import MercadoTab from './estadisticas/MercadoTab'

const PESTANAS = [['cartera', 'Mi cartera'], ['compras', 'Mis compras'], ['mercado', 'Mercado']] as const

export default function Estadisticas() {
  const v = useVista()
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number][0]>('cartera')
  if (v.cargando) return <main className="app"><Cabecera titulo="Estadísticas" /><p className="muted" role="status">Cargando…</p></main>
  const sinCompras = !v.ops.some((o) => o.tipo === 'compra')

  return (
    <main className="app stack">
      <Cabecera titulo="Estadísticas" />
      <div className="seg" role="tablist" aria-label="Secciones" style={{ alignSelf: 'flex-start' }}>
        {PESTANAS.map(([k, l]) => <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{l}</button>)}
      </div>
      {pestana !== 'mercado' && sinCompras && <p className="card muted">Apunta tu primera compra para ver estadísticas.</p>}
      {pestana === 'cartera' && !sinCompras && <CarteraTab v={v} />}
      {pestana === 'compras' && !sinCompras && <ComprasTab v={v} />}
      {pestana === 'mercado' && <MercadoTab v={v} />}
      <p className="notice" role="note">Las estadísticas son información sobre tus datos y el mercado, no una recomendación de inversión.</p>
    </main>
  )
}
