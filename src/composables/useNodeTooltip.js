import { onUnmounted } from 'vue'
import tippy from 'tippy.js'
import { buildTooltipHTML, tooltipOptions, getFixedTooltipReference, getTooltipPlacement } from '../utils/tooltip.js'

/**
 * Composable for handling node tooltips across all views
 * @param {Object} options - Configuration options
 * @param {Function} options.onOpenDetail - Callback when "Open Details" is clicked
 * @param {Function} options.onToggleComplete - Callback when checkbox is toggled
 * @param {Function} options.getHideSensitive - Function that returns current hideSensitive state
 * @param {Function} options.shouldShowTooltip - Function that returns whether tooltip should show for a node
 * @returns {Object} - Tooltip handlers
 */
export function useNodeTooltip(options = {}) {
  const { onOpenDetail, onToggleComplete, getHideSensitive = () => false, shouldShowTooltip = () => true } = options

  let activeTooltip = null
  let activeNodeId = null
  let tooltipShowTimeout = null
  let tooltipHideTimeout = null
  let locked = false
  const TOOLTIP_DELAY = 500
  const HIDE_DELAY = 200 // Allow time to move mouse to tooltip

  /**
   * Create and show tooltip immediately for a node.
   * @param {Object} node - Node data
   * @param {Event|null} event - Mouse event for positioning (optional)
   */
  function createTooltip(node, event = null) {
    // Destroy existing tooltip
    if (activeTooltip) {
      activeTooltip.destroy()
      activeTooltip = null
    }

    activeNodeId = node.id

    const content = buildTooltipHTML(node, {
      showCheckbox: node.type === 'task',
      hideSensitive: getHideSensitive(),
    })

    // Use dynamic position reference based on cursor location
    const fixedRef = getFixedTooltipReference(event)
    const placement = getTooltipPlacement(event)

    activeTooltip = tippy(fixedRef, {
      ...tooltipOptions,
      placement,
      content,
      showOnCreate: true,
      hideOnClick: false,
      onHidden: instance => {
        instance.destroy()
        if (activeTooltip === instance) {
          activeTooltip = null
        }
      },
      onShown: instance => {
        // Hide tooltip when mouse enters it (unless locked)
        instance.popper.addEventListener('mouseenter', () => {
          if (!instance.state.isDestroyed && !locked) {
            instance.hide()
          }
        })

        // Attach checkbox listener
        const checkbox = instance.popper.querySelector('input[type="checkbox"][data-node-id]')
        if (checkbox && onToggleComplete) {
          checkbox.addEventListener('change', evt => {
            const nodeId = parseInt(evt.target.dataset.nodeId)
            onToggleComplete(nodeId)
            if (!instance.state.isDestroyed) {
              instance.hide()
            }
          })
        }
        // Attach open detail button listener
        const openBtn = instance.popper.querySelector('.tt-open-detail[data-node-id]')
        if (openBtn && onOpenDetail) {
          openBtn.addEventListener('click', evt => {
            const nodeId = parseInt(evt.target.dataset.nodeId)
            onOpenDetail(nodeId)
            if (!instance.state.isDestroyed) {
              instance.hide()
            }
          })
        }
      },
    })
  }

  function showTooltip(event, node) {
    // Don't show hover tooltip if there's a locked tooltip
    if (locked) {
      return
    }

    // Check if tooltip should be shown for this node
    if (!shouldShowTooltip(node)) {
      return
    }

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

    // Store event for delayed use
    const storedEvent = event

    tooltipShowTimeout = setTimeout(() => {
      // Recheck if tooltip should still be shown (detail panel may have opened during delay)
      if (!shouldShowTooltip(node)) {
        return
      }

      createTooltip(node, storedEvent)
    }, TOOLTIP_DELAY)
  }

  function hideTooltip() {
    // Don't hide if locked
    if (locked) {
      return
    }

    // Clear any pending show
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    // Delayed hide to allow mouse to enter tooltip
    if (activeTooltip && !activeTooltip.state.isDestroyed) {
      tooltipHideTimeout = setTimeout(() => {
        if (activeTooltip && !activeTooltip.state.isDestroyed && !locked) {
          activeTooltip.hide()
        }
      }, HIDE_DELAY)
    }
  }

  function forceHide() {
    // Immediate hide without delay, even if locked
    locked = false
    activeNodeId = null
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout)
      tooltipHideTimeout = null
    }
    if (activeTooltip && !activeTooltip.state.isDestroyed) {
      activeTooltip.popper?.classList?.remove('tooltip-locked')
      activeTooltip.destroy()
      activeTooltip = null
    }
  }

  function lockTooltip() {
    if (activeTooltip && !activeTooltip.state.isDestroyed) {
      locked = true
      activeTooltip.popper?.classList?.add('tooltip-locked')
    }
  }

  function unlockTooltip() {
    locked = false
    if (activeTooltip && !activeTooltip.state.isDestroyed) {
      activeTooltip.popper?.classList?.remove('tooltip-locked')
      activeTooltip.hide()
    }
    activeNodeId = null
  }

  function toggleLock(node, event = null) {
    if (!node) return

    // Clear any pending show/hide
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout)
      tooltipHideTimeout = null
    }

    if (locked && activeNodeId === node.id) {
      // Clicking same node again - unlock
      unlockTooltip()
    } else if (activeTooltip && !activeTooltip.state.isDestroyed && activeNodeId === node.id) {
      // Tooltip visible for this node - lock it
      lockTooltip()
    } else {
      // Create tooltip immediately and lock it
      createTooltip(node, event)
      setTimeout(() => lockTooltip(), 10)
    }
  }

  function isLocked() {
    return locked
  }

  function cleanup() {
    locked = false
    activeNodeId = null
    if (tooltipShowTimeout) {
      clearTimeout(tooltipShowTimeout)
      tooltipShowTimeout = null
    }
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout)
      tooltipHideTimeout = null
    }
    if (activeTooltip && !activeTooltip.state.isDestroyed) {
      activeTooltip.destroy()
      activeTooltip = null
    }
  }

  // Auto cleanup on unmount
  onUnmounted(cleanup)

  return {
    showTooltip,
    hideTooltip,
    forceHide,
    lockTooltip,
    unlockTooltip,
    toggleLock,
    isLocked,
    cleanup,
  }
}
