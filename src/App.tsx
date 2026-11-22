import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './state/auth'
import { DataProvider } from './state/data'
import Layout from './components/Layout'
import Login from './pages/Login'
import VerificarCorreo from './pages/VerificarCorreo'
import Inicio from './pages/Inicio'
import Operaciones from './pages/Operaciones'
const Estadisticas = lazy(() => import('./pages/Estadisticas'))
const Plan = lazy(() => import('./pages/Plan'))
const Avisos = lazy(() => import('./pages/Avisos'))
const Trading = lazy(() => import('./pages/Trading'))
const GraficoPro = lazy(() => import('./pages/GraficoPro'))
const Mercado = lazy(() => import('./pages/Mercado'))
const Ajustes = lazy(() => import('./pages/Ajustes'))
const Calculadoras = lazy(() => import('./pages/Calculadoras'))
import Bloqueo from './components/Bloqueo'

export default function App() {
  const { user, demo, cargando } = useAuth()
  if (cargando) return <main className="app"><p className="muted" role="status">Cargando…</p></main>
  if (!user && !demo) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  if (user && !demo && !user.emailVerified) return <VerificarCorreo />
  return (
    <Bloqueo>
    <DataProvider>
      <Suspense fallback={<main className="app"><p className="muted" role="status">Cargando…</p></main>}>
      <Routes>
        <Route path="grafico" element={<GraficoPro />} />
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="operaciones" element={<Operaciones />} />
          <Route path="estadisticas" element={<Estadisticas />} />
          <Route path="trading" element={<Trading />} />
          <Route path="plan" element={<Plan />} />
          <Route path="avisos" element={<Avisos />} />
          <Route path="mercado" element={<Mercado />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="calculadoras" element={<Calculadoras />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </DataProvider>
    </Bloqueo>
  )
}
