import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
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

createApp(App).mount('#app')
