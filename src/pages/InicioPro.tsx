import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Maximize2 } from 'lucide-react'
import { useVista } from '../state/vista'
import Cabecera from '../components/Cabecera'
import PrecioVivo from '../components/PrecioVivo'
import FilaRendimiento from '../components/FilaRendimiento'
import OperacionSheet from '../components/OperacionSheet'
import Esqueleto from '../components/Esqueleto'
import ErrorBoundary from '../components/ErrorBoundary'
import { useTirarRefrescar } from '../hooks/useTirarRefrescar'
import { MONEDAS } from '../lib/schemas'
import { btcDeCompra, btcDeVenta, calcularFifo, estadoNiveles, filaCompra, ordenarPorFecha, progresoDca, type Operacion } from '../lib/calculos'
import { filasTrades } from '../lib/trading'
import { btc as fBtc, btcConSigno, claseSigno, dinero, fechaCorta, flecha, hoyISO, OCULTO } from '../lib/format'
import type { Temporalidad } from '../lib/velas'

// Las velas se cargan aparte y solo cuando hacen falta: el resumen se pinta antes.
const GraficoVelas = lazy(() => import('../components/GraficoVelas'))
const TF_PRO: readonly Temporalidad[] = ['15m', '1h', '4h', '1D', '1S']
const PESTANAS = [['operaciones', 'Operaciones'], ['trades', 'Trades'], ['plan', 'Plan'], ['avisos', 'Avisos']] as const
type Pestana = (typeof PESTANAS)[number][0]

