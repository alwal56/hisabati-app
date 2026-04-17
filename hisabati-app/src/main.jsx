import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Register service worker (handled by vite-plugin-pwa)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Disable bounce scroll on iOS
document.addEventListener('touchmove', (e) => {
  if (e.target === document.body) e.preventDefault()
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
