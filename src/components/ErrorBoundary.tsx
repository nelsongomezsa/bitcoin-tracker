import { Component, type ReactNode } from 'react'

/** Un fallo en un bloque (p. ej. una gráfica) no debe dejar toda la app en blanco. */
export default class ErrorBoundary extends Component<{ children: ReactNode; etiqueta?: string }, { fallo: boolean }> {
  state = { fallo: false }
  static getDerivedStateFromError() {
    return { fallo: true }
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error(error)
  }
  render() {
    if (this.state.fallo) {
      return <p className="card muted" role="alert">{this.props.etiqueta ?? 'Esta sección'} no se ha podido mostrar. Recarga la app para reintentarlo.</p>
    }
    return this.props.children
  }
}
