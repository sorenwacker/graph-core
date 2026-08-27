const { app, BrowserWindow, ipcMain, session, shell, Menu, safeStorage, systemPreferences } = require('electron')
const path = require('path')
const Database = require('./database')
const {
  OPEN_SETTINGS,
  SHOW_SHORTCUTS,
  APP_BEFORE_QUIT,
  APP_QUIT_SAVE_DONE,
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
const { registerSecurityHandlers, readSecurityConfig } = require('./ipc/security')
const { createKeyManager } = require('./database/keyManager')
const { registerSensitiveNotesHandlers, SENSITIVE_SETTINGS_KEY } = require('./ipc/sensitiveNotes')
const { createSensitiveSession } = require('./database/sensitiveSession')
const {
  SENSITIVE_LOCKED_EVENT,
  CAPTURE_HIDE,
  CAPTURE_SAVED_EVENT,
  CAPTURE_GET_CONFIG,
  CAPTURE_SET_CONFIG,
} = require('./ipcChannels')
const { createQuickCapture, DEFAULT_ACCELERATOR } = require('./quickCapture')
const { isEncrypted } = require('./database/encryption')

let mainWindow
let db

// =========================================
// TWO-PHASE QUIT / CLOSE SAVE
// =========================================

// Hold the first quit (or window close) attempt, tell the renderer to flush its
// unsaved edits (autosave), and resume once it acks via APP_QUIT_SAVE_DONE. The
// wait is bounded by a timeout so a hung renderer can never block quit forever.
const QUIT_SAVE_TIMEOUT_MS = 3000
let quitSaveHandled = false
let pendingQuitSaveDone = null
// The single in-flight save request, if any: { callbacks, timeoutId, done }.
let pendingSaveRequest = null

/**
 * Ask the renderer to flush unsaved edits, then run `onDone`.
 *
 * Only one request is ever in flight: a second caller (e.g. Cmd+Q while a
 * window close is already waiting) joins the pending one instead of sending a
 * second APP_BEFORE_QUIT, and its callback runs off the same ack/timeout.
 * @param {Electron.BrowserWindow} win - Window whose renderer should save
 * @param {Function} onDone - Called once, after the ack or the timeout
 */
function requestRendererSave(win, onDone) {
  if (pendingSaveRequest) {
    pendingSaveRequest.callbacks.push(onDone)
    return
  }

  const request = { callbacks: [onDone], timeoutId: null, done: false }
  const finish = () => {
    if (request.done) return
    request.done = true
    clearTimeout(request.timeoutId)
    pendingSaveRequest = null
    pendingQuitSaveDone = null
    for (const callback of request.callbacks) callback()
  }

  request.timeoutId = setTimeout(finish, QUIT_SAVE_TIMEOUT_MS)
  pendingSaveRequest = request
  pendingQuitSaveDone = finish
  win.webContents.send(APP_BEFORE_QUIT)
}

/**
 * Run the save handshake when the user closes the window.
 *
 * On Linux/Windows the close destroys the window before `window-all-closed`
 * calls app.quit(), so by the time `before-quit` runs there is no renderer left
 * to ask - without this hook the handshake would only ever cover menu/Cmd+Q.
 * The close is deferred once, then re-issued after the renderer acks.
 * @param {Electron.BrowserWindow} win - Window to guard
 */
function setupSaveOnClose(win) {
  let saveDone = false
  win.on('close', event => {
    if (saveDone || quitSaveHandled) return
    if (win.isDestroyed() || win.webContents.isDestroyed()) return

    event.preventDefault()
    requestRendererSave(win, () => {
      saveDone = true
      if (!win.isDestroyed()) win.close()
    })
  })
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
  setupSaveOnClose(mainWindow)

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
  const dbPath = path.join(app.getPath('userData'), 'graph.db')
  const securityConfigPath = path.join(app.getPath('userData'), 'security.json')
  const keyManager = createKeyManager({ safeStorage })

  // Construct the database and register the handlers that need it. Runs at
  // boot for a plaintext or keychain-unlockable file, and from the unlock
  // handler otherwise (docs/architecture/encryption.md, "Unlock flow").
  // The sensitive session is held here so its idle relock and the disable flow
  // can reach it (docs/architecture/sensitive-notes.md).
  let sensitiveSession = null
  function makeSensitiveSession(wrappedKey) {
    return createSensitiveSession({
      wrappedKey,
      onLock: () => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send(SENSITIVE_LOCKED_EVENT)
      },
    })
  }

  async function finishUnlock(encryptionKey, encryptionSlots) {
    db = new Database(dbPath, { encryptionKey, encryptionSlots })
    await db.ready
    // Restore the sensitive-notes session (locked) if the feature was enabled.
    const wrappedB64 = db.getSetting(SENSITIVE_SETTINGS_KEY)
    if (wrappedB64) {
      sensitiveSession = makeSensitiveSession(Buffer.from(wrappedB64, 'base64'))
      db.sensitiveSession = sensitiveSession
    }
    registerDatabaseHandlers(ipcMain, db)
    setupQuickCapture()
    return db
  }

  // Quick capture (docs/guides/quick-capture.md): a global hotkey and reusable
  // capture window. Registered after the database is available so the
  // accelerator setting can be read on an unlocked database.
  let quickCapture = null
  function setupQuickCapture() {
    if (quickCapture) {
      quickCapture.register()
      return
    }
    quickCapture = createQuickCapture({
      getAccelerator: () => (db ? db.getSetting('quickCaptureAccelerator') : null),
    })
    applyCaptureRegistration()
    ipcMain.handle(CAPTURE_HIDE, () => {
      quickCapture.hide()
      // Tell the main window to refresh so the captured note appears.
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CAPTURE_SAVED_EVENT)
    })
    ipcMain.handle(CAPTURE_GET_CONFIG, () => ({
      enabled: db.getSetting('quickCaptureEnabled') !== 'false',
      accelerator: db.getSetting('quickCaptureAccelerator') || DEFAULT_ACCELERATOR,
    }))
    ipcMain.handle(CAPTURE_SET_CONFIG, (_event, { enabled, accelerator }) => {
      db.setSetting('quickCaptureEnabled', enabled ? 'true' : 'false')
      if (accelerator) db.setSetting('quickCaptureAccelerator', accelerator)
      const ok = applyCaptureRegistration()
      return { success: ok || !enabled, registered: ok }
    })
  }

  // Register the hotkey when enabled, else clear it. Returns whether a hotkey
  // is now active.
  function applyCaptureRegistration() {
    if (db.getSetting('quickCaptureEnabled') === 'false') {
      quickCapture.unregister()
      return false
    }
    return quickCapture.register()
  }

  // Silent unlock attempt: keychain slot, optionally gated by Touch ID.
  let bootKey = null
  let bootSlots = []
  let locked = false
  const fsSync = require('fs')
  if (fsSync.existsSync(dbPath)) {
    const head = fsSync.readFileSync(dbPath)
    if (isEncrypted(head)) {
      let key = keyManager.unlockWithKeychain(head)
      const config = readSecurityConfig(securityConfigPath)
      if (key && config.touchIdGate && process.platform === 'darwin') {
        try {
          await systemPreferences.promptTouchID('unlock your Graph Core database')
        } catch {
          // Declined or failed: fall through to the password unlock screen.
          key = null
        }
      }
      if (key) {
        bootKey = key
        const { readSlots } = require('./database/encryption')
        bootSlots = readSlots(head)
      } else {
        locked = true
      }
    }
  }

  if (!locked) {
    await finishUnlock(bootKey, bootSlots)
  }

  // Handlers that work without the database.
  registerSecurityHandlers(ipcMain, {
    getDb: () => db,
    finishUnlock,
    dbPath,
    configPath: securityConfigPath,
    keyManager,
    systemPreferences,
  })
  registerSensitiveNotesHandlers(ipcMain, {
    getDb: () => db,
    getSession: () => sensitiveSession,
    setSession: session => {
      sensitiveSession = session
      if (db) db.sensitiveSession = session
    },
    createSession: makeSensitiveSession,
    isDatabaseEncrypted: () => Boolean(db && db.encryptionKey),
    verifyRecoveryPassword: password => {
      const fileBuffer = fsSync.readFileSync(dbPath)
      if (isEncrypted(fileBuffer)) keyManager.unlockWithPassword(fileBuffer, password)
    },
  })
  registerOllamaHandlers(ipcMain, httpRequest)
  registerOpenaiHandlers(ipcMain, httpRequest)
  registerAgentHandlers(ipcMain, httpRequest)
  registerWindowHandlers(ipcMain)

  // Renderer ack that pre-quit autosave finished (see the before-quit handler)
  ipcMain.handle(APP_QUIT_SAVE_DONE, () => {
    if (pendingQuitSaveDone) pendingQuitSaveDone()
  })

  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  const { globalShortcut } = require('electron')
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', event => {
  if (quitSaveHandled) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    // No renderer to save; let the quit proceed normally.
    quitSaveHandled = true
    return
  }

  event.preventDefault()
  requestRendererSave(mainWindow, () => {
    quitSaveHandled = true
    app.quit()
  })
})
