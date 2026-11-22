import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { createRequire } from 'node:module'
// El paquete usa firebase compat por CommonJS: lo cargamos por CJS para compartir la misma instancia.
const { assertFails, assertSucceeds, initializeTestEnvironment } = createRequire(import.meta.url)('@firebase/rules-unit-testing') as typeof import('@firebase/rules-unit-testing')

type Db = ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore'] extends () => infer R ? R : never
const doc = (db: Db, path: string) => db.doc(path)
const getDoc = (r: ReturnType<typeof doc>) => r.get()
const setDoc = (r: ReturnType<typeof doc>, d: Record<string, unknown>) => r.set(d)
const updateDoc = (r: ReturnType<typeof doc>, d: Record<string, unknown>) => r.update(d)
const deleteDoc = (r: ReturnType<typeof doc>) => r.delete()
const req = createRequire(import.meta.url)
const compat = req('firebase/compat/app')
req('firebase/compat/firestore')
// Marca de tiempo REAL del servidor (hace falta para las reglas con `== request.time`).
const serverTimestamp = () => (compat.default ?? compat).firestore.FieldValue.serverTimestamp()
const Timestamp = { now: () => new Date(), fromDate: (d: Date) => d }

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bitcoin-tracker',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => env.clearFirestore())

const ana = () => env.authenticatedContext('ana', { email_verified: true, email: 'ana@example.com' }).firestore()
const anaSinVerificar = () => env.authenticatedContext('ana', { email_verified: false, email: 'ana@example.com' }).firestore()
const beto = () => env.authenticatedContext('beto', { email_verified: true, email: 'beto@example.com' }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const op = (extra: Record<string, unknown> = {}) => ({
  tipo: 'compra', fecha: '2025-01-10', cantidad: 100, comision: 1, precio: 50000, moneda: 'EUR', creado: serverTimestamp(), ...extra,
})
const perfil = (extra: Record<string, unknown> = {}) => ({ nombre: 'Ana', monedaPreferida: 'EUR', modoPrivado: false, creado: serverTimestamp(), ...extra })

describe('aislamiento por usuario (IDOR)', () => {
  it('el dueño lee y escribe lo suyo', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/operaciones/o1'), op()))
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/operaciones/o1')))
  })
  it('otro usuario no lee ni escribe', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users/ana/operaciones/o1'), { x: 1 }))
    await assertFails(getDoc(doc(beto(), 'users/ana/operaciones/o1')))
    await assertFails(setDoc(doc(beto(), 'users/ana/operaciones/o2'), op()))
    await assertFails(deleteDoc(doc(beto(), 'users/ana/operaciones/o1')))
    await assertFails(getDoc(doc(beto(), 'users/ana')))
  })
  it('sin sesión no hay nada', async () => {
    await assertFails(getDoc(doc(anon(), 'users/ana')))
    await assertFails(getDoc(doc(anon(), 'mercado/precio')))
    await assertFails(setDoc(doc(anon(), 'users/ana/operaciones/o1'), op()))
  })
  it('exige correo verificado', async () => {
    await assertFails(setDoc(doc(anaSinVerificar(), 'users/ana/operaciones/o1'), op()))
    await assertFails(setDoc(doc(anaSinVerificar(), 'users/ana'), perfil()))
  })
  it('rutas desconocidas denegadas', async () => {
    await assertFails(setDoc(doc(ana(), 'otra/cosa'), { a: 1 }))
    await assertFails(setDoc(doc(ana(), 'users/ana/secretos/s1'), { a: 1 }))
  })
})

describe('mercado', () => {
  it('lectura para usuarios, escritura nunca desde el cliente', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'mercado/precio'), { eur: 1 }))
    await assertSucceeds(getDoc(doc(ana(), 'mercado/precio')))
    await assertFails(setDoc(doc(ana(), 'mercado/precio'), { eur: 2 }))
    await assertFails(deleteDoc(doc(ana(), 'mercado/precio')))
  })
})

describe('mercado: documentos nuevos solo lectura', () => {
  it('ballenas, instituciones, carteras y velas: leer sí, escribir nunca', async () => {
    for (const id of ['ballenas', 'instituciones', 'carteras', 'velas', 'velas_15m', 'velas_1h', 'velas_4h', 'velas_1d', 'velas_1w', 'fng', 'global', 'red', 'estadisticas', 'telegram']) {
      await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore() as never, `mercado/${id}`), { x: 1 }))
      await assertSucceeds(getDoc(doc(ana(), `mercado/${id}`)))
      await assertFails(setDoc(doc(ana(), `mercado/${id}`), { x: 2 }))
    }
  })
  it('sin sesión no se lee', async () => {
    await assertFails(getDoc(doc(anon(), 'mercado/ballenas')))
  })
})

