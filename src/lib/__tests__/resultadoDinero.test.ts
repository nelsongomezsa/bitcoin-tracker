// Resultado en dinero → BTC. Todos los números están inventados.
import { describe, expect, it } from 'vitest'
import { btcDeResultado, calcularTrade, filasTrades, pasoAPaso, resumenPorMes, totalesTrading, type Trade } from '../trading'
import { tradeSchema } from '../schemas'
import { buscarPrecioBtc, instanteCierre, intervaloPara, inicioVela, precioDeSalida, precioDeVela } from '../precioResultado'

const P = { EUR: 50000, USD: 55000, AUD: 80000 }
const t = (o: Partial<Trade>): Trade => ({
  id: 'x', estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 50000, precioSalida: 51000, moneda: 'USD', ...o,
})

describe('resultado en dinero → BTC (resultado ÷ precio, 8 decimales)', () => {
  it('+100 $ y −100 $ a 50.000 $/BTC → +0,002 y −0,002 BTC, y el total es 0', () => {
    expect(btcDeResultado(100, 50000)).toBe(0.002)
    expect(btcDeResultado(-100, 50000)).toBe(-0.002)
    const par = [t({ id: 'a', resultadoDinero: 100, resultadoMoneda: 'USD', resultadoPrecio: 50000 }), t({ id: 'b', fechaCierre: '2025-03-05', resultadoDinero: -100, resultadoMoneda: 'USD', resultadoPrecio: 50000 })]
    const x = totalesTrading(par, P, 'USD')
    expect(x.ganado).toBe(0.002)
    expect(x.perdido).toBe(0.002)
    expect(Math.abs(x.neto)).toBeLessThan(1e-12)
    expect(Math.abs(x.netoValor)).toBeLessThan(1e-7)
  })
  it('−50 € a 40.000 €/BTC → −0,00125 BTC', () => {
    expect(btcDeResultado(-50, 40000)).toBe(-0.00125)
    expect(calcularTrade(t({ resultadoDinero: -50, resultadoMoneda: 'EUR', resultadoPrecio: 40000 }), 0).btc).toBe(-0.00125)
  })
  it('+200 AUD a 100.000 AUD/BTC → +0,002 BTC', () => {
    expect(calcularTrade(t({ resultadoDinero: 200, resultadoMoneda: 'AUD', resultadoPrecio: 100000 }), 0).btc).toBe(0.002)
  })
  it('redondea a 8 decimales (−100 € a 81.300 € → −0,00123001 BTC) y el redondeo es simétrico', () => {
    expect(btcDeResultado(-100, 81300)).toBe(-0.00123001)
    expect(btcDeResultado(100, 81300)).toBe(0.00123001)
    expect(btcDeResultado(0, 81300)).toBe(0)
  })
  it('los BTC escritos a mano siguen mandando sobre el resultado en dinero', () => {
    const c = calcularTrade(t({ resultadoDinero: 100, resultadoMoneda: 'USD', resultadoPrecio: 50000, btcGanadoManual: 0.0031 }), 0)
    expect(c).toMatchObject({ btc: 0.0031, manual: true, deResultado: false })
  })
  it('el resultado manda sobre margen × %', () => {
    const c = calcularTrade(t({ margenBTC: 0.5, pctManual: 10, resultadoDinero: 100, resultadoMoneda: 'USD', resultadoPrecio: 50000 }), 0)
    expect(c).toMatchObject({ btc: 0.002, deResultado: true })
  })
  it('el paso a paso lo cuenta', () => {
    const x = t({ resultadoDinero: -50, resultadoMoneda: 'EUR', resultadoPrecio: 40000 })
    expect(pasoAPaso(x, calcularTrade(x, 0))).toContain('resultado −50,00 EUR ÷ 40.000 EUR/BTC → −0,00125 BTC')
  })
})

