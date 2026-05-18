/**
 * Composable for handling wheel/zoom events on the graph.
 * Supports two trackpad zoom modes:
 * - 'scroll': Two-finger vertical scroll zooms (like Google Maps)
 * - 'pinch': Only pinch zooms, scroll pans (scroll-friendly)
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getContainer - Function returning container element
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @param {Object} options.trackpadZoomMode - Ref for trackpad zoom mode setting
 * @returns {Object} Wheel handling functions
 */
export function useGraphWheel(options = {}) {
  const { getContainer, getCy, trackpadZoomMode } = options

  let wheelCleanup = null

  /**
   * Set up custom wheel handling for trackpad zoom modes.
   * Mode 'scroll': Two-finger vertical scroll zooms (like Google Maps)
   * Mode 'pinch': Only pinch zooms, scroll pans (scroll-friendly)
   */
  function setupWheelHandler() {
    const container = getContainer()
    const cy = getCy()
    if (!container || !cy) return

    // Clean up previous handler
    if (wheelCleanup) {
      wheelCleanup()
      wheelCleanup = null
    }

    const el = container

    function handleWheel(e) {
      e.preventDefault()

      const currentCy = getCy()
      if (!currentCy) return

      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Determine if this should zoom or pan based on mode
      const isHorizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3
      const isPinch = e.ctrlKey // Browser synthesizes ctrlKey for pinch gestures

      let shouldZoom
      if (trackpadZoomMode?.value === 'pinch') {
        // Pinch mode: only pinch gesture zooms
        shouldZoom = isPinch
      } else {
        // Scroll mode (default): vertical scroll zooms, horizontal pans
        shouldZoom = !isHorizontalPan || isPinch
      }

      if (shouldZoom) {
        // Zoom centered on mouse position
        const intensity = isPinch ? 0.008 : 0.003
        const multiplier = Math.exp(-e.deltaY * intensity)
        const currentZoom = currentCy.zoom()
        const newZoom = Math.min(Math.max(currentZoom * multiplier, 0.1), 3)

        // Apply zoom centered on mouse
        currentCy.zoom({ level: newZoom, renderedPosition: { x: mouseX, y: mouseY } })
      } else {
        // Pan
        const pan = currentCy.pan()
        currentCy.pan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY })
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanup = () => el.removeEventListener('wheel', handleWheel)
  }

  /**
   * Clean up wheel event handlers.
   */
  function cleanup() {
    if (wheelCleanup) {
      wheelCleanup()
      wheelCleanup = null
    }
  }

  return {
    setupWheelHandler,
    cleanup,
  }
}
