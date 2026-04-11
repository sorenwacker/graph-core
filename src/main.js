import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './style.css'
import './themes/dark.css'
import './themes/light.css'
import App from './App.vue'
import DetachedView from './components/DetachedView.vue'

const pinia = createPinia()

// Check if this is a detached window
const params = new URLSearchParams(window.location.search)
const detachedNodeId = params.get('detached')

if (detachedNodeId) {
  // Mount DetachedView for detached windows
  const nodeId = parseInt(detachedNodeId, 10)
  const detachedApp = createApp({
    render() {
      return h(DetachedView, { nodeId })
    },
  })
  detachedApp.use(pinia)
  detachedApp.mount('#app')
} else {
  // Mount main App
  const app = createApp(App)
  app.use(pinia)
  app.mount('#app')
}
