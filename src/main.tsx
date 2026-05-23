import { render } from 'solid-js/web'
import './index.css'
import './opencode-ported/styles/session-review.css'
import './opencode-ported/styles/diff-changes.css'
import App from './App.tsx'
import { AppProviders } from './context/AppProviders'
import { ErrorBoundary } from 'solid-js'

render(() => (
  <ErrorBoundary fallback={(err) => (
    <div style={{ color: "red", padding: "20px", background: "black" }}>
      <h1>FATAL ERROR</h1>
      <pre>{String(err)}</pre>
      <pre>{err?.stack}</pre>
    </div>
  )}>
    <AppProviders>
      <App />
    </AppProviders>
  </ErrorBoundary>
), document.getElementById('root')!)
const bootSplash = document.getElementById('boot-splash')
if (bootSplash) {
  requestAnimationFrame(() => {
    bootSplash.classList.add('boot-splash-hidden')
    bootSplash.addEventListener('transitionend', () => {
      bootSplash.remove()
    }, { once: true })
    setTimeout(() => {
      if (bootSplash.isConnected) bootSplash.remove()
    }, 500)
  })
}
