import { ArrowDownToLine, ArrowUpFromLine, Activity } from 'lucide-react'
import Sheet from './Sheet'

export type Nuevo = 'compra' | 'venta' | 'trade'

/** Hoja del botón ＋: apuntar compra, apuntar venta o (si Trading está activado) un trade nuevo. */
export default function NuevoSheet({ trading, onElegir, onCerrar }: { trading: boolean; onElegir: (n: Nuevo) => void; onCerrar: () => void }) {
  const I = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const
  return (
    <Sheet titulo="¿Qué quieres apuntar?" onCerrar={onCerrar}>
      <div className="stack">
        <button className="btn-big" onClick={() => onElegir('compra')}><ArrowDownToLine {...I} /> Apuntar compra</button>
        <button className="btn-big" onClick={() => onElegir('venta')}><ArrowUpFromLine {...I} /> Apuntar venta</button>
        {trading && <button className="btn-big" onClick={() => onElegir('trade')}><Activity {...I} /> Nuevo trade</button>}
      </div>
    </Sheet>
  )
}
