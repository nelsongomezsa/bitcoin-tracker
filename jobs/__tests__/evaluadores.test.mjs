import { describe, expect, it } from 'vitest'
import { estadoInicial, evaluarDiarios, evaluarFrecuentes } from '../avisos/evaluadores.mjs'

const P = (eur) => ({ EUR: eur, USD: eur * 1.1, AUD: eur * 1.65 })
const AHORA = Date.parse('2025-06-02T08:30:00Z') // lunes
const ctx = (o = {}) => ({ ahora: AHORA, precios: P(50000), prev: P(50000), cambio1h: 0, cambio24h: 0, cambio7d: 0, estad: null, fng: null, red: null, ...o })
const user = (ajustes = {}, extra = {}) => ({ config: { ajustes: { rentable: { activo: false }, nivelClave: { activo: false }, ...ajustes }, general: { zona: 'Europe/Madrid', horaResumen: 9 }, resumen: { precioMedio: 50000, btc: 0.1, invertido: 5000, nivelesPendientes: [45000, 40000], ...extra.resumen }, ...extra.config }, uid: 'u' })
const claves = (a) => a.map((x) => x.clave)
const on = (o = {}) => ({ activo: true, ...o })

describe('precio', () => {
  it('movimientos con umbral y dirección', () => {
    const a = evaluarFrecuentes(ctx({ cambio24h: -0.06, cambio1h: 0.01 }), user({ mov24h: on({ umbral: 5 }), mov1h: on({ umbral: 3 }) }), estadoInicial())
    expect(claves(a)).toEqual(['mov24h:baja'])
    expect(evaluarFrecuentes(ctx({ cambio24h: -0.06 }), user({ mov24h: on({ umbral: 8 }) }), estadoInicial())).toHaveLength(0)
  })
  it('nuevo máximo y mínimo del mes', () => {
    const e = { mes: { max: 49000, min: 48000 }, anio: { max: 80000, min: 30000 } }
    const a = evaluarFrecuentes(ctx({ estad: { extremos: e } }), user({ maxMes: on(), minMes: on(), maxAnio: on() }), estadoInicial())
    expect(claves(a)).toEqual(['maxMes:6'])
  })
  it('números redondos al cruzar en la moneda elegida', () => {
    const u = user({ redondos: on({ paso: 10000 }) })
    expect(claves(evaluarFrecuentes(ctx({ prev: P(49900), precios: P(50100) }), u, estadoInicial()))[0]).toContain('redondos:50000:sube')
    expect(evaluarFrecuentes(ctx({ prev: P(50100), precios: P(50900) }), u, estadoInicial())).toHaveLength(0)
  })
})

