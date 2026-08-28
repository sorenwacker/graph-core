import { describe, it, expect, beforeEach } from 'vitest'

/**
 * The capture window has to float over whatever is on screen, including a macOS
 * app in native fullscreen (docs/guides/quick-capture.md).
 *
 * On macOS a fullscreen window owns its own Space. Showing an ordinary window
 * while one is active makes the system switch away from that Space, which
 * leaves the fullscreen window blank - the app looks broken until you switch
 * back. Asking for overlay behaviour explicitly is what avoids it, so these
 * assertions guard the flags rather than the appearance.
 */

const created = []

class FakeWindow {
  constructor(config) {
    this.config = config
    this.calls = []
    this.destroyed = false
    created.push(this)
  }
  on() {}
  loadURL() {}
  loadFile() {}
  getSize() {
    return [560, 68]
  }
  setPosition() {}
  show() {}
  focus() {}
  hide() {}
  isDestroyed() {
    return this.destroyed
  }
  setVisibleOnAllWorkspaces(visible, options) {
    this.calls.push(['setVisibleOnAllWorkspaces', visible, options])
  }
  setAlwaysOnTop(onTop, level) {
    this.calls.push(['setAlwaysOnTop', onTop, level])
  }
}

const deps = {
  BrowserWindow: FakeWindow,
  globalShortcut: { register: () => true, unregister: () => {} },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
}

const { createQuickCapture } = await import('../../electron/quickCapture.js')

beforeEach(() => {
  created.length = 0
})

function build(platform) {
  createQuickCapture({ getAccelerator: () => null, deps, platform }).show()
  return created[0]
}

describe('on macOS', () => {
  it('stays visible over a fullscreen Space instead of switching away from it', () => {
    const win = build('darwin')
    const call = win.calls.find(c => c[0] === 'setVisibleOnAllWorkspaces')
    expect(call).toBeTruthy()
    expect(call[1]).toBe(true)
    expect(call[2]).toMatchObject({ visibleOnFullScreen: true })
  })

  it('sits at a window level above a fullscreen window', () => {
    const win = build('darwin')
    const call = win.calls.find(c => c[0] === 'setAlwaysOnTop')
    expect(call).toBeTruthy()
    expect(call[1]).toBe(true)
    // 'floating' is not above a fullscreen Space; 'screen-saver' is.
    expect(call[2]).toBe('screen-saver')
  })

  it('never takes a Space of its own', () => {
    expect(build('darwin').config).toMatchObject({ fullscreenable: false })
  })
})

describe('on other platforms', () => {
  it('still builds a window and asks for none of the macOS overlay behaviour', () => {
    const win = build('win32')
    expect(win).toBeTruthy()
    expect(win.calls.find(c => c[0] === 'setVisibleOnAllWorkspaces')).toBeUndefined()
  })
})
