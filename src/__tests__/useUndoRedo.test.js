import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUndoRedo } from '../composables/useUndoRedo.js'

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
      reorderNode: vi.fn().mockResolvedValue()
    }
    undoRedo = useUndoRedo({ api: mockApi })
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
        execute: vi.fn()
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
        execute: vi.fn()
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
        execute: vi.fn().mockRejectedValue(new Error('fail'))
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
})
