import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVista } from '../state/vista'
import OperacionSheet from '../components/OperacionSheet'
import Cabecera from '../components/Cabecera'
import Sheet from '../components/Sheet'
import { calcularFifo, filaCompra, ordenarPorFecha, type Operacion } from '../lib/calculos'
import { btc, claseSigno, dinero, fechaCorta, flecha, hoyISO, porcentaje, porcentajeConSigno } from '../lib/format'
import { mensajeError } from '../lib/errores'

type Filtro = 'todas' | 'compra' | 'venta'

export default function Operaciones() {
  const v = useVista()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [plataforma, setPlataforma] = useState('')
  const [hoja, setHoja] = useState<null | { tipo: 'compra' | 'venta'; op?: Operacion; plantilla?: boolean }>(null)
  const [borrar, setBorrar] = useState<Operacion | null>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()

  const ventas = useMemo(() => {
    try { return new Map(calcularFifo(v.ops).ventas.map((x) => [x.id, x])) } catch { return new Map() }
  }, [v.ops])
  const plataformas = useMemo(() => [...new Set(v.ops.map((o) => o.plataforma).filter(Boolean))] as string[], [v.ops])
  const lista = ordenarPorFecha(v.ops).filter((o) => (filtro === 'todas' || o.tipo === filtro) && (!plataforma || o.plataforma === plataforma)).reverse()
  const original = (id: string) => v.operaciones.find((o) => o.id === id)

  // Los avisos de DCA abren la app en «Duplicar última compra».
  useEffect(() => {
    if (params.get('duplicar') !== '1' || v.cargando) return
    const ultima = ordenarPorFecha(v.ops.filter((o) => o.tipo === 'compra')).at(-1)
    setParams({}, { replace: true })
    if (ultima) duplicar(ultima)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, v.cargando])

  function duplicar(o: Operacion) {
    const m = o.moneda
    const precioHoy = v.precios ? Math.round(v.precios[m]) : o.precio
    const orig = original(o.id) ?? o
    setHoja({ tipo: 'compra', plantilla: true, op: { ...orig, id: '', fecha: hoyISO(), precio: precioHoy } })
  }

  async function confirmarBorrado() {
    if (!borrar) return
    try {
      await v.borrarOperacion(borrar.id)
      setBorrar(null)
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido borrar.'))
    }
  }

  if (v.cargando) return <main className="app"><p className="muted" role="status">Cargando…</p></main>
  return (
    <main className="app stack">
      <Cabecera titulo="Operaciones">
        <div className="seg" role="group" aria-label="Filtro">
          {([['todas', 'Todas'], ['compra', 'Compras'], ['venta', 'Ventas']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>
          ))}
        </div>
      </Cabecera>
      {plataformas.length > 0 && (
        <label style={{ maxWidth: 240 }}>Plataforma
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
            <option value="">Todas</option>
            {plataformas.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      )}
      <div className="row">
        <button className="btn-primary btn-big" onClick={() => setHoja({ tipo: 'compra' })}>Apuntar compra</button>
        <button className="btn-outline btn-big" onClick={() => setHoja({ tipo: 'venta' })}>Apuntar venta</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {lista.length === 0 && <p className="card muted">No hay operaciones en esta vista.</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {lista.map((o) => {
          const f = o.tipo === 'compra' ? filaCompra(o, v.precio) : null
          const vr = ventas.get(o.id)
          return (
            <li key={o.id} className="card stack">
              <div className="row between">
                <b>{o.tipo === 'compra' ? 'Compra' : 'Venta'} · <span className="num">{fechaCorta(o.fecha)}</span></b>
                <span className="num">{v.$(o.cantidad)}</span>
              </div>
              <div className="muted num" style={{ fontSize: 13 }}>
                Precio {dinero(o.precio, v.moneda, 0)} · comisión {v.$(o.comision)}{f && <span className={f.comisionAlta ? 'warn' : ''}> ({porcentaje(f.pctComision)})</span>}
                {o.plataforma ? ` · ${o.plataforma}` : ''}
              </div>
              {o.nota && <div className="notice">{o.nota}</div>}
              {f && (
                <div className={`num ${claseSigno(f.rentabilidad)}`}>
                  {btc(f.btc)} · vale {v.$(f.valorHoy)} · {v.privado ? '••••' : `${flecha(f.rentabilidad)} ${porcentajeConSigno(f.rentabilidad, 1)}`}
                </div>
              )}
              {vr && (
                <div className={`num ${claseSigno(vr.ganancia)}`}>
                  Ganancia realizada (FIFO): {flecha(vr.ganancia)} {v.$s(vr.ganancia)}
                </div>
              )}
              <div className="row wrap">
                <button onClick={() => setHoja({ tipo: o.tipo, op: original(o.id) })}>Editar</button>
                {o.tipo === 'compra' && <button onClick={() => duplicar(o)}>Duplicar</button>}
                <button className="btn-danger" onClick={() => setBorrar(o)}>Borrar</button>
              </div>
            </li>
          )
        })}
      </ul>
      {hoja && <OperacionSheet tipo={hoja.tipo} inicial={hoja.op} plantilla={hoja.plantilla} onCerrar={() => setHoja(null)} />}
      {borrar && (
        <Sheet titulo="¿Borrar esta operación?" onCerrar={() => setBorrar(null)}>
          <p className="muted">Se borrará la {borrar.tipo} del {fechaCorta(borrar.fecha)}. No se puede deshacer.</p>
          <div className="row">
            <button onClick={() => setBorrar(null)}>Cancelar</button>
            <button className="btn-danger" style={{ flex: 1 }} onClick={() => void confirmarBorrado()}>Borrar</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
