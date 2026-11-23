import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Sheet from './Sheet'
import { btcDeResultado, calcularTrade, pasoAPaso, type Direccion, type Trade } from '../lib/trading'
import { buscarPrecioBtc } from '../lib/precioResultado'
import { MONEDAS, tradeSchema } from '../lib/schemas'
import { btcConSigno, dinero, hoyISO, porcentajeConSigno } from '../lib/format'
import { mensajeError } from '../lib/errores'
import { PLATAFORMAS, recordarPlataforma, ultimaPlataforma } from '../lib/plataformas'
import { useVista } from '../state/vista'
import type { Moneda } from '../lib/calculos'

interface Props {
  /** Trade a editar, o plantilla (al duplicar) si `plantilla` es true. */
  inicial?: Trade
  plantilla?: boolean
  onCerrar: () => void
}

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const PILDORAS = [1, 2, 3, 5, 10]

export default function TradeSheet({ inicial, plantilla, onCerrar }: Props) {
  const v = useVista()
  const editando = inicial && !plantilla ? inicial.id : undefined
  const [f, setF] = useState({
    estado: (inicial?.estado ?? 'cerrado') as 'abierto' | 'cerrado',
    direccion: (inicial?.direccion ?? 'largo') as Direccion,
    fechaInicio: inicial?.fechaInicio ?? hoyISO(),
    fechaCierre: inicial?.fechaCierre ?? hoyISO(),
    precioEntrada: inicial ? String(inicial.precioEntrada) : '',
    precioSalida: inicial?.precioSalida != null ? String(inicial.precioSalida) : '',
    moneda: (inicial?.moneda ?? 'USD') as Moneda,
    apalancamiento: inicial?.apalancamiento != null ? String(inicial.apalancamiento) : '',
    margenBTC: inicial?.margenBTC != null ? String(inicial.margenBTC) : '',
    comisiones: inicial?.comisiones != null ? String(inicial.comisiones) : '',
    pct: inicial?.pctManual != null ? String(inicial.pctManual) : '',
    btcManual: inicial?.btcGanadoManual != null ? String(inicial.btcGanadoManual) : '',
    plataforma: inicial ? (inicial.plataforma ?? '') : ultimaPlataforma(),
    nota: inicial?.nota ?? '',
    margenDestinado: inicial?.margenDestinado != null ? String(inicial.margenDestinado) : '',
    horaInicio: inicial?.horaInicio ?? '',
    horaCierre: inicial?.horaCierre ?? '',
    resultado: inicial?.resultadoDinero != null ? String(inicial.resultadoDinero) : '',
    rMoneda: (inicial?.resultadoMoneda ?? v.perfil.monedaPreferida) as Moneda,
    rPrecio: inicial?.resultadoPrecio != null ? String(inicial.resultadoPrecio) : '',
  })
  const [otroLev, setOtroLev] = useState(inicial?.apalancamiento != null && !PILDORAS.includes(inicial.apalancamiento))
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cerrado = f.estado === 'cerrado'

  // ── Resultado en dinero → BTC: el precio sale de la vela de Kraken del cierre (o del precio de salida si no hay vela) ──
  const resultadoNum = aNum(f.resultado)
  const hayResultado = cerrado && Number.isFinite(resultadoNum)
  const [fuentePrecio, setFuentePrecio] = useState(inicial?.resultadoPrecio != null ? 'guardado con el trade' : '')
  const [buscando, setBuscando] = useState(false)
  const claveBuscada = useRef(inicial?.resultadoPrecio != null ? `${inicial.resultadoMoneda}|${inicial.fechaCierre}|${inicial.horaCierre ?? ''}` : '')
  const precioSalidaRef = useRef(f.precioSalida)
  precioSalidaRef.current = f.precioSalida
  const monedaTradeRef = useRef(f.moneda)
  monedaTradeRef.current = f.moneda
  const preciosRef = useRef(v.precios)
  preciosRef.current = v.precios
  useEffect(() => {
    if (!hayResultado) return
    const clave = `${f.rMoneda}|${f.fechaCierre}|${f.horaCierre}`
    if (clave === claveBuscada.current) return
    let vigente = true
    setBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarPrecioBtc({ moneda: f.rMoneda, fecha: f.fechaCierre, hora: f.horaCierre || undefined, trade: { precioSalida: aNum(precioSalidaRef.current), moneda: monedaTradeRef.current }, precios: preciosRef.current })
      if (!vigente) return
      claveBuscada.current = clave
      setBuscando(false)
      if (r) { setF((s) => ({ ...s, rPrecio: String(r.precio) })); setFuentePrecio(r.detalle) }
      else setFuentePrecio('no he encontrado precio: escríbelo a mano')
    }, 400)
    return () => { vigente = false; clearTimeout(t); setBuscando(false) }
  }, [hayResultado, f.rMoneda, f.fechaCierre, f.horaCierre])
  const precioRes = aNum(f.rPrecio)
  const btcRes = hayResultado && precioRes > 0 ? btcDeResultado(resultadoNum, precioRes) : null
  const candidato = useMemo(() => {
    const r = tradeSchema.safeParse({
      estado: f.estado, direccion: f.direccion, fechaInicio: f.fechaInicio, ...(cerrado ? { fechaCierre: f.fechaCierre, precioSalida: aNum(f.precioSalida) } : {}),
      precioEntrada: aNum(f.precioEntrada), moneda: f.moneda,
      ...(f.apalancamiento.trim() !== '' ? { apalancamiento: aNum(f.apalancamiento) } : {}),
      ...(Number.isFinite(aNum(f.margenBTC)) ? { margenBTC: aNum(f.margenBTC) } : {}),
      ...(Number.isFinite(aNum(f.comisiones)) ? { comisiones: aNum(f.comisiones) } : {}),
      ...(Number.isFinite(aNum(f.pct)) ? { pctManual: aNum(f.pct) } : {}),
      ...(Number.isFinite(aNum(f.btcManual)) ? { btcGanadoManual: aNum(f.btcManual) } : {}),
      ...(f.plataforma.trim() ? { plataforma: f.plataforma } : {}), ...(f.nota.trim() ? { nota: f.nota } : {}),
      ...(Number.isFinite(aNum(f.margenDestinado)) ? { margenDestinado: aNum(f.margenDestinado) } : {}),
      ...(hayResultado ? { resultadoDinero: resultadoNum, resultadoMoneda: f.rMoneda } : {}), ...(hayResultado && precioRes > 0 ? { resultadoPrecio: precioRes } : {}),
      ...(f.horaInicio ? { horaInicio: f.horaInicio } : {}), ...(cerrado && f.horaCierre ? { horaCierre: f.horaCierre } : {}),
    })
    return r
  }, [f, cerrado, hayResultado, resultadoNum, precioRes])

  const vista = useMemo(() => {
    if (!candidato.success) return null
    const t: Trade = { id: 'nuevo', ...candidato.data }
    const c = calcularTrade(t, v.precios?.[t.moneda] ?? t.precioEntrada)
    return { t, c }
  }, [candidato, v.precios])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!candidato.success) return setError(candidato.error.issues[0].message)
    setOcupado(true)
    try {
      await v.guardarTrade(candidato.data, editando)
      if (f.plataforma) recordarPlataforma(f.plataforma)
      onCerrar()
    } catch (err) {
      setError(mensajeError(err, 'No se ha podido guardar. Inténtalo de nuevo.'))
    } finally {
      setOcupado(false)
    }
  }

  const usarPrecioActual = (k: 'precioEntrada' | 'precioSalida') => {
    if (v.precios) setF((s) => ({ ...s, [k]: String(Math.round(v.precios![s.moneda])) }))
  }
  const titulo = editando ? 'Editar trade' : 'Nuevo trade'

  return (
    <Sheet titulo={titulo} onCerrar={onCerrar}>
      <form className="stack" onSubmit={enviar} noValidate>
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Dirección">
            <button type="button" aria-pressed={f.direccion === 'largo'} onClick={() => setF((s) => ({ ...s, direccion: 'largo' }))}>Largo ▲</button>
            <button type="button" aria-pressed={f.direccion === 'corto'} onClick={() => setF((s) => ({ ...s, direccion: 'corto' }))}>Corto ▼</button>
          </div>
          <div className="seg" role="group" aria-label="Estado">
            <button type="button" aria-pressed={f.estado === 'abierto'} onClick={() => setF((s) => ({ ...s, estado: 'abierto' }))}>Abierto</button>
            <button type="button" aria-pressed={f.estado === 'cerrado'} onClick={() => setF((s) => ({ ...s, estado: 'cerrado' }))}>Cerrado</button>
          </div>
        </div>
        <p className="notice">{f.direccion === 'largo' ? 'Largo: ganas si el precio sube.' : 'Corto: ganas si el precio baja.'}</p>

        <div className="grid2">
          <label>Fecha de inicio<input type="date" value={f.fechaInicio} max={hoyISO()} onChange={set('fechaInicio')} required /></label>
          <label>Hora de inicio (opcional)<input type="time" value={f.horaInicio} onChange={set('horaInicio')} /></label>
          {cerrado && <label>Fecha de cierre<input type="date" value={f.fechaCierre} min={f.fechaInicio} max={hoyISO()} onChange={set('fechaCierre')} required /></label>}
          {cerrado && <label>Hora de cierre (opcional)<input type="time" value={f.horaCierre} onChange={set('horaCierre')} /></label>}
          <label>Moneda
            <select value={f.moneda} onChange={set('moneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </div>

        <label>Precio de entrada
          <div className="row">
            <input inputMode="decimal" value={f.precioEntrada} onChange={set('precioEntrada')} placeholder="0" required />
            <button type="button" onClick={() => usarPrecioActual('precioEntrada')} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
          </div>
        </label>
        {cerrado && (
          <label>Precio de salida
            <div className="row">
              <input inputMode="decimal" value={f.precioSalida} onChange={set('precioSalida')} placeholder="0" required />
              <button type="button" onClick={() => usarPrecioActual('precioSalida')} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
            </div>
          </label>
        )}

        <div className="stack" style={{ gap: 8 }} role="group" aria-label="Apalancamiento">
          <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Apalancamiento (opcional)</span>
          <div className="chips">
            <button type="button" className="opt" aria-pressed={!otroLev && f.apalancamiento === ''} onClick={() => { setOtroLev(false); setF((s) => ({ ...s, apalancamiento: '' })) }}>Ninguno</button>
            {PILDORAS.map((n) => (
              <button key={n} type="button" className="opt" aria-pressed={!otroLev && f.apalancamiento === String(n)} onClick={() => { setOtroLev(false); setF((s) => ({ ...s, apalancamiento: String(n) })) }}>x{n}</button>
            ))}
            <button type="button" className="opt" aria-pressed={otroLev} onClick={() => setOtroLev(true)}>Otro</button>
          </div>
          {otroLev && <input aria-label="Apalancamiento (1 a 125)" inputMode="decimal" value={f.apalancamiento} onChange={set('apalancamiento')} placeholder="1 a 125" />}
        </div>

        <div className="grid2">
          <label>Margen para la sugerencia (BTC)<input inputMode="decimal" value={f.margenBTC} onChange={set('margenBTC')} placeholder="0,05" /></label>
          <label>Comisiones % (opcional)<input inputMode="decimal" value={f.comisiones} onChange={set('comisiones')} placeholder="0,4" /></label>
        </div>

        <div className="grid2">
          <label>% de ganancia (a mano)<input inputMode="decimal" value={f.pct} onChange={set('pct')} placeholder="15,35" /></label>
          <label>BTC ganados (a mano)<input inputMode="decimal" value={f.btcManual} onChange={set('btcManual')} placeholder="0,0089" /></label>
        </div>
        <p className="notice">Lo que escribas aquí manda sobre cualquier cálculo. Negativo si pierdes.</p>
        {vista && (
          <div className="row between wrap" aria-label="Sugerencia">
            <p className="notice" style={{ flex: 1 }}>
              Sugerencia (cálculo automático{f.apalancamiento.trim() === '' ? ', sin apalancamiento' : ''}): {porcentajeConSigno(vista.c.sugerencia.pct)}{vista.c.sugerencia.btc != null ? ` · ${btcConSigno(vista.c.sugerencia.btc)}` : ''}
            </p>
            <button type="button" onClick={() => setF((s) => ({ ...s, pct: String(Math.round(vista.c.sugerencia.pct * 1e4) / 100), btcManual: vista.c.sugerencia.btc != null ? String(Math.round(vista.c.sugerencia.btc * 1e8) / 1e8) : s.btcManual }))}>Usar sugerencia</button>
          </div>
        )}

        {cerrado && (
          <div className="stack" style={{ gap: 8 }} role="group" aria-label="Resultado en dinero">
            <div className="grid2">
              <label>Resultado en dinero (opcional)<input inputMode="decimal" value={f.resultado} onChange={set('resultado')} placeholder="−100 (pérdida) o 100 (ganancia)" /></label>
              <label>Moneda del resultado
                <select value={f.rMoneda} onChange={set('rMoneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
              </label>
            </div>
            {hayResultado && (
              <>
                <label>Precio de BTC usado en {f.rMoneda} (puedes cambiarlo)<input inputMode="decimal" value={f.rPrecio} onChange={(e) => { setF((s) => ({ ...s, rPrecio: e.target.value })); setFuentePrecio('escrito a mano') }} placeholder="0" /></label>
                <p className="notice" aria-live="polite">
                  {buscando ? 'Buscando el precio de BTC del cierre en Kraken…'
                    : btcRes != null
                      ? <><b className="num">{resultadoNum > 0 ? '+' : resultadoNum < 0 ? '−' : ''}{dinero(Math.abs(resultadoNum), f.rMoneda, Number.isInteger(resultadoNum) ? 0 : 2)} → {btcConSigno(btcRes)} a {dinero(precioRes, f.rMoneda, 0)}/BTC</b> · {fuentePrecio || 'precio escrito a mano'}</>
                      : `Falta el precio de BTC${fuentePrecio ? ` (${fuentePrecio})` : ''}.`}
                </p>
                <p className="notice">Los BTC salen de resultado ÷ precio, a 8 decimales. Si escribes los BTC a mano arriba, mandan ellos.</p>
              </>
            )}
          </div>
        )}

        <label>Plataforma (opcional)
          <input list="plataformas-trading" maxLength={40} value={f.plataforma} onChange={set('plataforma')} />
          <datalist id="plataformas-trading">{PLATAFORMAS.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label>Margen destinado (BTC, opcional)<input inputMode="decimal" value={f.margenDestinado} onChange={set('margenDestinado')} placeholder="0,15" /></label>
        <label>Nota (opcional, máx. 200)<input value={f.nota} maxLength={200} onChange={set('nota')} placeholder="Ej.: x10 con 0,15 BTC de margen" /></label>
        <p className="notice">El margen destinado y la nota son solo para recordar cómo montaste el trade: no cambian ningún cálculo.</p>

        {vista && (
          <div className="card stack" aria-live="polite">
            <h3>Vista previa{vista.c.abierto ? ' · sin cerrar' : ''}</h3>
            <p className={`num ${vista.c.pct > 0 ? 'gain' : vista.c.pct < 0 ? 'loss' : ''}`}>
              {vista.c.pct > 0 ? '▲' : vista.c.pct < 0 ? '▼' : '■'} {porcentajeConSigno(vista.c.pct)}
              {vista.c.btc != null && <> · {btcConSigno(vista.c.btc)}</>}
            </p>
            <p className="notice">{pasoAPaso(vista.t, vista.c)}</p>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={ocupado} type="submit">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
