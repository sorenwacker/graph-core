<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../services/api'

/**
 * Settings > Security: enable or disable at-rest encryption and the Touch ID
 * gate (docs/architecture/encryption.md). Self-contained: talks to the api
 * directly, like the AI settings section.
 */

const status = ref(null)
const password = ref('')
const passwordConfirm = ref('')
const disablePassword = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)

async function refresh() {
  status.value = await api.securityStatus()
}

onMounted(refresh)

async function enable() {
  error.value = ''
  message.value = ''
  if (password.value !== passwordConfirm.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Use at least 8 characters'
    return
  }
  busy.value = true
  const result = await api.securityEnable(password.value)
  busy.value = false
  if (result.success) {
    message.value = 'Encryption enabled. Store the recovery password somewhere safe.'
    password.value = ''
    passwordConfirm.value = ''
    await refresh()
  } else {
    error.value = result.error || 'Enabling failed'
  }
}

async function disable() {
  error.value = ''
  message.value = ''
  busy.value = true
  const result = await api.securityDisable(disablePassword.value)
  busy.value = false
  if (result.success) {
    message.value = 'Encryption disabled; the database is stored as plaintext again.'
    disablePassword.value = ''
    await refresh()
  } else {
    error.value = result.error || 'Disabling failed'
  }
}

async function toggleTouchId(event) {
  await api.securitySetTouchId(event.target.checked)
  await refresh()
}
</script>

<template>
  <div v-if="status && status.state !== 'unavailable'" class="security-settings">
    <h3>Encryption at rest</h3>

    <template v-if="status.state === 'plaintext'">
      <p class="setting-hint">
        Encrypts the database file, backups, and snapshots. The recovery password is the only way to open the data if
        this machine's keychain is lost - there is no other recovery.
      </p>
      <div class="setting-row">
        <input v-model="password" type="password" placeholder="Recovery password" data-testid="enable-password" />
        <input
          v-model="passwordConfirm"
          type="password"
          placeholder="Repeat password"
          data-testid="enable-password-confirm"
        />
        <button :disabled="busy || !password" @click="enable">Encrypt database</button>
      </div>
    </template>

    <template v-else-if="status.state === 'encrypted'">
      <p class="setting-hint">The database is encrypted at rest.</p>
      <label v-if="status.touchIdAvailable" class="setting-row">
        <input type="checkbox" :checked="status.touchIdEnabled" @change="toggleTouchId" />
        Require Touch ID at startup
      </label>
      <div class="setting-row">
        <input
          v-model="disablePassword"
          type="password"
          placeholder="Recovery password"
          data-testid="disable-password"
        />
        <button :disabled="busy || !disablePassword" @click="disable">Disable encryption</button>
      </div>
    </template>

    <p v-if="message" class="setting-message">{{ message }}</p>
    <p v-if="error" class="setting-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.security-settings h3 {
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

.setting-row input[type='password'] {
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
