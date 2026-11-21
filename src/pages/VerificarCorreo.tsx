import { useState } from 'react'
import { sendEmailVerification } from 'firebase/auth'
import { useAuth } from '../state/auth'
import { mensajeError } from '../lib/errores'

export default function VerificarCorreo() {
  const { user, refrescar, salir } = useAuth()
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function reenviar() {
    if (!user) return
    try {
      await sendEmailVerification(user)
      setMsg('Correo enviado. Revisa también la carpeta de spam.')
    } catch (e) {
      setMsg(mensajeError(e))
    }
  }
  async function comprobar() {
    setOcupado(true)
    try {
      await refrescar()
      setMsg('Todavía no vemos la verificación. Abre el enlace del correo y vuelve a probar.')
    } catch (e) {
      setMsg(mensajeError(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <main className="app stack" style={{ maxWidth: 440 }}>
      <h1>Verifica tu correo</h1>
      <p className="muted">Hemos enviado un enlace a <b>{user?.email}</b>. Tienes que verificarlo antes de usar la app.</p>
      <button className="btn-primary" onClick={comprobar} disabled={ocupado}>Ya lo he verificado</button>
      <button onClick={reenviar}>Reenviar correo</button>
      <button className="btn-ghost" onClick={() => void salir()}>Cerrar sesión</button>
      {msg && <p role="status" className="notice">{msg}</p>}
    </main>
  )
}
