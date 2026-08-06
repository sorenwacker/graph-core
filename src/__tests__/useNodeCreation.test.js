import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useNodeCreation } from '../composables/useNodeCreation.js'

describe('useNodeCreation', () => {
  let deps

  beforeEach(() => {
    vi.clearAllMocks()

    deps = {
      newNodeTitle: ref(''),
      newNodeType: ref('task'),
      addChildParentId: ref(null),
      currentContainerId: ref(7),
      showDetail: ref(true),
      addNodeModal: ref({ visible: false, parentId: null }),
      detailPanelRef: ref({ loadChildren: vi.fn() }),
      nodeOps: { createNode: vi.fn().mockResolvedValue({ id: 42, title: 'New' }) },
      addChildNode: vi.fn().mockResolvedValue({ id: 42 }),
      selectNode: vi.fn(),
      loadChildren: vi.fn().mockResolvedValue(undefined),
      loadSidebarTree: vi.fn().mockResolvedValue(undefined),
      refreshAfterChange: vi.fn().mockResolvedValue(undefined),
      hideTooltip: vi.fn(),
      expandedIds: ref(new Set()),
    }
  })

  describe('handleAddChild', () => {
    it('opens the add-node modal for a bare parent id (tree/cards views)', () => {
      const { handleAddChild } = useNodeCreation(deps)
      const event = { stopPropagation: vi.fn() }

      handleAddChild(5, event)

      expect(event.stopPropagation).toHaveBeenCalled()
      expect(deps.hideTooltip).toHaveBeenCalled()
      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 5 })
      expect(deps.addChildNode).not.toHaveBeenCalled()
    })

    it('opens the modal with the parent id from a prompt payload (timeline/table views)', () => {
      const { handleAddChild } = useNodeCreation(deps)

      // Shape emitted by useTimelineInteractions and TableView on Cmd+Click.
      handleAddChild({ parentId: 12, title: '', prompt: true })

      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 12 })
      // Regression guard: the whole payload object must never be used as the id.
      expect(typeof deps.addNodeModal.value.parentId).toBe('number')
      expect(deps.addChildNode).not.toHaveBeenCalled()
    })

    it('prompts rather than creating when the payload carries an empty title', () => {
      const { handleAddChild } = useNodeCreation(deps)

      handleAddChild({ parentId: 3, title: '', type: 'task' })

      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 3 })
      expect(deps.addChildNode).not.toHaveBeenCalled()
    })

    it('creates directly when the payload carries a title', () => {
      const { handleAddChild } = useNodeCreation(deps)
      const payload = { parentId: 3, title: 'Child', type: 'task', x: 10, y: 20 }

      handleAddChild(payload)

      expect(deps.addChildNode).toHaveBeenCalledWith(payload)
      expect(deps.addNodeModal.value.visible).toBe(false)
    })

    it('prefers prompting over creating when prompt is set alongside a title', () => {
      const { handleAddChild } = useNodeCreation(deps)

      handleAddChild({ parentId: 4, title: 'Draft', prompt: true })

      expect(deps.addChildNode).not.toHaveBeenCalled()
      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 4 })
    })

    it('opens a root-level modal when there is no parent at all', () => {
      const { handleAddChild } = useNodeCreation(deps)

      handleAddChild(null)

      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: null })
    })
  })

  describe('handleCreate', () => {
    it('creates at the given position when a title is supplied', async () => {
      const { handleCreate } = useNodeCreation(deps)

      handleCreate({ title: 'Node', type: 'task', x: 1, y: 2 })
      await vi.waitFor(() => expect(deps.nodeOps.createNode).toHaveBeenCalled())

      expect(deps.nodeOps.createNode).toHaveBeenCalledWith({
        title: 'Node',
        type: 'task',
        parentId: 7,
        x: 1,
        y: 2,
      })
    })

    it('opens the modal for the current container when no title is supplied', () => {
      const { handleCreate } = useNodeCreation(deps)

      handleCreate()

      expect(deps.hideTooltip).toHaveBeenCalled()
      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 7 })
    })
  })

  describe('createNode', () => {
    it('ignores blank titles', async () => {
      deps.newNodeTitle.value = '   '
      const { createNode } = useNodeCreation(deps)

      await createNode()

      expect(deps.nodeOps.createNode).not.toHaveBeenCalled()
    })

    it('creates under the pending add-child parent and expands it', async () => {
      deps.newNodeTitle.value = 'Task'
      deps.addChildParentId.value = 9
      const { createNode } = useNodeCreation(deps)

      await createNode()

      expect(deps.nodeOps.createNode).toHaveBeenCalledWith({ title: 'Task', type: 'task', parentId: 9 })
      expect(deps.expandedIds.value.has(9)).toBe(true)
      expect(deps.loadSidebarTree).toHaveBeenCalled()
      expect(deps.newNodeTitle.value).toBe('')
      expect(deps.addChildParentId.value).toBe(null)
      expect(deps.loadChildren).toHaveBeenCalledWith(7, { silent: true })
    })
  })
  describe('addChildFromDetail', () => {
    it('opens the modal for the subtask button instead of creating an untitled node', async () => {
      const { addChildFromDetail } = useNodeCreation(deps)

      // Shape DetailPanel emits for the per-child "+" (add subtask) button.
      await addChildFromDetail({ parentId: 15, title: '', type: 'task', prompt: true })

      expect(deps.addNodeModal.value).toEqual({ visible: true, parentId: 15 })
      expect(deps.addChildNode).not.toHaveBeenCalled()
    })

    it('creates directly when the payload carries a title', async () => {
      const { addChildFromDetail } = useNodeCreation(deps)
      const payload = { parentId: 15, title: 'Write spec', type: 'task' }

      await addChildFromDetail(payload)

      expect(deps.addChildNode).toHaveBeenCalledWith(payload)
      expect(deps.detailPanelRef.value.loadChildren).toHaveBeenCalled()
      expect(deps.addNodeModal.value.visible).toBe(false)
    })
  })
})
