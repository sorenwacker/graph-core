const { app, BrowserWindow, ipcMain, session, shell, net, Menu } = require('electron')
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

function createMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('open-settings')
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            mainWindow?.webContents.send('menu-undo')
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            mainWindow?.webContents.send('menu-redo')
          }
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core')
          }
        },
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core#readme')
          }
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            mainWindow?.webContents.send('show-shortcuts')
          }
        },
        { type: 'separator' },
        {
          label: 'Release Notes',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core/releases')
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core/issues')
          }
        },
        { type: 'separator' },
        {
          label: 'Ollama Setup',
          click: async () => {
            await shell.openExternal('https://ollama.ai/download')
          }
        },
        {
          label: 'Ollama Models',
          click: async () => {
            await shell.openExternal('https://ollama.ai/library')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'graph.db')
  db = new Database(dbPath)
  await db.ready // Wait for async initialization

  createMenu()
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

// Notify renderer to save before quitting
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-before-quit')
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
// NODE TABLES
// =========================================
ipcMain.handle('db:getNodeTable', (event, nodeId) => db.getNodeTable(nodeId))
ipcMain.handle('db:createNodeTable', (event, nodeId, data) => db.createNodeTable(nodeId, data))
ipcMain.handle('db:updateNodeTable', (event, nodeId, data) => db.updateNodeTable(nodeId, data))
ipcMain.handle('db:deleteNodeTable', (event, nodeId) => db.deleteNodeTable(nodeId))
ipcMain.handle('db:getTableCells', (event, nodeId) => db.getTableCells(nodeId))
ipcMain.handle('db:setCells', (event, nodeId, cells) => db.setCells(nodeId, cells))
ipcMain.handle('db:clearCells', (event, nodeId) => db.clearCells(nodeId))

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

// =========================================
// OLLAMA LLM INTEGRATION
// =========================================

/**
 * Make HTTP request to Ollama API
 */
async function ollamaRequest(endpoint, path, options = {}) {
  const url = `${endpoint}${path}`

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || 'GET',
      url
    })

    if (options.body) {
      request.setHeader('Content-Type', 'application/json')
    }

    let responseData = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString()
      })

      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData))
          } catch {
            resolve(responseData)
          }
        } else {
          const error = new Error(`Ollama API error: ${response.statusCode}`)
          error.statusCode = response.statusCode
          try {
            error.data = JSON.parse(responseData)
          } catch {
            error.data = responseData
          }
          reject(error)
        }
      })
    })

    request.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        reject(new Error('Ollama is not running. Start with: ollama serve'))
      } else {
        reject(error)
      }
    })

    if (options.body) {
      request.write(JSON.stringify(options.body))
    }

    request.end()
  })
}

ipcMain.handle('ollama:generate', async (event, { prompt, content, model, endpoint, contextSize }) => {
  const fullPrompt = `${prompt}\n\n---\n\n${content}`

  try {
    const response = await ollamaRequest(endpoint, '/api/generate', {
      method: 'POST',
      body: {
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          num_ctx: contextSize || 32768
        }
      }
    })
    return response.response
  } catch (error) {
    if (error.statusCode === 404 && error.data?.error?.includes('not found')) {
      throw new Error(`Model not available. Run: ollama pull ${model}`)
    }
    throw error
  }
})

ipcMain.handle('ollama:testConnection', async (event, endpoint) => {
  try {
    await ollamaRequest(endpoint, '/api/tags')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('ollama:listModels', async (event, endpoint) => {
  const response = await ollamaRequest(endpoint, '/api/tags')
  return (response.models || []).map(m => m.name)
})

// =========================================
// OPENAI-COMPATIBLE API INTEGRATION
// =========================================

/**
 * Make HTTP request to OpenAI-compatible API
 */
async function openaiRequest(endpoint, path, apiKey, options = {}) {
  const url = `${endpoint}${path}`

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || 'GET',
      url
    })

    request.setHeader('Authorization', `Bearer ${apiKey}`)
    if (options.body) {
      request.setHeader('Content-Type', 'application/json')
    }

    let responseData = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString()
      })

      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData))
          } catch {
            resolve(responseData)
          }
        } else {
          const error = new Error(`API error: ${response.statusCode}`)
          error.statusCode = response.statusCode
          try {
            error.data = JSON.parse(responseData)
          } catch {
            error.data = responseData
          }
          reject(error)
        }
      })
    })

    request.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        reject(new Error('Cannot connect to API endpoint'))
      } else {
        reject(error)
      }
    })

    if (options.body) {
      request.write(JSON.stringify(options.body))
    }

    request.end()
  })
}

ipcMain.handle('openai:generate', async (event, { prompt, content, model, endpoint, apiKey }) => {
  if (!apiKey) {
    throw new Error('API key is required')
  }

  try {
    const response = await openaiRequest(endpoint, '/chat/completions', apiKey, {
      method: 'POST',
      body: {
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: content }
        ],
        stream: false
      }
    })
    return response.choices?.[0]?.message?.content || ''
  } catch (error) {
    if (error.statusCode === 401) {
      throw new Error('Invalid API key')
    }
    if (error.data?.error?.message) {
      throw new Error(error.data.error.message)
    }
    throw error
  }
})

ipcMain.handle('openai:testConnection', async (event, endpoint, apiKey) => {
  if (!apiKey) {
    return { success: false, error: 'API key is required' }
  }
  try {
    await openaiRequest(endpoint, '/models', apiKey)
    return { success: true }
  } catch (error) {
    if (error.statusCode === 401) {
      return { success: false, error: 'Invalid API key' }
    }
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('openai:listModels', async (event, endpoint, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required')
  }
  const response = await openaiRequest(endpoint, '/models', apiKey)
  return (response.data || []).map(m => m.id).sort()
})

// App info
ipcMain.handle('app:getVersion', () => app.getVersion())
