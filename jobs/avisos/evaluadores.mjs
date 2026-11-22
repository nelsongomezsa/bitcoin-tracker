// Evaluadores de avisos: funciones puras. Reciben el contexto de mercado, los datos del usuario y su
// estado (que mutan para recordar lo ya avisado) y devuelven la lista de avisos a enviar.
import { ajuste, general, zonaDe } from '../../src/shared/avisosCatalogo.mjs'
import { aMoneda, btcN, deMoneda, dinero, num, pct, pctSigno } from './formato.mjs'
import { local } from './tiempo.mjs'

const H = 3600 * 1000
const MARGEN_RENTABLE = 0.005

export function estadoInicial() {
  return {
    enviados: {}, pendientes: [], contador: { fecha: '', n: 0 }, limiteAvisado: '', hitos: [], rentable: null,
    zonaIndice: null, alertasDisparadas: {}, halving: [], flags: {}, ultimaPrueba: 0, telegramChatId: null,
    correo: null, tokensValidAfter: null, carterasVistas: {},
  }
}

const mk = (clave, titulo, texto, extra = {}) => ({ clave, titulo, texto, ...extra })

/** Contexto común por usuario. */
function base(ctx, u) {
  const g = general(u.config.general)
  const aj = (c) => ajuste(u.config.ajustes, c)
  const mon = g.moneda
  const precio = ctx.precios[mon]
  const prev = ctx.prev?.[mon] ?? null
  return { g, aj, mon, precio, prev, r: u.config.resumen ?? null, d: (eur) => dinero(aMoneda(eur, mon, ctx.precios), mon) }
}

const cruza = (a, b, nivel) => a != null && ((a > nivel && b <= nivel) || (a < nivel && b >= nivel))

