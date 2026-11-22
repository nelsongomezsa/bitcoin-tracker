import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Pencil } from 'lucide-react'
import { useVista } from '../state/vista'
import PrecioChart from '../components/PrecioChart'
import OperacionSheet from '../components/OperacionSheet'
import Cabecera from '../components/Cabecera'
import Contador from '../components/Contador'
import PrecioVivo from '../components/PrecioVivo'
import Sparkline from '../components/Sparkline'
import { InicioEsqueleto } from '../components/Esqueleto'
import { useTirarRefrescar } from '../hooks/useTirarRefrescar'
import { MONEDAS } from '../lib/schemas'
import { claseSigno, dinero, fechaCorta, flecha, porcentaje, porcentajeConSigno, horaCorta, OCULTO } from '../lib/format'
import { convertir, filaCompra, ordenarPorFecha, proximoNivel, serieCartera, type Operacion } from '../lib/calculos'

const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Inicio() {
  const v = useVista()
  const [hoja, setHoja] = useState<null | { tipo: 'compra' | 'venta'; op?: Operacion }>(null)
  const { dist, refrescando } = useTirarRefrescar(v.refrescar)
  const { res, precio, precios, moneda } = v
  const factor = precios ? precios[moneda] / precios.EUR : 1

  const spark = useMemo(() => {
    const h = v.historico.slice(-8).map((p) => ({ ...p, precio: p.precio * factor }))
    try { return serieCartera(v.ops, h).map((p) => p.valor) } catch { return [] }
  }, [v.historico, v.ops, factor])

  if (v.cargando) return <main className="app"><Cabecera titulo="Inicio" /><InicioEsqueleto /></main>

  const ultimas = ordenarPorFecha(v.ops.filter((o) => o.tipo === 'compra')).slice(-5).reverse()
  const nivel = res ? proximoNivel(v.plan, v.operaciones, v.precios?.EUR ?? 0) : null
  const nivelEnMoneda = nivel ? nivel.precio * factor : undefined
  const ath = v.mercado?.maximoHistorico[moneda]
  const fg = v.mercado?.miedoCodicia
  const comisionAlta = res && res.pctComisiones > 0.03
  const otras = MONEDAS.filter((m) => m !== moneda)
  const sinOps = v.operaciones.length === 0
  const oculto = (s: string) => (v.privado ? OCULTO : s)

  return (
    <main className="app stack">
      <Cabecera titulo="Inicio">
        <div className="seg" role="group" aria-label="Moneda">
          {MONEDAS.map((m) => <button key={m} aria-pressed={moneda === m} onClick={() => v.setMoneda(m)}>{m}</button>)}
        </div>
        <button aria-label={v.privado ? 'Mostrar cifras' : 'Ocultar cifras'} aria-pressed={v.privado} onClick={() => void v.togglePrivado()}>
          {v.privado ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </Cabecera>

      <div className="ptr" style={{ height: refrescando ? 28 : dist }} aria-live="polite">{refrescando ? 'Actualizando…' : dist >= 60 ? 'Suelta para actualizar' : dist > 8 ? 'Tira para actualizar' : ''}</div>

      {v.errorFifo && <p className="card err" role="alert">Tus operaciones no cuadran: hay ventas con más BTC del que había. Revisa la lista.</p>}

      <section className="card saldo stack" aria-label="Saldo">
        <div className="aura" aria-hidden="true" />
        <h3>Valor actual</h3>
        <div className="big">{res ? (v.privado ? OCULTO : <Contador valor={`${nf.format(res.valorHoy)} ${moneda === 'EUR' ? '€' : moneda === 'USD' ? '$' : 'A$'}`} />) : '—'}</div>
        <div className="muted num" style={{ fontSize: 13 }}>
          {otras.map((m, i) => (
            <span key={m}>{i > 0 && ' · '}{v.privado ? OCULTO : dinero(convertir(res?.valorHoy ?? 0, moneda, m, precios ?? { EUR: 1, USD: 1, AUD: 1 }), m, 0)}</span>
          ))}
        </div>
        {res && !v.privado && <div style={{ margin: '4px 0' }}><Sparkline valores={spark} /></div>}
        {res && (
          <div className={`mid ${claseSigno(res.ganancia)}`}>
            {flecha(res.ganancia)} {v.$s(res.ganancia)} <span className="num" style={{ fontSize: 15 }}>({v.pct(res.rentabilidad)})</span>
          </div>
        )}
        <div className="grid2">
          <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Metido</span><span className="num">{res ? v.$(res.invertido) : '—'}</span></div>
          <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Precio de BTC</span>{precio ? <PrecioVivo valor={precio} texto={dinero(precio, moneda, 0)} /> : <span className="num">—</span>}</div>
        </div>
        {v.mercado?.actualizado && <p className="notice">Precio actualizado {horaCorta(v.mercado.actualizado)}</p>}
      </section>

      <div className="chips" aria-label="Resumen del mercado">
        {res && res.btc > 0 && <div className="chip"><span className="k">Precio medio</span><span className="v warn">{v.$(res.precioMedioReal)}</span></div>}
        {res && res.btc > 0 && (
          <div className="chip"><span className="k">Rentable desde</span>
            <span className="v">{res.subidaParaRentable > 0 ? `+${oculto(porcentaje(res.subidaParaRentable))}` : <span className="gain">▲ ya</span>}</span></div>
        )}
        {nivel && <div className="chip"><span className="k">Próximo nivel</span><span className="v key">{dinero(nivelEnMoneda ?? 0, moneda, 0)}</span></div>}
        {fg && <div className="chip"><span className="k">Miedo y codicia</span><span className="v">{fg.valor} · {fg.clasificacion}</span></div>}
        {ath ? <div className="chip"><span className="k">Del máximo</span><span className="v loss">▼ {porcentaje(1 - precio / ath)}</span></div> : null}
      </div>

      <div className="row">
        <button className="btn-primary btn-big" onClick={() => setHoja({ tipo: 'compra' })}>Añadir compra</button>
        <button className="btn-outline btn-big" onClick={() => setHoja({ tipo: 'venta' })}>Retirar / vender</button>
      </div>

      {sinOps && <p className="card muted">Todavía no has apuntado ninguna operación. Empieza con «Añadir compra».</p>}

      <PrecioChart historico={v.historico} precioActualEur={v.precios?.EUR} factor={factor} ops={v.ops} precioMedio={res?.precioMedioReal ?? 0} proximoNivel={nivelEnMoneda} />

      <section className="card stack" aria-label="Últimas compras">
        <div className="row between"><h2>Últimas compras</h2><Link to="/operaciones">Ver todas</Link></div>
        {ultimas.length === 0 ? <p className="muted">Sin compras.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Fecha</th><th>Metido</th><th>Vale hoy</th><th>Rentab.</th><th><span className="sr">Editar</span></th></tr></thead>
              <tbody>
                {ultimas.map((o) => {
                  const f = filaCompra(o, precio)
                  return (
                    <tr key={o.id}>
                      <td className="num">{fechaCorta(o.fecha)}</td>
                      <td className="num">{v.$(f.cantidad)}</td>
                      <td className="num">{v.$(f.valorHoy)}</td>
                      <td className={`num ${claseSigno(f.rentabilidad)}`}>{v.privado ? '••••' : `${flecha(f.rentabilidad)} ${porcentajeConSigno(f.rentabilidad, 1)}`}</td>
                      <td><button className="btn-ghost" aria-label={`Editar compra del ${fechaCorta(o.fecha)}`} onClick={() => setHoja({ tipo: 'compra', op: v.operaciones.find((x) => x.id === o.id) })}><Pencil size={16} strokeWidth={1.75} /></button></td>
                    </tr>
                  )
                })}
                {res && (
                  <tr>
                    <td><b>Total</b></td>
                    <td className="num"><b>{v.$(res.invertido)}</b></td>
                    <td className="num"><b>{v.$(res.valorHoy)}</b></td>
                    <td className={`num ${claseSigno(res.rentabilidad)}`}><b>{v.privado ? '••••' : `${flecha(res.rentabilidad)} ${porcentajeConSigno(res.rentabilidad, 1)}`}</b></td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {comisionAlta && res && <p className="warn">Has pagado el {porcentaje(res.pctComisiones)} de lo metido en comisiones.</p>}
      <div className="row wrap">
        <Link className="btn" to="/calculadoras">Calculadoras</Link>
        <Link className="btn" to="/plan">Plan y objetivos</Link>
      </div>
      <p className="notice">Información de mercado, no una recomendación de inversión.</p>

      {hoja && <OperacionSheet tipo={hoja.tipo} inicial={hoja.op} onCerrar={() => setHoja(null)} />}
    </main>
  )
}
