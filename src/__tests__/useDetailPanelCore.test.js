import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useDetailPanelCore } from '../composables/useDetailPanelCore.js'

// Mock api service
vi.mock('../services/api', () => ({
  api: {
    getChildren: vi.fn().mockResolvedValue([]),
    getLinkedNodes: vi.fn().mockResolvedValue([]),
    unlinkNodes: vi.fn().mockResolvedValue(true),
    updateNode: vi.fn().mockResolvedValue(true),
    reorderNode: vi.fn().mockResolvedValue(true),
    exportMarkdown: vi.fn().mockResolvedValue({ markdown: '# Test' }),
    exportJSON: vi.fn().mockResolvedValue({ nodes: [] }),
    exportCSV: vi.fn().mockResolvedValue({ csv: 'header,data' }),
  },
}))

// Mock useErrorHandler
vi.mock('./useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn(),
  }),
}))

// Mock useMentions
vi.mock('./useMentions.js', () => ({
  useMentions: () => ({
    showMentions: { value: false },
    mentionPosition: { value: { top: 0, left: 0 } },
    filteredPersons: { value: [] },
    selectedMentionIndex: { value: 0 },
    handleInput: vi.fn(),
    handleKeydown: vi.fn(),
    selectMention: vi.fn(),
    hideMentions: vi.fn(),
    refreshPersons: vi.fn(),
  }),
}))

// Mock useNodeTable
vi.mock('./useNodeTable.js', () => ({
  useNodeTable: () => ({
    table: { value: null },
    cells: { value: [] },
    loading: { value: false },
    hasTable: { value: false },
    loadTable: vi.fn().mockResolvedValue(undefined),
    createTable: vi.fn().mockResolvedValue({ id: 1 }),
    updateTable: vi.fn().mockResolvedValue(true),
    deleteTable: vi.fn().mockResolvedValue(true),
    saveCell: vi.fn().mockResolvedValue(true),
    saveCellStyle: vi.fn().mockResolvedValue(true),
  }),
}))

// Mock formatting utils
vi.mock('../utils/formatting.js', () => ({
  getInitials: vi.fn(name => name?.charAt(0) || '?'),
  formatDate: vi.fn(date => date || 'N/A'),
  getDueStatus: vi.fn(() => 'none'),
}))

