import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'

render(() => <App />, document.getElementById('root')!)

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