describe('varios trades con monedas mezcladas: las pérdidas restan en todo', () => {
  // 1: +100 $ @50.000 = +0,002 · 2: −50 € @40.000 = −0,00125 · 3: +200 AUD @100.000 = +0,002 · 4: −30 $ @60.000 = −0,0005
  const lote = [
    t({ id: '1', fechaInicio: '2025-01-02', fechaCierre: '2025-01-10', resultadoDinero: 100, resultadoMoneda: 'USD', resultadoPrecio: 50000 }),
    t({ id: '2', fechaInicio: '2025-01-12', fechaCierre: '2025-01-20', resultadoDinero: -50, resultadoMoneda: 'EUR', resultadoPrecio: 40000 }),
    t({ id: '3', fechaInicio: '2025-02-01', fechaCierre: '2025-02-05', resultadoDinero: 200, resultadoMoneda: 'AUD', resultadoPrecio: 100000 }),
    t({ id: '4', fechaInicio: '2025-02-06', fechaCierre: '2025-02-08', resultadoDinero: -30, resultadoMoneda: 'USD', resultadoPrecio: 60000 }),
  ]
  it('Ganado, Perdido y Neto', () => {
    const x = totalesTrading(lote, P, 'USD')
    expect(x.ganado).toBeCloseTo(0.004, 12)
    expect(x.perdido).toBeCloseTo(0.00175, 12)
    expect(x.neto).toBeCloseTo(0.00225, 12) // = ganado − perdido = suma con signo
  })
  it('«Total histórico» (acumulado tras cada trade) resta las pérdidas', () => {
    expect(filasTrades(lote, P, 'USD').map((f) => f.acumulado)).toEqual([expect.closeTo(0.002, 12), expect.closeTo(0.00075, 12), expect.closeTo(0.00275, 12), expect.closeTo(0.00225, 12)])
  })
  it('«Por mes» suma con signo', () => {
    const m = resumenPorMes(lote, P, 'USD')
    expect(m.map((x) => [x.mes, x.n])).toEqual([['2025-01', 2], ['2025-02', 2]])
    expect(m[0].btc).toBeCloseTo(0.00075, 12)
    expect(m[1].btc).toBeCloseTo(0.00150, 12)
    expect(m.reduce((s, x) => s + x.btc, 0)).toBeCloseTo(0.00225, 12)
  })
  it('el total se muestra en la moneda que elija el usuario (BTC × precio actual de esa moneda)', () => {
    for (const vista of ['EUR', 'USD', 'AUD'] as const) expect(totalesTrading(lote, P, vista).netoValor).toBeCloseTo(0.00225 * P[vista], 9)
  })
})

describe('esquema: el resultado necesita moneda y precio', () => {
  const ok = { estado: 'cerrado', direccion: 'largo', fechaInicio: '2025-03-01', fechaCierre: '2025-03-04', precioEntrada: 50000, precioSalida: 51000 }
  it('completo vale (positivo, negativo o cero); a medias, no', () => {
    for (const r of [100, -100, 0]) expect(tradeSchema.safeParse({ ...ok, resultadoDinero: r, resultadoMoneda: 'EUR', resultadoPrecio: 81300 }).success, String(r)).toBe(true)
    expect(tradeSchema.safeParse({ ...ok, resultadoDinero: 100 }).success).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, resultadoDinero: 100, resultadoMoneda: 'EUR' }).success).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, resultadoMoneda: 'EUR', resultadoPrecio: 81300 }).success).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, resultadoDinero: 100, resultadoMoneda: 'BTC', resultadoPrecio: 1 }).success).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, resultadoDinero: 100, resultadoMoneda: 'EUR', resultadoPrecio: 0 }).success).toBe(false)
    expect(tradeSchema.safeParse({ ...ok, resultadoDinero: 1e9, resultadoMoneda: 'EUR', resultadoPrecio: 1 }).success).toBe(false)
  })
})

