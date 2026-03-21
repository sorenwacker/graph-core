const { app, BrowserWindow, ipcMain, session, shell, net, Menu } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
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
ipcMain.handle('db:getDescendantsBatch', (event, rootIds) => {
  const result = db.getDescendantsBatch(rootIds)
  // Convert Map to plain object for IPC serialization
  return Object.fromEntries(result)
})
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
ipcMain.handle('db:searchCount', (event, query, type, workspaceId, options) => db.searchCount(query, type, workspaceId, options))

// Reorder
ipcMain.handle('db:reorderNode', (event, nodeId, targetId, position) => db.reorderNode(nodeId, targetId, position))

// Export
ipcMain.handle('db:exportMarkdown', (event, nodeId) => db.exportMarkdown(nodeId))
ipcMain.handle('db:exportJSON', (event, nodeId, options) => db.exportJSON(nodeId, options))
ipcMain.handle('db:exportCSV', (event, nodeId, workspaceId) => db.exportCSV(nodeId, workspaceId))

// Import
ipcMain.handle('db:importJSON', (event, data, targetParentId, workspaceId) => db.importJSON(data, targetParentId, workspaceId))
ipcMain.handle('db:importCSV', (event, csvData, targetParentId, workspaceId) => db.importCSV(csvData, targetParentId, workspaceId))

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
// HTTP REQUEST UTILITY
// =========================================

/**
 * HTTP request using Node's https module with SSL verification disabled
 * Used for self-hosted endpoints with self-signed certificates
 */
async function httpRequestWithoutSslVerification(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    errorPrefix = 'API',
    connectionError = 'Cannot connect to API endpoint'
  } = options

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const transport = isHttps ? https : http

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { ...headers },
      rejectUnauthorized: false // Skip SSL verification
    }

    if (body) {
      const bodyStr = JSON.stringify(body)
      requestOptions.headers['Content-Type'] = 'application/json'
      requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }

    const request = transport.request(requestOptions, (response) => {
      let responseData = ''

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
          const error = new Error(`${errorPrefix} error: ${response.statusCode}`)
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
        reject(new Error(connectionError))
      } else {
        reject(error)
      }
    })

    if (body) {
      request.write(JSON.stringify(body))
    }

    request.end()
  })
}

/**
 * Generic HTTP request using Electron's net module
 * @param {string} url - Full URL to request
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (default: 'GET')
 * @param {Object} options.body - Request body (will be JSON stringified)
 * @param {Object} options.headers - Additional headers
 * @param {string} options.errorPrefix - Prefix for error messages (default: 'API')
 * @param {string} options.connectionError - Custom connection refused message
 * @param {boolean} options.skipSslVerification - Skip SSL certificate verification
 */
async function httpRequest(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    errorPrefix = 'API',
    connectionError = 'Cannot connect to API endpoint',
    skipSslVerification = false
  } = options

  // For SSL bypass, use Node's https module directly
  if (skipSslVerification && url.startsWith('https://')) {
    return httpRequestWithoutSslVerification(url, { method, body, headers, errorPrefix, connectionError })
  }

  return new Promise((resolve, reject) => {
    const request = net.request({ method, url })

    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      request.setHeader(key, value)
    })
    if (body) {
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
          const error = new Error(`${errorPrefix} error: ${response.statusCode}`)
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
        reject(new Error(connectionError))
      } else if (error.message?.includes('SSL') || error.message?.includes('ERR_SSL') ||
                 error.message?.includes('CERT') || error.message?.includes('certificate')) {
        reject(new Error(`SSL/TLS error: ${error.message}. For self-signed certificates, enable "Skip SSL verification" in settings.`))
      } else {
        reject(error)
      }
    })

    if (body) {
      request.write(JSON.stringify(body))
    }

    request.end()
  })
}

// =========================================
// OLLAMA LLM INTEGRATION
// =========================================

/**
 * Make HTTP request to Ollama API
 */
function ollamaRequest(endpoint, path, options = {}) {
  return httpRequest(`${endpoint}${path}`, {
    method: options.method,
    body: options.body,
    errorPrefix: 'Ollama API',
    connectionError: 'Ollama is not running. Start with: ollama serve'
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
function openaiRequest(endpoint, path, apiKey, options = {}) {
  return httpRequest(`${endpoint}${path}`, {
    method: options.method,
    body: options.body,
    headers: { Authorization: `Bearer ${apiKey}` },
    skipSslVerification: options.skipSslVerification
  })
}

ipcMain.handle('openai:generate', async (event, { prompt, content, model, endpoint, apiKey, skipSslVerification }) => {
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
      },
      skipSslVerification
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

ipcMain.handle('openai:testConnection', async (event, endpoint, apiKey, skipSslVerification) => {
  if (!apiKey) {
    return { success: false, error: 'API key is required' }
  }
  try {
    await openaiRequest(endpoint, '/models', apiKey, { skipSslVerification })
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

ipcMain.handle('openai:listModels', async (event, endpoint, apiKey, skipSslVerification) => {
  if (!apiKey) {
    throw new Error('API key is required')
  }
  const response = await openaiRequest(endpoint, '/models', apiKey, { skipSslVerification })
  return (response.data || []).map(m => m.id).sort()
})

// App info
ipcMain.handle('app:getVersion', () => app.getVersion())
