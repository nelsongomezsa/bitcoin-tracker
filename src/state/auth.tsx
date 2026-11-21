import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

interface AuthCtx {
  user: User | null
  cargando: boolean
  demo: boolean
  entrarDemo: () => void
  salir: () => Promise<void>
  /** Vuelve a leer emailVerified desde el servidor. */
  refrescar: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(Boolean(auth))
  const [demo, setDemo] = useState(false)
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setCargando(false)
    })
  }, [])

  const salir = useCallback(async () => {
    setDemo(false)
    if (auth) await fbSignOut(auth)
  }, [])

  const refrescar = useCallback(async () => {
    if (!auth?.currentUser) return
    await auth.currentUser.reload()
    await auth.currentUser.getIdToken(true) // para que las reglas vean email_verified = true
    setUser(auth.currentUser)
    setVersion((v) => v + 1)
  }, [])

  const value = useMemo(() => ({ user, cargando, demo, entrarDemo: () => setDemo(true), salir, refrescar }), [user, cargando, demo, salir, refrescar])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}
