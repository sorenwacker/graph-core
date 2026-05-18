const { app, BrowserWindow, ipcMain, session, shell, net, Menu } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
const Database = require('./database')
const {
  OPEN_SETTINGS,
  SHOW_SHORTCUTS,
  APP_BEFORE_QUIT,
  APP_GET_VERSION,
  MENU_UNDO,
  MENU_REDO,
} = require('./ipcChannels')

// IPC Handler Modules
const { registerDatabaseHandlers } = require('./ipc/database')
const { registerOllamaHandlers } = require('./ipc/ollama')
const { registerOpenaiHandlers } = require('./ipc/openai')
const { registerAgentHandlers } = require('./ipc/agent')
const { registerWindowHandlers, createWindowConfig, setupExternalLinkHandling } = require('./ipc/window')

let mainWindow
let db

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
// WINDOW CREATION
// =========================================

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

// =========================================
// MENU CREATION
// =========================================

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

// =========================================
// APP INITIALIZATION
// =========================================

app.whenReady().then(async () => {
  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'graph.db')
  db = new Database(dbPath)
  await db.ready // Wait for async initialization

  // Register all IPC handlers
  registerDatabaseHandlers(ipcMain, db)
  registerOllamaHandlers(ipcMain, httpRequest)
  registerOpenaiHandlers(ipcMain, httpRequest)
  registerAgentHandlers(ipcMain, httpRequest)
  registerWindowHandlers(ipcMain)

  // App info handler
  ipcMain.handle(APP_GET_VERSION, () => app.getVersion())

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
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(APP_BEFORE_QUIT)
  }
})
