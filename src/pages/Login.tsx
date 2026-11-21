import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile,
} from 'firebase/auth'
import { auth, firebaseConfigurado } from '../lib/firebase'
import { emailSchema, passwordSchema } from '../lib/schemas'
import { contrasenaFiltrada } from '../lib/hibp'
import { mensajeError } from '../lib/errores'
import { useAuth } from '../state/auth'
import { completarLoginTotp, mfaHabilitado } from '../lib/mfa'
import type { MultiFactorError } from 'firebase/auth'
import Instalar from '../components/Instalar'

type Modo = 'entrar' | 'registro' | 'recuperar'

export default function Login() {
  const { user, demo, entrarDemo } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mfa, setMfa] = useState<MultiFactorError | null>(null)
  const [codigo, setCodigo] = useState('')

  if (user || demo) return <Navigate to="/" replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (mfa) {
      try { await completarLoginTotp(mfa, codigo) } catch (err) { setError(mensajeError(err, 'Código incorrecto.')) }
      return
    }
    if (!auth) return setError('La app no está conectada a Firebase todavía. Puedes probar el modo demo.')
    const correo = emailSchema.safeParse(email)
    if (!correo.success) return setError(correo.error.issues[0].message)
    setOcupado(true)
    try {
      if (modo === 'recuperar') {
        await sendPasswordResetEmail(auth, correo.data)
        // Mensaje igual exista o no la cuenta, para no revelar qué correos están registrados.
        setInfo('Si el correo existe, recibirás un enlace para restablecer la contraseña.')
      } else {
        const pass = passwordSchema.safeParse(password)
        if (!pass.success) return setError(pass.error.issues[0].message)
        if (modo === 'registro') {
          if (await contrasenaFiltrada(pass.data)) return setError('Esa contraseña aparece en filtraciones conocidas. Elige otra.')
          const cred = await createUserWithEmailAndPassword(auth, correo.data, pass.data)
          if (nombre.trim()) await updateProfile(cred.user, { displayName: nombre.trim().slice(0, 60) })
          await sendEmailVerification(cred.user)
        } else {
          await signInWithEmailAndPassword(auth, correo.data, pass.data)
        }
      }
    } catch (err) {
      if (mfaHabilitado && (err as { code?: string }).code === 'auth/multi-factor-auth-required') setMfa(err as MultiFactorError)
      else setError(mensajeError(err))
    } finally {
      setOcupado(false)
    }
  }

  const titulo = modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Recuperar contraseña'
  return (
    <main className="app stack" style={{ maxWidth: 440 }}>
      <header>
        <h1>Bitcoin Tracker</h1>
        <p className="muted">Apunta tus compras y ventas de bitcoin. Tus datos son solo tuyos.</p>
      </header>

      {!firebaseConfigurado && (
        <p className="card notice" role="status">Firebase no está configurado en este entorno. Copia <code>.env.example</code> a <code>.env</code> o usa el modo demo.</p>
      )}

      <form className="card stack" onSubmit={enviar} noValidate aria-label={titulo}>
        <h2>{titulo}</h2>
        {modo === 'registro' && (
          <label>Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={60} />
          </label>
        )}
        <label>Correo electrónico
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        </label>
        {modo !== 'recuperar' && (
          <label>Contraseña {modo === 'registro' && <span>(mínimo 10 caracteres)</span>}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} required />
          </label>
        )}
        {mfa && <label>Código de tu app autenticadora<input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="one-time-code" /></label>}
        {error && <p className="err" role="alert">{error}</p>}
        {info && <p className="gain" role="status">{info}</p>}
        <button className="btn-primary" disabled={ocupado} type="submit">{ocupado ? 'Un momento…' : titulo}</button>
        <div className="row between wrap">
          {modo !== 'entrar' && <button type="button" className="btn-ghost" onClick={() => setModo('entrar')}>Ya tengo cuenta</button>}
          {modo !== 'registro' && <button type="button" className="btn-ghost" onClick={() => setModo('registro')}>Crear cuenta</button>}
          {modo === 'entrar' && <button type="button" className="btn-ghost" onClick={() => setModo('recuperar')}>He olvidado la contraseña</button>}
        </div>
      </form>

      <button className="btn-outline" onClick={entrarDemo}>Probar sin cuenta</button>
      <p className="notice">El modo demo usa una cartera ficticia en memoria. No guarda nada.</p>
      <Instalar />
    </main>
  )
}
