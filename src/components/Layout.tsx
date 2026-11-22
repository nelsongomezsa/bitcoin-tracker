import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ChartNoAxesCombined, Globe, House, Plus, Settings } from 'lucide-react'
import { useDatos } from '../state/data'
import { horaCorta } from '../lib/format'
import SincronizarAvisos from './SincronizarAvisos'
import OperacionSheet from './OperacionSheet'

const I = { size: 22, strokeWidth: 1.6, 'aria-hidden': true } as const

export default function Layout() {
  const { demo, mercado } = useDatos()
  const { pathname } = useLocation()
  const reducir = useReducedMotion()
  const [online, setOnline] = useState(navigator.onLine)
  const [hoja, setHoja] = useState(false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return (
    <>
      {demo && <div className="banner" role="status">Modo demo · datos ficticios</div>}
      {!online && (
        <div className="banner off" role="status">
          Sin conexión{mercado?.actualizado ? ` · último precio ${horaCorta(mercado.actualizado)}` : ''}
        </div>
      )}
      <motion.div key={pathname} initial={reducir ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={reducir ? { duration: 0.12 } : { type: 'spring', stiffness: 260, damping: 28 }}>
        <Outlet />
      </motion.div>
      <SincronizarAvisos />
      <nav className="nav" aria-label="Navegación principal">
        <NavLink to="/" end><House {...I} />Inicio</NavLink>
        <NavLink to="/mercado"><Globe {...I} />Mercado</NavLink>
        <button className="fab" aria-label="Añadir compra o venta" onClick={() => setHoja(true)}><Plus size={26} strokeWidth={2} aria-hidden="true" /></button>
        <NavLink to="/estadisticas"><ChartNoAxesCombined {...I} />Estadísticas</NavLink>
        <NavLink to="/ajustes"><Settings {...I} />Ajustes</NavLink>
      </nav>
      {hoja && <OperacionSheet tipo="compra" onCerrar={() => setHoja(false)} />}
    </>
  )
}
