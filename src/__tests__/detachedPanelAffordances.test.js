import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailPanel from '../components/DetailPanel.vue'

/**
 * A detached window hosts the DetailPanel on its own. Pin, fullscreen, detach
 * and link-search have no meaning there: DetachedView answers three of them
 * with empty handlers and does not handle detach at all, so the buttons look
 * live and do nothing. Hide them rather than wiring handlers that cannot work.
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

// The detach button is gated on running under Electron; without this the
// "no detach button" assertion would pass for the wrong reason.
window.electronAPI = { openDetachedWindow: () => {} }

const NODE = { id: 1, title: 'A note', type: 'note', notes: '', children: [] }

function render(props) {
  return mount(DetailPanel, {
    props: { node: NODE, width: 400, workspaces: [], ...props },
    global: {
      stubs: {
        NotesEditor: true,
        NotesAIToolbar: true,
        MarkdownRenderer: true,
        NodeSpreadsheet: true,
        ChildrenSection: true,
        MetadataGridSection: true,
        PersonDetailForm: true,
        OrganizationDetailForm: true,
        TagInput: true,
      },
    },
  })
}

describe('in a detached window', () => {
  const w = () => render({ detached: true, fullscreen: true })

  it('offers no pin button', () => {
    expect(w().find('.pin-btn').exists()).toBe(false)
  })

  it('offers no detach button, since it is already detached', () => {
    expect(w().find('.detach-btn').exists()).toBe(false)
  })

  it('offers no fullscreen toggle', () => {
    expect(w().find('.fullscreen-btn').exists()).toBe(false)
  })

  it('still offers close', () => {
    expect(w().find('.close-btn').exists()).toBe(true)
  })

  it('tells the metadata section it is detached, so link search is hidden too', () => {
    expect(w().findComponent({ name: 'MetadataGridSection' }).props('detached')).toBe(true)
  })
})

describe('in the main window', () => {
  const w = () => render({ detached: false })

  it('still offers pin and fullscreen', () => {
    expect(w().find('.pin-btn').exists()).toBe(true)
    expect(w().find('.fullscreen-btn').exists()).toBe(true)
  })
})
