<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../../services/api'

/**
 * Settings > General: MCP server (docs/guides/mcp.md). Turn the bridge for
 * MCP clients on or off, see connected clients, and copy the client
 * configuration. Desktop only.
 */

const status = ref(null)
const message = ref('')
const error = ref('')

let unsubscribe = null
onMounted(async () => {
  status.value = await api.mcpGetStatus()
  unsubscribe = api.onMcpStatus(next => (status.value = next))
})
onUnmounted(() => unsubscribe?.())

async function toggle(event) {
  error.value = ''
  message.value = ''
  try {
    status.value = await api.mcpSetEnabled(event.target.checked)
  } catch (e) {
    error.value = e.message || 'Could not change the MCP server.'
  }
}

async function copyConfig() {
  await navigator.clipboard.writeText(JSON.stringify(status.value.clientConfig, null, 2))
  message.value = 'Client configuration copied.'
}
</script>

<template>
  <div v-if="status" class="mcp-settings" data-testid="mcp-settings">
    <h3>MCP server</h3>
    <p class="setting-hint">
      Lets an MCP client such as Claude Code read and edit your nodes while Graph Core is running. Notes of sensitive
      nodes are never shared.
    </p>
    <label class="setting-row">
      <input type="checkbox" :checked="status.enabled" data-testid="mcp-enabled" @change="toggle" />
      Enable MCP server
    </label>
    <template v-if="status.running">
      <p class="setting-row" data-testid="mcp-clients">Connected clients: {{ status.clients }}</p>
      <div class="setting-row">
        <button data-testid="mcp-copy-config" @click="copyConfig">Copy client configuration</button>
      </div>
    </template>
    <p v-if="message" class="setting-message">{{ message }}</p>
    <p v-if="error" class="setting-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.mcp-settings {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.mcp-settings h3 {
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
.setting-row button {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
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
