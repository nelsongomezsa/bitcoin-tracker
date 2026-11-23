import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDocFromServer, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './auth'
import type { Operacion, Plan, PuntoPrecio } from '../lib/calculos'
import {
  AVISOS_INICIALES, PERFIL_INICIAL, PLAN_VACIO, type AvisosDoc, type Datos, type Mercado, type Objetivos, type OperacionGuardable, type Perfil,
} from '../lib/tipos'
import { avisosSchema, operacionSchema, perfilSchema, planSchema, tradeSchema } from '../lib/schemas'
import type { Trade, TradeGuardable } from '../lib/trading'
import { guardarVistaLocal, leerVistaLocal } from '../lib/modoVista'
import { interruptorPrueba } from '../lib/pruebas'
import { cargarMercadoReal, type MercadoReal } from '../lib/demoReal'
import { idDispositivo, marcarRegistrado, navegadorGenerico, yaRegistrado } from '../lib/dispositivo'
import {
  AVISOS_DEMO, GLOBAL_DEMO, OBJETIVOS_DEMO, PERFIL_DEMO, RED_DEMO, demoExtra, fngDemo, velasDemo, velasSinteticas, historicoDemo, mercadoDemo, operacionesDemo, planDemo, tradesDemo,
} from './demoData'

const Ctx = createContext<Datos | null>(null)

export const useDatos = (): Datos => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDatos fuera de DataProvider')
  return c
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { demo, user } = useAuth()
  if (demo) return <DemoProvider>{children}</DemoProvider>
  if (user) return <FirestoreProvider uid={user.uid} nombre={user.displayName ?? ''}>{children}</FirestoreProvider>
  return <>{children}</>
}

// ───────────── Modo demo: todo en memoria, nada llega a Firestore ─────────────
/** Datos reales de la demo (velas diarias y semanales de Kraken) para los hooks de mercado. */
const DemoRealCtx = createContext<{ activo: boolean; velas: MercadoReal['velas'] | null }>({ activo: false, velas: null })

function DemoProvider({ children }: { children: ReactNode }) {
  const vacia = interruptorPrueba('demo-vacia')
  const sintetica = interruptorPrueba('demo-sintetica') // solo para las pruebas automáticas: todo inventado y determinista
  // Precio real de BTC (Kraken). Si no se puede (sin red…), se usan datos inventados.
  const [real, setReal] = useState<MercadoReal | null | 'fallo'>(sintetica ? 'fallo' : null)
  useEffect(() => {
    if (sintetica) return
    let vivo = true
    const limite = setTimeout(() => { if (vivo) setReal((r) => r ?? 'fallo') }, 9000)
    void cargarMercadoReal().then((r) => { if (vivo) setReal(r ?? 'fallo') })
    return () => { vivo = false; clearTimeout(limite) }
  }, [sintetica])
  const listo = real !== null
  const datos = real && real !== 'fallo' ? real : null
  const mercado = useMemo(() => datos?.mercado ?? mercadoDemo(), [datos])
  const historico = useMemo(() => datos?.historico ?? historicoDemo(), [datos])

  const [perfil, setPerfil] = useState<Perfil>(() => ({ ...PERFIL_DEMO, vista: leerVistaLocal() }))
  const [operaciones, setOperaciones] = useState<Operacion[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [plan, setPlan] = useState<Plan>(PLAN_VACIO)
  const [objetivos, setObjetivos] = useState<Objetivos>({})
  const [avisos, setAvisos] = useState<AvisosDoc>(AVISOS_DEMO)
  // Las compras, los trades y el plan inventados se crean una vez, anclados al histórico (real) ya cargado.
  const iniciado = useRef(false)
  useEffect(() => {
    if (!listo || iniciado.current) return
    iniciado.current = true
    if (vacia) return
    const ahora = Date.now()
    setOperaciones(operacionesDemo(ahora, historico))
    setTrades(tradesDemo(ahora, historico, datos?.usdPorEur ?? 1.08))
    setPlan(planDemo(ahora, historico))
    setObjetivos(OBJETIVOS_DEMO)
  }, [listo, vacia, historico, datos])
  const ctxReal = useMemo(() => ({ activo: Boolean(datos), velas: datos?.velas ?? null }), [datos])

  const value: Datos = {
    demo: true, demoReal: Boolean(datos), cargando: !listo, perfil, operaciones, trades, plan, objetivos, avisos, mercado, historico, telegramVinculado: false,
    guardarOperacion: async (o, id) => {
      const v = operacionSchema.parse(o)
      setOperaciones((prev) => (id ? prev.map((x) => (x.id === id ? { ...v, id } : x)) : [...prev, { ...v, id: `demo-${crypto.randomUUID()}` }]))
    },
    borrarOperacion: async (id) => setOperaciones((p) => p.filter((o) => o.id !== id)),
    guardarTrade: async (t, id) => {
      const v = tradeSchema.parse(t)
      setTrades((prev) => (id ? prev.map((x) => (x.id === id ? { ...v, id } : x)) : [...prev, { ...v, id: `demo-${crypto.randomUUID()}` }]))
    },
    borrarTrade: async (id) => setTrades((p) => p.filter((x) => x.id !== id)),
    guardarPlan: async (p, ob) => {
      setPlan(p)
      if (ob) setObjetivos(ob)
    },
    guardarAvisos: async (a) => setAvisos(a),
    guardarPerfil: async (p) => { guardarVistaLocal(p.vista); setPerfil(p) },
    refrescar: async () => { await new Promise((r) => setTimeout(r, 600)) },
    pedirPrueba: async () => undefined,
    crearVinculo: async () => undefined,
    suscribirHistorial: (cb) => {
      cb([{ id: 'd1', t: new Date(Date.now() - 3600e3), tipo: 'mov24h', titulo: 'Movimiento de precio', texto: 'BTC sube un 5,2 % en 24 horas (ejemplo del modo demo).' }])
      return () => undefined
    },
  }
  return <DemoRealCtx.Provider value={ctxReal}><Ctx.Provider value={value}>{children}</Ctx.Provider></DemoRealCtx.Provider>
}

// ───────────── Firestore ─────────────
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d)
const MONEDAS_OK = ['EUR', 'USD', 'AUD']
const OPCIONALES_TRADE = ['fechaCierre', 'precioSalida', 'margenBTC', 'comisiones', 'pctManual', 'btcGanadoManual', 'plataforma', 'nota', 'margenDestinado', 'resultadoDinero', 'resultadoMoneda', 'resultadoPrecio', 'horaInicio', 'horaCierre']
const limpiar = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T

