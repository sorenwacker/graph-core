/**
 * DOM utilities for node operations
 */

/**
 * Scroll to a node element and highlight it temporarily
 * @param {string|number} nodeId - The node ID to scroll to
 */
export function scrollToNode(nodeId) {
  const el = document.querySelector(`[data-node-id="${nodeId}"]`) ||
             document.querySelector(`#node-${nodeId}`) ||
             document.querySelector(`.node-card[data-id="${nodeId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('search-highlight')
    setTimeout(() => el.classList.remove('search-highlight'), 2000)
  }
}
