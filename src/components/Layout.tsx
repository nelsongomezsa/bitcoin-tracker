import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useDatos } from '../state/data'
import { horaCorta } from '../lib/format'
import SincronizarAvisos from './SincronizarAvisos'

const ICONOS: Record<string, string> = {
  inicio: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  ops: 'M4 6h16M4 12h16M4 18h10',
  stats: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  avisos: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-1-2H9L8 7 6 8 4 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z',
}
const Icono = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

export default function Layout() {
  const { demo, mercado } = useDatos()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const items: [string, string, string][] = [['/', 'Inicio', 'inicio'], ['/operaciones', 'Operaciones', 'ops'], ['/estadisticas', 'Estadísticas', 'stats'], ['/avisos', 'Avisos', 'avisos'], ['/ajustes', 'Ajustes', 'ajustes']]
  return (
    <>
      {demo && <div className="banner" role="status">Modo demo · datos ficticios</div>}
      {!online && (
        <div className="banner off" role="status">
          Sin conexión{mercado?.actualizado ? ` · último precio ${horaCorta(mercado.actualizado)}` : ''}
        </div>
      )}
      <Outlet />
      <SincronizarAvisos />
      <nav className="nav" aria-label="Navegación principal">
        {items.map(([to, label, ic]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icono d={ICONOS[ic]} />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