describe('mi cartera', () => {
  it('rentable: margen de ±0,5 % y sin avisar la primera vez', () => {
    const u = user({ rentable: on() })
    const est = estadoInicial()
    expect(evaluarFrecuentes(ctx({ precios: P(50100) }), u, est)).toHaveLength(0) // dentro del margen
    expect(est.rentable).toBeNull()
    expect(evaluarFrecuentes(ctx({ precios: P(51000) }), u, est)).toHaveLength(0) // primera vez: solo recuerda
    expect(est.rentable).toBe('positivo')
    expect(evaluarFrecuentes(ctx({ precios: P(49000) }), u, est).map((x) => x.clave)).toEqual(['rentable:baja'])
    expect(evaluarFrecuentes(ctx({ precios: P(49900) }), u, est)).toHaveLength(0) // ruido dentro del margen
    expect(evaluarFrecuentes(ctx({ precios: P(51000) }), u, est).map((x) => x.clave)).toEqual(['rentable:sube'])
  })
  it('hitos: avisa una vez y se rearma al volver a cruzar', () => {
    const u = user({ hitos: on() })
    const est = estadoInicial() // invertido 5000, btc 0,1 → +10 % a 55.000
    expect(claves(evaluarFrecuentes(ctx({ precios: P(56000) }), u, est))).toEqual(['hito:10'])
    expect(evaluarFrecuentes(ctx({ precios: P(56500) }), u, est)).toHaveLength(0)
    expect(evaluarFrecuentes(ctx({ precios: P(52000) }), u, est)).toHaveLength(0) // baja del hito: se rearma
    expect(claves(evaluarFrecuentes(ctx({ precios: P(56000) }), u, est))).toEqual(['hito:10'])
    expect(claves(evaluarFrecuentes(ctx({ precios: P(44000) }), u, est))).toEqual(['hito:-10'])
  })
  it('objetivos una sola vez y valor de cartera al cruzar', () => {
    const est = estadoInicial()
    const u = user({ objetivoBtc: on(), valorCartera: on({ umbral: 5500 }) }, { resumen: { btcMeta: 0.1 } })
    const a = evaluarFrecuentes(ctx({ prev: P(54000), precios: P(56000) }), u, est)
    expect(claves(a).sort()).toEqual(['objetivoBtc', 'valorCartera:5500'])
    expect(evaluarFrecuentes(ctx({ prev: P(54000), precios: P(56000) }), u, est).map((x) => x.clave)).toEqual(['valorCartera:5500'])
  })
  it('precio objetivo al cruzar hacia arriba', () => {
    const u = user({ precioObjetivo: on() }, { resumen: { precioObjetivo: 60000 } })
    expect(evaluarFrecuentes(ctx({ prev: P(59000), precios: P(60100) }), u, estadoInicial())).toHaveLength(1)
    expect(evaluarFrecuentes(ctx({ prev: P(61000), precios: P(62000) }), u, estadoInicial())).toHaveLength(0)
  })
})

describe('mi plan', () => {
  it('nivel clave: aviso previo a X % y al tocarlo', () => {
    const u = user({ nivelClave: on({ umbral: 3 }) })
    expect(claves(evaluarFrecuentes(ctx({ prev: P(46000), precios: P(46200) }), u, estadoInicial()))).toEqual(['nivel:cerca:45000'])
    expect(claves(evaluarFrecuentes(ctx({ prev: P(45200), precios: P(44900) }), u, estadoInicial()))).toEqual(['nivel:toca:45000'])
    expect(evaluarFrecuentes(ctx({ prev: P(50000), precios: P(49000) }), u, estadoInicial())).toHaveLength(0)
  })
  it('comprar bajaría la media: solo con el precio por debajo de la media', () => {
    const u = user({ comprarBajaMedia: on({ importe: 100 }) })
    const a = evaluarFrecuentes(ctx({ precios: P(45000) }), u, estadoInicial())
    expect(a).toHaveLength(1)
    expect(a[0].cooldownMs).toBe(7 * 24 * 3600 * 1000)
    expect(a[0].texto).toContain('100 €')
    expect(evaluarFrecuentes(ctx({ precios: P(55000) }), u, estadoInicial())).toHaveLength(0)
  })
  it('DCA: el día y la hora elegidos, en su zona horaria', () => {
    const u = user({ dca: on({ dia: 1, hora: 9 }) })
    expect(evaluarFrecuentes(ctx({ ahora: Date.parse('2025-06-02T06:30:00Z') }), u, estadoInicial())).toHaveLength(0) // 08:30 en Madrid
    const a = evaluarFrecuentes(ctx({ ahora: Date.parse('2025-06-02T07:30:00Z') }), u, estadoInicial()) // 09:30
    expect(a).toHaveLength(1)
    expect(a[0].url).toBe('/operaciones?duplicar=1')
    expect(evaluarFrecuentes(ctx({ ahora: Date.parse('2025-06-03T10:00:00Z') }), u, estadoInicial())).toHaveLength(0) // martes
  })
  it('inicio de DCA al tocar el precio de arranque, una vez', () => {
    const est = estadoInicial()
    const u = user({ inicioDca: on() }, { resumen: { precioInicio: 48000 } })
    expect(evaluarFrecuentes(ctx({ prev: P(48500), precios: P(47900) }), u, est)).toHaveLength(1)
    expect(evaluarFrecuentes(ctx({ prev: P(47900), precios: P(48500) }), u, est)).toHaveLength(0)
  })
  it('DCA saltado a los 8 días (solo en el cron diario)', () => {
    const u = user({ dcaSaltado: on() }, { resumen: { ultimaCompra: '2025-05-20' } })
    expect(claves(evaluarDiarios(ctx(), u, estadoInicial()))).toEqual(['dcaSaltado'])
    expect(evaluarDiarios(ctx(), user({ dcaSaltado: on() }, { resumen: { ultimaCompra: '2025-05-30' } }), estadoInicial())).toHaveLength(0)
  })
})

