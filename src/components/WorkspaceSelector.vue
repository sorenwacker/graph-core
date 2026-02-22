<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  workspaces: { type: Array, required: true },
  modelValue: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue', 'create', 'delete'])

const showNewInput = ref(false)
const newName = ref('')
const inputRef = ref(null)

function openNewDialog() {
  showNewInput.value = true
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

function deleteWorkspace() {
  if (props.workspaces.length > 1) {
    emit('delete', props.modelValue)
  }
}
</script>

<template>
  <div class="workspace-selector">
    <select
      :value="modelValue"
      @change="emit('update:modelValue', $event.target.value)"
      class="workspace-dropdown"
      title="Switch workspace"
    >
      <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
        {{ ws.name }}
      </option>
    </select>

    <template v-if="!showNewInput">
      <button class="ws-btn add" @click="openNewDialog" title="Create new workspace">+</button>
      <button
        v-if="workspaces.length > 1"
        class="ws-btn delete"
        @click="deleteWorkspace"
        title="Delete current workspace"
      >-</button>
    </template>

    <div v-else class="new-workspace-form">
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
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.ws-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ws-btn.delete:hover {
  background: #fee2e2;
  border-color: #ef4444;
  color: #ef4444;
}

.new-workspace-form {
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
