<script setup>
import { ref } from 'vue'
import { api } from '../services/api'

/**
 * Shown instead of the app when the database file is encrypted and this
 * machine's keychain cannot unlock it (docs/architecture/encryption.md,
 * "Unlock flow"). A successful unlock re-wraps the key into the keychain and
 * reloads the window, so the app boots normally with the database open.
 */

const password = ref('')
const error = ref('')
const busy = ref(false)

async function unlock() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = ''
  const result = await api.securityUnlock(password.value)
  if (result.success) {
    window.location.reload()
  } else {
    error.value = result.error || 'Unlock failed'
    busy.value = false
  }
}
</script>

<template>
  <div class="unlock-screen">
    <div class="unlock-card">
      <h1>Database locked</h1>
      <p class="unlock-hint">
        This database is encrypted and this machine's keychain cannot open it. Enter the recovery password to unlock;
        the key is then stored in this machine's keychain so the next start is automatic.
      </p>
      <form @submit.prevent="unlock">
        <input
          v-model="password"
          type="password"
          placeholder="Recovery password"
          autofocus
          :disabled="busy"
          data-testid="unlock-password"
        />
        <button type="submit" :disabled="!password || busy">
          {{ busy ? 'Unlocking…' : 'Unlock' }}
        </button>
      </form>
      <p v-if="error" class="unlock-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.unlock-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #000);
  z-index: 10000;
}

.unlock-card {
  width: 360px;
  padding: 32px;
  border: 1px solid var(--border-color, #333);
  border-radius: 12px;
  background: var(--bg-secondary, #080808);
}

.unlock-card h1 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--text-primary, #d0d0d0);
}

.unlock-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, #888);
  margin-bottom: 20px;
}

.unlock-card form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.unlock-card input {
  padding: 10px 12px;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  background: var(--bg-primary, #000);
  color: var(--text-primary, #d0d0d0);
}

.unlock-card button {
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: var(--accent-color, #3b82f6);
  color: #fff;
  cursor: pointer;
}

.unlock-card button:disabled {
  opacity: 0.5;
  cursor: default;
}

.unlock-error {
  margin-top: 12px;
  font-size: 12px;
  color: var(--error-color, #ef4444);
}
</style>
