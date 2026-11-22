import { describe, expect, it } from 'vitest'
import { procesarUsuarios } from '../avisos/orquestador.mjs'

// Firestore simulado: cuenta cada documento que devuelve una consulta (lo que factura la lectura real).
function fakeDb(usuarios) {
  const escritos = []
  let lecturas = 0
  const docRef = (path) => ({
    path,
    parent: { parent: { id: path.split('/')[1] } },
    update: async (d) => escritos.push(['update', path, d]),
    set: async (d) => escritos.push(['set', path, d]),
  })
  const docs = []
  for (const [uid, partes] of Object.entries(usuarios)) {
    for (const [id, data] of Object.entries(partes)) docs.push({ id, ref: docRef(`users/${uid}/avisos/${id}`), data: () => data })
  }
  return {
    escritos,
    get lecturas() { return lecturas },
    collectionGroup: () => ({ get: async () => { lecturas += docs.length; return { docs } } }),
    doc: (p) => ({ ...docRef(p), get: async () => { lecturas++; return { data: () => undefined } } }),
    collection: () => ({ add: async (d) => escritos.push(['add', 'historial', d]) }),
  }
}

const FV = { arrayRemove: (...x) => x }
const ctx = { ahora: Date.parse('2025-06-02T10:00:00Z'), precios: { EUR: 46000, USD: 50600, AUD: 75900 }, prev: { EUR: 48000, USD: 52800, AUD: 79200 }, cambio1h: 0, cambio24h: -0.07, cambio7d: 0, estad: null, fng: null, red: null }

describe('orquestador', () => {
  it('50 usuarios: como mucho 3 lecturas por usuario', async () => {
    const usuarios = {}
    for (let i = 0; i < 50; i++) {
      usuarios[`u${i}`] = {
        config: { tokens: ['t'], ajustes: { mov24h: { activo: true, umbral: 5 } }, general: { zona: 'Europe/Madrid' } },
        estado: { telegramChatId: null },
        prueba: { ts: { toMillis: () => 0 } },
      }
    }
    const db = fakeDb(usuarios)
    const enviados = []
    const r = await procesarUsuarios({ db, ctx, modo: 'frecuente', FieldValue: FV, enviarPush: async (t, m) => { enviados.push(m); return [] }, enviarTelegram: null })
    expect(db.lecturas).toBeLessThanOrEqual(50 * 3)
    expect(r.usuarios).toBe(50)
    expect(enviados).toHaveLength(50)
  })
  it('usuarios sin canales no generan envíos; token caducado se borra', async () => {
    const db = fakeDb({
      sin: { config: { tokens: [], ajustes: { mov24h: { activo: true } } } },
      con: { config: { tokens: ['malo', 'bueno'], ajustes: { mov24h: { activo: true } } } },
    })
    const r = await procesarUsuarios({ db, ctx, modo: 'frecuente', FieldValue: FV, enviarPush: async () => ['malo'], enviarTelegram: null })
    expect(r.usuarios).toBe(1)
    expect(db.escritos.some(([k, , d]) => k === 'update' && JSON.stringify(d).includes('malo'))).toBe(true)
  })
  it('aviso de prueba: se envía una vez aunque no haya avisos', async () => {
    const mk = (ms) => fakeDb({ u: { config: { tokens: ['t'], ajustes: {} }, estado: { ultimaPrueba: 0 }, prueba: { ts: { toMillis: () => ms } } } })
    const enviados = []
    const push = async (t, m) => { enviados.push(m.titulo); return [] }
    await procesarUsuarios({ db: mk(1000), ctx, modo: 'frecuente', FieldValue: FV, enviarPush: push, enviarTelegram: null })
    expect(enviados).toEqual(['Aviso de prueba'])
    const db2 = fakeDb({ u: { config: { tokens: ['t'], ajustes: {} }, estado: { ultimaPrueba: 1000 }, prueba: { ts: { toMillis: () => 1000 } } } })
    await procesarUsuarios({ db: db2, ctx, modo: 'frecuente', FieldValue: FV, enviarPush: push, enviarTelegram: null })
    expect(enviados).toHaveLength(1)
  })
  it('dispositivo nuevo: respeta el interruptor y es urgente por defecto', async () => {
    const extras = { u: [{ clave: 'dispositivo:x', titulo: 'Nuevo dispositivo', texto: 'Safari', requiere: 'dispositivoNuevo', cooldownMs: 1000 }], v: [{ clave: 'dispositivo:y', titulo: 'N', texto: 'S', requiere: 'dispositivoNuevo' }] }
    const db = fakeDb({ u: { config: { tokens: ['t'], ajustes: {} } }, v: { config: { tokens: ['t'], ajustes: { dispositivoNuevo: { activo: false } } } } })
    const enviados = []
    await procesarUsuarios({ db, ctx: { ...ctx, cambio24h: 0 }, modo: 'frecuente', FieldValue: FV, extras, enviarPush: async (t, m) => { enviados.push(m.titulo); return [] }, enviarTelegram: null })
    expect(enviados).toEqual(['Nuevo dispositivo'])
  })
})