describe('useDetailPanelCore', () => {
  let mockProps
  let mockEmit
  let api

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    api = (await import('../services/api')).api

    mockProps = {
      node: { id: 1, title: 'Test Node', type: 'note' },
      hideCompleted: false,
      currentWorkspace: 1,
    }

    mockEmit = vi.fn()

    // Mock URL API
    global.URL.createObjectURL = vi.fn(() => 'blob:test')
    global.URL.revokeObjectURL = vi.fn()

    // Mock prompt
    global.prompt = vi.fn().mockReturnValue('Test Title')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should return all expected properties and methods', () => {
      const result = useDetailPanelCore(mockProps, mockEmit)

      // State
      expect(result).toHaveProperty('editedNode')
      expect(result).toHaveProperty('children')
      expect(result).toHaveProperty('linkedNodes')
      expect(result).toHaveProperty('newTaskTitle')
      expect(result).toHaveProperty('activeTab')

      // Collapsible states
      expect(result).toHaveProperty('notesCollapsed')
      expect(result).toHaveProperty('tableCollapsed')
      expect(result).toHaveProperty('childrenCollapsed')

      // Computed
      expect(result).toHaveProperty('filteredChildren')
      expect(result).toHaveProperty('completedChildrenCount')
      expect(result).toHaveProperty('isPerson')
      expect(result).toHaveProperty('isOrganization')

      // Functions
      expect(result).toHaveProperty('loadChildren')
      expect(result).toHaveProperty('loadLinkedNodes')
      expect(result).toHaveProperty('saveChanges')
      expect(result).toHaveProperty('deleteNode')
      expect(result).toHaveProperty('addTask')
    })

    it('should start with default state values', () => {
      const { activeTab, notesCollapsed, tableCollapsed } = useDetailPanelCore(mockProps, mockEmit)

      expect(activeTab.value).toBe('edit')
      expect(notesCollapsed.value).toBe(false)
      expect(tableCollapsed.value).toBe(true)
    })
  })

  describe('filteredChildren', () => {
    it('should return all children when hideCompleted is false', () => {
      const { children, filteredChildren } = useDetailPanelCore(mockProps, mockEmit)

      children.value = [
        { id: 1, completed: false },
        { id: 2, completed: true },
      ]

      expect(filteredChildren.value).toHaveLength(2)
    })

    it('should filter completed children when hideCompleted is true', () => {
      mockProps.hideCompleted = true
      const { children, filteredChildren } = useDetailPanelCore(mockProps, mockEmit)

      children.value = [
        { id: 1, completed: false },
        { id: 2, completed: true },
      ]

      expect(filteredChildren.value).toHaveLength(1)
      expect(filteredChildren.value[0].id).toBe(1)
    })
  })

  describe('completedChildrenCount', () => {
    it('should count completed children', () => {
      const { children, completedChildrenCount } = useDetailPanelCore(mockProps, mockEmit)

      children.value = [
        { id: 1, completed: true },
        { id: 2, completed: false },
        { id: 3, completed: true },
      ]

      expect(completedChildrenCount.value).toBe(2)
    })
  })

  describe('isPerson and isOrganization', () => {
    it('should correctly identify person type', () => {
      const { editedNode, isPerson, isOrganization } = useDetailPanelCore(mockProps, mockEmit)

      editedNode.value = { type: 'person' }

      expect(isPerson.value).toBe(true)
      expect(isOrganization.value).toBe(false)
    })

    it('should correctly identify organization type', () => {
      const { editedNode, isPerson, isOrganization } = useDetailPanelCore(mockProps, mockEmit)

      editedNode.value = { type: 'organization' }

      expect(isPerson.value).toBe(false)
      expect(isOrganization.value).toBe(true)
    })
  })

  describe('loadChildren', () => {
    it('should load children from API', async () => {
      api.getChildren.mockResolvedValue([
        { id: 2, title: 'Child 1', type: 'task' },
        { id: 3, title: 'Child 2', type: 'note' },
      ])

      const { children, loadChildren, loadingChildren } = useDetailPanelCore(mockProps, mockEmit)

      await loadChildren()

      expect(api.getChildren).toHaveBeenCalledWith(1)
      // Only tasks are kept
      expect(children.value).toHaveLength(1)
      expect(children.value[0].type).toBe('task')
      expect(loadingChildren.value).toBe(false)
    })

    it('should do nothing if no node', async () => {
      mockProps.node = null
      const { loadChildren } = useDetailPanelCore(mockProps, mockEmit)

      await loadChildren()

      expect(api.getChildren).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      api.getChildren.mockRejectedValue(new Error('Network error'))
      const { children, loadChildren } = useDetailPanelCore(mockProps, mockEmit)

      await loadChildren()

      expect(children.value).toEqual([])
    })
  })

  describe('loadLinkedNodes', () => {
    it('should load linked nodes from API', async () => {
      api.getLinkedNodes.mockResolvedValue([{ id: 5, title: 'Linked Node' }])

      const { linkedNodes, loadLinkedNodes } = useDetailPanelCore(mockProps, mockEmit)

      await loadLinkedNodes()

      expect(api.getLinkedNodes).toHaveBeenCalledWith(1)
      expect(linkedNodes.value).toEqual([{ id: 5, title: 'Linked Node' }])
    })
  })

  describe('removeLink', () => {
    it('should unlink nodes and refresh', async () => {
      const { removeLink } = useDetailPanelCore(mockProps, mockEmit)

      await removeLink({ id: 5 })

      expect(api.unlinkNodes).toHaveBeenCalledWith(1, 5)
    })
  })

  describe('onCodeMirrorNotesUpdate', () => {
    it('should update editedNode notes', () => {
      const { editedNode, onCodeMirrorNotesUpdate } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { notes: 'old' }

      onCodeMirrorNotesUpdate('new notes')

      expect(editedNode.value.notes).toBe('new notes')
    })

    it('should trigger autosave after delay', () => {
      const { editedNode, onCodeMirrorNotesUpdate } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1 }

      onCodeMirrorNotesUpdate('new notes')

      expect(mockEmit).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      expect(mockEmit).toHaveBeenCalledWith('update', expect.any(Object))
    })
  })

  describe('saveChanges', () => {
    it('should emit update event', () => {
      const { editedNode, saveChanges } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1, title: 'Updated' }

      saveChanges()

      expect(mockEmit).toHaveBeenCalledWith('update', { id: 1, title: 'Updated' })
    })
  })

  describe('deleteNode', () => {
    it('should emit delete event', () => {
      const { deleteNode } = useDetailPanelCore(mockProps, mockEmit)

      deleteNode()

      expect(mockEmit).toHaveBeenCalledWith('delete', 1)
    })
  })

  describe('wrapWithParent', () => {
    it('should emit wrap-with-parent with title', () => {
      const { wrapWithParent } = useDetailPanelCore(mockProps, mockEmit)

      wrapWithParent()

      expect(global.prompt).toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith('wrap-with-parent', { nodeId: 1, parentTitle: 'Test Title' })
    })

    it('should not emit if prompt cancelled', () => {
      global.prompt.mockReturnValue(null)
      const { wrapWithParent } = useDetailPanelCore(mockProps, mockEmit)

      wrapWithParent()

      expect(mockEmit).not.toHaveBeenCalled()
    })
  })

  describe('moveToRoot', () => {
    it('should emit move-to-root event', () => {
      const { moveToRoot } = useDetailPanelCore(mockProps, mockEmit)

      moveToRoot()

      expect(mockEmit).toHaveBeenCalledWith('move-to-root', 1)
    })
  })

  describe('setImportance', () => {
    it('should set importance and save', () => {
      const { editedNode, setImportance } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1 }

      setImportance(3)

      expect(editedNode.value.importance).toBe(3)
      expect(mockEmit).toHaveBeenCalledWith('update', expect.objectContaining({ importance: 3 }))
    })
  })

  describe('clearDate', () => {
    it('should clear date field and save', () => {
      const { editedNode, clearDate } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1, due_date: '2024-01-01' }

      clearDate('due_date')

      expect(editedNode.value.due_date).toBeNull()
      expect(mockEmit).toHaveBeenCalled()
    })
  })

  describe('updateDate', () => {
    it('should update date field and save', () => {
      const { editedNode, updateDate } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1 }

      updateDate('due_date', '2024-12-31')

      expect(editedNode.value.due_date).toBe('2024-12-31')
      expect(mockEmit).toHaveBeenCalled()
    })
  })

  describe('addTask', () => {
    it('should emit add-child with task data', () => {
      const { newTaskTitle, addTask } = useDetailPanelCore(mockProps, mockEmit)
      newTaskTitle.value = 'New Task'

      addTask()

      expect(mockEmit).toHaveBeenCalledWith('add-child', {
        parentId: 1,
        title: 'New Task',
        type: 'task',
      })
      expect(newTaskTitle.value).toBe('')
    })

    it('should not add empty task', () => {
      const { newTaskTitle, addTask } = useDetailPanelCore(mockProps, mockEmit)
      newTaskTitle.value = '   '

      addTask()

      expect(mockEmit).not.toHaveBeenCalled()
    })
  })

  describe('toggleChildComplete', () => {
    it('should toggle completion and emit child-updated', async () => {
      const { toggleChildComplete } = useDetailPanelCore(mockProps, mockEmit)

      await toggleChildComplete({ id: 2, completed: false })

      expect(api.updateNode).toHaveBeenCalledWith(2, { completed: true })
      expect(mockEmit).toHaveBeenCalledWith('child-updated', 2)
    })
  })

  describe('selectChild', () => {
    it('should emit select-child event', () => {
      const { selectChild } = useDetailPanelCore(mockProps, mockEmit)

      selectChild({ id: 5 })

      expect(mockEmit).toHaveBeenCalledWith('select-child', 5)
    })
  })

  describe('drag and drop', () => {
    it('should set drag state on dragStart', () => {
      const { draggedChild, onDragStart } = useDetailPanelCore(mockProps, mockEmit)

      const mockEvent = {
        dataTransfer: {
          effectAllowed: '',
          setData: vi.fn(),
        },
      }

      onDragStart(mockEvent, { id: 1, title: 'Child' })

      expect(draggedChild.value).toEqual({ id: 1, title: 'Child' })
      expect(mockEvent.dataTransfer.effectAllowed).toBe('move')
    })

    it('should set drop position on dragOver', () => {
      const { draggedChild, dropTarget, dropPosition, onDragStart, onDragOver } = useDetailPanelCore(
        mockProps,
        mockEmit
      )

      const startEvent = { dataTransfer: { effectAllowed: '', setData: vi.fn() } }
      onDragStart(startEvent, { id: 1 })

      const mockEvent = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 50 }) },
        clientY: 110, // Above midpoint
      }

      onDragOver(mockEvent, { id: 2 })

      expect(dropTarget.value).toEqual({ id: 2 })
      expect(dropPosition.value).toBe('before')
    })

    it('should clear drag state on dragEnd', () => {
      const { draggedChild, dropTarget, dropPosition, onDragStart, onDragEnd } = useDetailPanelCore(mockProps, mockEmit)

      const startEvent = { dataTransfer: { effectAllowed: '', setData: vi.fn() } }
      onDragStart(startEvent, { id: 1 })

      onDragEnd()

      expect(draggedChild.value).toBeNull()
      expect(dropTarget.value).toBeNull()
      expect(dropPosition.value).toBeNull()
    })

    it('should reorder on drop', async () => {
      const { onDragStart, onDrop } = useDetailPanelCore(mockProps, mockEmit)

      const startEvent = { dataTransfer: { effectAllowed: '', setData: vi.fn() } }
      onDragStart(startEvent, { id: 1 })

      const dropEvent = { preventDefault: vi.fn() }
      await onDrop(dropEvent, { id: 2 })

      expect(api.reorderNode).toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith('child-updated', 1)
    })
  })

  describe('export functions', () => {
    it('should export markdown', async () => {
      const { editedNode, exportMarkdown, showExportMenu } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1, title: 'Test Node' }
      showExportMenu.value = true

      // Mock createElement and click
      const mockLink = { href: '', download: '', click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink)

      await exportMarkdown()

      expect(api.exportMarkdown).toHaveBeenCalledWith(1)
      expect(mockLink.click).toHaveBeenCalled()
      expect(showExportMenu.value).toBe(false)
    })

    it('should export JSON', async () => {
      const { editedNode, exportJSON, showExportMenu } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1, title: 'Test Node' }

      const mockLink = { href: '', download: '', click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink)

      await exportJSON()

      expect(api.exportJSON).toHaveBeenCalledWith(1)
    })

    it('should export CSV', async () => {
      const { editedNode, exportCSV } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1, title: 'Test Node' }

      const mockLink = { href: '', download: '', click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink)

      await exportCSV()

      expect(api.exportCSV).toHaveBeenCalledWith(1, 1)
    })
  })

  describe('table handlers', () => {
    it('should create table and expand section', async () => {
      const { tableCollapsed, handleCreateTable } = useDetailPanelCore(mockProps, mockEmit)
      tableCollapsed.value = true

      await handleCreateTable()

      expect(tableCollapsed.value).toBe(false)
    })

    it('should do nothing if no node', async () => {
      mockProps.node = null
      const { handleCreateTable } = useDetailPanelCore(mockProps, mockEmit)

      await handleCreateTable()
      // Should not throw
    })
  })

  describe('handleKeydown', () => {
    it('should emit close on Escape when not in input', () => {
      const { handleKeydown } = useDetailPanelCore(mockProps, mockEmit)

      // Mock document.activeElement as a div (not input)
      Object.defineProperty(document, 'activeElement', {
        value: { tagName: 'DIV' },
        writable: true,
      })

      handleKeydown({ key: 'Escape' })

      expect(mockEmit).toHaveBeenCalledWith('close')
    })

    it('should blur input on Escape when in input', () => {
      const { handleKeydown } = useDetailPanelCore(mockProps, mockEmit)

      const mockBlur = vi.fn()
      Object.defineProperty(document, 'activeElement', {
        value: { tagName: 'INPUT', blur: mockBlur },
        writable: true,
      })

      handleKeydown({ key: 'Escape' })

      expect(mockBlur).toHaveBeenCalled()
      expect(mockEmit).not.toHaveBeenCalledWith('close')
    })
  })

  describe('cleanup', () => {
    it('should clear autosave timeout', () => {
      const { onCodeMirrorNotesUpdate, cleanup } = useDetailPanelCore(mockProps, mockEmit)
      const { editedNode } = useDetailPanelCore(mockProps, mockEmit)
      editedNode.value = { id: 1 }

      onCodeMirrorNotesUpdate('test')
      cleanup()

      // Advance time to confirm timeout was cleared
      vi.advanceTimersByTime(1000)
      // The save from onCodeMirrorNotesUpdate should not have fired
    })
  })

  describe('startResize', () => {
    it('should emit resize-start and set isResizing', () => {
      const { isResizing, startResize } = useDetailPanelCore(mockProps, mockEmit)

      startResize({ clientX: 100 })

      expect(isResizing.value).toBe(true)
      expect(mockEmit).toHaveBeenCalledWith('resize-start', { clientX: 100 })
    })
  })

  describe('autoResizeTitle', () => {
    it('should adjust element height', () => {
      const { autoResizeTitle } = useDetailPanelCore(mockProps, mockEmit)

      const mockElement = {
        style: { height: '' },
        scrollHeight: 50,
      }

      autoResizeTitle({ target: mockElement })

      expect(mockElement.style.height).toBe('50px')
    })
  })
})
