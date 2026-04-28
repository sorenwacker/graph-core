/**
 * Composable for demo workspace management.
 * Handles creation, reset, and onboarding interactions.
 */

import { createDemoWorkspace, resetDemoWorkspace, demoWorkspaceExists, DEMO_WORKSPACE_ID } from '../utils/demoData.js'
import { showToast } from './useToast.js'

/**
 * Create demo workspace operations.
 * @param {Object} options - Configuration
 * @param {Object} options.api - API service
 * @param {Ref} options.currentWorkspace - Current workspace ref
 * @param {Function} options.loadWorkspaces - Function to reload workspaces
 * @returns {Object} Demo workspace operations
 */
export function useDemoWorkspace({ api, currentWorkspace, loadWorkspaces }) {
  /**
   * Create a new demo workspace with sample data.
   */
  async function createDemo() {
    const exists = await demoWorkspaceExists(api)
    if (exists) {
      showToast('Demo workspace already exists', 'info')
      currentWorkspace.value = DEMO_WORKSPACE_ID
      return
    }

    const result = await createDemoWorkspace(api)
    if (result.success) {
      await loadWorkspaces()
      currentWorkspace.value = DEMO_WORKSPACE_ID
      showToast('Demo workspace created', 'success')
    } else {
      showToast(result.error || 'Failed to create demo workspace', 'error')
    }
  }

  /**
   * Reset demo workspace with fresh sample data.
   */
  async function resetDemo() {
    const confirmed = confirm(
      'Reset Demo Workspace?\n\nThis will delete all data in the Demo workspace and recreate it with fresh sample content.'
    )
    if (!confirmed) return

    const result = await resetDemoWorkspace(api)
    if (result.success) {
      await loadWorkspaces()
      currentWorkspace.value = DEMO_WORKSPACE_ID
      showToast('Demo workspace reset', 'success')
    } else {
      showToast(result.error || 'Failed to reset demo workspace', 'error')
    }
  }

  return {
    createDemo,
    resetDemo,
    DEMO_WORKSPACE_ID,
  }
}