describe('alertas a medida', () => {
  const al = (o) => ({ id: 'a1', dir: 'abajo', precio: 48000, moneda: 'EUR', repetir: false, ...o })
  it('se dispara una vez si no es repetible', () => {
    const est = estadoInicial()
    const u = user({}, { config: { alertas: [al()] } })
    expect(evaluarFrecuentes(ctx({ precios: P(47000) }), u, est)).toHaveLength(1)
    expect(evaluarFrecuentes(ctx({ precios: P(46000), ahora: AHORA + 7 * 3600e3 }), u, est)).toHaveLength(0)
  })
  it('repetible: espera 6 h y se rearma al dejar de cumplirse', () => {
    const est = estadoInicial()
    const u = user({}, { config: { alertas: [al({ repetir: true })] } })
    expect(evaluarFrecuentes(ctx({ precios: P(47000) }), u, est)).toHaveLength(1)
    expect(evaluarFrecuentes(ctx({ precios: P(47000), ahora: AHORA + 3 * 3600e3 }), u, est)).toHaveLength(0)
    expect(evaluarFrecuentes(ctx({ precios: P(47000), ahora: AHORA + 7 * 3600e3 }), u, est)).toHaveLength(1)
    evaluarFrecuentes(ctx({ precios: P(50000), ahora: AHORA + 8 * 3600e3 }), u, est)
    expect(est.alertasDisparadas.a1).toBeUndefined()
  })
  it('en otra moneda', () => {
    const u = user({}, { config: { alertas: [al({ dir: 'arriba', precio: 56000, moneda: 'USD' })] } })
    expect(evaluarFrecuentes(ctx({ precios: P(52000) }), u, estadoInicial())).toHaveLength(1) // 57.200 $
  })
})

