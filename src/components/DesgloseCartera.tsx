import type { DesgloseCartera as Desglose } from '../lib/trading'
import { claseSigno } from '../lib/format'
import { useVista } from '../state/vista'

/** «Cartera», «Trading (neto)» y «Total», por separado, cuando se suma el trading a la cartera. Las pérdidas de trading restan. */
export default function DesgloseCartera({ d }: { d: Desglose }) {
  const v = useVista()
  const fila = (nombre: string, btc: number, valor: number, fuerte = false) => (
    <tr key={nombre}>
      <th scope="row" style={fuerte ? { color: 'var(--text)' } : undefined}>{nombre}</th>
      <td className={`num ${nombre === 'Trading (neto)' ? claseSigno(btc) : ''}`}>{nombre === 'Trading (neto)' ? v.btcS(btc) : v.btcF(btc)}</td>
      <td className={`num ${nombre === 'Trading (neto)' ? claseSigno(valor) : ''}`}>{nombre === 'Trading (neto)' ? v.$s(valor) : v.$(valor)}</td>
    </tr>
  )
  return (
    <table className="pro-tabla-mini desglose" aria-label="Cartera, Trading y Total" style={{ width: '100%' }}>
      <thead><tr><th scope="col" /><th scope="col" className="r">BTC</th><th scope="col" className="r">Valor</th></tr></thead>
      <tbody>
        {fila('Cartera', d.cartera.btc, d.cartera.valor)}
        {fila('Trading (neto)', d.trading.btc, d.trading.valor)}
        {fila('Total', d.total.btc, d.total.valor, true)}
      </tbody>
    </table>
  )
}
