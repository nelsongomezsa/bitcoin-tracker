import { describe, expect, it } from 'vitest'
import { INTERVALOS, MAX_VELAS, clavesPendientes, descargarVelas, filasDeRespuesta, guardarVelas, limpiarVelas, urlOhlc } from '../mercado/kraken.mjs'

const fila = (t, o = 100, h = 110, l = 90, c = 105) => [t, String(o), String(h), String(l), String(c), '100', '1.5', 7] // formato de Kraken (cadenas)

describe('limpiarVelas', () => {
  it('ordena, quita repetidos (gana el último) y convierte a números', () => {
    const r = limpiarVelas([fila(300), fila(100), fila(200), fila(200, 101, 111, 91, 106)])
    expect(r.map((x) => x[0])).toEqual([100, 200, 300])
    expect(r[1]).toEqual([200, 101, 111, 91, 106, 1.5])
  })
  it('los tiempos están en segundos (los milisegundos se convierten)', () => {
    expect(limpiarVelas([fila(1_700_000_000_000)])[0][0]).toBe(1_700_000_000)
    expect(limpiarVelas([fila(1_700_000_000)])[0][0]).toBe(1_700_000_000)
  })
  it('descarta filas imposibles', () => {
    expect(limpiarVelas([fila(1, 100, 90, 110, 100), fila(2, 100, 110, 90, 120), fila(3, 0), fila(4, NaN), ['x'], null, fila(5)])).toHaveLength(1)
  })
  it('se queda con las 300 últimas', () => {
    const r = limpiarVelas(Array.from({ length: 500 }, (_, i) => fila(1000 + i * 60)))
    expect(r).toHaveLength(MAX_VELAS)
    expect(r[0][0]).toBe(1000 + 200 * 60)
    expect(r.at(-1)[0]).toBe(1000 + 499 * 60)
  })
  it('es idempotente (se puede volver a limpiar lo ya guardado)', () => {
    const a = limpiarVelas([fila(10), fila(20)])
    expect(limpiarVelas(a)).toEqual(a)
  })
  it('sin huecos raros: nunca hay saltos hacia atrás ni tiempos iguales', () => {
    const r = limpiarVelas(Array.from({ length: 400 }, (_, i) => fila(((i * 7919) % 400) * 900)))
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBeGreaterThan(r[i - 1][0])
  })
})

describe('respuesta y descarga', () => {
  it('lee la primera serie ignorando "last" y falla con errores', () => {
    expect(filasDeRespuesta({ error: [], result: { XXBTZEUR: [fila(1)], last: 1 } })).toHaveLength(1)
    expect(() => filasDeRespuesta({ error: ['EGeneral:Invalid arguments'], result: {} })).toThrow(/Kraken/)
    expect(() => filasDeRespuesta({ error: [], result: { last: 1 } })).toThrow()
  })
  it('usa la API pública de Kraken sin clave', async () => {
    const urls = []
    const getJson = async (u) => { urls.push(u); return { error: [], result: { XBT: [fila(100), fila(50)], last: 100 } } }
    const v = await descargarVelas(getJson, 'XBTEUR', 15)
    expect(urls[0]).toBe(urlOhlc('XBTEUR', 15))
    expect(urls[0]).toMatch(/^https:\/\/api\.kraken\.com\/0\/public\/OHLC\?pair=XBTEUR&interval=15$/)
    expect(v.map((x) => x[0])).toEqual([50, 100])
  })
  it('guarda un documento por temporalidad con EUR y USD; un fallo no bloquea el resto', async () => {
    const guardado = {}
    const db = { doc: (ruta) => ({ get: async () => ({ data: () => ({}) }), set: async (d) => { guardado[ruta] = d } }) }
    const getJson = async (u) => { if (u.includes('interval=60') && u.includes('XBTUSD')) throw new Error('HTTP 500'); return { error: [], result: { X: [fila(10), fila(20)], last: 1 } } }
    await guardarVelas({ db, FieldValue: { serverTimestamp: () => 'ts' }, getJson, claves: ['15m', '1h', '4h'], pausa: async () => {} })
    expect(Object.keys(guardado).filter((k) => k !== 'mercado/velas_estado').sort()).toEqual(['mercado/velas_15m', 'mercado/velas_4h'])
    expect(guardado['mercado/velas_15m']).toMatchObject({ intervalo: 15, EUR: [[10, 100, 110, 90, 105, 1.5], [20, 100, 110, 90, 105, 1.5]] })
    expect(Object.keys(guardado['mercado/velas_15m'])).toEqual(expect.arrayContaining(['EUR', 'USD']))
  })
  it('intervalos de Kraken: 15, 60, 240, 1440, 10080', () => {
    expect(Object.values(INTERVALOS)).toEqual([15, 60, 240, 1440, 10080])
  })
})

