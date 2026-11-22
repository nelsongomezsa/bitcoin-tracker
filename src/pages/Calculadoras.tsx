import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVista } from '../state/vista'
import { bajarMedia, escenarioPrecio, siVendoHoy, VentaExcedidaError } from '../lib/calculos'
import Cabecera from '../components/Cabecera'
import { btc as fBtc, claseSigno, dinero, flecha } from '../lib/format'

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export default function Calculadoras() {
  const v = useVista()
  const { res, precio, moneda } = v
  const [objetivo, setObjetivo] = useState('')
  const [escenario, setEscenario] = useState(precio ? String(Math.round(precio)) : '')
  const [cantVender, setCantVender] = useState('')
  const [todo, setTodo] = useState(true)

  const bm = useMemo(() => {
    const o = aNum(objetivo)
    return o > 0 && precio > 0 ? bajarMedia(v.ops, o, precio) : null
  }, [objetivo, precio, v.ops])
  const esc = useMemo(() => {
    const p = aNum(escenario)
    return p > 0 ? escenarioPrecio(v.ops, p) : null
  }, [escenario, v.ops])

  const venta = useMemo(() => {
    if (!precio || !res || res.btc <= 0) return { error: '' as const, sim: null }
    try {
      const n = aNum(cantVender)
      if (!todo && !(n > 0)) return { error: '' as const, sim: null }
      return { error: '' as const, sim: siVendoHoy(v.ops, precio, todo ? undefined : n) }
    } catch (e) {
      return { error: e instanceof VentaExcedidaError ? 'No tienes tanto BTC.' : 'No se puede calcular.', sim: null }
    }
  }, [v.ops, precio, res, todo, cantVender])

  const slider = Math.min(Math.max(aNum(escenario) || precio, precio * 0.2 || 1), precio * 4 || 1)
  const motivos = { sin_btc: 'Todavía no tienes BTC apuntado.', ya_alcanzado: 'Tu precio medio ya está en ese valor o por debajo.', precio_alto: 'Al precio actual no es posible: el precio de BTC tiene que estar por debajo de tu objetivo.' }

  return (
    <main className="app stack">
      <Cabecera titulo="Calculadoras"><Link to="/">← Inicio</Link></Cabecera>
      {!precio && <p className="card muted">Sin precio actual no se pueden hacer los cálculos.</p>}

      <section className="card stack" aria-label="Bajar mi media">
        <h2>Bajar mi media</h2>
        <p className="muted">Precio medio actual: <b className="num warn">{res ? v.$(res.precioMedioReal) : '—'}</b> · BTC ahora: <span className="num">{dinero(precio, moneda, 0)}</span></p>
        <label>Precio medio al que quiero llegar ({moneda})
          <input inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
        </label>
        {bm && (bm.posible ? (
          <div className="stack" aria-live="polite">
            <p>Tendrías que comprar <b className="num">{v.$(bm.importe)}</b> al precio actual ({fBtc(bm.btcNuevos)}).</p>
            <p className="muted num">Tu precio medio quedaría en {v.$(bm.nuevaMedia)}.</p>
          </div>
        ) : <p className="warn" role="status">{motivos[bm.motivo]}</p>)}
      </section>

      <section className="card stack" aria-label="¿Y si BTC llega a X?">
        <h2>¿Y si BTC llega a X?</h2>
        <label>Precio de BTC ({moneda})
          <input inputMode="decimal" value={escenario} onChange={(e) => setEscenario(e.target.value)} />
        </label>
        {precio > 0 && <input type="range" aria-label="Precio de BTC" min={Math.round(precio * 0.2)} max={Math.round(precio * 4)} step={Math.max(1, Math.round(precio / 200))} value={slider} onChange={(e) => setEscenario(e.target.value)} />}
        {esc && (
          <div className="stack" aria-live="polite">
            <p className="num">Tu cartera valdría {v.$(esc.valor)}</p>
            <p className={`num ${claseSigno(esc.ganancia)}`}>{flecha(esc.ganancia)} {v.$s(esc.ganancia)} ({v.pct(esc.rentabilidad)})</p>
          </div>
        )}
        <p className="notice">Es un cálculo hipotético, no una predicción.</p>
      </section>

      <section className="card stack" aria-label="Si vendo hoy">
        <h2>Si vendo hoy</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} /> Vender todo
        </label>
        {!todo && <label>BTC a vender<input inputMode="decimal" value={cantVender} onChange={(e) => setCantVender(e.target.value)} /></label>}
        {venta.error && <p className="err" role="alert">{venta.error}</p>}
        {venta.sim && (
          <div className="stack" aria-live="polite">
            <p className="num">Vendes {v.btcF(venta.sim.btc)} y recibes {v.$(venta.sim.ingreso)}</p>
            <p className="num muted">Coste de adquisición (FIFO): {v.$(venta.sim.coste)}</p>
            <p className={`num ${claseSigno(venta.sim.ganancia)}`}>{flecha(venta.sim.ganancia)} Ganancia o pérdida: {v.$s(venta.sim.ganancia)}</p>
            {moneda === 'EUR' ? (
              <p className="num">IRPF del ahorro estimado: {v.$(venta.sim.irpfEstimado)} ({v.pct(venta.sim.ganancia > 0 ? venta.sim.irpfEstimado / venta.sim.ganancia : 0).replace('+', '')})</p>
            ) : <p className="muted">La estimación del IRPF solo está disponible en euros.</p>}
          </div>
        )}
        <p className="notice" role="note">Es una orientación basada en los tramos generales del ahorro en España (del 19 % al 30 %). No es asesoramiento fiscal: consulta a un profesional.</p>
      </section>
    </main>
  )
}
