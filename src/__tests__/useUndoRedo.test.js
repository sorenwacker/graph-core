import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUndoRedo } from '../composables/useUndoRedo.js'
import { EditCommand } from '../commands/index.js'

describe('useUndoRedo composable', () => {
  let mockApi, undoRedo

  beforeEach(() => {
    mockApi = {
      moveNode: vi.fn().mockResolvedValue(),
      createNode: vi.fn().mockResolvedValue({ id: 99 }),
      deleteNode: vi.fn().mockResolvedValue(),
      updateNode: vi.fn().mockResolvedValue(),
      restoreNode: vi.fn().mockResolvedValue({ id: 1, parent_id: 2 }),
      linkNodes: vi.fn().mockResolvedValue(),
      unlinkNodes: vi.fn().mockResolvedValue(),
      reorderNode: vi.fn().mockResolvedValue(),
    }
    // Disable persistence in most tests
    undoRedo = useUndoRedo({ api: mockApi, persist: false })
  })

  describe('initial state', () => {
    it('should have empty undo stack', () => {
      expect(undoRedo.undoStack.value).toEqual([])
    })

    it('should have empty redo stack', () => {
      expect(undoRedo.redoStack.value).toEqual([])
    })

    it('should report canUndo as false', () => {
      expect(undoRedo.canUndo.value).toBe(false)
    })

    it('should report canRedo as false', () => {
      expect(undoRedo.canRedo.value).toBe(false)
    })

    it('should have undoCount of 0', () => {
      expect(undoRedo.undoCount.value).toBe(0)
    })

    it('should have redoCount of 0', () => {
      expect(undoRedo.redoCount.value).toBe(0)
    })
  })

  describe('pushCommand', () => {
    it('should add command to undo stack', () => {
      const mockCommand = { type: 'move', undo: vi.fn(), execute: vi.fn() }
      undoRedo.pushCommand(mockCommand)
      expect(undoRedo.undoStack.value).toHaveLength(1)
      expect(undoRedo.undoStack.value[0].type).toBe('move')
    })

    it('should update canUndo to true', () => {
      undoRedo.pushCommand({ type: 'move' })
      expect(undoRedo.canUndo.value).toBe(true)
    })

    it('should clear redo stack on push', () => {
      undoRedo.redoStack.value = [{ type: 'test' }]
      undoRedo.pushCommand({ type: 'move' })
      expect(undoRedo.redoStack.value).toEqual([])
    })

    it('should enforce max stack size (default 50)', () => {
      for (let i = 0; i < 55; i++) {
        undoRedo.pushCommand({ type: 'test', id: i })
      }
      expect(undoRedo.undoStack.value).toHaveLength(50)
      // First 5 should have been removed
      expect(undoRedo.undoStack.value[0].id).toBe(5)
    })

    it('should respect custom maxStackSize', () => {
      const smallStack = useUndoRedo({ api: mockApi, maxStackSize: 3 })
      for (let i = 0; i < 5; i++) {
        smallStack.pushCommand({ type: 'test', id: i })
      }
      expect(smallStack.undoStack.value).toHaveLength(3)
      expect(smallStack.undoStack.value[0].id).toBe(2)
    })
  })

  describe('undo', () => {
    it('should do nothing if stack is empty', async () => {
      await undoRedo.undo()
      expect(undoRedo.undoStack.value).toHaveLength(0)
    })

    it('should call command.undo with api', async () => {
      const mockCommand = { undo: vi.fn().mockResolvedValue(), execute: vi.fn() }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      expect(mockCommand.undo).toHaveBeenCalledWith(mockApi)
    })

    it('should move command from undo to redo stack', async () => {
      const mockCommand = { type: 'test', undo: vi.fn().mockResolvedValue(), execute: vi.fn() }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      expect(undoRedo.undoStack.value).toHaveLength(0)
      expect(undoRedo.redoStack.value).toHaveLength(1)
      expect(undoRedo.redoStack.value[0].type).toBe('test')
    })

    it('should call onSuccess callback', async () => {
      const onSuccess = vi.fn()
      const ur = useUndoRedo({ api: mockApi, onSuccess })
      ur.pushCommand({ undo: vi.fn().mockResolvedValue(), execute: vi.fn() })
      await ur.undo()
      expect(onSuccess).toHaveBeenCalled()
    })

    it('should restore command to stack on failure', async () => {
      const mockCommand = {
        undo: vi.fn().mockRejectedValue(new Error('fail')),
        execute: vi.fn(),
      }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      expect(undoRedo.undoStack.value).toHaveLength(1)
      expect(undoRedo.redoStack.value).toHaveLength(0)
    })

    it('should call onError callback on failure', async () => {
      const onError = vi.fn()
      const ur = useUndoRedo({ api: mockApi, onError })
      const mockCommand = {
        undo: vi.fn().mockRejectedValue(new Error('fail')),
        execute: vi.fn(),
      }
      ur.pushCommand(mockCommand)
      await ur.undo()
      expect(onError).toHaveBeenCalledWith(expect.any(Error), mockCommand)
    })
  })

  describe('redo', () => {
    it('should do nothing if redo stack is empty', async () => {
      await undoRedo.redo()
      expect(undoRedo.redoStack.value).toHaveLength(0)
    })

    it('should call command.execute with api', async () => {
      const mockCommand = { undo: vi.fn().mockResolvedValue(), execute: vi.fn().mockResolvedValue() }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      await undoRedo.redo()
      expect(mockCommand.execute).toHaveBeenCalledWith(mockApi)
    })

    it('should move command from redo to undo stack', async () => {
      const mockCommand = { undo: vi.fn().mockResolvedValue(), execute: vi.fn().mockResolvedValue() }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      await undoRedo.redo()
      expect(undoRedo.redoStack.value).toHaveLength(0)
      expect(undoRedo.undoStack.value).toHaveLength(1)
    })

    it('should call onSuccess callback', async () => {
      const onSuccess = vi.fn()
      const ur = useUndoRedo({ api: mockApi, onSuccess })
      const mockCommand = { undo: vi.fn().mockResolvedValue(), execute: vi.fn().mockResolvedValue() }
      ur.pushCommand(mockCommand)
      await ur.undo()
      onSuccess.mockClear()
      await ur.redo()
      expect(onSuccess).toHaveBeenCalled()
    })

    it('should restore command to redo stack on failure', async () => {
      const mockCommand = {
        undo: vi.fn().mockResolvedValue(),
        execute: vi.fn().mockRejectedValue(new Error('fail')),
      }
      undoRedo.pushCommand(mockCommand)
      await undoRedo.undo()
      await undoRedo.redo()
      expect(undoRedo.redoStack.value).toHaveLength(1)
      expect(undoRedo.undoStack.value).toHaveLength(0)
    })
  })

  describe('clear', () => {
    it('should empty both stacks', () => {
      undoRedo.pushCommand({ type: 'test1' })
      undoRedo.pushCommand({ type: 'test2' })
      undoRedo.redoStack.value = [{ type: 'test3' }]
      undoRedo.clear()
      expect(undoRedo.undoStack.value).toEqual([])
      expect(undoRedo.redoStack.value).toEqual([])
    })
  })

  describe('isProcessing', () => {
    it('should be false initially', () => {
      expect(undoRedo.isProcessing.value).toBe(false)
    })

    it('should prevent concurrent undo operations', async () => {
      const slowUndo = vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 50)))
      const fastUndo = vi.fn().mockResolvedValue()

      // Push two commands - fast one first, slow one second (LIFO order)
      undoRedo.pushCommand({ type: 'fast', undo: fastUndo, execute: vi.fn() })
      undoRedo.pushCommand({ type: 'slow', undo: slowUndo, execute: vi.fn() })

      // Start both undos - second should be ignored while first is processing
      const undo1 = undoRedo.undo() // Will pop 'slow' and start processing
      const undo2 = undoRedo.undo() // Should be ignored (isProcessing is true)

      await Promise.all([undo1, undo2])

      // Only slow command should have been undone (it was on top of stack)
      expect(slowUndo).toHaveBeenCalledTimes(1)
      // Fast command should NOT have been undone yet (blocked by isProcessing)
      expect(fastUndo).toHaveBeenCalledTimes(0)
    })
  })

  describe('persistence', () => {
    let mockStorage = {}

    beforeEach(() => {
      mockStorage = {}
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: vi.fn(key => mockStorage[key] ?? null),
          setItem: vi.fn((key, value) => {
            mockStorage[key] = value
          }),
          removeItem: vi.fn(key => {
            delete mockStorage[key]
          }),
        },
        writable: true,
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should save undo stack to sessionStorage when command is pushed', async () => {
      const ur = useUndoRedo({ api: mockApi, persist: true })
      const cmd = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Old' },
        newValues: { title: 'New' },
      })

      ur.pushCommand(cmd)

      // Vue watchers are async, wait for next tick
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-undoStack']).toBeDefined()
      })

      const stored = JSON.parse(mockStorage['graphcore-undoStack'])
      expect(stored).toHaveLength(1)
      expect(stored[0].type).toBe('edit')
    })

    it('should restore undo stack from sessionStorage on init', () => {
      const storedCommands = [
        {
          type: 'edit',
          nodeId: 1,
          oldValues: { title: 'Old' },
          newValues: { title: 'New' },
        },
      ]
      mockStorage['graphcore-undoStack'] = JSON.stringify(storedCommands)

      const ur = useUndoRedo({ api: mockApi, persist: true })

      expect(ur.undoStack.value).toHaveLength(1)
      expect(ur.undoStack.value[0].nodeId).toBe(1)
      expect(ur.canUndo.value).toBe(true)
    })

    it('should restore redo stack from sessionStorage on init', () => {
      const storedCommands = [
        {
          type: 'move',
          nodeId: 2,
          oldParentId: 5,
          newParentId: 10,
        },
      ]
      mockStorage['graphcore-redoStack'] = JSON.stringify(storedCommands)

      const ur = useUndoRedo({ api: mockApi, persist: true })

      expect(ur.redoStack.value).toHaveLength(1)
      expect(ur.canRedo.value).toBe(true)
    })

    it('should not persist when persist option is false', async () => {
      const ur = useUndoRedo({ api: mockApi, persist: false })
      ur.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: {},
          newValues: {},
        })
      )

      // Wait a tick
      await new Promise(r => setTimeout(r, 10))

      expect(mockStorage['graphcore-undoStack']).toBeUndefined()
    })

    it('should handle corrupt storage gracefully', () => {
      mockStorage['graphcore-undoStack'] = 'not valid json {'

      // Should not throw
      const ur = useUndoRedo({ api: mockApi, persist: true })

      expect(ur.undoStack.value).toEqual([])
    })

    it('should clear storage when stacks are cleared', async () => {
      mockStorage['graphcore-undoStack'] = JSON.stringify([{ type: 'edit', nodeId: 1, oldValues: {}, newValues: {} }])
      mockStorage['graphcore-redoStack'] = JSON.stringify([
        { type: 'move', nodeId: 2, oldParentId: 5, newParentId: 10 },
      ])

      const ur = useUndoRedo({ api: mockApi, persist: true })
      ur.clear()

      await vi.waitFor(() => {
        const storedUndo = JSON.parse(mockStorage['graphcore-undoStack'] || '[]')
        const storedRedo = JSON.parse(mockStorage['graphcore-redoStack'] || '[]')
        expect(storedUndo).toHaveLength(0)
        expect(storedRedo).toHaveLength(0)
      })
    })
  })
})
