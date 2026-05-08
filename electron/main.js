const { app, BrowserWindow, ipcMain, session, shell, net, Menu } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
const Database = require('./database')
const {
  // Database - Node CRUD
  DB_GET_NODES,
  DB_GET_NODE,
  DB_CREATE_NODE,
  DB_UPDATE_NODE,
  DB_DELETE_NODE,
  // Database - Tree Operations
  DB_GET_ROOTS,
  DB_GET_PROJECTS,
  DB_GET_INBOX,
  DB_GET_RECENT,
  DB_GET_FAVORITES,
  DB_GET_TASKS,
  DB_GET_CHILDREN,
  DB_GET_DESCENDANTS,
  DB_GET_DESCENDANTS_BATCH,
  DB_GET_ANCESTORS,
  DB_MOVE_NODE,
  // Database - Links
  DB_LINK_NODES,
  DB_UNLINK_NODES,
  DB_GET_ALL_LINKS,
  DB_GET_LINKED_NODES,
  // Database - Tree View
  DB_GET_TREE,
  // Database - Search
  DB_SEARCH,
  DB_SEARCH_COUNT,
  // Database - Reorder
  DB_REORDER_NODE,
  // Database - Export
  DB_EXPORT_MARKDOWN,
  DB_EXPORT_JSON,
  DB_EXPORT_CSV,
  // Database - Import
  DB_IMPORT_JSON,
  DB_IMPORT_CSV,
  // Database - Trash
  DB_GET_TRASH,
  DB_RESTORE_NODE,
  DB_EMPTY_TRASH,
  // Database - Lost & Found
  DB_GET_ORPHANED_NODES,
  DB_REPARENT_TO_ROOT,
  // Database - Tags
  DB_GET_ALL_TAGS,
  DB_GET_NODES_BY_TAG,
  // Database - Workspaces
  DB_GET_WORKSPACES,
  DB_GET_WORKSPACE,
  DB_CREATE_WORKSPACE,
  DB_UPDATE_WORKSPACE,
  DB_DELETE_WORKSPACE,
  // Database - Backups & Reload
  DB_BACKUP,
  DB_LIST_BACKUPS,
  DB_RESTORE_BACKUP,
  DB_RELOAD,
  DB_REPAIR_WORKSPACES,
  DB_GET_DATA_PATH,
  // Database - Node Tables
  DB_GET_NODE_TABLE,
  DB_CREATE_NODE_TABLE,
  DB_UPDATE_NODE_TABLE,
  DB_DELETE_NODE_TABLE,
  DB_GET_TABLE_CELLS,
  DB_SET_CELLS,
  DB_CLEAR_CELLS,
  // Database - Settings
  DB_GET_SETTING,
  DB_GET_ALL_SETTINGS,
  DB_SET_SETTING,
  DB_SET_SETTINGS,
  DB_DELETE_SETTING,
  // Shell
  SHELL_OPEN_EXTERNAL,
  // Window
  WINDOW_OPEN_DETACHED,
  WINDOW_CLOSE_DETACHED,
  // Ollama
  OLLAMA_GENERATE,
  OLLAMA_TEST_CONNECTION,
  OLLAMA_LIST_MODELS,
  // OpenAI
  OPENAI_GENERATE,
  OPENAI_TEST_CONNECTION,
  OPENAI_LIST_MODELS,
  // App
  APP_GET_VERSION,
  // Menu Events
  MENU_UNDO,
  MENU_REDO,
  OPEN_SETTINGS,
  SHOW_SHORTCUTS,
  // App Lifecycle
  APP_BEFORE_QUIT,
} = require('./ipcChannels')

let mainWindow
let db
const detachedWindows = new Map() // Track open detached windows by nodeId

/**
 * Create common BrowserWindow configuration with optional overrides.
 * @param {Object} options - Window-specific options to merge
 * @returns {Object} Complete BrowserWindow configuration
 */
