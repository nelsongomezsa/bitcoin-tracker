import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../state/auth'
import { useVista } from '../state/vista'
import Sheet from '../components/Sheet'
import Cabecera from '../components/Cabecera'
import { Link } from 'react-router-dom'
import { MONEDAS } from '../lib/schemas'
import { informeFifoAnual } from '../lib/calculos'
import { dinero, fechaCorta } from '../lib/format'
import { leerArchivo, mensajeImportacion, type ResultadoImportacion } from '../lib/importar'
import { leerArchivoTrades, type ResultadoTrades } from '../lib/importarTrades'
import { descargarCsv, descargarInforme, descargarTradesCsv, descargarTradesXlsx, descargarXlsx, informeFifoCsv } from '../lib/exportar'
import { activarBloqueo, bloqueoActivo, bloqueoSoportado, desactivarBloqueo } from '../lib/bloqueo'
import { borrarCuenta } from '../lib/borrarCuenta'
import { confirmarAltaTotp, iniciarAltaTotp, mfaHabilitado } from '../lib/mfa'
import { mensajeError } from '../lib/errores'
import type { TotpSecret } from 'firebase/auth'

export default function Ajustes() {
  const v = useVista()
  const { user, salir } = useAuth()
  const [msg, setMsg] = useState('')
  const [prev, setPrev] = useState<ResultadoImportacion | null>(null)
  const [importando, setImportando] = useState(false)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [bloqueo, setBloqueo] = useState(bloqueoActivo())
  const [soporteBloqueo, setSoporteBloqueo] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [password, setPassword] = useState('')
  const [errBorrar, setErrBorrar] = useState('')
  const [totp, setTotp] = useState<{ secreto: TotpSecret; uri: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const archivo = useRef<HTMLInputElement>(null)
  const archivoTrades = useRef<HTMLInputElement>(null)
  const [bufTrades, setBufTrades] = useState<ArrayBuffer | null>(null)
  const [acumulado, setAcumulado] = useState(false)
  const [prevT, setPrevT] = useState<ResultadoTrades | null>(null)

  useEffect(() => { void bloqueoSoportado().then(setSoporteBloqueo) }, [])

  async function elegirArchivo(f: File | undefined) {
    setMsg('')
    setPrev(null)
    if (!f) return
    try {
      setPrev(leerArchivo(await f.arrayBuffer(), v.moneda))
    } catch (e) {
      setMsg(mensajeImportacion(e))
    } finally {
      if (archivo.current) archivo.current.value = ''
    }
  }

  async function confirmarImportacion() {
    if (!prev) return
    setImportando(true)
    try {
      for (const o of prev.operaciones) await v.guardarOperacion(o)
      setMsg(`Se han importado ${prev.operaciones.length} compras.`)
      setPrev(null)
    } catch (e) {
      setMsg(mensajeError(e, 'No se ha podido completar la importación.'))
    } finally {
      setImportando(false)
    }
  }

  async function elegirArchivoTrades(f: File | undefined) {
    setMsg('')
    setPrevT(null)
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      setBufTrades(buf)
      setPrevT(leerArchivoTrades(buf, 'USD', { acumulado }))
    } catch (e) {
      setMsg(mensajeImportacion(e).replace('Fecha, Precio, Cantidad y Comisión', 'Fecha inicio, Precio entrada y Precio salida'))
    } finally {
      if (archivoTrades.current) archivoTrades.current.value = ''
    }
  }
  function cambiarAcumulado(on: boolean) {
    setAcumulado(on)
    if (bufTrades) { try { setPrevT(leerArchivoTrades(bufTrades, 'USD', { acumulado: on })) } catch { /* se mantiene la previsualización */ } }
  }
  async function confirmarImportacionTrades() {
    if (!prevT) return
    setImportando(true)
    try {
      for (const t of prevT.trades) await v.guardarTrade(t)
      setMsg(`Se han importado ${prevT.trades.length} trades.`)
      setPrevT(null)
      setBufTrades(null)
    } catch (e) {
      setMsg(mensajeError(e, 'No se ha podido completar la importación.'))
    } finally {
      setImportando(false)
    }
  }

  let informe: ReturnType<typeof informeFifoAnual> | null = null
  try { informe = informeFifoAnual(v.ops, anio) } catch { /* operaciones incoherentes */ }

  async function toggleBloqueo(on: boolean) {
    setMsg('')
    try {
      if (on) await activarBloqueo()
      else desactivarBloqueo()
      setBloqueo(on)
    } catch {
      setMsg('No se ha podido activar el bloqueo en este dispositivo.')
    }
  }

  async function confirmarBorrado() {
    setErrBorrar('')
    try {
      await borrarCuenta(password)
    } catch (e) {
      setErrBorrar(mensajeError(e, 'No se ha podido borrar la cuenta. Comprueba la contraseña.'))
    }
  }

  return (
    <main className="app stack">
      <Cabecera titulo="Ajustes" />
      <section className="card stack" aria-label="Accesos">
        <Link className="btn" to="/avisos">Avisos y notificaciones</Link>
        <Link className="btn" to="/operaciones">Todas mis operaciones</Link>
      </section>
      {msg && <p role="status" className="card notice">{msg}</p>}

      <section className="card stack" aria-label="Preferencias">
        <h2>Preferencias</h2>
        <label>Moneda preferida
          <select value={v.perfil.monedaPreferida} onChange={(e) => { const m = e.target.value as typeof v.perfil.monedaPreferida; v.setMoneda(m); void v.guardarPerfil({ ...v.perfil, monedaPreferida: m }) }}>
            {MONEDAS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
          <input type="checkbox" checked={v.privado} onChange={() => void v.togglePrivado()} /> Modo privado (oculta las cifras con ••••)
        </label>
      </section>

      <section className="card stack" aria-label="Apariencia">
        <h2>Apariencia</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
          <input type="checkbox" checked={v.perfil.mostrarTrading} onChange={(e) => void v.guardarPerfil({ ...v.perfil, mostrarTrading: e.target.checked })} /> Mostrar Trading
        </label>
        <p className="notice">Con Trading, la barra queda: Inicio · Mercado · ＋ · Trading · Ajustes, y Estadísticas pasa a Inicio.</p>
        {v.perfil.mostrarTrading && (
          <>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
              <input type="checkbox" checked={v.perfil.sumarTradingACartera} onChange={(e) => void v.guardarPerfil({ ...v.perfil, sumarTradingACartera: e.target.checked })} /> Sumar los BTC ganados con trades a mi cartera
            </label>
            <p className="notice">En Inicio aparece una línea aparte «de trading». El precio medio de tus compras no cambia.</p>
          </>
        )}
      </section>

      <section className="card stack" aria-label="Importar">
        <h2>Importar desde Excel o CSV</h2>
        <p className="muted">Columnas: Fecha, Precio, Cantidad y Comisión. Se importan como compras en {v.moneda}. El archivo se procesa en tu dispositivo y no se sube a ningún sitio (máx. 2 MB).</p>
        <input ref={archivo} type="file" accept=".xlsx,.xls,.csv" aria-label="Archivo a importar" onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
        {prev && (
          <div className="stack">
            <h3>Previsualización: {prev.operaciones.length} compras válidas, {prev.errores.length} con errores</h3>
            <div style={{ overflowX: 'auto', maxHeight: 240 }}>
              <table>
                <thead><tr><th>Fecha</th><th>Precio</th><th>Cantidad</th><th>Comisión</th></tr></thead>
                <tbody>{prev.operaciones.slice(0, 50).map((o, i) => <tr key={i}><td className="num">{fechaCorta(o.fecha)}</td><td className="num">{dinero(o.precio, o.moneda, 2)}</td><td className="num">{dinero(o.cantidad, o.moneda)}</td><td className="num">{dinero(o.comision, o.moneda)}</td></tr>)}</tbody>
              </table>
            </div>
            {prev.errores.length > 0 && <ul className="err" style={{ margin: 0 }}>{prev.errores.slice(0, 5).map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}</ul>}
            <div className="row">
              <button onClick={() => setPrev(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} disabled={importando || prev.operaciones.length === 0} onClick={() => void confirmarImportacion()}>Importar {prev.operaciones.length}</button>
            </div>
          </div>
        )}
      </section>

      {v.perfil.mostrarTrading && (
        <section className="card stack" id="importar-trades" aria-label="Importar trades">
          <h2>Importar trades desde Excel o CSV</h2>
          <p className="muted">Columnas: Trade, Fecha inicio, Fecha cierre, Precio entrada, Precio salida, % ganancia y Total ganado (BTC). Un «x5» en la cabecera o en la columna Trade se lee como apalancamiento. Se importan en USD; el archivo no se sube a ningún sitio (máx. 2 MB).</p>
          <input ref={archivoTrades} type="file" accept=".xlsx,.xls,.csv" aria-label="Archivo de trades a importar" onChange={(e) => void elegirArchivoTrades(e.target.files?.[0])} />
          {prevT && (
            <div className="stack">
              <h3>Previsualización: {prevT.trades.length} trades válidos, {prevT.errores.length} con errores{prevT.apalancamiento ? ` · apalancamiento x${prevT.apalancamiento}` : ''}</h3>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
                <input type="checkbox" checked={acumulado} onChange={(e) => cambiarAcumulado(e.target.checked)} /> «Total ganado (BTC)» es un acumulado (se importa la diferencia de cada fila)
              </label>
              <div style={{ overflowX: 'auto', maxHeight: 260 }}>
                <table>
                  <thead><tr><th>Inicio</th><th>Cierre</th><th>Entrada</th><th>Salida</th><th>Dir.</th><th>x</th><th>BTC</th></tr></thead>
                  <tbody>{prevT.trades.slice(0, 50).map((t, i) => <tr key={i}><td className="num">{fechaCorta(t.fechaInicio)}</td><td className="num">{t.fechaCierre ? fechaCorta(t.fechaCierre) : '—'}</td><td className="num">{dinero(t.precioEntrada, t.moneda, 0)}</td><td className="num">{t.precioSalida ? dinero(t.precioSalida, t.moneda, 0) : '—'}</td><td>{t.direccion}</td><td className="num">{t.apalancamiento}</td><td className="num">{t.btcGanadoManual ?? '—'}</td></tr>)}</tbody>
                </table>
              </div>
              {prevT.errores.length > 0 && <ul className="err" style={{ margin: 0 }}>{prevT.errores.slice(0, 5).map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}</ul>}
              <div className="row">
                <button onClick={() => setPrevT(null)}>Cancelar</button>
                <button className="btn-primary" style={{ flex: 1 }} disabled={importando || prevT.trades.length === 0} onClick={() => void confirmarImportacionTrades()}>Importar {prevT.trades.length}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card stack" aria-label="Exportar">
        <h2>Exportar copia de seguridad</h2>
        <div className="row wrap">
          <button onClick={() => descargarCsv(v.operaciones)}>Descargar CSV</button>
          <button onClick={() => descargarXlsx(v.operaciones)}>Descargar Excel</button>
        </div>
        {v.perfil.mostrarTrading && v.trades.length > 0 && (
          <div className="row wrap">
            <button onClick={() => descargarTradesCsv(v.trades)}>Trades en CSV</button>
            <button onClick={() => descargarTradesXlsx(v.trades)}>Trades en Excel</button>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="Informe FIFO">
        <h2>Informe FIFO del año</h2>
        <label style={{ maxWidth: 140 }}>Año
          <input type="number" min={2009} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
        </label>
        {informe && informe.ventas.length === 0 && <p className="muted">No hay ventas en {anio}.</p>}
        {informe && informe.ventas.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Fecha</th><th>Ingreso</th><th>Coste</th><th>Resultado</th></tr></thead>
                <tbody>
                  {informe.ventas.map((x) => <tr key={x.id}><td className="num">{fechaCorta(x.fecha)}</td><td className="num">{v.$(x.ingreso)}</td><td className="num">{v.$(x.coste)}</td><td className={`num ${x.ganancia >= 0 ? 'gain' : 'loss'}`}>{x.ganancia >= 0 ? '▲' : '▼'} {v.$s(x.ganancia)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="num">Total: {v.$s(informe.gananciaTotal)}</p>
            <button onClick={() => descargarInforme(informeFifoCsv(informe!.ventas), anio)}>Descargar informe (CSV)</button>
          </>
        )}
        <p className="notice">Criterio FIFO (primero en entrar, primero en salir). Es una ayuda para tu declaración, no asesoramiento fiscal.</p>
      </section>

      {soporteBloqueo && (
        <section className="card stack" aria-label="Bloqueo">
          <h2>Bloqueo con Face ID / huella</h2>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
            <input type="checkbox" checked={bloqueo} onChange={(e) => void toggleBloqueo(e.target.checked)} /> Pedir Face ID o huella al abrir la app
          </label>
          <p className="notice">Protege la pantalla en este dispositivo.</p>
        </section>
      )}

      {mfaHabilitado && !v.demo && user && (
        <section className="card stack" aria-label="Doble factor">
          <h2>Doble factor (TOTP)</h2>
          {!totp ? <button onClick={() => void iniciarAltaTotp(user).then(setTotp).catch((e) => setMsg(mensajeError(e)))}>Configurar app autenticadora</button> : (
            <div className="stack">
              <p className="muted">Añade esta clave en tu app autenticadora y escribe el código de 6 dígitos.</p>
              <code style={{ wordBreak: 'break-all' }}>{totp.secreto.secretKey}</code>
              <input inputMode="numeric" maxLength={6} aria-label="Código de 6 dígitos" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              <button className="btn-primary" onClick={() => void confirmarAltaTotp(user, totp.secreto, codigo).then(() => { setTotp(null); setMsg('Doble factor activado.') }).catch((e) => setMsg(mensajeError(e)))}>Activar</button>
            </div>
          )}
        </section>
      )}

      <section className="card stack" aria-label="Cuenta">
        <h2>Cuenta</h2>
        {user && <p className="muted">{user.email}</p>}
        <button onClick={() => void salir()}>Cerrar sesión</button>
        {!v.demo && <button className="btn-danger" onClick={() => setBorrando(true)}>Borrar mi cuenta y todos mis datos</button>}
      </section>

      <p className="notice">Bitcoin Tracker es una herramienta de apuntes personales. No ofrece asesoramiento financiero ni fiscal.</p>

      {borrando && (
        <Sheet titulo="Borrar cuenta" onCerrar={() => setBorrando(false)}>
          <p className="muted">Se borrarán tu cuenta y todas tus operaciones. No se puede deshacer. Escribe tu contraseña para confirmar.</p>
          <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {errBorrar && <p className="err" role="alert">{errBorrar}</p>}
          <div className="row">
            <button onClick={() => setBorrando(false)}>Cancelar</button>
            <button className="btn-danger" style={{ flex: 1 }} disabled={!password} onClick={() => void confirmarBorrado()}>Borrar para siempre</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
