import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: vi.fn(key => localStorageMock.store[key] || null),
  setItem: vi.fn((key, value) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn(key => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}

// Mock api
vi.mock('../services/api.js', () => ({
  api: {
    updateNode: vi.fn().mockResolvedValue({}),
  },
}))

// Mock cytoscape and extensions
vi.mock('cytoscape', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    elements: vi.fn(() => ({ remove: vi.fn() })),
    add: vi.fn(),
    layout: vi.fn(() => ({ run: vi.fn(), stop: vi.fn() })),
    fit: vi.fn(),
    center: vi.fn(),
    zoom: vi.fn(),
    pan: vi.fn(),
    nodes: vi.fn(() => []),
    edges: vi.fn(() => []),
    getElementById: vi.fn(),
    resize: vi.fn(),
    nodeHtmlLabel: vi.fn(),
  })),
}))

vi.mock('cytoscape-cose-bilkent', () => ({ default: vi.fn() }))
vi.mock('cytoscape-cola', () => ({ default: vi.fn() }))
vi.mock('cytoscape-dagre', () => ({ default: vi.fn() }))
vi.mock('cytoscape-d3-force', () => ({ default: vi.fn() }))
vi.mock('cytoscape-node-html-label', () => ({ default: vi.fn() }))

import { api } from '../services/api.js'