function createWindowConfig(options = {}) {
  const baseConfig = {
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../assets/icon.png'),
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
        : `file://${path.join(__dirname, '../dist/index.html')}`

    if (!url.startsWith(appUrl) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow(
    createWindowConfig({
      width: 1400,
      height: 900,
    })
  )

  // Set Content Security Policy (stricter in production)
  const isDev = process.env.NODE_ENV === 'development'
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:*"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
        ],
      },
    })
  })

  setupExternalLinkHandling(mainWindow)

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
    detachedWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { detached: String(nodeId) },
    })
  }

  return { success: true, focused: false }
}

function createMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  mainWindow?.webContents.send(OPEN_SETTINGS)
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            mainWindow?.webContents.send(MENU_UNDO)
          },
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            mainWindow?.webContents.send(MENU_REDO)
          },
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
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
        { role: 'togglefullscreen' },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core')
          },
        },
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core#readme')
          },
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            mainWindow?.webContents.send(SHOW_SHORTCUTS)
          },
        },
        { type: 'separator' },
        {
          label: 'Release Notes',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core/releases')
          },
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/sorenwacker/graph-core/issues')
          },
        },
        { type: 'separator' },
        {
          label: 'Ollama Setup',
          click: async () => {
            await shell.openExternal('https://ollama.ai/download')
          },
        },
        {
          label: 'Ollama Models',
          click: async () => {
            await shell.openExternal('https://ollama.ai/library')
          },
        },
      ],
    },
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
app.on('before-quit', event => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(APP_BEFORE_QUIT)
  }
})

// IPC Handlers - Node CRUD
ipcMain.handle(DB_GET_NODES, (event, params) => db.getNodes(params))
ipcMain.handle(DB_GET_NODE, (event, id) => db.getNode(id))
ipcMain.handle(DB_CREATE_NODE, (event, data) => db.createNode(data))
ipcMain.handle(DB_UPDATE_NODE, (event, id, data) => db.updateNode(id, data))
ipcMain.handle(DB_DELETE_NODE, (event, id, hard) => db.deleteNode(id, hard))

// Tree operations
ipcMain.handle(DB_GET_ROOTS, (event, workspaceId) => db.getRoots(workspaceId))
ipcMain.handle(DB_GET_PROJECTS, () => db.getProjects())
ipcMain.handle(DB_GET_INBOX, () => db.getInbox())
ipcMain.handle(DB_GET_RECENT, (event, limit, workspaceId) => db.getRecent(limit, workspaceId))
ipcMain.handle(DB_GET_FAVORITES, (event, workspaceId) => db.getFavorites(workspaceId))
ipcMain.handle(DB_GET_TASKS, (event, params) => db.getTasks(params))
ipcMain.handle(DB_GET_CHILDREN, (event, id, type) => db.getChildren(id, type))
ipcMain.handle(DB_GET_DESCENDANTS, (event, id, maxDepth) => db.getDescendants(id, maxDepth))
ipcMain.handle(DB_GET_DESCENDANTS_BATCH, (event, rootIds) => {
  const result = db.getDescendantsBatch(rootIds)
  // Convert Map to plain object for IPC serialization
  return Object.fromEntries(result)
})
ipcMain.handle(DB_GET_ANCESTORS, (event, id) => db.getAncestors(id))
ipcMain.handle(DB_MOVE_NODE, (event, id, newParentId) => db.moveNode(id, newParentId))

// Links
ipcMain.handle(DB_LINK_NODES, (event, sourceId, targetId) => db.linkNodes(sourceId, targetId))
ipcMain.handle(DB_UNLINK_NODES, (event, sourceId, targetId) => db.unlinkNodes(sourceId, targetId))
ipcMain.handle(DB_GET_ALL_LINKS, (event, nodeIds) => db.getAllLinks(nodeIds))
ipcMain.handle(DB_GET_LINKED_NODES, (event, id) => db.getLinkedNodes(id))

// Tree view
ipcMain.handle(DB_GET_TREE, (event, rootId) => db.getTree(rootId))

