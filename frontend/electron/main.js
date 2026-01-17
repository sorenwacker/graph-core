const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const Database = require('./database')

let mainWindow
let db

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
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws://localhost:*"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"
        ]
      }
    })
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:9743')
    // mainWindow.webContents.openDevTools()  // Uncomment to debug
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
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
ipcMain.handle('db:getRoots', () => db.getRoots())
ipcMain.handle('db:getProjects', () => db.getProjects())
ipcMain.handle('db:getInbox', () => db.getInbox())
ipcMain.handle('db:getRecent', (event, limit) => db.getRecent(limit))
ipcMain.handle('db:getFavorites', () => db.getFavorites())
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
ipcMain.handle('db:search', (event, query, type) => db.search(query, type))

// Reorder
ipcMain.handle('db:reorderNode', (event, nodeId, targetId, position) => db.reorderNode(nodeId, targetId, position))

// Export
ipcMain.handle('db:exportMarkdown', (event, nodeId) => db.exportMarkdown(nodeId))

// Trash
ipcMain.handle('db:getTrash', (event, limit) => db.getTrash(limit))
ipcMain.handle('db:restoreNode', (event, id) => db.restoreNode(id))
ipcMain.handle('db:emptyTrash', () => db.emptyTrash())
