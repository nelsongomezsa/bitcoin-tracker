import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

/** Cifra que parpadea en verde o rojo 600 ms al cambiar, con una flecha. */
export default function PrecioVivo({ valor, texto }: { valor: number; texto: string }) {
  const previo = useRef(valor)
  const [dir, setDir] = useState<'' | 'up' | 'down'>('')
  useEffect(() => {
    if (valor === previo.current) return
    setDir(valor > previo.current ? 'up' : 'down')
    previo.current = valor
    const t = setTimeout(() => setDir(''), 650)
    return () => clearTimeout(t)
  }, [valor])
  return (
    <span className={`num ${dir ? `flash-${dir}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {texto}
      {dir === 'up' && <ArrowUp size={14} strokeWidth={1.75} aria-label="Sube" />}
      {dir === 'down' && <ArrowDown size={14} strokeWidth={1.75} aria-label="Baja" />}
    </span>
  )
}