describe('validación de operaciones', () => {
  const crear = (extra: Record<string, unknown>) => setDoc(doc(ana(), 'users/ana/operaciones/o1'), op(extra))
  it('acepta los campos opcionales válidos', async () => {
    await assertSucceeds(crear({ plataforma: 'Exchange', nota: 'DCA semanal' }))
  })
  it('rechaza cantidades fuera de rango', async () => {
    await assertFails(crear({ cantidad: 0 }))
    await assertFails(crear({ cantidad: -5 }))
    await assertFails(crear({ cantidad: 10000000 }))
    await assertFails(crear({ cantidad: '100' }))
  })
  it('comisión ≥ 0 y menor que la cantidad', async () => {
    await assertFails(crear({ comision: -1 }))
    await assertFails(crear({ comision: 100 }))
    await assertSucceeds(crear({ comision: 0 }))
  })
  it('precio > 0', async () => {
    await assertFails(crear({ precio: 0 }))
  })
  it('fecha con formato y no futura', async () => {
    await assertFails(crear({ fecha: '2999-01-01' }))
    await assertFails(crear({ fecha: '10/01/2025' }))
    await assertFails(crear({ fecha: Timestamp.now() }))
  })
  it('plataforma ≤ 40 caracteres', async () => {
    await assertSucceeds(crear({ plataforma: 'x'.repeat(40) }))
    await assertFails(crear({ plataforma: 'x'.repeat(41) }))
  })
  it('nota ≤ 200, tipo y moneda cerrados', async () => {
    await assertFails(crear({ nota: 'x'.repeat(201) }))
    await assertSucceeds(crear({ nota: 'x'.repeat(200) }))
    await assertFails(crear({ tipo: 'regalo' }))
    await assertFails(crear({ moneda: 'GBP' }))
  })
  it('mass assignment: campos no permitidos', async () => {
    await assertFails(crear({ admin: true }))
    await assertFails(crear({ uid: 'beto' }))
  })
  it('editar no permite cambiar la fecha de creación', async () => {
    await assertSucceeds(crear({}))
    const ref = doc(ana(), 'users/ana/operaciones/o1')
    await assertSucceeds(updateDoc(ref, { cantidad: 200, editado: serverTimestamp() }))
    await assertFails(updateDoc(ref, { creado: Timestamp.fromDate(new Date('2020-01-01')) }))
    await assertFails(updateDoc(ref, { cantidad: -1 }))
  })
  it('el dueño puede borrar', async () => {
    await assertSucceeds(crear({}))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/operaciones/o1')))
  })
})

describe('perfil, plan y avisos', () => {
  it('perfil válido y mass assignment', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil()))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ rol: 'admin' })))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ monedaPreferida: 'BTC' })))
  })
  it('plan', async () => {
    const plan = { capital: 1000, nivelesClave: [{ precio: 50000, porcentajeCapital: 10 }], dca: { inicio: '2025-06-01', porcentajeSemanal: 1, semanas: 25 } }
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/plan/config'), plan))
    await assertFails(setDoc(doc(ana(), 'users/ana/plan/config'), { ...plan, capital: -1 }))
    await assertFails(setDoc(doc(ana(), 'users/ana/plan/config'), { ...plan, extra: 1 }))
    await assertFails(setDoc(doc(beto(), 'users/ana/plan/config'), plan))
  })
  it('plan: DCA sin fecha de inicio', async () => {
    const plan = { capital: 1000, nivelesClave: [], dca: { porcentajeSemanal: 1, semanas: 25 } }
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/plan/config'), plan))
  })
  it('avisos: config válida y sin campos de más', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: { nivel: { activo: true } }, tokens: ['t1'] }))
    await assertFails(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: {}, enviados: { nivel: 1 } }))
    await assertFails(setDoc(doc(beto(), 'users/ana/avisos/config'), { ajustes: {} }))
  })
  it('avisos: el cliente puede guardar su resumen para el job', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: {}, resumen: { precioMedio: 50000, btc: 0.1 } }))
  })
  it('borrar la cuenta: el dueño borra sus documentos', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil()))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana')))
  })
})

