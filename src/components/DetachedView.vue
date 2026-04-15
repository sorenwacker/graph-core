<script setup>
import { ref, onMounted, watch } from 'vue'
import { api } from '../services/api.js'
import { useDetachedWindow } from '../composables/useDetachedWindow.js'
import { useTheme } from '../composables/useTheme.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { pickNodeFields } from '../utils/nodeFields.js'
import DetailPanel from './DetailPanel.vue'

const { handleError } = useErrorHandler()

const props = defineProps({
  nodeId: { type: Number, required: true },
})

// Initialize theme for detached window
useTheme()

const { broadcastNodeUpdate, broadcastNodeDelete, onMessage } = useDetachedWindow()

const currentNode = ref(null)
const navigationHistory = ref([]) // Stack for back navigation
const loading = ref(true)
const error = ref(null)
const workspaces = ref([])

// Load the initial node
async function loadNode(id) {
  loading.value = true
  error.value = null
  try {
    currentNode.value = await api.getNode(id)
    if (!currentNode.value) {
      error.value = 'Node not found'
    }
  } catch (e) {
    handleError(e, { context: 'Loading detached node', silent: true })
    error.value = 'Failed to load node'
  } finally {
    loading.value = false
  }
}

// Load workspaces for DetailPanel
async function loadWorkspaces() {
  try {
    workspaces.value = await api.getWorkspaces()
  } catch (e) {
    handleError(e, { context: 'Loading workspaces', silent: true })
    workspaces.value = []
  }
}

// Handle node update from DetailPanel
async function handleUpdate(updatedNode) {
  try {
    await api.updateNode(updatedNode.id, pickNodeFields(updatedNode))
    currentNode.value = { ...updatedNode }

    // Broadcast update to other windows
    broadcastNodeUpdate(updatedNode)

    // Update window title
    document.title = updatedNode.title || 'Detached Node'
  } catch (e) {
    handleError(e, { context: 'Updating node' })
  }
}

// Handle node deletion
async function handleDelete(node) {
  try {
    await api.deleteNode(node.id)
    broadcastNodeDelete(node.id)
    // Close the window after deleting
    window.close()
  } catch (e) {
    handleError(e, { context: 'Deleting node' })
  }
}

// Handle AI improve notes
async function handleAIImproveNotes(payload) {
  const { nodeId, oldNotes: _oldNotes, newNotes, prompt: _prompt, selectionRange, fullNotes } = payload

  // Use fullNotes from the editor (current content) for correct selection positions
  const currentFullNotes = fullNotes ?? ''

  let finalNewNotes
  if (selectionRange) {
    // Selection-based improvement: replace only the selected portion
    finalNewNotes =
      currentFullNotes.slice(0, selectionRange.from) + newNotes + currentFullNotes.slice(selectionRange.to)
  } else {
    // Full notes improvement
    finalNewNotes = newNotes
  }

  try {
    await api.updateNode(nodeId, { notes: finalNewNotes })
    // Update local state
    if (currentNode.value && currentNode.value.id === nodeId) {
      currentNode.value = { ...currentNode.value, notes: finalNewNotes }
      // Broadcast update to other windows
      broadcastNodeUpdate(currentNode.value)
    }
  } catch (e) {
    handleError(e, { context: 'Applying AI improvement' })
  }
}

// Navigate to a child node
function selectChild(childId) {
  if (currentNode.value) {
    navigationHistory.value.push(currentNode.value.id)
  }
  loadNode(childId)
}

// Navigate back
function goBack() {
  if (navigationHistory.value.length > 0) {
    const previousId = navigationHistory.value.pop()
    loadNode(previousId)
  }
}

// Handle wrap-with-parent (create parent node)
async function wrapWithParent(node) {
  try {
    // Create new parent node
    const parentData = {
      title: 'New Parent',
      type: 'group',
      parent_id: node.parent_id,
      workspace_id: node.workspace_id,
    }
    const newParent = await api.createNode(parentData)

    // Move current node under new parent
    await api.moveNode(node.id, newParent.id)

    // Reload node and broadcast
    await loadNode(node.id)
    broadcastNodeUpdate(newParent)
  } catch (e) {
    handleError(e, { context: 'Wrapping with parent' })
  }
}

