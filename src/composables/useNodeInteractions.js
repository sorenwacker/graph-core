import { handleNodeClick, handleNodeHover, handleNodeDoubleClick, shouldShowTooltip } from '../utils/nodeInteractions.js'

/**
 * Composable for node interactions
 * Provides consistent hover/click/double-click behavior across all views
 *
 * @param {Object} options
 * @param {Function} options.onHover - Called on hover (light select, updates detail if open)
 * @param {Function} options.onSelect - Called on click (full select + open detail)
 * @param {Function} options.onNavigate - Called on double-click (enter container)
 * @param {Function} options.onMultiSelect - Called on Shift+click
 * @param {Function} options.onAddChild - Called on Cmd/Ctrl+click (add child)
 * @param {Function} options.onDelete - Called on Option+Cmd/Ctrl+click (delete)
 * @param {Function} options.getShowDetail - Returns current showDetail state
 * @param {Function} options.showTooltip - Tooltip show function
 * @param {Function} options.hideTooltip - Tooltip hide function
 */
export function useNodeInteractions(options = {}) {
  const {
    onHover,
    onSelect,
    onNavigate,
    onMultiSelect,
    onAddChild,
    onDelete,
    getShowDetail = () => false,
    showTooltip,
    hideTooltip
  } = options

  const hoverCallbacks = { onHover }
  const clickCallbacks = { onSelect, onMultiSelect, onAddChild, onDelete }
  const dblClickCallbacks = { onNavigate }

  /**
   * Handle mouseenter on a node - light select + tooltip
   */
  function handleHover(event, node) {
    handleNodeHover(node, hoverCallbacks)

    // Show tooltip only if detail panel is closed
    if (showTooltip && shouldShowTooltip(getShowDetail())) {
      showTooltip(event, node)
    }
  }

  /**
   * Handle mouseleave on a node
   */
  function handleLeave() {
    hideTooltip?.()
  }

  /**
   * Handle click on a node - select + open detail
   */
  function handleClick(event, node) {
    handleNodeClick(event, node, clickCallbacks)
  }

  /**
   * Handle double-click on a node - navigate
   */
  function handleDoubleClick(node) {
    handleNodeDoubleClick(node, dblClickCallbacks)
  }

  return {
    handleHover,
    handleLeave,
    handleClick,
    handleDoubleClick
  }
}