describe('avisos: ajustes generales, alertas y Telegram', () => {
  const cfg = (extra: Record<string, unknown>) => setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: {}, ...extra })
  it('ajustes generales con rangos', async () => {
    await assertSucceeds(cfg({ general: { zona: 'Europe/Madrid', silencioActivo: true, silencioDesde: 22, silencioHasta: 8, limiteDiario: 10, pausadoHasta: 0, moneda: 'USD', horaResumen: 9 } }))
    await assertFails(cfg({ general: { silencioDesde: 24 } }))
    await assertFails(cfg({ general: { limiteDiario: 0 } }))
    await assertFails(cfg({ general: { limiteDiario: 101 } }))
    await assertFails(cfg({ general: { moneda: 'GBP' } }))
    await assertFails(cfg({ general: { admin: true } }))
  })
  it('máximo 20 alertas y 30 carteras seguidas', async () => {
    const alerta = (i: number) => ({ id: `a${i}`, dir: 'abajo', precio: 40000, moneda: 'EUR', repetir: false })
    await assertSucceeds(cfg({ alertas: Array.from({ length: 20 }, (_, i) => alerta(i)) }))
    await assertFails(cfg({ alertas: Array.from({ length: 21 }, (_, i) => alerta(i)) }))
    await assertSucceeds(cfg({ seguidas: Array.from({ length: 30 }, (_, i) => `c${i}`) }))
    await assertFails(cfg({ seguidas: Array.from({ length: 31 }, (_, i) => `c${i}`) }))
  })
  it('Telegram: el cliente solo puede pedir la desconexión, nunca fijar el chat', async () => {
    await assertSucceeds(cfg({ telegram: { desconectar: true } }))
    await assertFails(cfg({ telegram: { chatId: 123 } }))
  })
  it('estado e historial: el dueño lee y borra, nadie escribe', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as never, 'users/ana/avisos/estado'), { telegramChatId: 1 })
      await setDoc(doc(c.firestore() as never, 'users/ana/historial/h1'), { titulo: 'x' })
    })
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/avisos/estado')))
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/historial/h1')))
    await assertFails(getDoc(doc(beto(), 'users/ana/historial/h1')))
    await assertFails(setDoc(doc(ana(), 'users/ana/avisos/estado'), { telegramChatId: 999 }))
    await assertFails(setDoc(doc(ana(), 'users/ana/historial/h2'), { titulo: 'inventado' }))
    await assertFails(updateDoc(doc(ana(), 'users/ana/historial/h1'), { titulo: 'otro' }))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/historial/h1')))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/avisos/estado')))
  })
  it('aviso de prueba: una marca de tiempo, y no más de una cada 5 minutos', async () => {
    const ref = doc(ana(), 'users/ana/avisos/prueba')
    await assertSucceeds(setDoc(ref, { ts: serverTimestamp() }))
    await assertFails(setDoc(ref, { ts: serverTimestamp() })) // demasiado pronto
    await assertFails(setDoc(doc(ana(), 'users/ana/avisos/prueba'), { ts: new Date('2020-01-01') }))
    await assertFails(setDoc(doc(beto(), 'users/ana/avisos/prueba'), { ts: serverTimestamp() }))
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore() as never, 'users/ana/avisos/prueba'), { ts: new Date(Date.now() - 10 * 60 * 1000) }))
    await assertSucceeds(setDoc(ref, { ts: serverTimestamp() })) // ya pasaron más de 5 minutos
  })
  it('dispositivos: crea el dueño, sin campos de más, sin tocar el de otro', async () => {
    const d = (extra: Record<string, unknown> = {}) => ({ creado: serverTimestamp(), navegador: 'Safari en iPhone', procesado: false, ...extra })
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/dispositivos/d1'), d()))
    await assertFails(setDoc(doc(ana(), 'users/ana/dispositivos/d2'), d({ ip: '1.2.3.4' })))
    await assertFails(setDoc(doc(ana(), 'users/ana/dispositivos/d3'), d({ navegador: 'x'.repeat(41) })))
    await assertFails(setDoc(doc(beto(), 'users/ana/dispositivos/d4'), d()))
    await assertFails(updateDoc(doc(ana(), 'users/ana/dispositivos/d1'), { procesado: true }))
  })
  it('vínculos de Telegram: solo el propio, código bien formado y 15 minutos máximo', async () => {
    const v = (uid: string, min: number) => ({ uid, expira: new Date(Date.now() + min * 60 * 1000) })
    await assertSucceeds(setDoc(doc(ana(), 'vinculos/ABCD1234EF'), v('ana', 14)))
    await assertFails(setDoc(doc(ana(), 'vinculos/ABCD1234EG'), v('beto', 14))) // de otra persona
    await assertFails(setDoc(doc(ana(), 'vinculos/ABCD1234EH'), v('ana', 60))) // caduca tarde
    await assertFails(setDoc(doc(ana(), 'vinculos/abc'), v('ana', 10))) // código mal formado
    await assertFails(getDoc(doc(ana(), 'vinculos/ABCD1234EF'))) // no se lee
    await assertFails(deleteDoc(doc(beto(), 'vinculos/ABCD1234EF')))
    await assertSucceeds(deleteDoc(doc(ana(), 'vinculos/ABCD1234EF')))
  })
  it('plan: precio de arranque del DCA opcional y validado', async () => {
    const plan = (dca: Record<string, unknown>) => ({ capital: 1000, nivelesClave: [], dca: { porcentajeSemanal: 1, semanas: 25, ...dca } })
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/plan/config'), plan({ precioInicio: 72000, monedaInicio: 'USD' })))
    await assertFails(setDoc(doc(ana(), 'users/ana/plan/config'), plan({ precioInicio: -1 })))
    await assertFails(setDoc(doc(ana(), 'users/ana/plan/config'), plan({ monedaInicio: 'GBP' })))
  })
})

