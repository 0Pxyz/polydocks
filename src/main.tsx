import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/syne'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App'

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
