const { app, BrowserWindow, ipcMain, session, shell } = require('electron')
const path = require('path')
const Database = require('./database')

let mainWindow
let db
const detachedWindows = new Map() // Track open detached windows by nodeId

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../assets/icon.png')
  })

  // Set Content Security Policy (stricter in production)
  const isDev = process.env.NODE_ENV === 'development'
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:*"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"
        ]
      }
    })
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Also handle clicks on links within the page
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:9743'
      : `file://${path.join(__dirname, '../dist/index.html')}`

    if (!url.startsWith(appUrl) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:9743')
    // mainWindow.webContents.openDevTools()  // Uncomment to debug
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    // Enable devtools via keyboard shortcut in production
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key === 'I') {
        mainWindow.webContents.toggleDevTools()
      }
    })
  }
}

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

  const detachedWindow = new BrowserWindow({
    width: 700,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    title: nodeTitle || 'Detached Node',
    icon: path.join(__dirname, '../assets/icon.png')
  })

  // Track the window
  detachedWindows.set(nodeId, detachedWindow)

  // Clean up when window is closed
  detachedWindow.on('closed', () => {
    detachedWindows.delete(nodeId)
  })

  // Open external links in default browser
  detachedWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  detachedWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:9743'
      : `file://${path.join(__dirname, '../dist/index.html')}`

    if (!url.startsWith(appUrl) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Load the app with detached query param
  if (process.env.NODE_ENV === 'development') {
    detachedWindow.loadURL(`http://localhost:9743?detached=${nodeId}`)
  } else {
    detachedWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { detached: String(nodeId) }
    })
  }

  return { success: true, focused: false }
}

app.whenReady().then(async () => {
  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'graph.db')
  db = new Database(dbPath)
  await db.ready // Wait for async initialization

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers - Node CRUD
ipcMain.handle('db:getNodes', (event, params) => db.getNodes(params))
ipcMain.handle('db:getNode', (event, id) => db.getNode(id))
ipcMain.handle('db:createNode', (event, data) => db.createNode(data))
ipcMain.handle('db:updateNode', (event, id, data) => db.updateNode(id, data))
ipcMain.handle('db:deleteNode', (event, id, hard) => db.deleteNode(id, hard))

// Tree operations
ipcMain.handle('db:getRoots', (event, workspaceId) => db.getRoots(workspaceId))
ipcMain.handle('db:getProjects', () => db.getProjects())
ipcMain.handle('db:getInbox', () => db.getInbox())
ipcMain.handle('db:getRecent', (event, limit, workspaceId) => db.getRecent(limit, workspaceId))
ipcMain.handle('db:getFavorites', (event, workspaceId) => db.getFavorites(workspaceId))
ipcMain.handle('db:getTasks', (event, params) => db.getTasks(params))
ipcMain.handle('db:getChildren', (event, id, type) => db.getChildren(id, type))
ipcMain.handle('db:getDescendants', (event, id, maxDepth) => db.getDescendants(id, maxDepth))
ipcMain.handle('db:getAncestors', (event, id) => db.getAncestors(id))
ipcMain.handle('db:moveNode', (event, id, newParentId) => db.moveNode(id, newParentId))

// Links
ipcMain.handle('db:linkNodes', (event, sourceId, targetId) => db.linkNodes(sourceId, targetId))
ipcMain.handle('db:unlinkNodes', (event, sourceId, targetId) => db.unlinkNodes(sourceId, targetId))
ipcMain.handle('db:getAllLinks', (event, nodeIds) => db.getAllLinks(nodeIds))
ipcMain.handle('db:getLinkedNodes', (event, id) => db.getLinkedNodes(id))

// Tree view
ipcMain.handle('db:getTree', (event, rootId) => db.getTree(rootId))

// Search
ipcMain.handle('db:search', (event, query, type, workspaceId, options) => db.search(query, type, workspaceId, options))

// Reorder
ipcMain.handle('db:reorderNode', (event, nodeId, targetId, position) => db.reorderNode(nodeId, targetId, position))

// Export
ipcMain.handle('db:exportMarkdown', (event, nodeId) => db.exportMarkdown(nodeId))

// Trash
ipcMain.handle('db:getTrash', (event, limit) => db.getTrash(limit))
ipcMain.handle('db:restoreNode', (event, id) => db.restoreNode(id))
ipcMain.handle('db:emptyTrash', () => db.emptyTrash())

// Lost & Found
ipcMain.handle('db:getOrphanedNodes', () => db.getOrphanedNodes())
ipcMain.handle('db:reparentToRoot', (event, id) => db.reparentToRoot(id))

// Tags
ipcMain.handle('db:getAllTags', (event, workspaceId) => db.getAllTags(workspaceId))
ipcMain.handle('db:getNodesByTag', (event, tag, workspaceId, options) => db.getNodesByTag(tag, workspaceId, options))

// =========================================
// WORKSPACES
// =========================================
ipcMain.handle('db:getWorkspaces', () => db.getWorkspaces())
ipcMain.handle('db:getWorkspace', (event, id) => db.getWorkspace(id))
ipcMain.handle('db:createWorkspace', (event, data) => db.createWorkspace(data))
ipcMain.handle('db:updateWorkspace', (event, id, data) => db.updateWorkspace(id, data))
ipcMain.handle('db:deleteWorkspace', (event, id) => db.deleteWorkspace(id))

// =========================================
// DATABASE BACKUPS & RELOAD
// =========================================
ipcMain.handle('db:backup', (event, suffix) => db.backup(suffix))
ipcMain.handle('db:listBackups', () => db.listBackups())
ipcMain.handle('db:restoreBackup', (event, backupPath) => db.restoreBackup(backupPath))
ipcMain.handle('db:reload', () => db.reload())
ipcMain.handle('db:repairWorkspaces', () => db.repairWorkspaces())

// =========================================
// SHELL
// =========================================
ipcMain.handle('shell:openExternal', (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return shell.openExternal(url)
  }
})

// =========================================
// DETACHED WINDOWS
// =========================================
ipcMain.handle('window:openDetached', (event, nodeId, nodeTitle) => {
  return createDetachedWindow(nodeId, nodeTitle)
})

ipcMain.handle('window:closeDetached', (event, nodeId) => {
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