describe('qué se refresca y cuándo (por antigüedad, no por la hora del reloj)', () => {
  const ahora = Date.parse('2025-06-10T09:30:00Z')
  const H = 3600e3
  it('sin marcas de actualización, todas', () => {
    expect(clavesPendientes(ahora, {})).toEqual(['15m', '1h', '4h', '1d', '1w'])
    expect(clavesPendientes(ahora)).toHaveLength(5)
  })
  it('15m siempre; las demás cuando pasa su antigüedad máxima, en cualquier minuto de cualquier hora', () => {
    const reciente = Object.fromEntries(['15m', '1h', '4h', '1d', '1w'].map((k) => [k, ahora - 10 * 60e3]))
    expect(clavesPendientes(ahora, reciente)).toEqual(['15m'])
    expect(clavesPendientes(ahora, { ...reciente, '1h': ahora - 51 * 60e3 })).toEqual(['15m', '1h'])
    expect(clavesPendientes(ahora, { ...reciente, '1d': ahora - 4 * H, '1w': ahora - 4 * H })).toEqual(['15m', '1d', '1w'])
    // el caso real: la pasada cae a las 18:39 (no en los primeros minutos de un bloque de 4 h) y 1d/1w llevan un día sin actualizarse
    expect(clavesPendientes(Date.parse('2025-06-10T18:39:00Z'), { ...reciente, '4h': ahora - 12 * H, '1d': ahora - 30 * H, '1w': ahora - 30 * H })).toEqual(expect.arrayContaining(['4h', '1d', '1w']))
  })
  it('forzar (el job diario) pide todas', () => {
    expect(clavesPendientes(ahora, { '15m': ahora, '1h': ahora, '4h': ahora, '1d': ahora, '1w': ahora }, { forzar: true })).toHaveLength(5)
  })
  it('una marca ilegible cuenta como sin marca', () => {
    expect(clavesPendientes(ahora, { '1d': 'ayer', '1w': null })).toEqual(expect.arrayContaining(['1d', '1w']))
  })
})

describe('guardarVelas: estado, pausas y límite de peticiones', () => {
  const crearDb = (estadoInicial = {}) => {
    const docs = {}, estado = { ...estadoInicial }
    return {
      docs, estado,
      db: { doc: (ruta) => ({
        get: async () => ({ data: () => (ruta === 'mercado/velas_estado' ? estado : docs[ruta]) }),
        set: async (d, opc) => { if (ruta === 'mercado/velas_estado') Object.assign(estado, d); else docs[ruta] = opc?.merge ? { ...docs[ruta], ...d } : d },
      }) },
    }
  }
  const FV = { serverTimestamp: () => 'ts' }
  const ok = async () => ({ error: [], result: { X: [fila(10), fila(20)], last: 1 } })
  it('guarda todas las temporalidades pendientes (incluidas 1d y 1w) y apunta cuándo', async () => {
    const { db, docs, estado } = crearDb()
    const hechas = await guardarVelas({ db, FieldValue: FV, getJson: ok, ahora: 1000, pausa: async () => {} })
    expect(hechas).toEqual(['15m', '1h', '4h', '1d', '1w'])
    expect(Object.keys(docs).sort()).toEqual(['mercado/velas_15m', 'mercado/velas_1d', 'mercado/velas_1h', 'mercado/velas_1w', 'mercado/velas_4h'])
    expect(docs['mercado/velas_1d']).toMatchObject({ intervalo: 1440 })
    expect(docs['mercado/velas_1w']).toMatchObject({ intervalo: 10080 })
    expect(estado).toEqual({ '15m': 1000, '1h': 1000, '4h': 1000, '1d': 1000, '1w': 1000 })
  })
  it('solo vuelve a pedir lo que ha caducado', async () => {
    const urls = []
    const { db } = crearDb({ '15m': 0, '1h': 1000, '4h': 1000, '1d': 1000, '1w': 1000 })
    await guardarVelas({ db, FieldValue: FV, getJson: async (u) => { urls.push(u); return ok() }, ahora: 1000 + 60e3, pausa: async () => {} })
    expect(urls.every((u) => u.includes('interval=15'))).toBe(true)
    expect(urls).toHaveLength(2) // EUR y USD
  })
  it('espera entre peticiones (Kraken limita las públicas)', async () => {
    const pausas = []
    const { db } = crearDb()
    await guardarVelas({ db, FieldValue: FV, getJson: ok, ahora: 1, pausaMs: 1100, pausa: async (ms) => { pausas.push(ms) } })
    expect(pausas).toHaveLength(9) // 10 peticiones, 9 esperas
    expect(pausas.every((ms) => ms === 1100)).toBe(true)
  })
  it('ante «Too many requests» espera y reintenta una vez; si sigue fallando, avisa y sigue con el resto', async () => {
    let fallos = 0
    const { db, docs } = crearDb()
    const limitado = async (u) => { if (u.includes('interval=1440') && fallos < 1) { fallos++; return { error: ['EGeneral:Too many requests'], result: {} } } return ok() }
    await guardarVelas({ db, FieldValue: FV, getJson: limitado, ahora: 1, pausa: async () => {} })
    expect(fallos).toBe(1)
    expect(docs['mercado/velas_1d']).toBeDefined() // se recuperó tras la espera
    const { db: db2, docs: d2, estado: e2 } = crearDb()
    await guardarVelas({ db: db2, FieldValue: FV, getJson: async (u) => (u.includes('interval=10080') ? { error: ['EGeneral:Internal error'], result: {} } : ok()), ahora: 1, pausa: async () => {} })
    expect(d2['mercado/velas_1w']).toBeUndefined()
    expect(e2['1w']).toBeUndefined() // sin marca: se reintentará en la siguiente pasada
    expect(d2['mercado/velas_1d']).toBeDefined()
  })
})