describe('trades', () => {
  const trade = (extra: Record<string, unknown> = {}) => ({
    estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 80000, precioSalida: 82520, moneda: 'USD',
    apalancamiento: 5, margenBTC: 0.05, comisiones: 0.4, creado: serverTimestamp(), ...extra,
  })
  const abierto = (extra: Record<string, unknown> = {}) => ({ estado: 'abierto', direccion: 'corto', fechaInicio: '2025-03-01', precioEntrada: 80000, moneda: 'EUR', apalancamiento: 1, creado: serverTimestamp(), ...extra })
  const crear = (d: Record<string, unknown>, id = 't1', quien = ana) => setDoc(doc(quien(), `users/ana/trades/${id}`), d)

  it('el dueño crea, lee, edita y borra', async () => {
    await assertSucceeds(crear(trade()))
    await assertSucceeds(getDoc(doc(ana(), 'users/ana/trades/t1')))
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana/trades/t1'), { nota: 'ok', editado: serverTimestamp() }))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana/trades/t1')))
  })
  it('abierto sin salida ni cierre; con todos los opcionales', async () => {
    await assertSucceeds(crear(abierto()))
    await assertSucceeds(crear(trade({ btcGanadoManual: -0.002, plataforma: 'Exchange', nota: 'prueba' }), 't2'))
  })
  it('un trade cerrado necesita fecha y precio de salida', async () => {
    const sinSalida: Record<string, unknown> = trade()
    delete sinSalida.precioSalida
    await assertFails(crear(sinSalida))
    const sinCierre: Record<string, unknown> = trade()
    delete sinCierre.fechaCierre
    await assertFails(crear(sinCierre))
  })
  it('otro usuario ni lee ni escribe; sin sesión nada; sin verificar nada', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users/ana/trades/t1'), { x: 1 }))
    await assertFails(getDoc(doc(beto(), 'users/ana/trades/t1')))
    await assertFails(crear(trade(), 't9', beto))
    await assertFails(deleteDoc(doc(beto(), 'users/ana/trades/t1')))
    await assertFails(crear(trade(), 't9', anon))
    await assertFails(crear(trade(), 't9', anaSinVerificar))
  })
  it('mass assignment y tipos', async () => {
    await assertFails(crear(trade({ rol: 'admin' })))
    await assertFails(crear(trade({ estado: 'otro' })))
    await assertFails(crear(trade({ direccion: 'neutral' })))
    await assertFails(crear(trade({ moneda: 'BTC' })))
    await assertFails(crear(trade({ precioEntrada: '80000' })))
    await assertFails(crear(trade({ nota: 'x'.repeat(201) })))
    await assertFails(crear(trade({ plataforma: 'x'.repeat(41) })))
  })
  it('rangos: precios, apalancamiento 1–125, margen, comisiones y manual', async () => {
    await assertFails(crear(trade({ precioEntrada: 0 })))
    await assertFails(crear(trade({ precioSalida: -1 })))
    await assertFails(crear(trade({ apalancamiento: 0.5 })))
    await assertFails(crear(trade({ apalancamiento: 126 })))
    await assertSucceeds(crear(trade({ apalancamiento: 125 }), 'a1'))
    await assertSucceeds(crear(trade({ apalancamiento: 1 }), 'a2'))
    await assertFails(crear(trade({ margenBTC: 0 })))
    await assertFails(crear(trade({ margenBTC: 21000000 })))
    await assertFails(crear(trade({ comisiones: -0.1 })))
    await assertFails(crear(trade({ comisiones: 101 })))
    await assertFails(crear(trade({ btcGanadoManual: 21000000 })))
    await assertFails(crear(trade({ btcGanadoManual: '1' })))
  })
  it('fechas: formato, no futura y cierre no anterior al inicio', async () => {
    await assertFails(crear(trade({ fechaInicio: '01/03/2025' })))
    await assertFails(crear(trade({ fechaInicio: '2999-01-01', fechaCierre: '2999-01-02' })))
    await assertFails(crear(trade({ fechaCierre: '2025-02-28' })))
    await assertSucceeds(crear(trade({ fechaCierre: '2025-03-01' }), 'mismo'))
  })
  it('al editar no se puede cambiar «creado»', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users/ana/trades/t1'), { ...trade(), creado: new Date('2025-01-01') }))
    await assertFails(setDoc(doc(ana(), 'users/ana/trades/t1'), trade()))
  })
  it('el perfil acepta mostrarTrading y sumarTradingACartera, y solo booleanos', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil({ mostrarTrading: false, sumarTradingACartera: true })))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ mostrarTrading: 'si' })))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ sumarTradingACartera: 1 })))
  })
})