// Search
ipcMain.handle(DB_SEARCH, (event, query, type, workspaceId, options) => db.search(query, type, workspaceId, options))
ipcMain.handle(DB_SEARCH_COUNT, (event, query, type, workspaceId, options) =>
  db.searchCount(query, type, workspaceId, options)
)

// Reorder
ipcMain.handle(DB_REORDER_NODE, (event, nodeId, targetId, position) => db.reorderNode(nodeId, targetId, position))

// Export
ipcMain.handle(DB_EXPORT_MARKDOWN, (event, nodeId) => db.exportMarkdown(nodeId))
ipcMain.handle(DB_EXPORT_JSON, (event, nodeId, options) => db.exportJSON(nodeId, options))
ipcMain.handle(DB_EXPORT_CSV, (event, nodeId, workspaceId) => db.exportCSV(nodeId, workspaceId))

// Import
ipcMain.handle(DB_IMPORT_JSON, (event, data, targetParentId, workspaceId) =>
  db.importJSON(data, targetParentId, workspaceId)
)
ipcMain.handle(DB_IMPORT_CSV, (event, csvData, targetParentId, workspaceId) =>
  db.importCSV(csvData, targetParentId, workspaceId)
)

// Trash
ipcMain.handle(DB_GET_TRASH, (event, limit) => db.getTrash(limit))
ipcMain.handle(DB_RESTORE_NODE, (event, id) => db.restoreNode(id))
ipcMain.handle(DB_EMPTY_TRASH, () => db.emptyTrash())

// Lost & Found
ipcMain.handle(DB_GET_ORPHANED_NODES, () => db.getOrphanedNodes())
ipcMain.handle(DB_REPARENT_TO_ROOT, (event, id) => db.reparentToRoot(id))

// Tags
ipcMain.handle(DB_GET_ALL_TAGS, (event, workspaceId) => db.getAllTags(workspaceId))
ipcMain.handle(DB_GET_NODES_BY_TAG, (event, tag, workspaceId, options) => db.getNodesByTag(tag, workspaceId, options))

// =========================================
// WORKSPACES
// =========================================
ipcMain.handle(DB_GET_WORKSPACES, () => db.getWorkspaces())
ipcMain.handle(DB_GET_WORKSPACE, (event, id) => db.getWorkspace(id))
ipcMain.handle(DB_CREATE_WORKSPACE, (event, data) => db.createWorkspace(data))
ipcMain.handle(DB_UPDATE_WORKSPACE, (event, id, data) => db.updateWorkspace(id, data))
ipcMain.handle(DB_DELETE_WORKSPACE, (event, id) => db.deleteWorkspace(id))

// =========================================
// DATABASE BACKUPS & RELOAD
// =========================================
ipcMain.handle(DB_BACKUP, (event, suffix) => db.backup(suffix))
ipcMain.handle(DB_LIST_BACKUPS, () => db.listBackups())
ipcMain.handle(DB_RESTORE_BACKUP, (event, backupPath) => db.restoreBackup(backupPath))
ipcMain.handle(DB_RELOAD, () => db.reload())
ipcMain.handle(DB_REPAIR_WORKSPACES, () => db.repairWorkspaces())
ipcMain.handle(DB_GET_DATA_PATH, () => app.getPath('userData'))

// =========================================
// NODE TABLES
// =========================================
ipcMain.handle(DB_GET_NODE_TABLE, (event, nodeId) => db.getNodeTable(nodeId))
ipcMain.handle(DB_CREATE_NODE_TABLE, (event, nodeId, data) => db.createNodeTable(nodeId, data))
ipcMain.handle(DB_UPDATE_NODE_TABLE, (event, nodeId, data) => db.updateNodeTable(nodeId, data))
ipcMain.handle(DB_DELETE_NODE_TABLE, (event, nodeId) => db.deleteNodeTable(nodeId))
ipcMain.handle(DB_GET_TABLE_CELLS, (event, nodeId) => db.getTableCells(nodeId))
ipcMain.handle(DB_SET_CELLS, (event, nodeId, cells) => db.setCells(nodeId, cells))
ipcMain.handle(DB_CLEAR_CELLS, (event, nodeId) => db.clearCells(nodeId))

