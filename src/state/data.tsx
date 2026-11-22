import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addDoc, collection, deleteDoc, doc, getDocFromServer, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './auth'
import type { Operacion, Plan, PuntoPrecio } from '../lib/calculos'
import {
  AVISOS_INICIALES, PERFIL_INICIAL, PLAN_VACIO, type AvisosDoc, type Datos, type Mercado, type Objetivos, type OperacionGuardable, type Perfil,
} from '../lib/tipos'
import { avisosSchema, operacionSchema, perfilSchema, planSchema } from '../lib/schemas'
import { idDispositivo, marcarRegistrado, navegadorGenerico, yaRegistrado } from '../lib/dispositivo'
import {
  AVISOS_DEMO, GLOBAL_DEMO, OBJETIVOS_DEMO, PERFIL_DEMO, RED_DEMO, demoExtra, fngDemo, velasDemo, historicoDemo, mercadoDemo, operacionesDemo, planDemo,
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
function DemoProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_DEMO)
  const [operaciones, setOperaciones] = useState<Operacion[]>(() => operacionesDemo())
  const [plan, setPlan] = useState<Plan>(() => planDemo())
  const [objetivos, setObjetivos] = useState<Objetivos>(OBJETIVOS_DEMO)
  const [avisos, setAvisos] = useState<AvisosDoc>(AVISOS_DEMO)
  const mercado = useMemo(() => mercadoDemo(), [])
  const historico = useMemo(() => historicoDemo(), [])

  const value: Datos = {
    demo: true, cargando: false, perfil, operaciones, plan, objetivos, avisos, mercado, historico, telegramVinculado: false,
    guardarOperacion: async (o, id) => {
      const v = operacionSchema.parse(o)
      setOperaciones((prev) => (id ? prev.map((x) => (x.id === id ? { ...v, id } : x)) : [...prev, { ...v, id: `demo-${crypto.randomUUID()}` }]))
    },
    borrarOperacion: async (id) => setOperaciones((p) => p.filter((o) => o.id !== id)),
    guardarPlan: async (p, ob) => {
      setPlan(p)
      if (ob) setObjetivos(ob)
    },
    guardarAvisos: async (a) => setAvisos(a),
    guardarPerfil: async (p) => setPerfil(p),
    refrescar: async () => { await new Promise((r) => setTimeout(r, 600)) },
    pedirPrueba: async () => undefined,
    crearVinculo: async () => undefined,
    suscribirHistorial: (cb) => {
      cb([{ id: 'd1', t: new Date(Date.now() - 3600e3), tipo: 'mov24h', titulo: 'Movimiento de precio', texto: 'BTC sube un 5,2 % en 24 horas (ejemplo del modo demo).' }])
      return () => undefined
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ───────────── Firestore ─────────────
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d)
const limpiar = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T

function FirestoreProvider({ uid, nombre, children }: { uid: string; nombre: string; children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil>({ ...PERFIL_INICIAL, nombre })
  const [operaciones, setOperaciones] = useState<Operacion[]>([])
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
          setPerfil({ nombre: String(d.nombre ?? ''), monedaPreferida: d.monedaPreferida ?? 'EUR', modoPrivado: Boolean(d.modoPrivado) })
        } else if (db) {
          // Primer acceso: crea el perfil (las reglas validan cada campo).
          void setDoc(doc(db, base), { nombre: nombre.slice(0, 60), monedaPreferida: 'EUR', modoPrivado: false, creado: serverTimestamp() })
        }
        setListos((l) => ({ ...l, perfil: true }))
      }),
      onSnapshot(collection(db, `${base}/operaciones`), (s) => {
        setOperaciones(
          s.docs.map((d) => {
            const x = d.data()
            return {
              id: d.id, tipo: x.tipo, fecha: x.fecha, cantidad: num(x.cantidad), comision: num(x.comision), precio: num(x.precio),
              moneda: x.moneda, plataforma: x.plataforma, nota: x.nota,
            } as Operacion
          }),
        )
        setListos((l) => ({ ...l, ops: true }))
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
    demo: false, cargando: !(listos.perfil && listos.ops), perfil, operaciones, plan, objetivos, avisos, mercado, historico, telegramVinculado,
    guardarOperacion: async (o: OperacionGuardable, id) => {
      if (!db) return
      const v = limpiar(operacionSchema.parse(o))
      if (id) await updateDoc(doc(db, `users/${uid}/operaciones/${id}`), { ...v, editado: serverTimestamp() })
      else await addDoc(collection(db, `users/${uid}/operaciones`), { ...v, creado: serverTimestamp() })
    },
    borrarOperacion: async (id) => {
      if (db) await deleteDoc(doc(db, `users/${uid}/operaciones/${id}`))
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
  const [datos, setDatos] = useState<T | null>(null)
  useEffect(() => {
    if (demo) {
      const d: Record<string, unknown> = { velas: velasDemo(), fng: fngDemo(), global: GLOBAL_DEMO, red: RED_DEMO, ...demoExtra() }
      setDatos((d[id] as T) ?? null)
      return
    }
    if (!db) return
    return onSnapshot(doc(db, `mercado/${id}`), (s) => setDatos(s.exists() ? (s.data() as T) : null))
  }, [id, demo])
  return datos
}
