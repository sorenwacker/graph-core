import { ref, watch } from 'vue'

/**
 * Composable for managing workspace state and operations.
 * Handles workspace CRUD, switching, and persistence.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for workspace operations
 * @param {Function} options.onSwitch - Callback when workspace switches (receives new workspace id)
 * @param {string} options.defaultWorkspace - Default workspace id (default: 'work')
 * @returns {Object} Workspace state and functions
 */
export function useWorkspace({
  api,
  onSwitch,
  defaultWorkspace = 'work'
} = {}) {
  // Get initial workspace from localStorage or use default
  const getInitialWorkspace = () => {
    if (typeof localStorage === 'undefined') return defaultWorkspace
    return localStorage.getItem('graphcore-workspace') || defaultWorkspace
  }

  // Core state
  const currentWorkspace = ref(getInitialWorkspace())
  const workspaces = ref([])

  // UI state for new workspace dialog
  const showNewWorkspaceInput = ref(false)
  const newWorkspaceName = ref('')

  /**
   * Load available workspaces from database
   */
  async function loadWorkspaces() {
    try {
      const ws = await api.getWorkspaces()
      workspaces.value = (ws || []).filter(Boolean)
    } catch (e) {
      console.error('Failed to load workspaces:', e)
      workspaces.value = []
    }
  }

  /**
   * Open the new workspace dialog
   */
  function openNewWorkspaceDialog() {
    newWorkspaceName.value = ''
    showNewWorkspaceInput.value = true
  }

  /**
   * Create a new workspace
   */
  async function createWorkspace() {
    const name = newWorkspaceName.value.trim()
    if (!name) {
      showNewWorkspaceInput.value = false
      return
    }

    try {
      const newWs = await api.createWorkspace({ name })
      await loadWorkspaces()
      if (newWs?.id) {
        currentWorkspace.value = newWs.id
      }
      showNewWorkspaceInput.value = false
      newWorkspaceName.value = ''
    } catch (e) {
      console.error('Failed to create workspace:', e)
    }
  }

  /**
   * Delete the current workspace
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  async function deleteCurrentWorkspace() {
    // Can't delete if only one workspace
    if (workspaces.value.length <= 1) {
      return false
    }

    const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
    if (!ws) return false

    // Check if workspace has nodes
    const roots = await api.getRoots(currentWorkspace.value)
    if (roots && roots.length > 0) {
      if (typeof alert !== 'undefined') {
        alert(`Cannot delete workspace "${ws.name}". It still contains ${roots.length} root node(s). Move or delete them first.`)
      }
      return false
    }

    try {
      await api.deleteWorkspace(currentWorkspace.value)
      await loadWorkspaces()
      if (workspaces.value.length > 0) {
        currentWorkspace.value = workspaces.value[0].id
      }
      return true
    } catch (e) {
      console.error('Failed to delete workspace:', e)
      return false
    }
  }

  /**
   * Switch to a different workspace
   * @param {string} workspaceId - Workspace ID to switch to
   */
  function switchWorkspace(workspaceId) {
    currentWorkspace.value = workspaceId
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('graphcore-workspace', workspaceId)
    }
    if (onSwitch) {
      onSwitch(workspaceId)
    }
  }

  /**
   * Get workspace ID for creating new nodes
   * @returns {string} Current workspace ID
   */
  function getWorkspaceIdForNode() {
    return currentWorkspace.value
  }

  // Persist workspace changes to localStorage
  watch(currentWorkspace, (newWs) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('graphcore-workspace', newWs)
    }
  })

  return {
    // State
    currentWorkspace,
    workspaces,
    showNewWorkspaceInput,
    newWorkspaceName,

    // Methods
    loadWorkspaces,
    openNewWorkspaceDialog,
    createWorkspace,
    deleteCurrentWorkspace,
    switchWorkspace,
    getWorkspaceIdForNode
  }
}
