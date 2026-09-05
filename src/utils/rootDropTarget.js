/**
 * The breadcrumb home icon is a drop target that moves a node to the top level.
 *
 * Graph, cards and table view drag by three different mechanisms - a canvas
 * grab, native HTML5 drag-and-drop, and a mouse-tracked ghost - so each detects
 * the target its own way. What "the target" is, and what the highlight looks
 * like, is decided here once. See docs/guides/drag-drop.md.
 */

/** Selector for the breadcrumb home icon. */
export const ROOT_DROP_SELECTOR = '.home-crumb'

/** Class applied to the home icon while a dragged node is over it. */
export const ROOT_DROP_ACTIVE_CLASS = 'drop-target'

/**
 * Find the breadcrumb root target under a screen point.
 *
 * @param {number} x - Client x coordinate.
 * @param {number} y - Client y coordinate.
 * @param {Document} doc - Document to hit-test, injectable for tests.
 * @returns {Element|null} The home crumb element, or null if the point misses it.
 */
export function findRootDropTarget(x, y, doc = document) {
  const el = doc.elementFromPoint(x, y)
  return el?.closest?.(ROOT_DROP_SELECTOR) ?? null
}

/**
 * Show or hide the drop highlight on the breadcrumb root target.
 *
 * @param {boolean} active - Whether a dragged node is currently over it.
 * @param {Document} doc - Document to search, injectable for tests.
 */
export function setRootDropHighlight(active, doc = document) {
  const crumb = doc.querySelector(ROOT_DROP_SELECTOR)
  if (!crumb) return
  if (active) crumb.classList.add(ROOT_DROP_ACTIVE_CLASS)
  else crumb.classList.remove(ROOT_DROP_ACTIVE_CLASS)
}

/**
 * Read the dragged node id from a native drag event.
 *
 * Card drag puts the id on the event as `text/plain`; anything else dropped on
 * the breadcrumb (a file, selected text) is not a node and is ignored.
 *
 * @param {DragEvent} e - The drop event.
 * @returns {number|null} The node id, or null when the payload is not one.
 */
export function nodeIdFromDragEvent(e) {
  const raw = e?.dataTransfer?.getData?.('text/plain')
  const id = parseInt(raw, 10)
  return Number.isInteger(id) && String(id) === String(raw).trim() ? id : null
}