describe('mercado y resúmenes', () => {
  const fng = (valor, extra = {}) => ({ valor, clasificacion: 'x', hace1d: valor, hace7d: valor, ...extra })
  it('miedo y codicia extremos', () => {
    const u = user({ miedoExtremo: on(), codiciaExtrema: on() })
    expect(claves(evaluarDiarios(ctx({ fng: fng(15) }), u, estadoInicial()))).toEqual(['miedoExtremo'])
    expect(claves(evaluarDiarios(ctx({ fng: fng(85) }), u, estadoInicial()))).toEqual(['codiciaExtrema'])
  })
  it('cambio de zona con dirección elegida', () => {
    const est = estadoInicial()
    const u = user({ zonaIndice: on({ direccion: 'miedo' }) })
    evaluarDiarios(ctx({ fng: fng(50) }), u, est) // Neutral: solo recuerda
    const a = evaluarDiarios(ctx({ fng: fng(38) }), u, est)
    expect(a[0].texto).toBe('El mercado pasa de Neutral a Miedo (38).')
    expect(evaluarDiarios(ctx({ fng: fng(60) }), u, est)).toHaveLength(0) // hacia la codicia: no la quiere
  })
  it('subida brusca del miedo', () => {
    const u = user({ subidaMiedo: on({ umbral: 15, ventana: 7 }) })
    expect(evaluarDiarios(ctx({ fng: fng(30, { hace7d: 50 }) }), u, estadoInicial())).toHaveLength(1)
    expect(evaluarDiarios(ctx({ fng: fng(40, { hace7d: 50 }) }), u, estadoInicial())).toHaveLength(0)
  })
  it('halving a 30 días, 7 días y el mismo día, una vez cada uno', () => {
    const est = estadoInicial()
    const u = user({ halving: on() })
    expect(evaluarDiarios(ctx({ red: { diasHalving: 29 } }), u, est)).toHaveLength(1)
    expect(evaluarDiarios(ctx({ red: { diasHalving: 28 } }), u, est)).toHaveLength(0)
    expect(evaluarDiarios(ctx({ red: { diasHalving: 6 } }), u, est)).toHaveLength(1)
    expect(evaluarDiarios(ctx({ red: { diasHalving: 0 } }), u, est)).toHaveLength(1)
    expect(evaluarDiarios(ctx({ red: null }), u, estadoInicial())).toHaveLength(0) // si la API falla, no se avisa
  })
  it('resumen diario a la hora elegida y mensual el día 1', () => {
    const u = user({ resumenDiario: on(), resumenMensual: on() }, { resumen: { mesAnterior: { mes: '2025-05', metido: 300, medioAntes: 52000, medioDespues: 51000, rentabilidad: 0.04 } } })
    expect(evaluarFrecuentes(ctx({ ahora: Date.parse('2025-06-01T06:00:00Z') }), u, estadoInicial())).toHaveLength(0) // 08:00 < 09:00
    const a = evaluarFrecuentes(ctx({ ahora: Date.parse('2025-06-01T08:00:00Z') }), u, estadoInicial())
    expect(claves(a)).toEqual(['resumenDiario:2025-06-01', 'resumenMensual:2025-06-01'])
    expect(a[1].texto).toContain('300 €')
  })
  it('resumen anual el 15 de enero', () => {
    const u = user({ resumenAnual: on() }, { resumen: { anioAnterior: { anio: 2025, ganancia: 1234, ventas: 2 } } })
    expect(evaluarDiarios(ctx({ ahora: Date.parse('2026-01-15T07:00:00Z') }), u, estadoInicial())).toHaveLength(1)
    expect(evaluarDiarios(ctx({ ahora: Date.parse('2026-01-16T07:00:00Z') }), u, estadoInicial())).toHaveLength(0)
  })
  it('cambio de correo o de contraseña', () => {
    const est = { ...estadoInicial(), correo: 'a@x.es', tokensValidAfter: 'T1' }
    const u = user({ cambioCuenta: on() })
    const a = evaluarDiarios(ctx({ cuenta: { correo: 'b@x.es', tokensValidAfter: 'T2' } }), u, est)
    expect(claves(a)).toEqual(['cuenta:correo', 'cuenta:clave'])
    expect(est.correo).toBe('b@x.es')
  })
})

describe('ballenas y carteras', () => {
  const grandes = [{ txid: 'a'.repeat(64), btc: 1500, bloque: 900000 }, { txid: 'b'.repeat(64), btc: 600, bloque: 900000 }]
  it('ballena: solo por encima del umbral de la usuaria', () => {
    const u = user({ ballena: on({ umbral: 1000 }) })
    const a = evaluarFrecuentes(ctx({ ballenasNuevas: grandes }), u, estadoInicial())
    expect(a).toHaveLength(1)
    expect(a[0].texto).toContain('1500 BTC')
    expect(evaluarFrecuentes(ctx({ ballenasNuevas: grandes }), user({}), estadoInicial())).toHaveLength(0) // apagado por defecto
  })
  it('cartera movida: solo las que sigue y con el interruptor', () => {
    const cambios = [{ id: 'x', nombre: 'Cartera X', cambioBtc: -120.5 }, { id: 'y', nombre: 'Cartera Y', cambioBtc: 3 }]
    const u = user({ carteraMovida: on() }, { config: { seguidas: ['x'] } })
    const a = evaluarFrecuentes(ctx({ carterasCambios: cambios }), u, estadoInicial())
    expect(a).toHaveLength(1)
    expect(a[0].texto).toBe('Cartera X ha sacado 120,5 BTC.')
    expect(evaluarFrecuentes(ctx({ carterasCambios: cambios }), user({}, { config: { seguidas: ['x'] } }), estadoInicial())).toHaveLength(0)
  })
})