// =========================================
// SETTINGS
// =========================================
ipcMain.handle(DB_GET_SETTING, (event, key) => db.getSetting(key))
ipcMain.handle(DB_GET_ALL_SETTINGS, () => db.getAllSettings())
ipcMain.handle(DB_SET_SETTING, (event, key, value) => db.setSetting(key, value))
ipcMain.handle(DB_SET_SETTINGS, (event, settings) => db.setSettings(settings))
ipcMain.handle(DB_DELETE_SETTING, (event, key) => db.deleteSetting(key))

// =========================================
// SHELL
// =========================================
ipcMain.handle(SHELL_OPEN_EXTERNAL, (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return shell.openExternal(url)
  }
})

// =========================================
// DETACHED WINDOWS
// =========================================
ipcMain.handle(WINDOW_OPEN_DETACHED, (event, nodeId, nodeTitle) => {
  return createDetachedWindow(nodeId, nodeTitle)
})

ipcMain.handle(WINDOW_CLOSE_DETACHED, (event, nodeId) => {
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
// HTTP CLIENT
// =========================================

/**
 * Unified HTTP client that handles both standard requests (via Electron's net module)
 * and requests requiring SSL verification bypass (via Node's http/https modules).
 */
class HttpClient {
  /**
   * Create an HttpClient instance.
   * @param {Object} config - Client configuration
   * @param {string} config.errorPrefix - Prefix for error messages (default: 'API')
   * @param {string} config.connectionError - Custom connection refused message
   */
  constructor(config = {}) {
    this.errorPrefix = config.errorPrefix || 'API'
    this.connectionError = config.connectionError || 'Cannot connect to API endpoint'
  }

  /**
   * Check if a hostname is localhost (safe for SSL bypass).
   * @param {string} hostname - The hostname to check
   * @returns {boolean} True if localhost
   */
  static isLocalhost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local')
  }

  /**
   * Parse response data, attempting JSON parse first.
   * @param {string} data - Raw response data
   * @returns {Object|string} Parsed JSON or raw string
   */
  static parseResponse(data) {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }

  /**
   * Create an error with status code and data attached.
   * @param {string} prefix - Error message prefix
   * @param {number} statusCode - HTTP status code
   * @param {string} responseData - Raw response data
   * @returns {Error} Error with statusCode and data properties
   */
  static createHttpError(prefix, statusCode, responseData) {
    const error = new Error(`${prefix} error: ${statusCode}`)
    error.statusCode = statusCode
    error.data = HttpClient.parseResponse(responseData)
    return error
  }

  /**
   * Handle request errors with appropriate messages.
   * @param {Error} error - Original error
   * @param {string} connectionError - Custom connection error message
   * @param {boolean} includeSslHint - Whether to include SSL hint for cert errors
   * @returns {Error} Processed error
   */
  static handleRequestError(error, connectionError, includeSslHint = false) {
    if (error.code === 'ECONNREFUSED') {
      return new Error(connectionError)
    }
    if (
      includeSslHint &&
      (error.message?.includes('SSL') ||
        error.message?.includes('ERR_SSL') ||
        error.message?.includes('CERT') ||
        error.message?.includes('certificate'))
    ) {
      return new Error(
        `SSL/TLS error: ${error.message}. For self-signed certificates, enable "Skip SSL verification" in settings.`
      )
    }
    return error
  }

  /**
   * Make an HTTP request using Node's http/https modules.
   * Allows SSL verification bypass for localhost.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object|string>} Response data
   */
  requestWithNode(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options

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
        rejectUnauthorized: !HttpClient.isLocalhost(urlObj.hostname),
      }

      if (body) {
        const bodyStr = JSON.stringify(body)
        requestOptions.headers['Content-Type'] = 'application/json'
        requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr)
      }

      const request = transport.request(requestOptions, response => {
        let responseData = ''

        response.on('data', chunk => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(HttpClient.parseResponse(responseData))
          } else {
            reject(HttpClient.createHttpError(this.errorPrefix, response.statusCode, responseData))
          }
        })
      })

      request.on('error', error => {
        reject(HttpClient.handleRequestError(error, this.connectionError, false))
      })

      if (body) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  /**
   * Make an HTTP request using Electron's net module.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object|string>} Response data
   */
  requestWithNet(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options

    return new Promise((resolve, reject) => {
      const request = net.request({ method, url })

      Object.entries(headers).forEach(([key, value]) => {
        request.setHeader(key, value)
      })
      if (body) {
        request.setHeader('Content-Type', 'application/json')
      }

      let responseData = ''

      request.on('response', response => {
        response.on('data', chunk => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(HttpClient.parseResponse(responseData))
          } else {
            reject(HttpClient.createHttpError(this.errorPrefix, response.statusCode, responseData))
          }
        })
      })

      request.on('error', error => {
        reject(HttpClient.handleRequestError(error, this.connectionError, true))
      })

      if (body) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  /**
   * Make an HTTP request.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @param {string} options.method - HTTP method (default: 'GET')
   * @param {Object} options.body - Request body (will be JSON stringified)
   * @param {Object} options.headers - Additional headers
   * @param {boolean} options.skipSslVerification - Skip SSL certificate verification
   * @returns {Promise<Object|string>} Response data
   */
  request(url, options = {}) {
    const { skipSslVerification = false, ...requestOptions } = options

    if (skipSslVerification && url.startsWith('https://')) {
      return this.requestWithNode(url, requestOptions)
    }
    return this.requestWithNet(url, requestOptions)
  }
}

