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
const serverTimestamp = () => new Date()
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
  it('avisos: el cliente no puede escribir "enviados"', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: { nivel: { activo: true } }, tokens: ['t1'] }))
    await assertFails(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: {}, enviados: { nivel: 1 } }))
  })
  it('avisos: el cliente puede guardar su resumen para el job', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana/avisos/config'), { ajustes: {}, resumen: { precioMedio: 50000, btc: 0.1 } }))
  })
  it('borrar la cuenta: el dueño borra sus documentos', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/ana'), perfil()))
    await assertSucceeds(deleteDoc(doc(ana(), 'users/ana')))
  })
})
