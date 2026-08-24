<script setup>
import { onMounted, ref, watch } from 'vue'
import { useSensitiveNotes } from '../../composables/useSensitiveNotes'

/**
 * Settings > Security: the sensitive-notes second layer
 * (docs/architecture/sensitive-notes.md). Shown only when database encryption
 * is on, since it reuses the recovery password.
 */

const { status, refresh, enable, unlock, lock, disable } = useSensitiveNotes()
const password = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)

const props = defineProps({ refreshSignal: { type: Number, default: 0 } })
onMounted(refresh)
// Database encryption becoming available or unavailable changes whether this
// section applies; re-read status when the panel signals a security change.
watch(() => props.refreshSignal, refresh)

async function run(fn, okMessage) {
  error.value = ''
  message.value = ''
  busy.value = true
  const result = await fn(password.value)
  busy.value = false
  if (result?.success) {
    message.value = okMessage
    password.value = ''
  } else {
    error.value = result?.error || 'Action failed'
  }
}
</script>

<template>
  <div v-if="status.available" class="sensitive-settings" data-testid="sensitive-settings">
    <h3>Sensitive notes</h3>
    <p class="status-line">
      <span class="status-badge" :class="status.enabled ? 'on' : 'off'">{{ status.enabled ? 'ON' : 'OFF' }}</span>
      <template v-if="status.enabled">
        Notes marked sensitive are encrypted; the session is
        {{ status.unlocked ? 'unlocked' : 'locked' }}.
      </template>
      <template v-else>Notes marked sensitive are masked but stored as plaintext.</template>
    </p>

    <template v-if="!status.enabled">
      <p class="setting-hint">
        Encrypts the content of notes marked sensitive, so they are protected even from someone at the unlocked app.
        Revealing them takes the recovery password.
      </p>
      <div class="setting-row">
        <input
          v-model="password"
          type="password"
          placeholder="Recovery password"
          data-testid="sensitive-enable-password"
        />
        <button :disabled="busy || !password" @click="run(enable, 'Sensitive notes are now encrypted.')">Enable</button>
      </div>
    </template>

    <template v-else>
      <div v-if="!status.unlocked" class="setting-row">
        <input
          v-model="password"
          type="password"
          placeholder="Recovery password"
          data-testid="sensitive-unlock-password"
        />
        <button :disabled="busy || !password" @click="run(unlock, 'Sensitive notes unlocked for this session.')">
          Unlock
        </button>
      </div>
      <div v-else class="setting-row">
        <button :disabled="busy" @click="lock" data-testid="sensitive-lock">Lock now</button>
      </div>
      <div class="setting-row">
        <input
          v-model="password"
          type="password"
          placeholder="Recovery password"
          data-testid="sensitive-disable-password"
        />
        <button :disabled="busy || !password" @click="run(disable, 'Sensitive-note encryption disabled.')">
          Disable
        </button>
      </div>
    </template>

    <p v-if="message" class="setting-message">{{ message }}</p>
    <p v-if="error" class="setting-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.sensitive-settings {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.sensitive-settings h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-primary);
}
.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}
.status-badge.on {
  background: var(--success-color, #22c55e);
  color: #000;
}
.status-badge.off {
  background: var(--bg-tertiary, #333);
  color: var(--text-secondary, #999);
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
}
.setting-row input {
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
