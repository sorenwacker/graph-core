/**
 * Calculate menu position that stays within viewport bounds.
 * Flips menu towards center when near edges.
 */
export function calculateMenuPosition(clickX, clickY, menuWidth = 260, menuHeight = 520) {
  const padding = 10
  const winW = window.innerWidth
  const winH = window.innerHeight

  // Flip horizontally if menu would overflow right edge
  let x = clickX
  if (clickX + menuWidth + padding > winW) {
    x = clickX - menuWidth
  }
  x = Math.max(padding, x)

  // Flip vertically if menu would overflow bottom edge
  let y = clickY
  if (clickY + menuHeight + padding > winH) {
    y = clickY - menuHeight
  }
  y = Math.max(padding, y)

  return { x, y }
}
