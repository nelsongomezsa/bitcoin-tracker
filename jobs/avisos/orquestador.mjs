// Recorre a los usuarios con avisos, evalúa, decide la entrega y envía.
// Lecturas: una sola consulta collectionGroup('avisos') que trae config, estado y prueba (3 documentos por usuario).
import { ajuste, general } from '../../src/shared/avisosCatalogo.mjs'
import { estadoInicial, evaluarDiarios, evaluarFrecuentes } from './evaluadores.mjs'
import { planificarEntrega } from './entrega.mjs'

const DIAS_HISTORIAL = 30

const uidDe = (doc) => doc.ref.parent.parent.id

function fusionar(inicial, guardado) {
  const e = { ...inicial, ...(guardado ?? {}) }
  for (const k of ['enviados', 'alertasDisparadas', 'flags', 'carterasVistas']) e[k] = { ...inicial[k], ...(guardado?.[k] ?? {}) }
  for (const k of ['pendientes', 'hitos', 'halving']) e[k] = Array.isArray(guardado?.[k]) ? guardado[k] : inicial[k]
  e.contador = { ...inicial.contador, ...(guardado?.contador ?? {}) }
  return e
}

/**
 * @param {object} p
 * @param {any} p.db Firestore (Admin)
 * @param {object} p.ctx contexto de mercado (precios, prev, cambios, estad, fng, red, ahora, ...)
 * @param {'frecuente'|'diario'} p.modo
 * @param {(tokens: string[], msg: any) => Promise<string[]>} p.enviarPush devuelve los tokens inválidos
 * @param {((chatId: string|number, texto: string) => Promise<void>)|null} p.enviarTelegram
 * @param {Record<string, any[]>} [p.extras] avisos extra por uid (dispositivos nuevos, carteras…)
 * @param {(uid: string) => Promise<any>} [p.cuentaDe] datos de Auth (solo modo diario)
 * @param {(uid: string, u: any) => any[]} [p.evaluarExtra] evaluadores adicionales (ballenas)
 * @param {{arrayRemove: Function, serverTimestamp?: Function}} p.FieldValue
 */
export async function procesarUsuarios({ db, ctx, modo, enviarPush, enviarTelegram, extras = {}, cuentaDe, evaluarExtra, FieldValue }) {
  const snap = await db.collectionGroup('avisos').get()
  const porUid = new Map()
  for (const d of snap.docs) {
    if (!['config', 'estado', 'prueba'].includes(d.id)) continue
    const uid = uidDe(d)
    const o = porUid.get(uid) ?? {}
    o[d.id] = d
    porUid.set(uid, o)
  }

  const resumen = { usuarios: 0, avisos: 0, mensajes: 0 }
  for (const [uid, docs] of porUid) {
    if (!docs.config) continue
    const config = docs.config.data() ?? {}
    const guardado = docs.estado?.data()
    const est = fusionar(estadoInicial(), guardado)
    const antes = JSON.stringify(est)
    const tokens = Array.isArray(config.tokens) ? config.tokens : []
    const chatId = est.telegramChatId
    const gen = general(config.general)
    const u = { config, uid }

    // Desvincular Telegram a petición de la usuaria.
    if (config.telegram?.desconectar === true) {
      est.telegramChatId = null
      await docs.config.ref.update({ telegram: {} })
    }
    const canales = { push: tokens.length > 0, telegram: Boolean(enviarTelegram && est.telegramChatId) }
    if (!canales.push && !canales.telegram) {
      if (JSON.stringify(est) !== antes) await escribirEstado(db, uid, docs.estado, est)
      continue
    }

    const uCtx = { ...ctx }
    if (modo === 'diario' && cuentaDe) uCtx.cuenta = await cuentaDe(uid)
    // Avisos externos (dispositivo nuevo…): respetan el interruptor, la prioridad y los canales de la usuaria.
    let avisos = (extras[uid] ?? []).flatMap((x) => {
      const a = x.requiere ? ajuste(config.ajustes, x.requiere) : { activo: true }
      return a.activo ? [{ ...x, prioridad: a.prioridad ?? x.prioridad, canales: a.canales }] : []
    })
    if (modo === 'frecuente') avisos = avisos.concat(evaluarFrecuentes(uCtx, u, est))
    if (modo === 'diario') avisos = avisos.concat(evaluarDiarios(uCtx, u, est))
    if (evaluarExtra) avisos = avisos.concat(evaluarExtra(uCtx, u, est))

    // Aviso de prueba pedido desde la app (como mucho uno cada 5 minutos, lo garantizan las reglas).
    const pr = docs.prueba?.data()
    const tPrueba = pr?.ts?.toMillis?.() ?? 0
    let mensajePrueba = null
    if (tPrueba > (est.ultimaPrueba ?? 0)) {
      est.ultimaPrueba = tPrueba
      mensajePrueba = { titulo: 'Aviso de prueba', texto: 'Todo funciona: así te llegarán los avisos.', url: '/avisos' }
    }

    const plan = planificarEntrega({ avisos, estado: est, general: gen, ahora: ctx.ahora, canales })
    const aEnviar = []
    if (mensajePrueba) aEnviar.push(['push', mensajePrueba], ['telegram', mensajePrueba])
    if (plan.push) aEnviar.push(['push', plan.push])
    if (plan.telegram) aEnviar.push(['telegram', plan.telegram])

    let invalidos = []
    for (const [canal, msg] of aEnviar) {
      try {
        if (canal === 'push' && canales.push) { invalidos = invalidos.concat(await enviarPush(tokens, msg)); resumen.mensajes++ }
        if (canal === 'telegram' && canales.telegram) { await enviarTelegram(est.telegramChatId, `${msg.titulo}\n${msg.texto}`); resumen.mensajes++ }
      } catch {
        // Sin detalles ni datos del usuario en los logs.
        console.warn(`Fallo al enviar por ${canal}`)
      }
    }
    if (invalidos.length) await docs.config.ref.update({ tokens: FieldValue.arrayRemove(...new Set(invalidos)) })

    // Historial (últimos 30 días): una entrada por aviso enviado.
    for (const a of plan.enviados) {
      await db.collection(`users/${uid}/historial`).add({ t: new Date(ctx.ahora), clave: a.clave, tipo: a.clave.split(':')[0], titulo: a.titulo, texto: a.texto.slice(0, 400) })
    }
    if (plan.enviados.length) { resumen.usuarios++; resumen.avisos += plan.enviados.length }

    if (JSON.stringify(est) !== antes) await escribirEstado(db, uid, docs.estado, est)
  }
  return resumen
}

async function escribirEstado(db, uid, docEstado, est) {
  await db.doc(`users/${uid}/avisos/estado`).set(est)
}

/** Borra el historial de más de 30 días (una sola consulta; solo se leen los documentos que se borran). */
export async function limpiarHistorial(db, ahora) {
  const corte = new Date(ahora - DIAS_HISTORIAL * 24 * 3600 * 1000)
  const viejos = await db.collectionGroup('historial').where('t', '<', corte).limit(450).get()
  if (viejos.empty) return 0
  const lote = db.batch()
  viejos.docs.forEach((d) => lote.delete(d.ref))
  await lote.commit()
  return viejos.size
}