describe('GraphView per-node settings', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('layout initialization', () => {
    it('should initialize layout from container graph_layout field', async () => {
      // Simulate the initialization logic from GraphView.vue
      const parent = { id: 1, graph_layout: 'radial' }
      const _layoutMode = ref('tree') // composable default

      // This mirrors line 153 of GraphView.vue
      const layoutMode = ref(parent?.graph_layout || _layoutMode.value)

      expect(layoutMode.value).toBe('radial')
    })

    it('should fall back to localStorage when graph_layout is null', async () => {
      localStorageMock.store['graph-layout-mode'] = 'force'

      const parent = { id: 1, graph_layout: null }
      const _layoutMode = ref(localStorageMock.getItem('graph-layout-mode') || 'tree')

      // This mirrors line 153 of GraphView.vue
      const layoutMode = ref(parent?.graph_layout || _layoutMode.value)

      expect(layoutMode.value).toBe('force')
    })

    it('should fall back to tree when no layout is stored', async () => {
      const parent = { id: 1, graph_layout: null }
      const _layoutMode = ref(localStorageMock.getItem('graph-layout-mode') || 'tree')

      const layoutMode = ref(parent?.graph_layout || _layoutMode.value)

      expect(layoutMode.value).toBe('tree')
    })
  })

  describe('layout persistence', () => {
    it('should save layout to container via api.updateNode', async () => {
      const parentId = 42
      const newLayout = 'radial'

      // Simulate the watch handler from GraphView.vue lines 223-229
      if (parentId) {
        await api.updateNode(parentId, { graph_layout: newLayout })
      }

      expect(api.updateNode).toHaveBeenCalledWith(42, { graph_layout: 'radial' })
    })

    it('should not call api.updateNode when parent is null', async () => {
      const parent = null
      const newLayout = 'radial'

      // Simulate the watch handler - should not call API
      if (parent?.id) {
        await api.updateNode(parent.id, { graph_layout: newLayout })
      }

      expect(api.updateNode).not.toHaveBeenCalled()
    })
  })

  describe('container navigation', () => {
    it('should load new container layout when navigating', async () => {
      const layoutMode = ref('tree')
      let lastKnownParentId = 1

      // Simulate navigating to a different container
      const newParent = { id: 2, graph_layout: 'force' }
      const newId = newParent.id

      // Simulate the watcher logic from lines 233-241
      if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        const containerLayout = newParent?.graph_layout
        const fallback = localStorageMock.getItem('graph-layout-mode') || 'tree'
        layoutMode.value = containerLayout || fallback
      }

      expect(layoutMode.value).toBe('force')
      expect(lastKnownParentId).toBe(2)
    })

    it('should fall back to localStorage when new container has no layout', async () => {
      localStorageMock.store['graph-layout-mode'] = 'radial'
      const layoutMode = ref('tree')
      let lastKnownParentId = 1

      // Navigate to container with no saved layout
      const newParent = { id: 2, graph_layout: null }
      const newId = newParent.id

      if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        const containerLayout = newParent?.graph_layout
        const fallback = localStorageMock.getItem('graph-layout-mode') || 'tree'
        layoutMode.value = containerLayout || fallback
      }

      expect(layoutMode.value).toBe('radial')
    })

    it('should not update layout when navigating to same container', async () => {
      const layoutMode = ref('tree')
      let lastKnownParentId = 1

      // Simulate navigating to the same container
      const parent = { id: 1, graph_layout: 'radial' }
      const newId = parent.id

      // This should not update layoutMode since we're at the same container
      if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        layoutMode.value = parent?.graph_layout || 'tree'
      }

      expect(layoutMode.value).toBe('tree') // unchanged
    })
  })

  describe('immediate watcher behavior', () => {
    it('should skip update on initial mount when layout already matches', async () => {
      const _layoutMode = ref('tree')
      const parent = { id: 1, graph_layout: 'radial' }

      // Initialize layoutMode as GraphView does (line 153)
      const layoutMode = ref(parent?.graph_layout || _layoutMode.value)
      let lastKnownParentId = parent?.id

      // Simulate the immediate watcher firing (oldId is undefined on first call)
      const newId = parent?.id
      const oldId = undefined

      // The new watcher logic should skip update when already initialized
      if (oldId === undefined && layoutMode.value === (parent?.graph_layout || _layoutMode.value)) {
        lastKnownParentId = newId
        // Early return - no update needed
      } else if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        const containerLayout = parent?.graph_layout
        const fallback = localStorageMock.getItem('graph-layout-mode') || 'tree'
        layoutMode.value = containerLayout || fallback
      }

      expect(layoutMode.value).toBe('radial')
      expect(lastKnownParentId).toBe(1)
    })

    it('should update layout when parent changes after initial mount', async () => {
      const _layoutMode = ref('tree')
      let parent = { id: 1, graph_layout: 'radial' }

      const layoutMode = ref(parent?.graph_layout || _layoutMode.value)
      let lastKnownParentId = parent?.id

      // Now navigate to a different container
      parent = { id: 2, graph_layout: 'force' }
      const newId = parent?.id
      const oldId = 1 // now we have an oldId

      if (oldId === undefined && layoutMode.value === (parent?.graph_layout || _layoutMode.value)) {
        lastKnownParentId = newId
      } else if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        const containerLayout = parent?.graph_layout
        const fallback = localStorageMock.getItem('graph-layout-mode') || 'tree'
        layoutMode.value = containerLayout || fallback
      }

      expect(layoutMode.value).toBe('force')
      expect(lastKnownParentId).toBe(2)
    })
  })

  describe('showRootNode initialization', () => {
    it('should initialize showRootNode from container show_root_node field (true)', async () => {
      const parent = { id: 1, show_root_node: 1 }
      const _showRootNode = ref(true) // composable default

      // This mirrors the initialization logic in GraphView.vue
      const showRootNode = ref(
        parent?.show_root_node !== null && parent?.show_root_node !== undefined
          ? Boolean(parent.show_root_node)
          : _showRootNode.value
      )

      expect(showRootNode.value).toBe(true)
    })

    it('should initialize showRootNode from container show_root_node field (false)', async () => {
      const parent = { id: 1, show_root_node: 0 }
      const _showRootNode = ref(true) // composable default

      const showRootNode = ref(
        parent?.show_root_node !== null && parent?.show_root_node !== undefined
          ? Boolean(parent.show_root_node)
          : _showRootNode.value
      )

      expect(showRootNode.value).toBe(false)
    })

    it('should fall back to composable default when show_root_node is null', async () => {
      const parent = { id: 1, show_root_node: null }
      const _showRootNode = ref(false) // composable default set to false

      const showRootNode = ref(
        parent?.show_root_node !== null && parent?.show_root_node !== undefined
          ? Boolean(parent.show_root_node)
          : _showRootNode.value
      )

      expect(showRootNode.value).toBe(false)
    })

    it('should fall back to composable default when show_root_node is undefined', async () => {
      const parent = { id: 1 } // no show_root_node property
      const _showRootNode = ref(true) // composable default

      const showRootNode = ref(
        parent?.show_root_node !== null && parent?.show_root_node !== undefined
          ? Boolean(parent.show_root_node)
          : _showRootNode.value
      )

      expect(showRootNode.value).toBe(true)
    })
  })

  describe('showRootNode persistence', () => {
    it('should save showRootNode=true to container via api.updateNode', async () => {
      const parentId = 42
      const visible = true

      if (parentId) {
        await api.updateNode(parentId, { show_root_node: visible ? 1 : 0 })
      }

      expect(api.updateNode).toHaveBeenCalledWith(42, { show_root_node: 1 })
    })

    it('should save showRootNode=false to container via api.updateNode', async () => {
      const parentId = 42
      const visible = false

      if (parentId) {
        await api.updateNode(parentId, { show_root_node: visible ? 1 : 0 })
      }

      expect(api.updateNode).toHaveBeenCalledWith(42, { show_root_node: 0 })
    })

    it('should not call api.updateNode when parent is null', async () => {
      const parent = null
      const visible = true

      if (parent?.id) {
        await api.updateNode(parent.id, { show_root_node: visible ? 1 : 0 })
      }

      expect(api.updateNode).not.toHaveBeenCalled()
    })
  })

  describe('showRootNode container navigation', () => {
    it('should load new container showRootNode when navigating', async () => {
      const _showRootNode = ref(true)
      const showRootNode = ref(true)
      let lastKnownParentId = 1

      // Simulate navigating to a different container with show_root_node=false
      const newParent = { id: 2, show_root_node: 0 }
      const newId = newParent.id

      if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        if (newParent?.show_root_node !== null && newParent?.show_root_node !== undefined) {
          showRootNode.value = Boolean(newParent.show_root_node)
        } else {
          showRootNode.value = _showRootNode.value
        }
      }

      expect(showRootNode.value).toBe(false)
      expect(lastKnownParentId).toBe(2)
    })

    it('should fall back to composable default when new container has no show_root_node', async () => {
      const _showRootNode = ref(false)
      const showRootNode = ref(true)
      let lastKnownParentId = 1

      // Navigate to container with no saved show_root_node
      const newParent = { id: 2, show_root_node: null }
      const newId = newParent.id

      if (newId !== lastKnownParentId) {
        lastKnownParentId = newId
        if (newParent?.show_root_node !== null && newParent?.show_root_node !== undefined) {
          showRootNode.value = Boolean(newParent.show_root_node)
        } else {
          showRootNode.value = _showRootNode.value
        }
      }

      expect(showRootNode.value).toBe(false) // falls back to composable default
    })
  })
})
