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
import UnlockScreen from './components/UnlockScreen.vue'
import CaptureView from './components/CaptureView.vue'
import { api } from './services/api'
import { initSettings, migrateSettingsToDatabase } from './composables/useSettings'

const pinia = createPinia()

// Initialize settings from database before mounting app
async function bootstrap() {
  // The quick-capture window is a lightweight input; mount it directly without
  // the full app bootstrap (docs/guides/quick-capture.md).
  if (new URLSearchParams(window.location.search).get('capture')) {
    createApp(CaptureView).use(pinia).mount('#app')
    return
  }

  // An encrypted database this machine cannot open silently blocks everything
  // else: mount only the unlock screen, which reloads the window on success
  // (docs/architecture/encryption.md, "Unlock flow").
  const security = await api.securityStatus()
  if (security.state === 'locked') {
    createApp(UnlockScreen).use(pinia).mount('#app')
    return
  }

  // Initialize settings cache from database
  await initSettings()

  // Migrate localStorage settings to database (one-time migration)
  try {
    const result = await migrateSettingsToDatabase()
    if (result.migrated > 0) {
      console.log(`Migrated ${result.migrated} settings to database`)
    }
  } catch (e) {
    console.error('Settings migration failed:', e)
  }

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
}

bootstrap()
