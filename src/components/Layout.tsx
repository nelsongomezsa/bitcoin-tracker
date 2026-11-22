import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ChartCandlestick, ChartNoAxesCombined, Globe, House, Plus, Settings } from 'lucide-react'
import { useDatos } from '../state/data'
import { horaCorta } from '../lib/format'
import SincronizarAvisos from './SincronizarAvisos'
import OperacionSheet from './OperacionSheet'
import NuevoSheet, { type Nuevo } from './NuevoSheet'
import TradeSheet from './TradeSheet'

const I = { size: 22, strokeWidth: 1.6, 'aria-hidden': true } as const

export default function Layout() {
  const { demo, mercado, perfil } = useDatos()
  const trading = perfil.mostrarTrading
  const { pathname } = useLocation()
  const reducir = useReducedMotion()
  const [online, setOnline] = useState(navigator.onLine)
  const [menu, setMenu] = useState(false)
  const [hoja, setHoja] = useState<Nuevo | null>(null)
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
        <button className="fab" aria-label={trading ? 'Apuntar compra, venta o trade' : 'Apuntar compra o venta'} onClick={() => setMenu(true)}><Plus size={26} strokeWidth={2} aria-hidden="true" /></button>
        {trading
          ? <NavLink to="/trading"><ChartCandlestick {...I} />Trading</NavLink>
          : <NavLink to="/estadisticas"><ChartNoAxesCombined {...I} />Estadísticas</NavLink>}
        <NavLink to="/ajustes"><Settings {...I} />Ajustes</NavLink>
      </nav>
      {menu && <NuevoSheet trading={trading} onCerrar={() => setMenu(false)} onElegir={(n) => { setMenu(false); setHoja(n) }} />}
      {(hoja === 'compra' || hoja === 'venta') && <OperacionSheet tipo={hoja} onCerrar={() => setHoja(null)} />}
      {hoja === 'trade' && <TradeSheet onCerrar={() => setHoja(null)} />}
    </>
  )
}
