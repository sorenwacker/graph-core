/**
 * Node Interaction Handlers
 *
 * Shared across Cards, Table, and Graph views.
 * See docs/INTERACTIONS.md for full specification.
 *
 * Interaction model:
 * - Hover: Light select (updates detail panel if open, shows tooltip if closed)
 * - Click: Select + open detail panel
 * - Double-click: Navigate into node
 * - Ctrl/Cmd + Click: Toggle persistent multi-select
 * - Shift + Click: Range select
 * - Enter: Toggle detail panel
 */

/**
 * Handle mouse entering a node (hover)
 * @param {Object} node - The node being hovered
 * @param {Object} callbacks - { onHover }
 */
export function handleNodeHover(node, callbacks) {
  callbacks.onHover?.(node)
}

/**
 * Handle mouse leaving a node
 * @param {Object} callbacks - { onLeave }
 */
export function handleNodeLeave(callbacks) {
  callbacks.onLeave?.()
}

/**
 * Handle click on a node - selects and opens detail panel
 * @param {Event} e - Mouse event
 * @param {Object} node - The clicked node
 * @param {Object} callbacks - { onSelect, onMultiSelect, onAddChild, onDelete }
 */
export function handleNodeClick(e, node, callbacks) {
  const hasCmd = e.ctrlKey || e.metaKey
  const hasAlt = e.altKey

  if (hasCmd && hasAlt) {
    // Option+Cmd/Ctrl+click: delete the node
    callbacks.onDelete?.(node)
  } else if (hasCmd) {
    // Cmd/Ctrl+click: add child node
    callbacks.onAddChild?.(node)
  } else if (e.shiftKey) {
    callbacks.onMultiSelect?.(node, { range: true })
  } else {
    callbacks.onSelect?.(node)
  }
}

/**
 * Handle double-click on a node - navigates into it
 * @param {Object} node - The clicked node
 * @param {Object} callbacks - { onNavigate }
 */
export function handleNodeDoubleClick(node, callbacks) {
  callbacks.onNavigate?.(node)
}

/**
 * Handle keydown events
 * @param {Event} e - Keyboard event
 * @param {Object} callbacks - { onToggleDetails }
 */
export function handleKeydown(e, callbacks) {
  if (e.key === 'Enter') {
    callbacks.onToggleDetails?.()
  }
}

/**
 * Determine if tooltip should be shown
 * @param {boolean} detailPanelOpen - Whether detail panel is visible
 * @returns {boolean} - True if tooltip should show
 */
export function shouldShowTooltip(detailPanelOpen) {
  return !detailPanelOpen
}
