import { onUnmounted } from 'vue'
import tippy from 'tippy.js'
import { buildTooltipHTML, tooltipOptions } from '../utils/tooltip.js'

/**
 * Composable for handling node tooltips across all views
 * @param {Object} options - Configuration options
 * @param {Function} options.onOpenDetail - Callback when "Open Details" is clicked
 * @param {Function} options.onToggleComplete - Callback when checkbox is toggled
 * @param {Function} options.getHideSensitive - Function that returns current hideSensitive state
 * @returns {Object} - Tooltip handlers
 */
export function useNodeTooltip(options = {}) {
  const { onOpenDetail, onToggleComplete, getHideSensitive = () => false } = options

  let activeTooltip = null
  let tooltipShowTimeout = null
  let tooltipHideTimeout = null
  let mouseX = 0
  let mouseY = 0
  const TOOLTIP_DELAY = 500
  const HIDE_DELAY = 200 // Allow time to move mouse to tooltip

  function showTooltip(event, node) {
    // Store mouse position
    mouseX = event.clientX
    mouseY = event.clientY

    // Clear any pending hide
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout)
      tooltipHideTimeout = null
    }

    // Clear any pending show
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }

    // Hide existing tooltip if different node
    if (activeTooltip) {
      activeTooltip.destroy()
      activeTooltip = null
    }

    tooltipShowTimeout = setTimeout(() => {
      const content = buildTooltipHTML(node, {
        showCheckbox: node.type === 'task',
        hideSensitive: getHideSensitive()
      })

      // Store position for getReferenceClientRect
      const posX = mouseX
      const posY = mouseY

      activeTooltip = tippy(document.body, {
        ...tooltipOptions,
        content,
        showOnCreate: true,
        hideOnClick: false,
        // Use getReferenceClientRect for virtual positioning
        getReferenceClientRect: () => ({
          width: 0,
          height: 0,
          top: posY,
          bottom: posY,
          left: posX,
          right: posX,
          x: posX,
          y: posY
        }),
        onHidden: (instance) => {
          instance.destroy()
          if (activeTooltip === instance) {
            activeTooltip = null
          }
        },
        onShown: (instance) => {
          // Track when mouse enters/leaves the tooltip itself
          instance.popper.addEventListener('mouseenter', () => {
            if (tooltipHideTimeout) {
              clearTimeout(tooltipHideTimeout)
              tooltipHideTimeout = null
            }
          })
          instance.popper.addEventListener('mouseleave', () => {
            tooltipHideTimeout = setTimeout(() => {
              instance.hide()
            }, HIDE_DELAY)
          })

          // Attach checkbox listener
          const checkbox = instance.popper.querySelector('input[type="checkbox"][data-node-id]')
          if (checkbox && onToggleComplete) {
            checkbox.addEventListener('change', (evt) => {
              const nodeId = parseInt(evt.target.dataset.nodeId)
              onToggleComplete(nodeId)
              instance.hide()
            })
          }
          // Attach open detail button listener
          const openBtn = instance.popper.querySelector('.tt-open-detail[data-node-id]')
          if (openBtn && onOpenDetail) {
            openBtn.addEventListener('click', (evt) => {
              const nodeId = parseInt(evt.target.dataset.nodeId)
              onOpenDetail(nodeId)
              instance.hide()
            })
          }
        }
      })
    }, TOOLTIP_DELAY)
  }

  function hideTooltip() {
    // Clear any pending show
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    // Delayed hide to allow mouse to enter tooltip
    if (activeTooltip) {
      tooltipHideTimeout = setTimeout(() => {
        if (activeTooltip) {
          activeTooltip.hide()
        }
      }, HIDE_DELAY)
    }
  }

  function cleanup() {
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout)
      tooltipHideTimeout = null
    }
    if (activeTooltip) {
      activeTooltip.destroy()
      activeTooltip = null
    }
  }

  // Auto cleanup on unmount
  onUnmounted(cleanup)

  return {
    showTooltip,
    hideTooltip,
    cleanup
  }
}