// Handle move to root
async function moveToRoot(node) {
  try {
    await api.moveNode(node.id, null)
    await loadNode(node.id)
    broadcastNodeUpdate(node)
  } catch (e) {
    handleError(e, { context: 'Moving to root' })
  }
}

// Handle adding child - receives { parentId, title, type } from ChildrenSection
async function addChild(payload) {
  try {
    // Use payload.parentId for subtasks (adding to a child), otherwise use current node
    const parentId = payload.parentId || currentNode.value?.id
    const childData = {
      title: payload.title || 'New Task',
      type: payload.type || 'task',
      parent_id: parentId,
      workspace_id: currentNode.value?.workspace_id,
    }
    const newChild = await api.createNode(childData)
    broadcastNodeUpdate(newChild)
    // Reload to show the new child in the list
    await loadNode(currentNode.value.id)
  } catch (e) {
    handleError(e, { context: 'Adding child' })
  }
}

// Handle child updated
function onChildUpdated(child) {
  broadcastNodeUpdate(child)
}

// Handle close - just close the window
function handleClose() {
  window.close()
}

// Listen for messages from other windows
onMounted(() => {
  loadNode(props.nodeId)
  loadWorkspaces()

  onMessage(data => {
    if (data.type === 'node-updated' && data.node) {
      // Update if this is our current node
      if (data.node.id === currentNode.value?.id) {
        currentNode.value = { ...data.node }
        document.title = data.node.title || 'Detached Node'
      }
    } else if (data.type === 'node-deleted' && data.nodeId === currentNode.value?.id) {
      // Our node was deleted from another window
      window.close()
    }
  })
})

// Update document title when node changes
watch(
  () => currentNode.value?.title,
  newTitle => {
    if (newTitle) {
      document.title = newTitle
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="detached-view">
    <!-- Draggable title bar region -->
    <div class="detached-titlebar"></div>

    <!-- Back navigation when we've drilled into children -->
    <div v-if="navigationHistory.length > 0" class="detached-nav">
      <button class="back-btn" @click="goBack" title="Go back to previous node">
        <span class="back-icon">&larr;</span> Back
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="detached-loading">Loading...</div>

    <!-- Error state -->
    <div v-else-if="error" class="detached-error">
      {{ error }}
    </div>

    <!-- Node detail panel -->
    <DetailPanel
      v-else-if="currentNode"
      :node="currentNode"
      :width="0"
      :fullscreen="true"
      :hide-completed="false"
      :pinned="false"
      :workspaces="workspaces"
      @update="handleUpdate"
      @delete="handleDelete"
      @wrap-with-parent="wrapWithParent"
      @move-to-root="moveToRoot"
      @select-child="selectChild"
      @toggle-fullscreen="() => {}"
      @toggle-pin="() => {}"
      @close="handleClose"
      @open-link-search="() => {}"
      @add-child="addChild"
      @child-updated="onChildUpdated"
      @ai-improve-notes="handleAIImproveNotes"
    />
  </div>
</template>

<style scoped>
.detached-view {
  width: 100vw;
  height: 100vh;
  background: var(--bg-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.detached-titlebar {
  height: 32px;
  -webkit-app-region: drag;
  app-region: drag;
  flex-shrink: 0;
}

.detached-nav {
  position: fixed;
  top: 38px;
  left: 12px;
  z-index: 1000;
}

.back-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.back-icon {
  font-size: 14px;
}

.detached-loading,
.detached-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}

.detached-error {
  color: var(--error-color);
}

/* Override DetailPanel styles for detached mode */
:deep(.detail-panel) {
  position: static !important;
  width: 100% !important;
  height: calc(100vh - 32px) !important;
  max-width: none !important;
  border-radius: 0 !important;
  border: none !important;
  overflow-y: auto !important;
}

:deep(.detail-panel.fullscreen) {
  padding-top: 0 !important;
}

:deep(.resize-handle) {
  display: none !important;
}
</style>
