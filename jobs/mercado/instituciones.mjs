// Empresas y gobiernos con bitcoin (CoinGecko Demo API, gratis). Se omite si no hay clave (secret COINGECKO_DEMO_KEY).
// Las respuestas se leen de forma tolerante: si falta un campo, se omite esa entidad o ese dato.
const BASE = 'https://api.coingecko.com/api/v3'
const TOP_DETALLE = 10

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)
const slug = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function normalizarEntidades(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((e) => ({
      id: String(e.id ?? e.entity_id ?? slug(e.name)),
      nombre: String(e.name ?? '').slice(0, 60),
      simbolo: e.symbol ? String(e.symbol).slice(0, 12) : null,
      pais: e.country ? String(e.country).slice(0, 4) : null,
      btc: num(e.total_holdings),
      valorUsd: num(e.total_current_value_usd),
      pctSuministro: num(e.percentage_of_total_supply),
    }))
    .filter((e) => e.nombre && e.btc != null)
    .sort((a, b) => b.btc - a.btc)
}

export function normalizarMovimientos(entidad, resp) {
  const lista = resp?.transactions ?? resp?.data ?? (Array.isArray(resp) ? resp : [])
  return lista
    .map((t) => ({
      entidad: entidad.nombre,
      tipo: String(t.type ?? t.transaction_type ?? '').toLowerCase().includes('sell') ? 'venta' : 'compra',
      btc: num(t.holding_net_change ?? t.amount ?? t.btc_amount),
      precioUsd: num(t.average_entry_value_usd ?? t.average_price ?? t.price_usd),
      fecha: num(t.date) ?? (t.date ? Date.parse(t.date) : null),
    }))
    .filter((t) => t.btc != null && Number.isFinite(t.fecha))
}

export async function actualizarInstituciones({ db, getJson, clave, FieldValue }) {
  if (!clave) {
    console.log('Instituciones: sin COINGECKO_DEMO_KEY, se omite')
    return
  }
  const cab = { 'x-cg-demo-api-key': clave }
  const [emp, gob] = await Promise.all([
    getJson(`${BASE}/companies/public_treasury/bitcoin`, cab),
    getJson(`${BASE}/governments/public_treasury/bitcoin`, cab).catch(() => null),
  ])
  const empresas = normalizarEntidades(emp?.companies).slice(0, 40)
  const gobiernos = normalizarEntidades(gob?.companies ?? gob?.governments).slice(0, 20)

  const detalles = {}
  const movimientos = []
  for (const e of [...empresas, ...gobiernos].sort((a, b) => b.btc - a.btc).slice(0, TOP_DETALLE)) {
    try {
      const h = await getJson(`${BASE}/public_treasury/${encodeURIComponent(e.id)}/transaction_history`, cab)
      const mov = normalizarMovimientos(e, h).sort((a, b) => b.fecha - a.fecha).slice(0, 20)
      movimientos.push(...mov)
      // Evolución de lo que tiene: se reconstruye hacia atrás desde el saldo actual con los cambios netos.
      let saldo = e.btc
      const hist = [[Date.now(), saldo]]
      for (const m of mov) {
        saldo -= m.tipo === 'venta' ? -Math.abs(m.btc) : Math.abs(m.btc)
        hist.push([m.fecha, Math.max(0, Math.round(saldo * 100) / 100)])
      }
      detalles[e.id] = hist.reverse()
    } catch {
      /* esta entidad se salta */
    }
  }
  movimientos.sort((a, b) => b.fecha - a.fecha)
  await db.doc('mercado/instituciones').set({
    empresas, gobiernos, movimientos: movimientos.slice(0, 30), detalles, actualizado: FieldValue.serverTimestamp(),
  })
  console.log(`Instituciones: ${empresas.length} empresas, ${gobiernos.length} gobiernos`)
}
