import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useVista } from '../state/vista'
import { estadoNiveles, precioObjetivoPorGanancia, progresoDca, progresoObjetivo, totalPlanificadoPct, type Plan as PlanT } from '../lib/calculos'
import type { Objetivos } from '../lib/tipos'
import { planSchema } from '../lib/schemas'
import { dinero, hoyISO, porcentaje, btc as fBtc } from '../lib/format'
import { mensajeError } from '../lib/errores'
import Cabecera from '../components/Cabecera'

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const optNum = (s: string) => (s.trim() === '' ? undefined : aNum(s))

function Barra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(valor * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={etiqueta} style={{ background: 'var(--border)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
      <div style={{ width: `${valor * 100}%`, background: 'var(--accent)', height: '100%' }} />
    </div>
  )
}

export default function Plan() {
  const v = useVista()
  const [editando, setEditando] = useState(false)
  const [msg, setMsg] = useState('')
  const [capital, setCapital] = useState(String(v.plan.capital))
  const [niveles, setNiveles] = useState(v.plan.nivelesClave.map((n) => ({ precio: String(n.precio), pct: String(n.porcentajeCapital) })))
  const [dca, setDca] = useState({ inicio: v.plan.dca.inicio ?? '', pct: String(v.plan.dca.porcentajeSemanal), semanas: String(v.plan.dca.semanas), arranque: v.plan.dca.precioInicio ? String(v.plan.dca.precioInicio) : '', monedaArranque: (v.plan.dca.monedaInicio ?? 'EUR') as string })
  const [obj, setObj] = useState({
    btcMeta: v.objetivos.btcMeta != null ? String(v.objetivos.btcMeta) : '',
    dineroMeta: v.objetivos.dineroMeta != null ? String(v.objetivos.dineroMeta) : '',
    modo: v.objetivos.precioVenta?.modo ?? 'porcentaje',
    valor: v.objetivos.precioVenta ? String(v.objetivos.precioVenta.valor) : '',
  })

  const plan = v.plan
  const estados = estadoNiveles(plan, v.operaciones)
  const total = totalPlanificadoPct(plan)
  const dcaP = progresoDca(plan, hoyISO())
  const res = v.res
  const pv = v.objetivos.precioVenta
  const precioVenta = pv && res ? (pv.modo === 'precio' ? pv.valor : precioObjetivoPorGanancia(res.precioMedioReal, pv.valor)) : null

  function abrirEdicion() {
    setCapital(String(v.plan.capital))
    setNiveles(v.plan.nivelesClave.map((n) => ({ precio: String(n.precio), pct: String(n.porcentajeCapital) })))
    setDca({ inicio: v.plan.dca.inicio ?? '', pct: String(v.plan.dca.porcentajeSemanal), semanas: String(v.plan.dca.semanas), arranque: v.plan.dca.precioInicio ? String(v.plan.dca.precioInicio) : '', monedaArranque: v.plan.dca.monedaInicio ?? 'EUR' })
    setObj({
      btcMeta: v.objetivos.btcMeta != null ? String(v.objetivos.btcMeta) : '',
      dineroMeta: v.objetivos.dineroMeta != null ? String(v.objetivos.dineroMeta) : '',
      modo: v.objetivos.precioVenta?.modo ?? 'porcentaje',
      valor: v.objetivos.precioVenta ? String(v.objetivos.precioVenta.valor) : '',
    })
    setMsg('')
    setEditando(true)
  }

  async function guardar() {
    setMsg('')
    const nuevo: PlanT = {
      capital: aNum(capital),
      nivelesClave: niveles.map((n) => ({ precio: aNum(n.precio), porcentajeCapital: aNum(n.pct) })),
      dca: {
        ...(dca.inicio ? { inicio: dca.inicio } : {}),
        porcentajeSemanal: aNum(dca.pct),
        semanas: Math.trunc(aNum(dca.semanas)),
        ...(optNum(dca.arranque) ? { precioInicio: optNum(dca.arranque), monedaInicio: dca.monedaArranque as 'EUR' | 'USD' | 'AUD' } : {}),
      },
    }
    const objetivos: Objetivos = {
      btcMeta: optNum(obj.btcMeta), dineroMeta: optNum(obj.dineroMeta),
      ...(optNum(obj.valor) ? { precioVenta: { modo: obj.modo as 'porcentaje' | 'precio', valor: optNum(obj.valor)! } } : {}),
    }
    const ok = planSchema.safeParse({ ...nuevo, objetivos })
    if (!ok.success) return setMsg('Revisa los números del plan: ' + ok.error.issues[0].message)
    try {
      await v.guardarPlan(nuevo, objetivos)
      setEditando(false)
    } catch (e) {
      setMsg(mensajeError(e, 'No se ha podido guardar el plan.'))
    }
  }

  if (editando) {
    return (
      <main className="app stack">
        <h1>Editar plan</h1>
        <p className="notice">Los precios de los niveles van en euros.</p>
        <label>Capital total (€)<input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /></label>
        <section className="card stack">
          <h2>Niveles clave</h2>
          {niveles.map((n, i) => (
            <div className="row" key={i}>
              <label style={{ flex: 1 }}>Precio<input inputMode="decimal" value={n.precio} onChange={(e) => setNiveles(niveles.map((x, j) => (j === i ? { ...x, precio: e.target.value } : x)))} /></label>
              <label style={{ width: 100 }}>% capital<input inputMode="decimal" value={n.pct} onChange={(e) => setNiveles(niveles.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} /></label>
              <button aria-label={`Quitar nivel ${i + 1}`} onClick={() => setNiveles(niveles.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button onClick={() => setNiveles([...niveles, { precio: '', pct: '' }])}>Añadir nivel</button>
        </section>
        <section className="card stack">
          <h2>DCA semanal</h2>
          <div className="grid2">
            <label>Inicio (opcional)<input type="date" value={dca.inicio} onChange={(e) => setDca({ ...dca, inicio: e.target.value })} /></label>
            <label>% semanal<input inputMode="decimal" value={dca.pct} onChange={(e) => setDca({ ...dca, pct: e.target.value })} /></label>
            <label>Semanas<input inputMode="numeric" value={dca.semanas} onChange={(e) => setDca({ ...dca, semanas: e.target.value })} /></label>
            <label>Precio de arranque (opcional)<input inputMode="decimal" value={dca.arranque} onChange={(e) => setDca({ ...dca, arranque: e.target.value })} /></label>
            <label>Moneda del arranque
              <select value={dca.monedaArranque} onChange={(e) => setDca({ ...dca, monedaArranque: e.target.value })}><option>EUR</option><option>USD</option><option>AUD</option></select>
            </label>
          </div>
        </section>
        <section className="card stack">
          <h2>Objetivos</h2>
          <label>Llegar a (BTC)<input inputMode="decimal" value={obj.btcMeta} onChange={(e) => setObj({ ...obj, btcMeta: e.target.value })} /></label>
          <label>Meter en total (€)<input inputMode="decimal" value={obj.dineroMeta} onChange={(e) => setObj({ ...obj, dineroMeta: e.target.value })} /></label>
          <div className="grid2">
            <label>Precio de venta objetivo por
              <select value={obj.modo} onChange={(e) => setObj({ ...obj, modo: e.target.value as 'porcentaje' | 'precio' })}>
                <option value="porcentaje">% de ganancia</option><option value="precio">Precio de BTC (€)</option>
              </select>
            </label>
            <label>Valor<input inputMode="decimal" value={obj.valor} onChange={(e) => setObj({ ...obj, valor: e.target.value })} /></label>
          </div>
        </section>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="row"><button onClick={() => setEditando(false)}>Cancelar</button><button className="btn-primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar</button></div>
      </main>
    )
  }

  return (
    <main className="app stack">
      <Cabecera titulo="Plan y objetivos"><button onClick={abrirEdicion}>Editar</button></Cabecera>
      <Link to="/">← Inicio</Link>

      <section className="card stack" aria-label="Niveles clave">
        <div className="row between"><h2>Niveles clave</h2><span className="num">Capital {v.privado ? '••••' : dinero(plan.capital)}</span></div>
        {estados.length === 0 ? <p className="muted">Aún no has definido niveles. Pulsa «Editar».</p> : (
          <table>
            <thead><tr><th>Precio</th><th>Importe</th><th>Estado</th></tr></thead>
            <tbody>
              {estados.map((e) => (
                <tr key={e.precio}>
                  <td className="num">{dinero(e.precio, 'EUR', 0)}</td>
                  <td className="num">{v.privado ? '••••' : dinero(e.importe)}</td>
                  <td><span className={`pill ${e.estado === 'Comprado' ? 'ok' : 'pend'}`}>{e.estado === 'Comprado' ? '✓ Comprado' : 'Pendiente'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="num">Total planificado: {total.toLocaleString('es-ES')} % {total !== 100 && <span className="warn" role="alert">· no suma 100 %</span>}</p>
      </section>

      <section className="card stack" aria-label="DCA">
        <h2>DCA semanal</h2>
        <p className="num">{dcaP.semanaActual === 0 ? 'Aún no ha empezado' : `Semana ${dcaP.semanaActual} de ${dcaP.semanas}`} · {v.privado ? '••••' : dinero(dcaP.importeSemanal)} por semana</p>
        <Barra valor={dcaP.semanas ? dcaP.semanaActual / dcaP.semanas : 0} etiqueta="Progreso del DCA" />
        <p className="muted num">Según el plan, quedan por meter {v.privado ? '••••' : dinero(dcaP.quedaPorMeter)}</p>
      </section>

      <section className="card stack" aria-label="Objetivos">
        <h2>Objetivos</h2>
        {v.objetivos.btcMeta && res && (
          <div className="stack"><span>Llegar a {fBtc(v.objetivos.btcMeta)}</span><Barra valor={progresoObjetivo(res.btc, v.objetivos.btcMeta)} etiqueta="Progreso en BTC" />
            <span className="muted num">{v.btcF(res.btc)} · {porcentaje(progresoObjetivo(res.btc, v.objetivos.btcMeta), 0)}</span></div>
        )}
        {v.objetivos.dineroMeta && res && (
          <div className="stack"><span>Meter {dinero(v.objetivos.dineroMeta, 'EUR', 0)}</span><Barra valor={progresoObjetivo(res.invertido, v.objetivos.dineroMeta)} etiqueta="Progreso en dinero metido" />
            <span className="muted num">{v.$(res.invertido)} · {porcentaje(progresoObjetivo(res.invertido, v.objetivos.dineroMeta), 0)}</span></div>
        )}
        {precioVenta != null && <p>Precio de venta objetivo: <b className="num key">{dinero(precioVenta, v.moneda, 0)}</b> · te avisaremos al alcanzarlo.</p>}
        {!v.objetivos.btcMeta && !v.objetivos.dineroMeta && precioVenta == null && <p className="muted">Sin objetivos todavía. Pulsa «Editar».</p>}
      </section>
    </main>
  )
}
