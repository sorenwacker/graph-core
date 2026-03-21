<script setup>
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
import tippy from 'tippy.js'

const props = defineProps({
  workspaces: { type: Array, required: true },
  modelValue: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue', 'create', 'delete', 'rename'])

const showNewInput = ref(false)
const showSettings = ref(false)
const newName = ref('')
const editName = ref('')
const inputRef = ref(null)
const editInputRef = ref(null)
const addBtn = ref(null)
const settingsBtn = ref(null)
const dropdownRef = ref(null)

let tippyInstances = []

const currentWorkspace = computed(() => {
  return props.workspaces.find(ws => ws.id === props.modelValue)
})

function initTooltips() {
  tippyInstances.forEach(i => i.destroy())
  tippyInstances = []

  if (addBtn.value) {
    tippyInstances.push(tippy(addBtn.value, {
      content: 'Create new workspace',
      placement: 'bottom',
      delay: [200, 0],
      theme: 'toolbar'
    }))
  }
  if (settingsBtn.value) {
    tippyInstances.push(tippy(settingsBtn.value, {
      content: 'Workspace settings',
      placement: 'bottom',
      delay: [200, 0],
      theme: 'toolbar'
    }))
  }
  if (dropdownRef.value) {
    tippyInstances.push(tippy(dropdownRef.value, {
      content: 'Switch workspace',
      placement: 'bottom',
      delay: [200, 0],
      theme: 'toolbar'
    }))
  }
}

onMounted(() => {
  nextTick(initTooltips)
})

watch([showNewInput, showSettings], () => {
  nextTick(initTooltips)
})

onUnmounted(() => {
  tippyInstances.forEach(i => i.destroy())
})

function openNewDialog() {
  showNewInput.value = true
  showSettings.value = false
  newName.value = ''
  nextTick(() => inputRef.value?.focus())
}

function createWorkspace() {
  if (newName.value.trim()) {
    emit('create', newName.value.trim())
    showNewInput.value = false
    newName.value = ''
  }
}

function cancelCreate() {
  showNewInput.value = false
  newName.value = ''
}

function openSettings() {
  showSettings.value = true
  showNewInput.value = false
  editName.value = currentWorkspace.value?.name || ''
  nextTick(() => editInputRef.value?.focus())
}

function closeSettings() {
  showSettings.value = false
  editName.value = ''
}

function saveSettings() {
  if (editName.value.trim() && editName.value.trim() !== currentWorkspace.value?.name) {
    emit('rename', { id: props.modelValue, name: editName.value.trim() })
  }
  closeSettings()
}

function deleteWorkspace() {
  if (props.workspaces.length > 1) {
    if (confirm(`Delete workspace "${currentWorkspace.value?.name}"? This cannot be undone.`)) {
      emit('delete', props.modelValue)
      closeSettings()
    }
  }
}
</script>

<template>
  <div class="workspace-selector">
    <select
      ref="dropdownRef"
      :value="modelValue"
      @change="emit('update:modelValue', $event.target.value)"
      class="workspace-dropdown"
    >
      <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
        {{ ws.name }}
      </option>
    </select>

    <template v-if="!showNewInput && !showSettings">
      <button ref="addBtn" class="ws-btn add" @click="openNewDialog">+</button>
      <button ref="settingsBtn" class="ws-btn settings" @click="openSettings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </template>

    <div v-else-if="showNewInput" class="ws-form">
      <input
        ref="inputRef"
        v-model="newName"
        class="ws-input"
        placeholder="Workspace name"
        @keyup.enter="createWorkspace"
        @keyup.escape="cancelCreate"
      />
      <button class="ws-btn" @click="createWorkspace">OK</button>
      <button class="ws-btn" @click="cancelCreate">X</button>
    </div>

    <div v-else-if="showSettings" class="ws-form settings-form">
      <input
        ref="editInputRef"
        v-model="editName"
        class="ws-input"
        placeholder="Workspace name"
        @keyup.enter="saveSettings"
        @keyup.escape="closeSettings"
      />
      <button class="ws-btn save" @click="saveSettings">Save</button>
      <button
        v-if="workspaces.length > 1"
        class="ws-btn delete"
        @click="deleteWorkspace"
      >Delete</button>
      <button class="ws-btn" @click="closeSettings">X</button>
    </div>
  </div>
</template>

<style scoped>
.workspace-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-dropdown {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
  min-width: 120px;
}

.workspace-dropdown:hover {
  border-color: var(--accent-color);
}

.ws-btn {
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  gap: 4px;
}

.ws-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ws-btn.add {
  font-size: 14px;
}

.ws-btn.settings {
  padding: 0 4px;
}

.ws-btn.settings svg {
  width: 14px;
  height: 14px;
}

.ws-btn.save {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ws-btn.save:hover {
  background: var(--accent-color);
  color: white;
}

.ws-btn.delete {
  background: var(--error-bg);
  border-color: var(--error-border);
  color: var(--error-color);
}

.ws-btn.delete:hover {
  background: var(--error-color);
  color: white;
}

.ws-form {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ws-input {
  padding: 4px 8px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
  width: 140px;
}

.ws-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}
</style>
