import { ref, onMounted, onUnmounted } from 'vue'

const CHANNEL_NAME = 'graph-core-sync'

/**
 * Composable for managing detached windows and cross-window synchronization
 * @returns {Object} - Detached window state and methods
 */
export function useDetachedWindow() {
  const isDetached = ref(false)
  const detachedNodeId = ref(null)
  const channel = ref(null)

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  // Parse URL to check for detached mode
  function parseDetachedParams() {
    const params = new URLSearchParams(window.location.search)
    const detached = params.get('detached')
    if (detached) {
      isDetached.value = true
      detachedNodeId.value = parseInt(detached, 10)
    }
  }

  // Initialize BroadcastChannel for cross-window sync
  function initChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      channel.value = new BroadcastChannel(CHANNEL_NAME)
    }
  }

  // Open a node in a detached window
  async function openDetachedWindow(nodeId, nodeTitle) {
    if (!isElectron || !window.electronAPI?.openDetachedWindow) {
      console.warn('Detached windows are only available in Electron')
      return { success: false, reason: 'not-electron' }
    }
    return await window.electronAPI.openDetachedWindow(nodeId, nodeTitle)
  }

  // Broadcast node update to other windows
  function broadcastNodeUpdate(node) {
    if (channel.value && node) {
      // Serialize to plain object to avoid cloning issues with Vue proxies
      try {
        channel.value.postMessage({
          type: 'node-updated',
          node: JSON.parse(JSON.stringify(node)),
        })
      } catch (e) {
        console.warn('Failed to broadcast node update:', e)
      }
    }
  }

  // Broadcast node deletion to other windows
  function broadcastNodeDelete(nodeId) {
    if (channel.value) {
      try {
        // Ensure nodeId is a primitive (not a Vue ref)
        const id = typeof nodeId === 'object' && nodeId !== null ? (nodeId.value ?? nodeId) : nodeId
        channel.value.postMessage({
          type: 'node-deleted',
          nodeId: id,
        })
      } catch (e) {
        console.warn('Failed to broadcast node delete:', e)
      }
    }
  }

  // Subscribe to channel messages
  function onMessage(callback) {
    if (channel.value) {
      channel.value.onmessage = event => {
        callback(event.data)
      }
    }
  }

  // Cleanup
  function cleanup() {
    if (channel.value) {
      channel.value.close()
      channel.value = null
    }
  }

  onMounted(() => {
    parseDetachedParams()
    initChannel()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    isDetached,
    detachedNodeId,
    isElectron,
    openDetachedWindow,
    broadcastNodeUpdate,
    broadcastNodeDelete,
    onMessage,
    cleanup,
  }
}
