import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useVista } from '../state/vista'
import Cabecera from '../components/Cabecera'
import Sheet from '../components/Sheet'
import Sparkline from '../components/Sparkline'
import TradeSheet from '../components/TradeSheet'
import TradeFicha from '../components/TradeFicha'
import TradingGraficas from '../components/TradingGraficas'
import { filasTrades, type FilaTrade, type Trade } from '../lib/trading'
import { claseSigno, fechaCorta, flecha, hoyISO, dinero, OCULTO } from '../lib/format'
import { mensajeError } from '../lib/errores'
import { MONEDAS } from '../lib/schemas'
import { descargarTradesCsv, descargarTradesXlsx } from '../lib/exportar'
import Esqueleto from '../components/Esqueleto'

type Filtro = 'todos' | 'abiertos' | 'cerrados'
export const AVISO_TRADING = 'El trading con apalancamiento puede hacerte perder más rápido de lo que ganas. Esto es solo un registro.'

export default function Trading() {
  const v = useVista()
  const nav = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ficha, setFicha] = useState<FilaTrade | null>(null)
  const [hoja, setHoja] = useState<null | { trade?: Trade; plantilla?: boolean }>(null)
  const [borrar, setBorrar] = useState<Trade | null>(null)
  const [error, setError] = useState('')

  const filas = useMemo(() => (v.precios ? filasTrades(v.trades, v.precios, v.moneda) : []), [v.trades, v.precios, v.moneda])
  const tot = v.trading
  const lista = useMemo(
    () => filas.filter((f) => (filtro === 'todos' ? true : filtro === 'abiertos' ? f.calculo.abierto : !f.calculo.abierto)).reverse(),
    [filas, filtro],
  )

  if (v.cargando) return <main className="app"><Cabecera titulo="Trading" /><Esqueleto alto={160} /></main>

  const curva = tot?.curva.map((p) => p.acumulado) ?? []
  const original = (id: string) => v.trades.find((t) => t.id === id)

  function duplicar(t: Trade) {
    const base = original(t.id) ?? t
    const resto: Trade = { ...base }
    delete resto.fechaCierre
    delete resto.precioSalida
    delete resto.btcGanadoManual
    setFicha(null)
    setHoja({ plantilla: true, trade: { ...resto, id: '', estado: 'abierto', fechaInicio: hoyISO(), precioEntrada: v.precios ? Math.round(v.precios[t.moneda]) : t.precioEntrada } })
  }
  async function confirmarBorrado() {
    if (!borrar) return
    try {
      await v.borrarTrade(borrar.id)
      setBorrar(null)
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido borrar.'))
    }
  }
  const oculto = (s: string) => (v.privado ? OCULTO : s)

  return (
    <main className="app stack">
      <Cabecera titulo="Trading">
        <div className="seg" role="group" aria-label="Moneda">
          {MONEDAS.map((m) => <button key={m} aria-pressed={v.moneda === m} onClick={() => v.setMoneda(m)}>{m}</button>)}
        </div>
        <button aria-label={v.privado ? 'Mostrar cifras' : 'Ocultar cifras'} aria-pressed={v.privado} onClick={() => void v.togglePrivado()}>
          {v.privado ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </Cabecera>

      <p className="notice card" role="note">{AVISO_TRADING}</p>

      {v.trades.length === 0 ? (
        <section className="card stack">
          <p className="muted">Todavía no has apuntado ningún trade. Apunta uno con el botón de abajo o importa tu Excel desde Ajustes.</p>
          <button className="btn-primary btn-big" onClick={() => setHoja({})}>Nuevo trade</button>
        </section>
      ) : tot && (
        <>
          <section className="card saldo stack" aria-label="Resumen de trading">
            <div className="aura" aria-hidden="true" />
            <h3>BTC ganados con trades</h3>
            <div className={`big ${claseSigno(tot.neto)}`} style={{ fontSize: 'clamp(24px, 8vw, 34px)', overflowWrap: 'anywhere' }}>{v.btcS(tot.neto)}</div>
            <div className="muted num" style={{ fontSize: 13 }}>Vale hoy {v.$s(tot.netoValor)}</div>
            {!v.privado && curva.length > 1 && <Sparkline valores={curva} etiqueta="BTC ganados acumulados, trade a trade" />}
            <div className={`mid num ${claseSigno(tot.neto)}`} style={{ fontSize: 15 }}>{flecha(tot.neto)} Neto {v.btcS(tot.neto)} · {v.$s(tot.netoValor)}</div>
          </section>

          <div className="chips" aria-label="Resumen de trades">
            <div className="chip"><span className="k">Trades</span><span className="v">{tot.nCerrados}{tot.nAbiertos ? ` + ${tot.nAbiertos} abiertos` : ''}</span></div>
            <div className="chip"><span className="k">Ganadores</span><span className="v">{oculto(`${Math.round(tot.pctGanadores * 100)} %`)}</span></div>
            {tot.mejor && <div className="chip"><span className="k">Mejor trade</span><span className="v gain">▲ {v.pct(tot.mejor.calculo.pct)}</span></div>}
            {tot.peor && tot.peor.calculo.pct < 0 && <div className="chip"><span className="k">Peor trade</span><span className="v loss">▼ {v.pct(tot.peor.calculo.pct)}</span></div>}
            <div className="chip"><span className="k">Racha</span><span className={`v ${claseSigno(tot.racha)}`}>{oculto(tot.racha === 0 ? '—' : `${tot.racha > 0 ? '▲' : '▼'} ${Math.abs(tot.racha)} ${tot.racha > 0 ? 'ganados' : 'perdidos'}`)}</span></div>
            <div className="chip"><span className="k">Ganancia media</span><span className={`v ${claseSigno(tot.gananciaMedia)}`}>{v.pct(tot.gananciaMedia)}</span></div>
            <div className="chip"><span className="k">Duración media</span><span className="v">{tot.duracionMediaDias.toFixed(1).replace('.', ',')} d</span></div>
          </div>

          <section className="card stack" aria-label="Ganado, perdido y neto">
            <h2>Totales</h2>
            <div className="grid2">
              <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Ganado</span><span className="num gain">{v.btcS(tot.ganado)}</span></div>
              <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Perdido</span><span className="num loss">{tot.perdido > 0 ? '−' : ''}{v.btcF(tot.perdido)}</span></div>
              <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Neto (ganado − perdido)</span><span className={`num ${claseSigno(tot.neto)}`}>{v.btcS(tot.neto)}</span></div>
              <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Neto × precio actual</span><span className={`num ${claseSigno(tot.netoValor)}`}>{v.$s(tot.netoValor)}</span></div>
            </div>
            {tot.nAbiertos > 0 && <p className="notice">Aparte, sin cerrar ({tot.nAbiertos}): {v.btcS(tot.abiertos)} · {v.$s(tot.abiertosValor)}. No suma a los totales hasta que cierres el trade.</p>}
          </section>

          <TradingGraficas filas={filas} />

          <section className="stack" aria-label="Lista de trades">
            <div className="row between wrap">
              <h2>Trades</h2>
              <div className="seg" role="group" aria-label="Filtro">
                {([['todos', 'Todos'], ['abiertos', 'Abiertos'], ['cerrados', 'Cerrados']] as const).map(([k, l]) => (
                  <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>
                ))}
              </div>
            </div>
            {error && <p className="err" role="alert">{error}</p>}
            {lista.length === 0 && <p className="card muted">No hay trades en esta vista.</p>}
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {lista.map((f) => {
                const t = f.trade, c = f.calculo
                return (
                  <li key={t.id}>
                    <button className="card stack trade-fila" style={{ width: '100%', textAlign: 'left' }} onClick={() => setFicha(f)} aria-label={`Trade ${t.direccion} x${t.apalancamiento} del ${fechaCorta(t.fechaInicio)}`}>
                      <div className="row between">
                        <b>{t.direccion === 'largo' ? 'Largo' : 'Corto'} x{t.apalancamiento}{c.abierto && <span className="notice" style={{ marginLeft: 8 }}>sin cerrar</span>}</b>
                        <span className={`num ${claseSigno(c.pct)}`}>{flecha(c.pct)} {v.pct(c.pct)}</span>
                      </div>
                      <div className="muted num" style={{ fontSize: 13 }}>
                        {fechaCorta(t.fechaInicio)}{t.fechaCierre ? ` → ${fechaCorta(t.fechaCierre)}` : ''} · {dinero(t.precioEntrada, t.moneda, 0)} → {dinero(c.precioReferencia, t.moneda, 0)}{c.abierto ? ' (hoy)' : ''}
                      </div>
                      <div className={`num ${claseSigno(c.btc ?? 0)}`}>{c.btc == null ? '— BTC' : v.btcS(c.btc)}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="card stack" aria-label="Exportar trades">
            <h2>Exportar</h2>
            <div className="row wrap">
              <button onClick={() => descargarTradesCsv(v.trades)}>Descargar CSV</button>
              <button onClick={() => descargarTradesXlsx(v.trades)}>Descargar Excel</button>
              <Link className="btn" to="/grafico?tf=5m">Gráfico pro</Link>
              <Link className="btn" to="/ajustes">Importar desde Excel</Link>
            </div>
          </section>
        </>
      )}

      <p className="notice">Información, no consejo de inversión. {AVISO_TRADING}</p>

      {ficha && (
        <TradeFicha
          fila={ficha}
          onCerrar={() => setFicha(null)}
          onEditar={() => { const t = original(ficha.trade.id); setFicha(null); setHoja({ trade: t }) }}
          onDuplicar={() => duplicar(ficha.trade)}
          onGrafico={() => nav('/grafico?tf=5m')}
          onBorrar={() => { setBorrar(ficha.trade); setFicha(null) }}
        />
      )}
      {hoja && <TradeSheet inicial={hoja.trade} plantilla={hoja.plantilla} onCerrar={() => setHoja(null)} />}
      {borrar && (
        <Sheet titulo="¿Borrar este trade?" onCerrar={() => setBorrar(null)}>
          <p className="muted">Se borrará el trade {borrar.direccion} del {fechaCorta(borrar.fechaInicio)}. No se puede deshacer.</p>
          <div className="row">
            <button onClick={() => setBorrar(null)}>Cancelar</button>
            <button className="btn-danger" style={{ flex: 1 }} onClick={() => void confirmarBorrado()}>Borrar</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