describe('trading', () => {
  const abierto = (extra = {}) => ({ id: 'a1', direccion: 'largo', apalancamiento: 5, precioEntrada: 100, moneda: 'EUR', fechaInicio: '2025-05-20', comisiones: 0, ...extra })
  const u = (ajustes, trades) => user(ajustes, { resumen: { tradesAbiertos: trades } })
  it('trade abierto más de X días, con repetición cada 3 días', () => {
    const a = evaluarFrecuentes(ctx(), u({ tradeDias: on({ umbral: 7 }) }, [abierto(), abierto({ id: 'a2', fechaInicio: '2025-06-01' })]), estadoInicial())
    expect(claves(a)).toEqual(['tradeDias:a1'])
    expect(a[0].cooldownMs).toBe(3 * 24 * 3600e3)
    expect(evaluarFrecuentes(ctx(), u({ tradeDias: { activo: false } }, [abierto()]), estadoInicial())).toHaveLength(0)
  })
  it('% del trade: largo y corto, apalancamiento y comisiones; umbral y dirección', () => {
    const p = (eur) => ctx({ precios: P(eur) })
    // largo x5, precio +3 % → +15 %
    expect(claves(evaluarFrecuentes(p(103), u({ tradePct: on({ umbral: 10 }) }, [abierto()]), estadoInicial()))).toEqual(['tradePct:a1:sube'])
    // las comisiones restan: +3 % × 5 − 6 % = +9 % → no llega al 10 %
    expect(evaluarFrecuentes(p(103), u({ tradePct: on({ umbral: 10 }) }, [abierto({ comisiones: 6 })]), estadoInicial())).toHaveLength(0)
    // corto: precio +3 % → −15 %
    expect(claves(evaluarFrecuentes(p(103), u({ tradePct: on({ umbral: 10 }) }, [abierto({ direccion: 'corto' })]), estadoInicial()))).toEqual(['tradePct:a1:baja'])
    expect(evaluarFrecuentes(p(103), u({ tradePct: on({ umbral: 10, direccion: 'perdida' }) }, [abierto()]), estadoInicial())).toHaveLength(0)
    expect(evaluarFrecuentes(p(100.5), u({ tradePct: on({ umbral: 10 }) }, [abierto()]), estadoInicial())).toHaveLength(0)
  })
  it('usa el precio de la moneda del trade', () => {
    const t = abierto({ moneda: 'USD', precioEntrada: 55000 }) // USD = EUR × 1,1 → 50000 € = 55000 $
    expect(evaluarFrecuentes(ctx({ precios: P(50000) }), u({ tradePct: on({ umbral: 1 }) }, [t]), estadoInicial())).toHaveLength(0)
  })
  it('sin trades abiertos no hace nada y el aviso respeta prioridad y canales del ajuste', () => {
    expect(evaluarFrecuentes(ctx(), u({ tradeDias: on() }, undefined), estadoInicial())).toHaveLength(0)
    const a = evaluarFrecuentes(ctx(), u({ tradeDias: on({ umbral: 1, prioridad: 'urgente', canales: ['push'] }) }, [abierto()]), estadoInicial())
    expect(a[0]).toMatchObject({ prioridad: 'urgente', canales: ['push'] })
  })
})
