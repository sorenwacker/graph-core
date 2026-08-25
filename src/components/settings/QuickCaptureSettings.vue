<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../services/api'

/**
 * Settings > General: quick capture (docs/guides/quick-capture.md). Enable or
 * disable the global capture hotkey and change the accelerator. Desktop only.
 */

const config = ref(null)
const accelerator = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)

async function refresh() {
  config.value = await api.captureGetConfig()
  accelerator.value = config.value.accelerator
}

onMounted(refresh)

async function save(enabled) {
  error.value = ''
  message.value = ''
  busy.value = true
  const result = await api.captureSetConfig({ enabled, accelerator: accelerator.value.trim() })
  busy.value = false
  if (result.success && result.registered !== false) {
    message.value = enabled ? 'Quick capture is on.' : 'Quick capture is off.'
    await refresh()
  } else if (result.success) {
    message.value = 'Saved, but the hotkey is off.'
    await refresh()
  } else {
    error.value = result.error || 'Could not register the hotkey. Try a different one.'
  }
}

function toggle(event) {
  save(event.target.checked)
}
</script>

<template>
  <div v-if="config" class="capture-settings" data-testid="capture-settings">
    <h3>Quick capture</h3>
    <p class="setting-hint">
      A global hotkey opens a small window to capture a note as a new top-level item, from any app.
    </p>
    <label class="setting-row">
      <input type="checkbox" :checked="config.enabled" data-testid="capture-enabled" @change="toggle" />
      Enable quick capture
    </label>
    <div class="setting-row">
      <input
        v-model="accelerator"
        type="text"
        placeholder="CommandOrControl+Shift+N"
        data-testid="capture-accelerator"
      />
      <button :disabled="busy || !accelerator.trim()" data-testid="capture-save" @click="save(config.enabled)">
        Set hotkey
      </button>
    </div>
    <p v-if="message" class="setting-message">{{ message }}</p>
    <p v-if="error" class="setting-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.capture-settings {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.capture-settings h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-primary);
}
.setting-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
}
.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.setting-row input[type='text'] {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.setting-row button {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
}
.setting-row button:disabled {
  opacity: 0.5;
  cursor: default;
}
.setting-message {
  font-size: 12px;
  color: var(--success-color, #22c55e);
}
.setting-error {
  font-size: 12px;
  color: var(--error-color, #ef4444);
}
</style>
