/**
 * Quick capture (docs/guides/quick-capture.md): a system-wide hotkey that opens
 * a small capture window over any app. The window loads the app with a capture
 * query param and creates a root note in the current workspace, then hides.
 *
 * The window is created once and reused (shown/hidden) so capture is instant.
 */

const path = require('path')
const electron = require('electron')
const { createWindowConfig } = require('./ipc/window')

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+N'

/**
 * @param {Object} options
 * @param {Function} options.getAccelerator - Current accelerator from settings.
 * @param {Object} [options.deps] - Electron pieces, injectable so the window
 *   configuration can be asserted without a running Electron.
 * @param {string} [options.platform] - Overridable for the same reason.
 */
function createQuickCapture({ getAccelerator, deps = electron, platform = process.platform }) {
  const { BrowserWindow, globalShortcut, screen } = deps
  let captureWindow = null
  let registeredAccelerator = null

  function buildWindow() {
    const win = new BrowserWindow(
      createWindowConfig({
        width: 560,
        height: 68,
        frame: false,
        resizable: false,
        movable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        titleBarStyle: 'default',
        // Never let it take a Space of its own.
        fullscreenable: false,
      })
    )

    if (platform === 'darwin') {
      // A macOS fullscreen window owns its own Space. Showing an ordinary
      // window while one is active makes the system switch away from that
      // Space, leaving the fullscreen window blank - the app looks broken.
      // Marking the capture window visible on all workspaces, at a level above
      // fullscreen, makes it float over that Space instead of displacing it.
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setAlwaysOnTop(true, 'screen-saver')
    }
    // Hiding on blur makes the window feel like a spotlight overlay.
    win.on('blur', () => win.hide())
    win.on('closed', () => {
      captureWindow = null
    })

    if (process.env.NODE_ENV === 'development') {
      win.loadURL('http://localhost:9743?capture=1')
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { capture: '1' } })
    }
    return win
  }

  function show() {
    if (!captureWindow || captureWindow.isDestroyed()) {
      captureWindow = buildWindow()
    }
    // Center horizontally near the top of the active display.
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { x, y, width } = display.workArea
    const [w] = captureWindow.getSize()
    captureWindow.setPosition(Math.round(x + (width - w) / 2), Math.round(y + 120))
    captureWindow.show()
    captureWindow.focus()
  }

  function hide() {
    if (captureWindow && !captureWindow.isDestroyed()) captureWindow.hide()
  }

  /** Register (or re-register) the global hotkey from the current setting. */
  function register() {
    unregister()
    const accelerator = getAccelerator() || DEFAULT_ACCELERATOR
    try {
      const ok = globalShortcut.register(accelerator, show)
      registeredAccelerator = ok ? accelerator : null
      return ok
    } catch {
      registeredAccelerator = null
      return false
    }
  }

  function unregister() {
    if (registeredAccelerator) {
      try {
        globalShortcut.unregister(registeredAccelerator)
      } catch {
        // ignore
      }
      registeredAccelerator = null
    }
  }

  return { show, hide, register, unregister }
}

module.exports = { createQuickCapture, DEFAULT_ACCELERATOR }
