export default function Esqueleto({ alto = 20, ancho = '100%' }: { alto?: number; ancho?: number | string }) {
  return <div className="skel" style={{ height: alto, width: ancho }} aria-hidden="true" />
}

export function InicioEsqueleto() {
  return (
    <div className="stack" role="status" aria-label="Cargando">
      <div className="card stack"><Esqueleto alto={14} ancho={90} /><Esqueleto alto={44} ancho="70%" /><Esqueleto alto={20} ancho="45%" /></div>
      <div className="row"><Esqueleto alto={56} /><Esqueleto alto={56} /></div>
      <div className="card"><Esqueleto alto={220} /></div>
    </div>
  )
}
