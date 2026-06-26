/**
 * Window IPC Handlers
 *
 * Registers WINDOW_* IPC handlers and manages detached windows.
 */

const { BrowserWindow, shell } = require('electron')
const path = require('path')
const { WINDOW_OPEN_DETACHED, WINDOW_CLOSE_DETACHED, SHELL_OPEN_EXTERNAL } = require('../ipcChannels')

// Track open detached windows by nodeId
const detachedWindows = new Map()

/**
 * Create common BrowserWindow configuration with optional overrides.
 * @param {Object} options - Window-specific options to merge
 * @returns {Object} Complete BrowserWindow configuration
 */
function createWindowConfig(options = {}) {
  const baseConfig = {
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.build.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../../assets/icon.png'),
  }

  return { ...baseConfig, ...options }
}

/**
 * Set up external link handling for a BrowserWindow.
 * Opens http/https links in the default browser instead of the app.
 * @param {BrowserWindow} window - The window to configure
 */
function setupExternalLinkHandling(window) {
  // Open external links in default browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Also handle clicks on links within the page
  window.webContents.on('will-navigate', (event, url) => {
    const appUrl =
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:9743'
        : `file://${path.join(__dirname, '../../dist/index.html')}`

    if (!url.startsWith(appUrl) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

/**
 * Create a detached window for a node.
 * @param {number|string} nodeId - Node ID
 * @param {string} nodeTitle - Node title for window title
 * @returns {Object} Result with success status
 */
function createDetachedWindow(nodeId, nodeTitle) {
  // Check if window already exists for this node
  if (detachedWindows.has(nodeId)) {
    const existingWindow = detachedWindows.get(nodeId)
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus()
      return { success: true, focused: true }
    }
    // Window was destroyed, remove from map
    detachedWindows.delete(nodeId)
  }

  const detachedWindow = new BrowserWindow(
    createWindowConfig({
      width: 700,
      height: 800,
      minWidth: 400,
      minHeight: 300,
      title: nodeTitle || 'Detached Node',
    })
  )

  // Track the window
  detachedWindows.set(nodeId, detachedWindow)

  // Clean up when window is closed
  detachedWindow.on('closed', () => {
    detachedWindows.delete(nodeId)
  })

  setupExternalLinkHandling(detachedWindow)

  // Load the app with detached query param
  if (process.env.NODE_ENV === 'development') {
    detachedWindow.loadURL(`http://localhost:9743?detached=${nodeId}`)
  } else {
    detachedWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: { detached: String(nodeId) },
    })
  }

  return { success: true, focused: false }
}

/**
 * Register window IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 */
function registerWindowHandlers(ipcMain) {
  ipcMain.handle(WINDOW_OPEN_DETACHED, (_event, nodeId, nodeTitle) => {
    return createDetachedWindow(nodeId, nodeTitle)
  })

  ipcMain.handle(WINDOW_CLOSE_DETACHED, (_event, nodeId) => {
    if (detachedWindows.has(nodeId)) {
      const window = detachedWindows.get(nodeId)
      if (!window.isDestroyed()) {
        window.close()
      }
      detachedWindows.delete(nodeId)
      return { success: true }
    }
    return { success: false }
  })

  ipcMain.handle(SHELL_OPEN_EXTERNAL, (_event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      return shell.openExternal(url)
    }
  })
}

module.exports = {
  registerWindowHandlers,
  createWindowConfig,
  setupExternalLinkHandling,
  createDetachedWindow,
  detachedWindows,
}
