import { createApp, h } from 'vue'
import './style.css'
import App from './App.vue'
import DetachedView from './components/DetachedView.vue'
import { typeConfig } from './utils/constants.js'

// Inject CSS variables from typeConfig for single source of truth
function injectTypeColorVars() {
  const root = document.documentElement
  for (const [type, config] of Object.entries(typeConfig)) {
    root.style.setProperty(`--type-${type}-bg`, config.bg)
    root.style.setProperty(`--type-${type}-text`, config.text)
  }
}

injectTypeColorVars()

// Check if this is a detached window
const params = new URLSearchParams(window.location.search)
const detachedNodeId = params.get('detached')

if (detachedNodeId) {
  // Mount DetachedView for detached windows
  const nodeId = parseInt(detachedNodeId, 10)
  createApp({
    render() {
      return h(DetachedView, { nodeId })
    }
  }).mount('#app')
} else {
  // Mount main App
  createApp(App).mount('#app')
}
