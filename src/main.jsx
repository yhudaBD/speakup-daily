import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Let the app render at least one real frame before fading the splash out,
// so the handoff never shows a blank gap between "splash gone" and "app painted".
const splash = document.getElementById('app-splash')
if (splash) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      splash.classList.add('hide')
      setTimeout(() => splash.remove(), 450)
    })
  })
}