export default function InicioPro() {
  const v = useVista()
  const [pestana, setPestana] = useState<Pestana>('operaciones')
  const [hoja, setHoja] = useState<null | { tipo: 'compra' | 'venta'; op?: Operacion }>(null)
  const { dist, refrescando } = useTirarRefrescar(v.refrescar)
  const { res, moneda, precio } = v
  const oculto = (s: string) => (v.privado ? OCULTO : s)
  const valor = res ? res.valorHoy + v.extraValor : 0
  const pnl = res ? res.ganancia + v.extraValor : 0
  const pnlPct = res && res.invertido > 0 ? pnl / res.invertido : res?.rentabilidad ?? 0
  const cambio24 = v.ticks24h[moneda === 'USD' ? 'USD' : 'EUR']?.cambioPct
  const cambioDia = cambio24 != null && Number.isFinite(cambio24) ? cambio24 / 100 : (v.mercado?.cambio24h ?? 0)

  const ventas = useMemo(() => {
    try { return new Map(calcularFifo(v.ops).ventas.map((x) => [x.id, x])) } catch { return new Map() }
  }, [v.ops])
  const filas = useMemo(() => ordenarPorFecha(v.ops).reverse().slice(0, 10), [v.ops])
  const trades = useMemo(() => (v.precios ? filasTrades(v.trades, v.precios, moneda).reverse().slice(0, 8) : []), [v.trades, v.precios, moneda])
  const niveles = useMemo(() => estadoNiveles(v.plan, v.operaciones, v.precios ?? undefined), [v.plan, v.operaciones, v.precios])
  const dca = useMemo(() => progresoDca(v.plan, hoyISO()), [v.plan])
  const avisosActivos = Object.values(v.avisos.ajustes).filter((a) => a.activo).length

  return (
    <main className="app stack pro-inicio">
      <Cabecera titulo="Inicio">
        <div className="seg" role="group" aria-label="Moneda">
          {MONEDAS.map((m) => <button key={m} aria-pressed={moneda === m} onClick={() => v.setMoneda(m)}>{m}</button>)}
        </div>
        <button className="pro-tag" aria-label="Cambiar a vista simple" aria-pressed onClick={() => void v.alternarVista()}>PRO</button>
        <button aria-label={v.privado ? 'Mostrar cifras' : 'Ocultar cifras'} aria-pressed={v.privado} onClick={() => void v.togglePrivado()}>
          {v.privado ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </Cabecera>
      <div className="ptr" style={{ height: refrescando ? 28 : dist }} aria-live="polite">{refrescando ? 'Actualizando…' : dist >= 60 ? 'Suelta para actualizar' : dist > 8 ? 'Tira para actualizar' : ''}</div>
      {v.errorFifo && <p className="card err" role="alert">Tus operaciones no cuadran: hay ventas con más BTC del que había. Revisa la lista.</p>}

      <section className="card pro-resumen" aria-label="Resumen pro">
        <div className="stack" style={{ gap: 2 }}>
          <span className="pro-et">Valor estimado</span>
          <div className="pro-valor num"><span className="sr">{res ? dinero(valor, moneda) : ''}</span><span aria-hidden="true">{res ? oculto(dinero(valor, moneda)) : '—'}</span></div>
          {res && <div className={`num ${claseSigno(pnl)}`}>PnL {flecha(pnl)} {v.$s(pnl)} <span>({v.pct(pnlPct)})</span></div>}
        </div>
        <table className="pro-tabla-mini" aria-label="Datos de la cartera">
          <tbody>
            <tr><th scope="row">BTC</th><td className="num">{res ? oculto(fBtc(res.btc).replace(' BTC', '')) : '—'}</td></tr>
            <tr><th scope="row">Precio medio</th><td className="num">{res && res.btc > 0 ? v.$(res.precioMedioReal) : '—'}</td></tr>
            <tr><th scope="row">Metido</th><td className="num">{res ? v.$(res.invertido) : '—'}</td></tr>
            <tr><th scope="row">Comisiones</th><td className="num">{res ? v.$(res.comisiones) : '—'}</td></tr>
          </tbody>
        </table>
      </section>
      {v.perfil.sumarTradingACartera && v.trading && <p className="pro-et num">de trading: {v.btcS(v.trading.neto)}</p>}

      <section className="card pro-par" aria-label="BTC en vivo">
        <div className="row between">
          <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
            <b>BTC/{moneda}</b>
            <span className="pro-precio">{precio ? <PrecioVivo valor={precio} texto={dinero(precio, moneda, 0)} /> : '—'}</span>
            <span className={`num ${claseSigno(cambioDia)}`}>{flecha(cambioDia)} {v.pct(cambioDia)}</span>
          </div>
          <Link className="pro-abrir" to="/grafico" aria-label="Abrir el gráfico pro a pantalla completa">Abrir <Maximize2 size={13} strokeWidth={1.75} aria-hidden="true" /></Link>
        </div>
        <ErrorBoundary etiqueta="Las velas">
          <Suspense fallback={<div className="pro-esqueleto"><Esqueleto alto={300} /></div>}>
            <GraficoVelas tfInicial="1D" temporalidades={TF_PRO} alto={300} />
          </Suspense>
        </ErrorBoundary>
        <FilaRendimiento dias={[1, 7, 30, 90, 365]} cambio24h={cambioDia} />
      </section>

      <div className="row">
        <button className="btn-big" style={{ flex: 1, background: 'var(--buy)', color: '#04140d', border: 'none', fontWeight: 700 }} onClick={() => setHoja({ tipo: 'compra' })}>Apuntar compra</button>
        <button className="btn-big" style={{ flex: 1, background: 'var(--sell)', color: '#1a0508', border: 'none', fontWeight: 700 }} onClick={() => setHoja({ tipo: 'venta' })}>Apuntar venta</button>
      </div>

      <div className="tabs-pro" role="tablist" aria-label="Secciones de Inicio">
        {PESTANAS.map(([k, l]) => <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{l}</button>)}
      </div>

      {pestana === 'operaciones' && (
        <section aria-label="Historial de operaciones">
          {filas.length === 0 ? <p className="muted">Todavía no has apuntado ninguna operación.</p> : (
            <table className="pro-historial">
              <thead><tr><th scope="col">Tipo y fecha</th><th scope="col" className="r">Precio y BTC</th><th scope="col" className="r">Importe y PnL</th></tr></thead>
              <tbody>
                {filas.map((o) => {
                  const esCompra = o.tipo === 'compra'
                  const f = esCompra ? filaCompra(o, precio) : null
                  const pn = esCompra ? f!.ganancia : ventas.get(o.id)?.ganancia
                  return (
                    <tr key={o.id} onClick={() => setHoja({ tipo: o.tipo, op: v.operaciones.find((x) => x.id === o.id) })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setHoja({ tipo: o.tipo, op: v.operaciones.find((x) => x.id === o.id) }) }} aria-label={`${esCompra ? 'Compra' : 'Venta'} del ${fechaCorta(o.fecha)}, editar`}>
                      <td><b className={esCompra ? 'pro-compra' : 'pro-venta'}>{esCompra ? '▲ Compra' : '▼ Venta'}</b><div className="pro-et num">{fechaCorta(o.fecha)}</div>{o.plataforma && <div className="pro-et">{o.plataforma}</div>}</td>
                      <td className="r num">{dinero(o.precio, moneda, 0)}<div className="pro-et">{fBtc(esCompra ? btcDeCompra(o) : btcDeVenta(o))}</div></td>
                      <td className="r num">{v.$(o.cantidad)}<div className={`${pn == null ? 'pro-et' : claseSigno(pn)}`}>{pn == null ? '—' : `${flecha(pn)} ${v.$s(pn)}`}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className="row between" style={{ marginTop: 8 }}><Link to="/operaciones">Ver todas</Link><span className="pro-et">Toca una fila para editarla</span></p>
        </section>
      )}

      {pestana === 'trades' && (
        <section aria-label="Últimos trades">
          {trades.length === 0 ? <p className="muted">Sin trades. Apunta el primero desde Trading.</p> : (
            <table className="pro-historial">
              <thead><tr><th scope="col">Dirección y fechas</th><th scope="col" className="r">Entrada → salida</th><th scope="col" className="r">% y BTC</th></tr></thead>
              <tbody>
                {trades.map((f) => (
                  <tr key={f.trade.id}>
                    <td><b>{f.trade.direccion === 'largo' ? 'Largo' : 'Corto'} x{f.trade.apalancamiento}</b><div className="pro-et num">{fechaCorta(f.trade.fechaInicio)}{f.calculo.abierto ? ' · sin cerrar' : ` → ${fechaCorta(f.trade.fechaCierre!)}`}</div></td>
                    <td className="r num">{dinero(f.trade.precioEntrada, f.trade.moneda, 0)}<div className="pro-et">{dinero(f.calculo.precioReferencia, f.trade.moneda, 0)}{f.calculo.abierto ? ' (hoy)' : ''}</div></td>
                    <td className={`r num ${claseSigno(f.calculo.pct)}`}>{flecha(f.calculo.pct)} {v.pct(f.calculo.pct)}<div>{f.calculo.btc == null ? '—' : oculto(btcConSigno(f.calculo.btc))}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {v.perfil.mostrarTrading && <p style={{ marginTop: 8 }}><Link to="/trading">Ir a Trading</Link></p>}
        </section>
      )}

      {pestana === 'plan' && (
        <section aria-label="Plan">
          <table className="pro-historial">
            <thead><tr><th scope="col">Nivel clave</th><th scope="col" className="r">% del capital</th><th scope="col" className="r">Estado</th></tr></thead>
            <tbody>
              {niveles.length === 0 ? <tr><td colSpan={3} className="muted">Sin niveles en el plan.</td></tr> : niveles.map((n, i) => (
                <tr key={i}><td className="num">{dinero(n.precio, 'EUR', 0)}</td><td className="r num">{v.plan.nivelesClave[i]?.porcentajeCapital} %</td><td className="r">{n.estado}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="pro-et num" style={{ marginTop: 8 }}>DCA: semana {dca.semanaActual || '—'} de {v.plan.dca.semanas}</p>
          <p style={{ marginTop: 8 }}><Link to="/plan">Plan y objetivos</Link></p>
        </section>
      )}

      {pestana === 'avisos' && (
        <section aria-label="Avisos">
          <p className="num">{avisosActivos} avisos activos · {(v.avisos.alertas ?? []).length} alertas de precio</p>
          <p style={{ marginTop: 8 }}><Link to="/avisos">Avisos y notificaciones</Link></p>
        </section>
      )}

      <p className="notice">Información de mercado, no una recomendación de inversión. La app solo registra operaciones: no opera ni se conecta a ningún exchange.</p>
      {hoja && <OperacionSheet tipo={hoja.tipo} inicial={hoja.op} onCerrar={() => setHoja(null)} />}
    </main>
  )
}
