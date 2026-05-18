const { app, BrowserWindow, ipcMain, session, shell, Menu } = require('electron')
const path = require('path')
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
const { httpRequest } = require('./ipc/httpClient')

let mainWindow
let db

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