describe('precio de BTC del cierre (Kraken) y respaldo', () => {
  // Filas de Kraken: [t, apertura, máx, mín, cierre, vwap, volumen, nº]
  const dia = (t: number, vwap: number) => [t, '1', '2', '0.5', '1.5', String(vwap), '10', 5]
  const hoy = Date.parse('2025-06-30T12:00:00Z')
  it('instante: con hora, la hora local; sin hora, el mediodía UTC', () => {
    expect(instanteCierre('2025-03-04')).toBe(Date.parse('2025-03-04T12:00:00Z') / 1000)
    expect(instanteCierre('2025-03-04', '14:30')).toBe(new Date('2025-03-04T14:30:00').getTime() / 1000)
  })
  it('intervalo: sin hora, diaria; con hora, 1 min / 1 h / diaria según la edad', () => {
    const ahora = hoy / 1000
    expect(intervaloPara(ahora - 100, ahora, false)).toBe(1440)
    expect(intervaloPara(ahora - 3600, ahora, true)).toBe(1)
    expect(intervaloPara(ahora - 3 * 86400, ahora, true)).toBe(60)
    expect(intervaloPara(ahora - 60 * 86400, ahora, true)).toBe(1440)
  })
  it('elige la vela que contiene el instante y usa su VWAP', () => {
    const t0 = inicioVela(Date.parse('2025-03-04T12:00:00Z') / 1000, 1440)
    expect(t0).toBe(Date.parse('2025-03-04T00:00:00Z') / 1000)
    expect(precioDeVela([dia(t0 - 86400, 40000), dia(t0, 41000), dia(t0 + 86400, 42000)], t0 + 43200, 1440)).toBe(41000)
    expect(precioDeVela([dia(t0, 0)], t0 + 1, 1440)).toBe(1.5) // sin VWAP, el cierre
    expect(precioDeVela([dia(t0 - 86400, 40000)], t0 + 1, 1440)).toBeNull() // no hay vela de ese día
  })
  it('sin hora usa la vela diaria del par de la moneda; guarda el precio (2 decimales) y la fuente', async () => {
    const urls: string[] = []
    const t0 = Date.parse('2025-03-04T00:00:00Z') / 1000
    const fetcher = (async (u: string) => { urls.push(u); return { ok: true, json: async () => ({ error: [], result: { XXBTZEUR: [dia(t0, 81300.456)], last: t0 } }) } }) as unknown as typeof fetch
    const r = await buscarPrecioBtc({ moneda: 'EUR', fecha: '2025-03-04', trade: t({}), precios: P, ahoraMs: hoy, fetcher })
    expect(r).toEqual({ precio: 81300.46, fuente: 'dia', detalle: 'vela diaria de Kraken' })
    expect(urls[0]).toBe(`https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=1440&since=${t0 - 1}`)
    for (const [m, par] of [['USD', 'XBTUSD'], ['AUD', 'XBTAUD']] as const) {
      await buscarPrecioBtc({ moneda: m, fecha: '2025-03-04', trade: t({}), precios: P, ahoraMs: hoy, fetcher })
      expect(urls.at(-1)).toContain(`pair=${par}&`)
    }
  })
  it('con hora y cierre reciente (2 h) usa la vela de 1 minuto; con 3 días, la de 1 hora', async () => {
    const hora = '10:15'
    const inst = instanteCierre('2025-06-30', hora) // hora local de quien ejecute el test
    const llamadas: string[] = []
    const con = (t0: number) => (async (u: string) => { llamadas.push(u); return { ok: true, json: async () => ({ error: [], result: { XBT: [[t0, '1', '1', '1', '1', '60000', '1', 1]], last: t0 } }) } }) as unknown as typeof fetch
    const reciente = await buscarPrecioBtc({ moneda: 'USD', fecha: '2025-06-30', hora, trade: t({}), precios: P, ahoraMs: inst * 1000 + 2 * 3600e3, fetcher: con(inicioVela(inst, 1)) })
    expect(reciente).toMatchObject({ fuente: 'minuto', precio: 60000 })
    expect(llamadas[0]).toContain('interval=1&')
    const antigua = await buscarPrecioBtc({ moneda: 'USD', fecha: '2025-06-30', hora, trade: t({}), precios: P, ahoraMs: inst * 1000 + 3 * 86400e3, fetcher: con(inicioVela(inst, 60)) })
    expect(antigua).toMatchObject({ fuente: 'hora', precio: 60000 })
    expect(llamadas[1]).toContain('interval=60&')
  })
  it('el cierre de HOY sin hora usa ya la vela diaria de hoy (aunque aún no sea mediodía UTC)', async () => {
    const t0 = Date.parse('2025-06-30T00:00:00Z') / 1000
    const manana = Date.parse('2025-06-30T03:00:00Z') // 03:00 UTC: el mediodía UTC de hoy todavía no ha llegado
    let pedido = ''
    const fetcher = (async (u: string) => { pedido = u; return { ok: true, json: async () => ({ error: [], result: { XBT: [[t0, '1', '1', '1', '1', '81300', '1', 1]], last: t0 } }) } }) as unknown as typeof fetch
    const r = await buscarPrecioBtc({ moneda: 'EUR', fecha: '2025-06-30', trade: t({}), precios: P, ahoraMs: manana, fetcher })
    expect(r).toMatchObject({ fuente: 'dia', precio: 81300 })
    expect(pedido).toContain('interval=1440')
  })
  it('un cierre en el futuro no consulta Kraken y usa el respaldo', async () => {
    let llamado = false
    const fetcher = (async () => { llamado = true; return { ok: true, json: async () => ({}) } }) as unknown as typeof fetch
    const r = await buscarPrecioBtc({ moneda: 'USD', fecha: '2025-07-05', trade: t({ precioSalida: 55000 }), precios: P, ahoraMs: Date.parse('2025-06-30T12:00:00Z'), fetcher })
    expect(llamado).toBe(false)
    expect(r?.fuente).toBe('salida')
  })
  it('sin vela (o sin red) usa el precio de salida del trade convertido con el cambio', async () => {
    const vacio = (async () => ({ ok: true, json: async () => ({ error: [], result: { XBT: [], last: 0 } }) })) as unknown as typeof fetch
    const caido = (async () => { throw new Error('sin red') }) as unknown as typeof fetch
    const trade = t({ moneda: 'USD', precioSalida: 55000 }) // 55.000 $ con USD = 55.000 y EUR = 50.000 → 50.000 €
    for (const fetcher of [vacio, caido]) {
      const r = await buscarPrecioBtc({ moneda: 'EUR', fecha: '2025-03-04', trade, precios: P, ahoraMs: hoy, fetcher })
      expect(r).toEqual({ precio: 50000, fuente: 'salida', detalle: 'precio de salida del trade convertido con el cambio' })
    }
    expect(precioDeSalida({ precioSalida: 40000, moneda: 'EUR' }, 'EUR', null)).toBe(40000)
    expect(precioDeSalida({ precioSalida: 40000, moneda: 'EUR' }, 'USD', null)).toBeNull()
    expect(await buscarPrecioBtc({ moneda: 'EUR', fecha: '2025-03-04', trade: { moneda: 'USD' }, precios: P, ahoraMs: hoy, fetcher: caido })).toBeNull()
  })
})