/** Avisos que se evalúan en cada pasada de 15 minutos. */
export function evaluarFrecuentes(ctx, u, est) {
  const { g, aj, mon, precio, prev, r, d } = base(ctx, u)
  const out = []
  const ahora = ctx.ahora

  // ── Precio: movimientos bruscos ──
  for (const [clave, cambio, etiqueta] of [['mov1h', ctx.cambio1h, '1 hora'], ['mov24h', ctx.cambio24h, '24 horas'], ['mov7d', ctx.cambio7d, '7 días']]) {
    const a = aj(clave)
    if (a.activo && cambio != null && Math.abs(cambio) >= (a.umbral ?? 5) / 100) {
      out.push(mk(`${clave}:${cambio > 0 ? 'sube' : 'baja'}`, 'Movimiento de precio', `BTC ${cambio > 0 ? 'sube' : 'baja'} un ${pct(cambio)} en ${etiqueta}. Ahora ${dinero(precio, mon)}.`, { prioridad: a.prioridad, canales: a.canales }))
    }
  }

  // ── Precio: máximos y mínimos ──
  const ex = ctx.estad?.extremos
  if (ex) {
    for (const [clave, per, tipo, texto] of [
      ['maxMes', 'mes', 'max', 'máximo del mes'], ['minMes', 'mes', 'min', 'mínimo del mes'],
      ['maxAnio', 'anio', 'max', 'máximo del año'], ['minAnio', 'anio', 'min', 'mínimo del año'],
    ]) {
      const a = aj(clave)
      const ref = ex[per]?.[tipo]
      if (!a.activo || !ref) continue
      const eur = ctx.precios.EUR
      if ((tipo === 'max' && eur > ref) || (tipo === 'min' && eur < ref)) {
        out.push(mk(`${clave}:${per === 'mes' ? local(ahora, g.zona).mes : local(ahora, g.zona).anio}`, 'Nuevo extremo', `BTC marca un nuevo ${texto}: ${dinero(precio, mon)}.`, { prioridad: a.prioridad, canales: a.canales, cooldownMs: 6 * H }))
      }
    }
  }

  // ── Precio: números redondos ──
  const red = aj('redondos')
  if (red.activo && prev != null && red.paso > 0) {
    const [a, b] = [Math.floor(prev / red.paso), Math.floor(precio / red.paso)]
    if (a !== b) {
      const nivel = (b > a ? b : a) * red.paso
      out.push(mk(`redondos:${nivel}:${b > a ? 'sube' : 'baja'}`, 'Número redondo', `BTC cruza ${dinero(nivel, mon)} ${b > a ? 'hacia arriba' : 'hacia abajo'}.`, { prioridad: red.prioridad, canales: red.canales, cooldownMs: 6 * H }))
    }
  }

  // ── Cartera ──
  if (r && r.btc > 0 && r.precioMedio > 0) {
    const eur = ctx.precios.EUR
    const rent = r.invertido > 0 ? (r.btc * eur) / r.invertido - 1 : null

    const ren = aj('rentable')
    if (ren.activo) {
      const media = r.precioMedio
      if (eur >= media * (1 + MARGEN_RENTABLE) && est.rentable !== 'positivo') {
        if (est.rentable === 'negativo') out.push(mk('rentable:sube', 'Vuelves a estar en positivo', `Vuelves a estar en positivo: BTC supera tu precio medio de ${d(media)}.`, { prioridad: ren.prioridad, canales: ren.canales }))
        est.rentable = 'positivo'
      } else if (eur <= media * (1 - MARGEN_RENTABLE) && est.rentable !== 'negativo') {
        if (est.rentable === 'positivo') out.push(mk('rentable:baja', 'Pasas a pérdidas', `BTC cae por debajo de tu precio medio de ${d(media)}.`, { prioridad: ren.prioridad, canales: ren.canales }))
        est.rentable = 'negativo'
      }
    }

    const hit = aj('hitos')
    if (hit.activo && rent != null) {
      const pr = rent * 100
      for (const h of [10, 25, 50, 100, -10, -20]) {
        const alcanzado = h > 0 ? pr >= h : pr <= h
        const i = est.hitos.indexOf(h)
        if (alcanzado && i < 0) {
          est.hitos.push(h)
          out.push(mk(`hito:${h}`, 'Hito de rentabilidad', `Tu rentabilidad ${h > 0 ? 'llega a' : 'cae hasta'} ${h > 0 ? '+' : '−'}${Math.abs(h)} % (${pctSigno(rent)}).`, { prioridad: hit.prioridad, canales: hit.canales, cooldownMs: 1000 }))
        } else if (!alcanzado && i >= 0) est.hitos.splice(i, 1)
      }
    }

    const vc = aj('valorCartera')
    if (vc.activo && prev != null) {
      const [antes, ahoraV] = [r.btc * prev, r.btc * precio]
      if (antes < vc.umbral && ahoraV >= vc.umbral) out.push(mk(`valorCartera:${vc.umbral}`, 'Valor de la cartera', `Tu cartera supera ${dinero(vc.umbral, mon)}: ${dinero(ahoraV, mon)}.`, { prioridad: vc.prioridad, canales: vc.canales }))
    }

    const ob = aj('objetivoBtc')
    if (ob.activo && r.btcMeta > 0 && r.btc >= r.btcMeta && !est.flags.objetivoBtc) {
      est.flags.objetivoBtc = true
      out.push(mk('objetivoBtc', 'Objetivo cumplido', `Has llegado a tu objetivo de ${r.btcMeta} BTC.`, { prioridad: ob.prioridad, canales: ob.canales }))
    }
    const oi = aj('objetivoInvertido')
    if (oi.activo && r.dineroMeta > 0 && r.invertido >= r.dineroMeta && !est.flags.objetivoInvertido) {
      est.flags.objetivoInvertido = true
      out.push(mk('objetivoInvertido', 'Objetivo cumplido', `Has metido ${d(r.dineroMeta)}, tu objetivo.`, { prioridad: oi.prioridad, canales: oi.canales }))
    }
    const po = aj('precioObjetivo')
    if (po.activo && r.precioObjetivo > 0 && ctx.prev?.EUR != null && ctx.prev.EUR < r.precioObjetivo && eur >= r.precioObjetivo) {
      out.push(mk('precioObjetivo', 'Precio objetivo', `BTC alcanza tu precio de venta objetivo de ${d(r.precioObjetivo)}.`, { prioridad: po.prioridad, canales: po.canales }))
    }
  }

  // ── Plan ──
  const nc = aj('nivelClave')
  if (nc.activo && r?.nivelesPendientes?.length) {
    const eur = ctx.precios.EUR
    for (const n of r.nivelesPendientes) {
      if (ctx.prev?.EUR != null && ctx.prev.EUR > n && eur <= n) out.push(mk(`nivel:toca:${n}`, 'Nivel clave', `BTC ha tocado ${d(n)}, tu precio clave.`, { prioridad: nc.prioridad, canales: nc.canales }))
      else if (eur > n && eur <= n * (1 + (nc.umbral ?? 3) / 100)) out.push(mk(`nivel:cerca:${n}`, 'Cerca de un nivel clave', `BTC se acerca a ${d(n)}, tu precio clave (${pct(eur / n - 1)} por encima).`, { prioridad: nc.prioridad, canales: nc.canales }))
    }
  }

  const cb = aj('comprarBajaMedia')
  if (cb.activo && r?.btc > 0 && r.invertido > 0 && ctx.precios.EUR < r.precioMedio) {
    const x = cb.importe ?? 100
    const nueva = (r.invertido + x) / (r.btc + x / ctx.precios.EUR)
    out.push(mk('bajaMedia', 'Tu precio medio', `Con el precio de hoy, comprar ${dinero(x)} bajaría tu media a ${d(nueva)}.`, { prioridad: cb.prioridad, canales: cb.canales, cooldownMs: 7 * 24 * H }))
  }

  const dca = aj('dca')
  if (dca.activo) {
    const l = local(ahora, g.zona)
    if (l.diaSemana === Number(dca.dia) && l.hora >= Number(dca.hora)) {
      out.push(mk(`dca:${l.fecha}`, 'Compra del plan', 'Hoy toca tu compra del plan. Pulsa para duplicar tu última compra.', { prioridad: dca.prioridad, canales: dca.canales, url: '/operaciones?duplicar=1', cooldownMs: 20 * H }))
    }
  }

  const ini = aj('inicioDca')
  if (ini.activo && r?.precioInicio > 0 && ctx.prev?.EUR != null && !est.flags.inicioDca && cruza(ctx.prev.EUR, ctx.precios.EUR, r.precioInicio)) {
    est.flags.inicioDca = true
    out.push(mk('inicioDca', 'Inicio de DCA', `BTC toca ${d(r.precioInicio)}, el precio de arranque de tu DCA.`, { prioridad: ini.prioridad, canales: ini.canales, url: '/plan' }))
  }

  // ── Alertas a medida ──
  for (const al of u.config.alertas ?? []) {
    const p = ctx.precios[al.moneda ?? mon]
    if (!p || !(al.precio > 0)) continue
    const cumple = al.dir === 'abajo' ? p < al.precio : p > al.precio
    const ultima = est.alertasDisparadas[al.id]
    if (!cumple) continue
    if (ultima && (!al.repetir || ahora - ultima < 6 * H)) continue
    est.alertasDisparadas[al.id] = ahora
    out.push(mk(`alerta:${al.id}`, 'Tu alerta', `BTC está ${al.dir === 'abajo' ? 'por debajo' : 'por encima'} de ${dinero(al.precio, al.moneda ?? mon)}: ${dinero(p, al.moneda ?? mon)}.`, { prioridad: 'normal', canales: ['push', 'telegram'], cooldownMs: 1000 }))
  }
  // Una alerta que ya no se cumple se rearma si es repetible.
  for (const al of u.config.alertas ?? []) {
    const p = ctx.precios[al.moneda ?? mon]
    if (al.repetir && p && est.alertasDisparadas[al.id] && !(al.dir === 'abajo' ? p < al.precio : p > al.precio)) delete est.alertasDisparadas[al.id]
  }

  // ── Resúmenes (a la hora elegida, en su zona horaria) ──
  const l = local(ahora, g.zona)
  if (l.hora >= g.horaResumen && r) {
    const valor = r.btc * precio
    const linea = (ref, etiqueta) => {
      const refM = ref ? aMoneda(ref, mon, ctx.precios) : null
      return `Tu cartera vale ${dinero(valor, mon)}${refM ? ` (${pctSigno(precio / refM - 1)} ${etiqueta})` : ''}. Metido ${d(r.invertido)}, precio medio ${d(r.precioMedio)}.`
    }
    const dia = aj('resumenDiario')
    if (dia.activo) out.push(mk(`resumenDiario:${l.fecha}`, 'Resumen diario', linea(ctx.estad?.ref?.d1, 'en 24 h'), { prioridad: dia.prioridad, canales: dia.canales, cooldownMs: 20 * H }))
    const sem = aj('resumenSemanal')
    if (sem.activo && l.diaSemana === 1) out.push(mk(`resumenSemanal:${l.fecha}`, 'Resumen semanal', linea(ctx.estad?.ref?.d7, 'en 7 días'), { prioridad: sem.prioridad, canales: sem.canales, cooldownMs: 20 * H }))
    const mes = aj('resumenMensual')
    if (mes.activo && l.dia === 1) {
      const m = r.mesAnterior
      const texto = m
        ? `Metiste ${d(m.metido)} el mes pasado. Tu precio medio pasó de ${d(m.medioAntes)} a ${d(m.medioDespues)} y tu rentabilidad es ${pctSigno(m.rentabilidad)}.`
        : linea(ctx.estad?.ref?.d30, 'en 30 días')
      out.push(mk(`resumenMensual:${l.fecha}`, 'Resumen del mes', texto, { prioridad: mes.prioridad, canales: mes.canales, cooldownMs: 20 * H }))
    }
  }
  const cs = aj('copiaSeguridad')
  if (cs.activo && l.dia === 1 && l.hora >= g.horaResumen) {
    out.push(mk(`copiaSeguridad:${l.fecha}`, 'Copia de seguridad', 'Recordatorio mensual: exporta una copia de tus operaciones desde Ajustes.', { prioridad: cs.prioridad, canales: cs.canales, url: '/ajustes', cooldownMs: 20 * H }))
  }

  // ── Ballenas y carteras que sigue ──
  const bal = aj('ballena')
  if (bal.activo && ctx.ballenasNuevas?.length) {
    for (const m of ctx.ballenasNuevas.filter((x) => x.btc >= (bal.umbral ?? 1000)).slice(0, 3)) {
      out.push(mk(`ballena:${m.txid.slice(0, 16)}`, 'Ballena detectada', `Se han movido ${btcN(m.btc)} BTC (≈ ${dinero(m.btc * precio, mon)}) en el bloque ${num(m.bloque)}.`, { prioridad: bal.prioridad, canales: bal.canales, url: '/mercado', cooldownMs: 1000 }))
    }
  }
  const cm = aj('carteraMovida')
  if (cm.activo && ctx.carterasCambios?.length) {
    const seguidas = new Set(u.config.seguidas ?? [])
    for (const c of ctx.carterasCambios.filter((x) => seguidas.has(x.id))) {
      out.push(mk(`cartera:${c.id}:${Math.floor(ctx.ahora / 3600e3)}`, 'Cartera en movimiento', `${c.nombre} ha ${c.cambioBtc < 0 ? 'sacado' : 'recibido'} ${btcN(Math.abs(c.cambioBtc))} BTC.`, { prioridad: cm.prioridad, canales: cm.canales, url: '/mercado', cooldownMs: 1000 }))
    }
  }
  // ── Trading: trades abiertos (el cliente deja su resumen en avisos/config) ──
  const td = aj('tradeDias'), tp = aj('tradePct')
  for (const t of r?.tradesAbiertos ?? []) {
    if (td.activo) {
      const dias = Math.floor((ahora - Date.parse(`${t.fechaInicio}T00:00:00Z`)) / (24 * H))
      if (dias > (td.umbral ?? 7)) out.push(mk(`tradeDias:${t.id}`, 'Trade abierto', `Tu trade ${t.direccion} x${t.apalancamiento} lleva ${num(dias)} días abierto.`, { prioridad: td.prioridad, canales: td.canales, url: '/trading', cooldownMs: 3 * 24 * H }))
    }
    const pe = ctx.precios[t.moneda]
    if (tp.activo && pe > 0 && t.precioEntrada > 0) {
      const mov = ((pe - t.precioEntrada) / t.precioEntrada) * (t.direccion === 'corto' ? -1 : 1)
      const p = mov * t.apalancamiento - (t.comisiones ?? 0) / 100
      const umbral = (tp.umbral ?? 10) / 100
      const gana = p >= umbral && tp.direccion !== 'perdida'
      const pierde = p <= -umbral && tp.direccion !== 'ganancia'
      if (gana || pierde) out.push(mk(`tradePct:${t.id}:${gana ? 'sube' : 'baja'}`, 'Trade abierto', `Tu trade ${t.direccion} x${t.apalancamiento} va en ${pctSigno(p)} (sin cerrar).`, { prioridad: tp.prioridad, canales: tp.canales, url: '/trading', cooldownMs: 12 * H }))
    }
  }

  return out
}

