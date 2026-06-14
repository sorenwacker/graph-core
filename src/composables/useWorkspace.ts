import { ref, watch, type Ref } from 'vue'
import type { Api, CreateWorkspaceData } from '../types'
import { useErrorHandler } from './useErrorHandler'

/** Workspace ID type - supports both string and number for backward compatibility */
export type WorkspaceId = string | number

/** Workspace with flexible ID type */
export interface WorkspaceItem {
  id: WorkspaceId
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  sort_order?: number
  created_at?: string
  updated_at?: string
}

/**
 * Options for useWorkspace composable.
 */
export interface UseWorkspaceOptions {
  /** API service for workspace operations */
  api: Api
  /** Callback when workspace switches (receives new workspace id) */
  onSwitch?: (workspaceId: WorkspaceId) => void
  /** Async callback for workspace change (receives new workspace id) */
  onWorkspaceChange?: (workspaceId: WorkspaceId) => Promise<void> | void
  /** Default workspace id */
  defaultWorkspace?: WorkspaceId
}

/**
 * Return type for useWorkspace composable.
 */
export interface UseWorkspaceReturn {
  /** Current workspace ID */
  currentWorkspace: Ref<WorkspaceId>
  /** List of available workspaces */
  workspaces: Ref<WorkspaceItem[]>
  /** Whether new workspace dialog is shown */
  showNewWorkspaceInput: Ref<boolean>
  /** New workspace name input value */
  newWorkspaceName: Ref<string>
  /** Load available workspaces from database */
  loadWorkspaces: () => Promise<void>
  /** Open the new workspace dialog */
  openNewWorkspaceDialog: () => void
  /** Create a new workspace */
  createWorkspace: (name?: string) => Promise<void>
  /** Delete the current workspace */
  deleteCurrentWorkspace: () => Promise<boolean>
  /** Rename a workspace */
  renameWorkspace: (workspaceId: WorkspaceId, newName: string) => Promise<boolean>
  /** Switch to a different workspace */
  switchWorkspace: (workspaceId: WorkspaceId) => void
  /**
   * Get workspace ID for creating new nodes. Accepts an optional node type to
   * match consumer call sites; the current implementation returns the active
   * workspace regardless of type.
   */
  getWorkspaceIdForNode: (type?: string) => WorkspaceId
}

const STORAGE_KEY = 'graphcore-workspace'
const DEFAULT_WORKSPACE = 'work'

/**
 * Composable for managing workspace state and operations.
 * Handles workspace CRUD, switching, and persistence.
 */
export function useWorkspace(options: UseWorkspaceOptions): UseWorkspaceReturn {
  const { api, onSwitch, onWorkspaceChange, defaultWorkspace = DEFAULT_WORKSPACE } = options
  const { handleError } = useErrorHandler()

  // Get initial workspace from localStorage or use default
  const getInitialWorkspace = (): WorkspaceId => {
    if (typeof localStorage === 'undefined') return defaultWorkspace
    return localStorage.getItem(STORAGE_KEY) || defaultWorkspace
  }

  // Core state
  const currentWorkspace = ref<WorkspaceId>(getInitialWorkspace())
  const workspaces = ref<WorkspaceItem[]>([])

  // UI state for new workspace dialog
  const showNewWorkspaceInput = ref(false)
  const newWorkspaceName = ref('')

  /**
   * Load available workspaces from database
   */
  async function loadWorkspaces(): Promise<void> {
    try {
      const ws = await api.getWorkspaces()
      workspaces.value = (ws || []).filter((w: WorkspaceItem | null) => w != null) as WorkspaceItem[]
    } catch (e) {
      handleError(e as Error, { context: 'Loading workspaces' })
      workspaces.value = []
    }
  }

  /**
   * Open the new workspace dialog
   */
  function openNewWorkspaceDialog(): void {
    newWorkspaceName.value = ''
    showNewWorkspaceInput.value = true
  }

  /**
   * Create a new workspace
   */
  async function createWorkspace(nameParam?: string): Promise<void> {
    const name = (nameParam || newWorkspaceName.value).trim()
    if (!name) {
      showNewWorkspaceInput.value = false
      return
    }

    try {
      const data: CreateWorkspaceData = { name }
      const newWs = await api.createWorkspace(data)
      await loadWorkspaces()
      if (newWs?.id) {
        currentWorkspace.value = newWs.id
      }
      showNewWorkspaceInput.value = false
      newWorkspaceName.value = ''
    } catch (e) {
      handleError(e as Error, { context: 'Creating workspace' })
    }
  }

  /**
   * Delete the current workspace
   */
  async function deleteCurrentWorkspace(): Promise<boolean> {
    // Can't delete if only one workspace
    if (workspaces.value.length <= 1) {
      return false
    }

    const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
    if (!ws) return false

    // Check if workspace has nodes
    const roots = await api.getRoots(currentWorkspace.value as number)
    if (roots && roots.length > 0) {
      if (typeof alert !== 'undefined') {
        alert(
          `Cannot delete workspace "${ws.name}". It still contains ${roots.length} root node(s). Move or delete them first.`
        )
      }
      return false
    }

    try {
      await api.deleteWorkspace(currentWorkspace.value as number)
      await loadWorkspaces()
      if (workspaces.value.length > 0) {
        currentWorkspace.value = workspaces.value[0].id
      }
      return true
    } catch (e) {
      handleError(e as Error, { context: 'Deleting workspace' })
      return false
    }
  }

  /**
   * Rename a workspace
   */
  async function renameWorkspace(workspaceId: WorkspaceId, newName: string): Promise<boolean> {
    if (!newName?.trim()) return false
    try {
      await api.updateWorkspace(workspaceId as number, { name: newName.trim() })
      await loadWorkspaces()
      return true
    } catch (e) {
      handleError(e as Error, { context: 'Renaming workspace' })
      return false
    }
  }

  /**
   * Switch to a different workspace
   */
  function switchWorkspace(workspaceId: WorkspaceId): void {
    currentWorkspace.value = workspaceId
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(workspaceId))
    }
    if (onSwitch) {
      onSwitch(workspaceId)
    }
  }

  /**
   * Get workspace ID for creating new nodes.
   * @param _type Optional node type (reserved for type-based routing; currently unused)
   */
  function getWorkspaceIdForNode(_type?: string): WorkspaceId {
    return currentWorkspace.value
  }

  // Persist workspace changes to localStorage and call change callback
  watch(currentWorkspace, async newWs => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(newWs))
    }
    if (onWorkspaceChange) {
      await onWorkspaceChange(newWs)
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
    renameWorkspace,
    switchWorkspace,
    getWorkspaceIdForNode,
  }
}
