import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './state/auth'
import { DataProvider } from './state/data'
import Layout from './components/Layout'
import Login from './pages/Login'
import VerificarCorreo from './pages/VerificarCorreo'
import Inicio from './pages/Inicio'
import Operaciones from './pages/Operaciones'
import Estadisticas from './pages/Estadisticas'
import Plan from './pages/Plan'
import Avisos from './pages/Avisos'

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
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="operaciones" element={<Operaciones />} />
          <Route path="estadisticas" element={<Estadisticas />} />
          <Route path="plan" element={<Plan />} />
          <Route path="avisos" element={<Avisos />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}
