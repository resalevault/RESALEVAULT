/**
 * RESALEVAULT - Arranque de la interfaz.
 *
 * `StrictMode` se activa siempre: ayuda a detectar efectos que no se limpian,
 * algo critico cuando hay suscripciones a eventos del proceso principal.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { AppProvider } from './lib/app-context'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Elemento raiz no encontrado')
}

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)
