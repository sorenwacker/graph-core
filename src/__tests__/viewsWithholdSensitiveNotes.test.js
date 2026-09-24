import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

/**
 * No view may put a sensitive note's text on screen, whatever route the node
 * took to reach it (docs/architecture/sensitive-notes.md). The read path
 * withholds the text, but a view that is handed a node still carrying it - a
 * stale copy, a broadcast from another window, a local edit - must refuse it
 * too. One test per view, so a new view cannot quietly opt out.
 */

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: { name: 'AgGridVue', inheritAttrs: false, setup: () => () => null },
}))
vi.mock('cytoscape', () => {
  const chain = new Proxy(function () {}, {
    get: (_t, p) => (p === 'then' ? undefined : p === 'length' ? 0 : chain),
    apply: () => chain,
  })
  const cy = () => chain
  cy.use = () => {}
  return { default: cy }
})
vi.mock('../services/api', () => ({
  api: new Proxy({}, { get: () => vi.fn(async () => []) }),
}))
vi.mock('../services/api.js', () => ({
  api: new Proxy({}, { get: () => vi.fn(async () => []) }),
}))

const SECRET = 'zebra-crossing-7731'

/**
 * A node carrying note text it should never show: flagged sensitive, but with
 * the text still attached, which is exactly the shape a stale or broadcast copy
 * has.
 */
const sensitive = {
  id: 1,
  title: 'Vault',
  type: 'task',
  notes: SECRET,
  notes_sensitive: true,
  has_notes: true,
  children: [],
  tags: [],
  due_date: '2026-09-01',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  workspace_id: 'work',
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})
if (!document.elementFromPoint) document.elementFromPoint = () => null

const VIEWS = [
  ['CardsView', () => import('../components/CardsView.vue'), { nodes: [sensitive] }],
  ['TableView', () => import('../components/TableView.vue'), { nodes: [sensitive] }],
  ['TasksView', () => import('../components/TasksView.vue'), { tasks: [sensitive], nodes: [sensitive] }],
  ['TimelineView', () => import('../components/TimelineView.vue'), { nodes: [sensitive] }],
  ['TrashView', () => import('../components/TrashView.vue'), { nodes: [sensitive], items: [sensitive] }],
  ['PersonsView', () => import('../components/PersonsView.vue'), { workspaceId: 'work', nodes: [sensitive] }],
  ['GraphView', () => import('../components/GraphView.vue'), { nodes: [sensitive] }],
  [
    'SpotlightSearch',
    () => import('../components/SpotlightSearch.vue'),
    { visible: true, searchResults: [sensitive], recentItems: [sensitive] },
  ],
  ['AppSidebar', () => import('../components/AppSidebar.vue'), { nodes: [sensitive], visible: true }],
  ['Breadcrumbs', () => import('../components/Breadcrumbs.vue'), { path: [sensitive] }],
]

describe.each(VIEWS)('%s', (name, load, props) => {
  it('never renders the text of a sensitive note', async () => {
    const target = document.createElement('div')
    target.id = 'view-controls-target'
    document.body.appendChild(target)
    const component = (await load()).default
    const w = mount(component, {
      props,
      attachTo: document.body,
      global: {
        plugins: [createPinia()],
        stubs: { NotesEditor: true, TagsSection: true, NodeSpreadsheet: true },
      },
    })
    for (let i = 0; i < 12; i++) await Promise.resolve()
    await w.vm.$nextTick()

    expect(w.html(), `${name} rendered the note text`).not.toContain(SECRET)
    w.unmount()
    target.remove()
  })
})
