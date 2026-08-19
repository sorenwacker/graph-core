import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSpreadsheetKeyboard } from '../composables/useSpreadsheetKeyboard.js'

/**
 * The spreadsheet keyboard handler is registered on document in the capture
 * phase, so it sees every key before AG Grid's cell editor does. It must stand
 * down while an editor is open, otherwise Backspace never reaches the input and
 * the selected range is blanked instead.
 */

let wrapper
let editorInput
let actions

function makeKeyboard(selectionBounds) {
  return useSpreadsheetKeyboard({
    getGridWrapper: () => wrapper,
    getSelectionBounds: () => selectionBounds,
    actions,
    isColumnMenuOpen: () => false,
    isContextMenuOpen: () => false,
  })
}

function keyEvent(key, extra = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  vi.spyOn(event, 'preventDefault')
  vi.spyOn(event, 'stopPropagation')
  return event
}

const singleCell = { minRow: 1, maxRow: 1, minCol: 2, maxCol: 2 }
const range = { minRow: 0, maxRow: 2, minCol: 0, maxCol: 1 }

beforeEach(() => {
  document.body.innerHTML = `
    <div id="wrapper" tabindex="0">
      <div id="cell" class="ag-cell" tabindex="-1">
        <input id="editor" class="ag-input-field-input" />
      </div>
    </div>
  `
  wrapper = document.getElementById('wrapper')
  editorInput = document.getElementById('editor')
  actions = {
    copySelection: vi.fn(),
    pasteSelection: vi.fn(),
    cutSelection: vi.fn(),
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    deleteSelectedCells: vi.fn(),
    fillSelectionWithValue: vi.fn(),
    clearSelection: vi.fn(),
    closeColumnMenu: vi.fn(),
    closeContextMenu: vi.fn(),
  }
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('useSpreadsheetKeyboard with an open cell editor', () => {
  beforeEach(() => editorInput.focus())

  it.each(['Backspace', 'Delete'])('lets %s reach the editor instead of clearing the selection', key => {
    const keyboard = makeKeyboard(singleCell)
    const event = keyEvent(key)

    keyboard.handleKeyDown(event)

    expect(actions.deleteSelectedCells).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not overwrite the selected range when a character is typed into the editor', () => {
    const keyboard = makeKeyboard(range)
    const event = keyEvent('x')

    keyboard.handleKeyDown(event)

    expect(actions.fillSelectionWithValue).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves Cmd+C to the editor so text inside a cell can be copied', () => {
    const keyboard = makeKeyboard(range)
    const event = keyEvent('c', { metaKey: true })

    keyboard.handleKeyDown(event)

    expect(actions.copySelection).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves Escape to the editor so an edit can be cancelled', () => {
    const keyboard = makeKeyboard(singleCell)

    keyboard.handleKeyDown(keyEvent('Escape'))

    expect(actions.clearSelection).not.toHaveBeenCalled()
  })
})

describe('useSpreadsheetKeyboard with no cell editor open', () => {
  beforeEach(() => wrapper.focus())

  it.each(['Backspace', 'Delete'])('clears the selected range on %s', key => {
    const keyboard = makeKeyboard(range)
    const event = keyEvent(key)

    keyboard.handleKeyDown(event)

    expect(actions.deleteSelectedCells).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('types a character into every cell of a multi-cell selection', () => {
    const keyboard = makeKeyboard(range)

    keyboard.handleKeyDown(keyEvent('x'))

    expect(actions.fillSelectionWithValue).toHaveBeenCalledWith('x')
  })

  it('copies the selection on Cmd+C', () => {
    const keyboard = makeKeyboard(range)

    keyboard.handleKeyDown(keyEvent('c', { metaKey: true }))

    expect(actions.copySelection).toHaveBeenCalledTimes(1)
  })

  it('clears the selection on Escape', () => {
    const keyboard = makeKeyboard(range)

    keyboard.handleKeyDown(keyEvent('Escape'))

    expect(actions.clearSelection).toHaveBeenCalledTimes(1)
  })
})