describe('vista simple o pro', () => {
  it('el perfil acepta vista simple o pro y nada más', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil({ vista: 'pro' })))
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil({ vista: 'simple' })))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ vista: 'exchange' })))
    await assertFails(setDoc(doc(ana(), 'users/ana'), perfil({ vista: true })))
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil())) // los perfiles antiguos, sin el campo, siguen valiendo
  })
})

describe('hora opcional en operaciones y trades', () => {
  let n = 0 // un documento nuevo en cada intento: repetir el id sería una edición, y las ediciones no pueden cambiar «creado»
  const crearOp = (extra: Record<string, unknown>) => setDoc(doc(ana(), `users/ana/operaciones/h${n++}`), op(extra))
  const tr = (extra: Record<string, unknown> = {}) => ({ estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 80000, precioSalida: 82520, moneda: 'USD', apalancamiento: 5, creado: serverTimestamp(), ...extra })
  const crearTr = (extra: Record<string, unknown>) => setDoc(doc(ana(), `users/ana/trades/h${n++}`), tr(extra))
  it('operaciones: HH:MM válida sí; sin hora sí; mal formada o de otro tipo no', async () => {
    await assertSucceeds(crearOp({ hora: '09:05' }))
    await assertSucceeds(crearOp({ hora: '23:59' }))
    await assertSucceeds(crearOp({}))
    for (const h of ['24:00', '9:05', '12:60', '12:30:15', 'tarde', 930, true]) await assertFails(crearOp({ hora: h }))
  })
  it('operaciones: se puede añadir o cambiar la hora al editar', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'users/ana/operaciones/o1'), op()))
    await assertSucceeds(updateDoc(doc(ana(), 'users/ana/operaciones/o1'), { hora: '10:30', editado: serverTimestamp() }))
    await assertFails(updateDoc(doc(ana(), 'users/ana/operaciones/o1'), { hora: '99:99', editado: serverTimestamp() }))
  })
  it('trades: horaInicio y horaCierre válidas sí; mal formadas no', async () => {
    await assertSucceeds(crearTr({ horaInicio: '10:05', horaCierre: '16:40' }))
    await assertSucceeds(crearTr({ horaInicio: '10:05' }))
    for (const h of ['25:00', '9:30', 'x']) { await assertFails(crearTr({ horaInicio: h })); await assertFails(crearTr({ horaCierre: h })) }
    await assertFails(crearTr({ horaInicio: 1005 }))
  })
  it('trades: el mismo día, el cierre no puede ser anterior al inicio', async () => {
    await assertFails(crearTr({ fechaCierre: '2025-03-01', horaInicio: '15:00', horaCierre: '14:59' }))
    await assertSucceeds(crearTr({ fechaCierre: '2025-03-01', horaInicio: '15:00', horaCierre: '15:00' }))
    await assertSucceeds(crearTr({ fechaCierre: '2025-03-02', horaInicio: '15:00', horaCierre: '09:00' })) // otro día: vale
  })
  it('otro usuario no puede escribir horas en lo de Ana', async () => {
    await assertFails(setDoc(doc(beto(), 'users/ana/operaciones/o9'), op({ hora: '10:00' })))
  })
})
