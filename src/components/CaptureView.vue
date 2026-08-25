<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../services/api'
import { STORAGE_KEYS } from '../utils/uiConstants.js'

/**
 * Quick capture window (docs/guides/quick-capture.md). A small input that
 * creates a note as a new root node in the current workspace, then hides the
 * window. Runs in its own capture window, opened by the global hotkey.
 */

const text = ref('')
const inputRef = ref(null)
const busy = ref(false)

onMounted(() => inputRef.value?.focus())

function hide() {
  window.electronAPI?.hideCapture?.()
}

async function save() {
  const title = text.value.trim()
  if (!title || busy.value) return
  busy.value = true
  try {
    await api.createNode({
      type: 'note',
      title,
      parent_id: null,
      workspace_id: localStorage.getItem(STORAGE_KEYS.WORKSPACE) || 'work',
    })
    text.value = ''
    hide()
  } finally {
    busy.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    hide()
  }
}
</script>

<template>
  <div class="capture-view">
    <form @submit.prevent="save">
      <input
        ref="inputRef"
        v-model="text"
        type="text"
        placeholder="Capture a note, press Enter to save"
        @keydown="onKeydown"
      />
    </form>
  </div>
</template>

<style scoped>
.capture-view {
  height: 100vh;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--bg-primary, #0a0a0f);
  -webkit-app-region: drag;
}

.capture-view form {
  flex: 1;
}

.capture-view input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  font-size: 16px;
  border: 1px solid var(--border-color, #333);
  border-radius: 10px;
  background: var(--bg-secondary, #14141c);
  color: var(--text-primary, #e8e8e8);
  outline: none;
  -webkit-app-region: no-drag;
}

.capture-view input:focus {
  border-color: var(--accent-color, #6366f1);
}
</style>
