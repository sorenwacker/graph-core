/**
 * Demo workspace data and creation utilities.
 * Creates a sample workspace with nodes demonstrating all node types and relationships.
 */

import demoDataJson from './demoData.json'

export const DEMO_WORKSPACE_ID = demoDataJson.workspace.id

export const demoWorkspace = demoDataJson.workspace

/**
 * Check if the demo workspace already exists.
 * @param {Object} api - The API service
 * @returns {Promise<boolean>}
 */
export async function demoWorkspaceExists(api) {
  try {
    const workspaces = await api.getWorkspaces()
    return workspaces.some(ws => ws.id === DEMO_WORKSPACE_ID)
  } catch {
    return false
  }
}

/**
 * Delete the demo workspace if it exists.
 * @param {Object} api - The API service
 * @returns {Promise<boolean>} Whether deletion succeeded
 */
export async function deleteDemoWorkspace(api) {
  const exists = await demoWorkspaceExists(api)
  if (!exists) {
    return true
  }

  try {
    await api.deleteWorkspace(DEMO_WORKSPACE_ID)
    return true
  } catch {
    return false
  }
}

/**
 * Reset the demo workspace (delete and recreate).
 * @param {Object} api - The API service
 * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
 */
export async function resetDemoWorkspace(api) {
  // Delete existing demo workspace
  const deleted = await deleteDemoWorkspace(api)
  if (!deleted) {
    return { success: false, error: 'Failed to delete existing demo workspace' }
  }

  // Create fresh demo workspace
  return createDemoWorkspaceInternal(api)
}

/**
 * Create the demo workspace with sample nodes and links.
 * @param {Object} api - The API service
 * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
 */
export async function createDemoWorkspace(api) {
  // Check if demo workspace already exists
  const exists = await demoWorkspaceExists(api)
  if (exists) {
    return { success: false, error: 'Demo workspace already exists' }
  }

  return createDemoWorkspaceInternal(api)
}

/**
 * Internal function to create demo workspace (without existence check).
 */
async function createDemoWorkspaceInternal(api) {
  const createdNodeIds = new Map() // ref -> id

  try {
    // 1. Create workspace
    await api.createWorkspace({
      id: demoWorkspace.id,
      name: demoWorkspace.name,
      color: demoWorkspace.color,
      icon: demoWorkspace.icon,
    })

    // 2. Create nodes (in order to resolve parent refs)
    for (const nodeDef of demoDataJson.nodes) {
      const parentId = nodeDef.parentRef ? createdNodeIds.get(nodeDef.parentRef) : null

      const nodeData = {
        type: nodeDef.type,
        title: nodeDef.title,
        notes: nodeDef.notes || '',
        workspace_id: DEMO_WORKSPACE_ID,
        parent_id: parentId,
        completed: nodeDef.completed || false,
        color: nodeDef.color || null,
        importance: nodeDef.importance || null,
        favorite: nodeDef.favorite || false,
      }

      const created = await api.createNode(nodeData)
      if (created?.id) {
        createdNodeIds.set(nodeDef.ref, created.id)
      }
    }

    // 3. Create links between nodes
    for (const linkDef of demoDataJson.links) {
      const sourceId = createdNodeIds.get(linkDef.sourceRef)
      const targetId = createdNodeIds.get(linkDef.targetRef)

      if (sourceId && targetId) {
        await api.linkNodes(sourceId, targetId)
      }
    }

    return { success: true, workspaceId: DEMO_WORKSPACE_ID }
  } catch (error) {
    // Attempt cleanup on failure
    try {
      await api.deleteWorkspace(DEMO_WORKSPACE_ID)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: error.message || 'Failed to create demo workspace' }
  }
}
