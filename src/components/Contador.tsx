import { motion, useReducedMotion } from 'motion/react'

const DIGITOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function Digito({ d }: { d: number }) {
  const reducir = useReducedMotion()
  return (
    <span className="digito" aria-hidden="true">
      <motion.span initial={false} animate={{ y: `${-d * 1.1}em` }} transition={reducir ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 22, mass: 0.9 }}>
        {DIGITOS.map((n) => <span key={n}>{n}</span>)}
      </motion.span>
    </span>
  )
}

/** Cifra con los dígitos rodando como en un marcador. `valor` ya viene formateado (es-ES). */
export default function Contador({ valor, className = '' }: { valor: string; className?: string }) {
  const chars = [...valor]
  return (
    <span className={`contador ${className}`}>
      <span className="sr">{valor}</span>
      {chars.map((c, i) => {
        const clave = chars.length - i // desde la derecha, para que cada posición conserve su rodillo
        return /\d/.test(c) ? <Digito key={clave} d={Number(c)} /> : <span key={clave} aria-hidden="true">{c === ' ' ? ' ' : c}</span>
      })}
    </span>
  )
}
