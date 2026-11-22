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
    const db = { doc: (ruta) => ({ set: async (d) => { guardado[ruta] = d } }) }
    const getJson = async (u) => { if (u.includes('interval=60') && u.includes('XBTUSD')) throw new Error('HTTP 500'); return { error: [], result: { X: [fila(10), fila(20)], last: 1 } } }
    await guardarVelas({ db, FieldValue: { serverTimestamp: () => 'ts' }, getJson, claves: ['15m', '1h', '4h'] })
    expect(Object.keys(guardado).sort()).toEqual(['mercado/velas_15m', 'mercado/velas_4h'])
    expect(guardado['mercado/velas_15m']).toMatchObject({ intervalo: 15, EUR: [[10, 100, 110, 90, 105, 1.5], [20, 100, 110, 90, 105, 1.5]] })
    expect(Object.keys(guardado['mercado/velas_15m'])).toEqual(expect.arrayContaining(['EUR', 'USD']))
  })
  it('intervalos de Kraken: 15, 60, 240, 1440, 10080', () => {
    expect(Object.values(INTERVALOS)).toEqual([15, 60, 240, 1440, 10080])
  })
})

describe('qué se refresca y cuándo', () => {
  it('cada 15 min: 15m y 1h; al empezar cada franja de 4 h (UTC) y en el diario, todo', () => {
    expect(clavesPendientes(Date.parse('2025-06-10T09:30:00Z'))).toEqual(['15m', '1h'])
    expect(clavesPendientes(Date.parse('2025-06-10T08:05:00Z'))).toEqual(['15m', '1h', '4h', '1d', '1w'])
    expect(clavesPendientes(Date.parse('2025-06-10T08:35:00Z'))).toEqual(['15m', '1h'])
    expect(clavesPendientes(Date.parse('2025-06-10T09:30:00Z'), { diario: true })).toHaveLength(5)
  })
})
