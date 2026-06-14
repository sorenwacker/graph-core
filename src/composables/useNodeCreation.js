/**
 * Node-creation UI handlers extracted from App.vue.
 *
 * Owns the "create a node" flows: the add-node bar, the add-node modal trigger,
 * graph-position creation, and adding a child from the detail panel. All shared
 * state and operations are injected so this stays a thin handler layer.
 */

/**
 * @param {Object} deps
 * @param {import('vue').Ref<string>} deps.newNodeTitle - Add-bar title input
 * @param {import('vue').Ref<string>} deps.newNodeType - Add-bar type
 * @param {import('vue').Ref<number|null>} deps.addChildParentId - Pending add-child parent
 * @param {import('vue').Ref<number|null>} deps.currentContainerId - Current container
 * @param {import('vue').Ref<boolean>} deps.showDetail - Detail panel visibility
 * @param {import('vue').Ref<Object>} deps.addNodeModal - Add-node modal state { visible, parentId }
 * @param {import('vue').Ref<Object|null>} deps.detailPanelRef - DetailPanel component ref
 * @param {Object} deps.nodeOps - Node operations composable
 * @param {Function} deps.addChildNode - Add-child action (from useNodeActionsUI)
 * @param {Function} deps.selectNode - Select a node
 * @param {Function} deps.loadChildren - Reload children
 * @param {Function} deps.loadSidebarTree - Reload sidebar tree
 * @param {Function} deps.refreshAfterChange - Refresh after a change
 * @param {Function} deps.hideTooltip - Hide the node tooltip
 * @param {import('vue').Ref<Set<number>>} deps.expandedIds - Expanded tree node IDs
 * @returns {Object} Node-creation handlers
 */
export function useNodeCreation({
  newNodeTitle,
  newNodeType,
  addChildParentId,
  currentContainerId,
  showDetail,
  addNodeModal,
  detailPanelRef,
  nodeOps,
  addChildNode,
  selectNode,
  loadChildren,
  loadSidebarTree,
  refreshAfterChange,
  hideTooltip,
  expandedIds,
}) {
  async function createNode() {
    if (!newNodeTitle.value.trim()) return
    const targetParentId = addChildParentId.value || currentContainerId.value
    const newNode = await nodeOps.createNode({
      title: newNodeTitle.value,
      type: newNodeType.value,
      parentId: targetParentId,
    })
    if (newNode) {
      if (addChildParentId.value) {
        expandedIds.value.add(addChildParentId.value)
        await loadSidebarTree()
      }
      newNodeTitle.value = ''
      addChildParentId.value = null
      await loadChildren(currentContainerId.value, { silent: true })
    }
  }

  const addChildFromDetail = async payload => {
    await addChildNode(payload)
    detailPanelRef.value?.loadChildren()
  }

  async function createNodeAtPosition({ title, type, x, y }) {
    const newNode = await nodeOps.createNode({ title, type, parentId: currentContainerId.value, x, y })
    if (newNode) {
      await refreshAfterChange()
      selectNode(newNode)
    }
  }

  const showAddNodeModal = (parentId = null) => {
    showDetail.value = false
    addNodeModal.value = { visible: true, parentId }
  }

  function handleAddChild(payload, e) {
    if (payload?.title) {
      addChildNode(payload)
      return
    }
    e?.stopPropagation()
    hideTooltip()
    showAddNodeModal(payload)
  }

  function handleCreate(payload) {
    if (payload?.title) {
      createNodeAtPosition(payload)
      return
    }
    hideTooltip()
    showAddNodeModal(currentContainerId.value)
  }

  return {
    createNode,
    createNodeAtPosition,
    addChildFromDetail,
    showAddNodeModal,
    handleAddChild,
    handleCreate,
  }
}