/**
 * Generic HTTP request function (convenience wrapper).
 * @param {string} url - Full URL to request
 * @param {Object} options - Request options
 * @returns {Promise<Object|string>} Response data
 */
function httpRequest(url, options = {}) {
  const { errorPrefix, connectionError, ...requestOptions } = options
  const client = new HttpClient({ errorPrefix, connectionError })
  return client.request(url, requestOptions)
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
    connectionError: 'Ollama is not running. Start with: ollama serve',
  })
}

ipcMain.handle(OLLAMA_GENERATE, async (event, { prompt, content, model, endpoint, contextSize }) => {
  const fullPrompt = `${prompt}\n\n---\n\n${content}`

  try {
    const response = await ollamaRequest(endpoint, '/api/generate', {
      method: 'POST',
      body: {
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          num_ctx: contextSize || 32768,
        },
      },
    })
    return response.response
  } catch (error) {
    if (error.statusCode === 404 && error.data?.error?.includes('not found')) {
      throw new Error(`Model not available. Run: ollama pull ${model}`)
    }
    throw error
  }
})

ipcMain.handle(OLLAMA_TEST_CONNECTION, async (event, endpoint) => {
  try {
    await ollamaRequest(endpoint, '/api/tags')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
})

ipcMain.handle(OLLAMA_LIST_MODELS, async (event, endpoint) => {
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
    skipSslVerification: options.skipSslVerification,
  })
}

ipcMain.handle(OPENAI_GENERATE, async (event, { prompt, content, model, endpoint, apiKey, skipSslVerification }) => {
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
          { role: 'user', content: content },
        ],
        stream: false,
      },
      skipSslVerification,
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

ipcMain.handle(OPENAI_TEST_CONNECTION, async (event, endpoint, apiKey, skipSslVerification) => {
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
      error: error.message,
    }
  }
})

ipcMain.handle(OPENAI_LIST_MODELS, async (event, endpoint, apiKey, skipSslVerification) => {
  if (!apiKey) {
    throw new Error('API key is required')
  }
  const response = await openaiRequest(endpoint, '/models', apiKey, { skipSslVerification })
  return (response.data || []).map(m => m.id).sort()
})

// App info
ipcMain.handle(APP_GET_VERSION, () => app.getVersion())