/** Avisos que dependen de datos diarios (índice de miedo y codicia, halving, DCA saltado, resumen anual). */
export function evaluarDiarios(ctx, u, est) {
  const { g, aj, mon, r } = base(ctx, u)
  const out = []
  const ahora = ctx.ahora
  const fng = ctx.fng

  if (fng) {
    const me = aj('miedoExtremo')
    if (me.activo && fng.valor <= (me.umbral ?? 20)) out.push(mk('miedoExtremo', 'Miedo extremo', `El índice de miedo y codicia marca ${fng.valor} (${fng.clasificacion ?? 'miedo extremo'}).`, { prioridad: me.prioridad, canales: me.canales }))
    const ce = aj('codiciaExtrema')
    if (ce.activo && fng.valor >= (ce.umbral ?? 80)) out.push(mk('codiciaExtrema', 'Codicia extrema', `El índice de miedo y codicia marca ${fng.valor} (${fng.clasificacion ?? 'codicia extrema'}).`, { prioridad: ce.prioridad, canales: ce.canales }))

    const zi = aj('zonaIndice')
    const zona = zonaDe(fng.valor)
    if (zi.activo && est.zonaIndice != null && est.zonaIndice !== zona.id) {
      const haciaMiedo = zona.id < est.zonaIndice
      if (zi.direccion === 'ambos' || (zi.direccion === 'miedo') === haciaMiedo) {
        const previa = [...Array(5).keys()].map((i) => zonaDe([0, 25, 45, 56, 75][i]).nombre)[est.zonaIndice]
        out.push(mk(`zona:${zona.id}`, 'Cambio de zona del índice', `El mercado pasa de ${previa} a ${zona.nombre} (${fng.valor}).`, { prioridad: zi.prioridad, canales: zi.canales }))
      }
    }
    est.zonaIndice = zona.id

    const sm = aj('subidaMiedo')
    const ref = Number(sm.ventana) === 1 ? fng.hace1d : fng.hace7d
    if (sm.activo && ref != null && ref - fng.valor >= (sm.umbral ?? 15)) {
      out.push(mk(`subidaMiedo:${sm.ventana}`, 'Sube el miedo', `El índice de miedo y codicia cae ${ref - fng.valor} puntos en ${Number(sm.ventana) === 1 ? '24 horas' : '7 días'} (${ref} → ${fng.valor}).`, { prioridad: sm.prioridad, canales: sm.canales }))
    }
  }

  const hv = aj('halving')
  if (hv.activo && ctx.red?.diasHalving != null) {
    const dias = ctx.red.diasHalving
    for (const lim of [30, 7, 0]) {
      if (dias <= lim && !est.halving.includes(lim)) {
        est.halving.push(lim)
        out.push(mk(`halving:${lim}`, 'Halving', lim === 0 ? 'Hoy se espera el halving de Bitcoin.' : `Faltan unos ${Math.max(0, Math.round(dias))} días para el halving de Bitcoin (estimación).`, { prioridad: hv.prioridad, canales: hv.canales, cooldownMs: 1000 }))
      }
    }
  }

  const ds = aj('dcaSaltado')
  if (ds.activo && r?.ultimaCompra) {
    const dias = Math.floor((ahora - Date.parse(`${r.ultimaCompra}T00:00:00Z`)) / (24 * H))
    if (dias >= 8) out.push(mk('dcaSaltado', 'DCA saltado', `Llevas ${dias} días sin ninguna compra.`, { prioridad: ds.prioridad, canales: ds.canales, url: '/operaciones?duplicar=1', cooldownMs: 7 * 24 * H }))
  }

  const l = local(ahora, g.zona)
  const an = aj('resumenAnual')
  if (an.activo && l.mes === 1 && l.dia === 15 && r?.anioAnterior) {
    const a = r.anioAnterior
    out.push(mk(`resumenAnual:${l.anio}`, `Resumen de ${a.anio} para la renta`, `Ganancia o pérdida FIFO de ${a.anio}: ${a.ganancia >= 0 ? '+' : '−'}${dinero(Math.abs(aMoneda(a.ganancia, mon, ctx.precios)), mon)} en ${num(a.ventas)} venta(s). Tienes el informe en Ajustes.`, { prioridad: an.prioridad, canales: an.canales, url: '/ajustes', cooldownMs: 300 * 24 * H }))
  }

  const cc = aj('cambioCuenta')
  if (cc.activo && ctx.cuenta) {
    if (est.correo != null && ctx.cuenta.correo && est.correo !== ctx.cuenta.correo) out.push(mk('cuenta:correo', 'Cambio de correo', 'El correo de tu cuenta ha cambiado. Si no has sido tú, restablece tu contraseña.', { prioridad: cc.prioridad, canales: cc.canales }))
    if (est.tokensValidAfter != null && ctx.cuenta.tokensValidAfter && est.tokensValidAfter !== ctx.cuenta.tokensValidAfter) out.push(mk('cuenta:clave', 'Cambio de contraseña o sesiones', 'Se ha cambiado tu contraseña o se han cerrado tus sesiones. Si no has sido tú, restablécela.', { prioridad: cc.prioridad, canales: cc.canales }))
  }
  if (ctx.cuenta) {
    est.correo = ctx.cuenta.correo ?? est.correo
    est.tokensValidAfter = ctx.cuenta.tokensValidAfter ?? est.tokensValidAfter
  }

  void deMoneda
  return out
}