function FirestoreProvider({ uid, nombre, children }: { uid: string; nombre: string; children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil>({ ...PERFIL_INICIAL, nombre, vista: leerVistaLocal() })
  const [operaciones, setOperaciones] = useState<Operacion[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [plan, setPlan] = useState<Plan>(PLAN_VACIO)
  const [objetivos, setObjetivos] = useState<Objetivos>({})
  const [avisos, setAvisos] = useState<AvisosDoc>(AVISOS_INICIALES)
  const [mercado, setMercado] = useState<Mercado | null>(null)
  const [historico, setHistorico] = useState<PuntoPrecio[]>([])
  const [listos, setListos] = useState({ perfil: false, ops: false })
  const [telegramVinculado, setTelegramVinculado] = useState(false)

  useEffect(() => {
    if (!db) return
    const base = `users/${uid}`
    const unsubs = [
      onSnapshot(doc(db, base), (s) => {
        if (s.exists()) {
          const d = s.data()
          setPerfil({
            nombre: String(d.nombre ?? ''), monedaPreferida: d.monedaPreferida ?? 'EUR', modoPrivado: Boolean(d.modoPrivado),
            mostrarTrading: d.mostrarTrading !== false, sumarTradingACartera: d.sumarTradingACartera === true,
            vista: d.vista === 'pro' || d.vista === 'simple' ? d.vista : leerVistaLocal(),
          })
        } else if (db) {
          // Primer acceso: crea el perfil (las reglas validan cada campo).
          void setDoc(doc(db, base), { nombre: nombre.slice(0, 60), monedaPreferida: 'EUR', modoPrivado: false, mostrarTrading: true, sumarTradingACartera: false, vista: leerVistaLocal(), creado: serverTimestamp() })
        }
        setListos((l) => ({ ...l, perfil: true }))
      }),
      onSnapshot(collection(db, `${base}/operaciones`), (s) => {
        setOperaciones(
          s.docs.map((d) => {
            const x = d.data()
            return {
              id: d.id, tipo: x.tipo, fecha: x.fecha, cantidad: num(x.cantidad), comision: num(x.comision), precio: num(x.precio),
              moneda: x.moneda, plataforma: x.plataforma, nota: x.nota, ...(typeof x.hora === 'string' ? { hora: x.hora } : {}),
            } as Operacion
          }),
        )
        setListos((l) => ({ ...l, ops: true }))
      }),
      onSnapshot(collection(db, `${base}/trades`), (s) => {
        setTrades(
          s.docs.map((d) => {
            const x = d.data()
            const opc = (k: string) => (typeof x[k] === 'number' ? { [k]: x[k] as number } : {})
            return {
              id: d.id, estado: x.estado, direccion: x.direccion, fechaInicio: x.fechaInicio, precioEntrada: num(x.precioEntrada), moneda: x.moneda ?? 'USD',
              ...(typeof x.apalancamiento === 'number' ? { apalancamiento: x.apalancamiento } : {}), ...(typeof x.fechaCierre === 'string' ? { fechaCierre: x.fechaCierre } : {}),
              ...opc('precioSalida'), ...opc('margenBTC'), ...opc('comisiones'), ...opc('pctManual'), ...opc('btcGanadoManual'), ...opc('margenDestinado'), ...opc('resultadoDinero'), ...opc('resultadoPrecio'), ...(MONEDAS_OK.includes(x.resultadoMoneda) ? { resultadoMoneda: x.resultadoMoneda } : {}),
              ...(typeof x.plataforma === 'string' ? { plataforma: x.plataforma } : {}), ...(typeof x.nota === 'string' ? { nota: x.nota } : {}),
              ...(typeof x.horaInicio === 'string' ? { horaInicio: x.horaInicio } : {}), ...(typeof x.horaCierre === 'string' ? { horaCierre: x.horaCierre } : {}),
            } as Trade
          }),
        )
      }),
      onSnapshot(doc(db, `${base}/plan/config`), (s) => {
        if (!s.exists()) return
        const d = s.data()
        setPlan({ capital: num(d.capital), nivelesClave: d.nivelesClave ?? [], dca: d.dca ?? PLAN_VACIO.dca })
        setObjetivos((d.objetivos as Objetivos) ?? {})
      }),
      onSnapshot(doc(db, `${base}/avisos/config`), (s) => {
        if (!s.exists()) return
        const d = s.data()
        setAvisos({
          ajustes: d.ajustes ?? {}, tokens: d.tokens ?? [], resumen: d.resumen, general: d.general, alertas: d.alertas ?? [],
          seguidas: d.seguidas ?? [], telegram: d.telegram, historialLeidoHasta: d.historialLeidoHasta instanceof Timestamp ? d.historialLeidoHasta.toDate() : null,
        })
      }),
      onSnapshot(doc(db, `${base}/avisos/estado`), (s) => setTelegramVinculado(Boolean(s.exists() && s.data().telegramChatId))),
      onSnapshot(doc(db, 'mercado/precio'), (s) => {
        if (!s.exists()) return
        const d = s.data()
        const t = (k: string) => ({ EUR: num(d[k]?.EUR), USD: num(d[k]?.USD), AUD: num(d[k]?.AUD) })
        setMercado({
          precios: t('precios'), maximoHistorico: t('maximoHistorico'), cambio24h: num(d.cambio24h), cambio7d: num(d.cambio7d),
          miedoCodicia: d.miedoCodicia ?? null,
          athFecha: typeof d.athFecha === 'string' ? new Date(d.athFecha) : null,
          actualizado: d.actualizado instanceof Timestamp ? d.actualizado.toDate() : null,
        })
      }),
      onSnapshot(doc(db, 'mercado/historico'), (s) => {
        if (!s.exists()) return
        const puntos = (s.data().puntos ?? []) as number[][]
        setHistorico(puntos.map(([t, precio]) => ({ t, precio })))
      }),
    ]
    void registrarDispositivo(uid)
    return () => unsubs.forEach((u) => u())
  }, [uid, nombre])

  const value: Datos = {
    demo: false, demoReal: false, cargando: !(listos.perfil && listos.ops), perfil, operaciones, trades, plan, objetivos, avisos, mercado, historico, telegramVinculado,
    guardarOperacion: async (o: OperacionGuardable, id) => {
      if (!db) return
      const v = limpiar(operacionSchema.parse(o))
      if (id) await updateDoc(doc(db, `users/${uid}/operaciones/${id}`), { ...v, ...(v.hora ? {} : { hora: deleteField() }), editado: serverTimestamp() })
      else await addDoc(collection(db, `users/${uid}/operaciones`), { ...v, creado: serverTimestamp() })
    },
    borrarOperacion: async (id) => {
      if (db) await deleteDoc(doc(db, `users/${uid}/operaciones/${id}`))
    },
    guardarTrade: async (t: TradeGuardable, id) => {
      if (!db) return
      const v = limpiar(tradeSchema.parse(t))
      if (id) {
        // Los opcionales que ya no están se borran del documento (updateDoc solo fusiona).
        const quitar = Object.fromEntries(OPCIONALES_TRADE.filter((k) => !(k in v)).map((k) => [k, deleteField()]))
        await updateDoc(doc(db, `users/${uid}/trades/${id}`), { ...v, ...quitar, editado: serverTimestamp() })
      }
      else await addDoc(collection(db, `users/${uid}/trades`), { ...v, creado: serverTimestamp() })
    },
    borrarTrade: async (id) => {
      if (db) await deleteDoc(doc(db, `users/${uid}/trades/${id}`))
    },
    guardarPlan: async (p, ob) => {
      if (!db) return
      const v = planSchema.parse({ ...p, objetivos: ob ?? objetivos })
      await setDoc(doc(db, `users/${uid}/plan/config`), v)
    },
    guardarAvisos: async (a) => {
      if (!db) return
      const v = avisosSchema.parse(a)
      await setDoc(doc(db, `users/${uid}/avisos/config`), limpiar({
        ajustes: v.ajustes, tokens: v.tokens, resumen: v.resumen, general: v.general, alertas: v.alertas, seguidas: v.seguidas,
        telegram: v.telegram, historialLeidoHasta: v.historialLeidoHasta ?? undefined,
      }))
    },
    guardarPerfil: async (p) => {
      if (!db) return
      const v = perfilSchema.parse(p)
      guardarVistaLocal(v.vista)
      await setDoc(doc(db, `users/${uid}`), v, { merge: true })
    },
    refrescar: async () => {
      if (db) await getDocFromServer(doc(db, 'mercado/precio')) // actualiza la caché y dispara el listener
    },
    pedirPrueba: async () => {
      if (db) await setDoc(doc(db, `users/${uid}/avisos/prueba`), { ts: serverTimestamp() })
    },
    crearVinculo: async (codigo) => {
      if (db) await setDoc(doc(db, `vinculos/${codigo}`), { uid, expira: Timestamp.fromMillis(Date.now() + 14 * 60 * 1000) })
    },
    suscribirHistorial: (cb) => {
      if (!db) return () => undefined
      const q = query(collection(db, `users/${uid}/historial`), orderBy('t', 'desc'), limit(40))
      return onSnapshot(q, (s) =>
        cb(s.docs.map((x) => ({ id: x.id, t: x.data().t instanceof Timestamp ? x.data().t.toDate() : new Date(), tipo: String(x.data().tipo ?? ''), titulo: String(x.data().titulo ?? ''), texto: String(x.data().texto ?? '') }))),
      )
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Registra este dispositivo la primera vez. Si es el primero de la cuenta no avisa; si no, el job avisa al resto. */
async function registrarDispositivo(uid: string) {
  try {
    if (!db || (await yaRegistrado(uid))) return
    const id = await idDispositivo()
    const otros = await getDocs(query(collection(db, `users/${uid}/dispositivos`), limit(1)))
    await setDoc(doc(db, `users/${uid}/dispositivos/${id}`), { creado: serverTimestamp(), navegador: navegadorGenerico(), procesado: otros.empty })
    await marcarRegistrado(uid)
  } catch {
    /* sin conexión o sin permiso: se reintenta en la próxima sesión */
  }
}

/** Documento compartido de mercado (mercado/<id>), escrito solo por el job. Se escucha solo mientras la pantalla está abierta. */
export function useMercadoDoc<T = Record<string, unknown>>(id: string): T | null {
  const { demo } = useAuth()
  const real = useContext(DemoRealCtx)
  const [datos, setDatos] = useState<T | null>(null)
  useEffect(() => {
    setDatos(null) // al cambiar de documento no se queda el anterior (p. ej. al cambiar de temporalidad)
    if (!id) return // sin documento (p. ej. 1m y 5m vienen en directo)
    if (demo) {
      // Con precio real, las velas por temporalidad no se inventan: el gráfico las pide a Kraken (REST) y las diarias/semanales salen de lo ya descargado.
      const sinteticas = real.activo ? {} : { velas_15m: velasSinteticas(15), velas_1h: velasSinteticas(60), velas_4h: velasSinteticas(240), velas_1d: velasSinteticas(1440), velas_1w: velasSinteticas(10080) }
      const d: Record<string, unknown> = { ...sinteticas, velas: real.velas ?? velasDemo(), fng: fngDemo(), global: GLOBAL_DEMO, red: RED_DEMO, ...demoExtra() }
      setDatos((d[id] as T) ?? null)
      return
    }
    if (!db) return
    return onSnapshot(doc(db, `mercado/${id}`), (s) => setDatos(s.exists() ? (s.data() as T) : null))
  }, [id, demo, real])
  return datos
}
