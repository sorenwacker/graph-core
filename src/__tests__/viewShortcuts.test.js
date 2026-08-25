import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts.js'
import { viewModes } from '../utils/viewConfig.js'

/**
 * Cmd/Ctrl + digit switches the main view, in the order the view switcher
 * renders. Before this existed there was no keyboard path between views at all.
 */

let state
let actions
let handleKeydown

beforeEach(() => {
  document.body.innerHTML = `
    <div id="outside" tabindex="0"></div>
    <div class="node-spreadsheet" data-owns-keys><div id="cell" class="ag-cell"></div></div>
    <input id="field" />
  `
  actions = {
    openSearch: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    showAddNodeModal: vi.fn(),
    deleteSelectedNodes: vi.fn(),
    deleteNode: vi.fn(),
    goToParent: vi.fn(),
    goToFirstChild: vi.fn(),
    goToPrevSibling: vi.fn(),
    goToNextSibling: vi.fn(),
    toggleDetailPanel: vi.fn(),
    clearSelection: vi.fn(),
    selectAll: vi.fn(),
    enterContainer: vi.fn(),
    openDetachedWindow: vi.fn(),
    showShortcuts: vi.fn(),
    selectNode: vi.fn(),
  }
  state = {
    viewMode: ref('graph'),
    selectedNode: ref(null),
    selectedIds: ref(new Set()),
    currentContainerId: ref(1),
    fullscreenDetail: ref(false),
    detailPinned: ref(false),
    showDetail: ref(false),
    flatChildren: ref([]),
    filteredChildren: ref([]),
    gridColumns: ref(1),
  }
  handleKeydown = useKeyboardShortcuts({ actions, state }).handleKeydown
})

afterEach(() => {
  document.body.innerHTML = ''
})

function press(key, target, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...opts })
  Object.defineProperty(event, 'target', { value: target })
  handleKeydown(event)
  return event
}

const outside = () => document.getElementById('outside')

describe('view switching shortcuts', () => {
  it('maps each digit to the view switcher entry at that position', () => {
    viewModes.forEach((view, index) => {
      state.viewMode.value = 'none'

      press(String(index + 1), outside(), { metaKey: true })

      expect(state.viewMode.value, `Cmd+${index + 1} should select "${view.id}"`).toBe(view.id)
    })
  })

  it('works with Ctrl as well as Cmd', () => {
    press('2', outside(), { ctrlKey: true })

    expect(state.viewMode.value).toBe(viewModes[1].id)
  })

  it('prevents the browser default so the digit does not reach the page', () => {
    const event = press('1', outside(), { metaKey: true })

    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a digit past the end of the switcher', () => {
    state.viewMode.value = 'graph'

    press(String(viewModes.length + 1), outside(), { metaKey: true })

    expect(state.viewMode.value).toBe('graph')
  })

  it('does not switch on a bare digit, which would fire while typing', () => {
    state.viewMode.value = 'graph'

    press('2', outside())

    expect(state.viewMode.value).toBe('graph')
  })

  it('does not fire while focus is inside the node spreadsheet', () => {
    state.viewMode.value = 'graph'

    press('2', document.getElementById('cell'), { metaKey: true })

    expect(state.viewMode.value).toBe('graph')
  })

  it('does not fire while typing in a text input', () => {
    state.viewMode.value = 'graph'

    press('2', document.getElementById('field'), { metaKey: true })

    expect(state.viewMode.value).toBe('graph')
  })
})
