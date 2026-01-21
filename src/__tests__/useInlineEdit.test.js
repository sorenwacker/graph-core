import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useInlineEdit } from '../composables/useInlineEdit.js'

describe('useInlineEdit composable', () => {
  let onSaveTitle, onSaveNotes, findNode, edit

  beforeEach(() => {
    vi.useFakeTimers()
    onSaveTitle = vi.fn()
    onSaveNotes = vi.fn()
    findNode = vi.fn()
    edit = useInlineEdit({ onSaveTitle, onSaveNotes, findNode })
  })

  afterEach(() => {
    edit.cleanup()
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should have null editingCardId', () => {
      expect(edit.editingCardId.value).toBeNull()
    })

    it('should have empty editingTitle', () => {
      expect(edit.editingTitle.value).toBe('')
    })

    it('should have null inlineNotesId', () => {
      expect(edit.inlineNotesId.value).toBeNull()
    })

    it('should have empty inlineNotesText', () => {
      expect(edit.inlineNotesText.value).toBe('')
    })
  })

  describe('title editing - startEditing', () => {
    it('should set editingCardId and editingTitle', () => {
      const node = { id: 1, title: 'Test Title' }
      edit.startEditing(node)

      expect(edit.editingCardId.value).toBe(1)
      expect(edit.editingTitle.value).toBe('Test Title')
    })

    it('should stop event propagation', () => {
      const node = { id: 1, title: 'Test' }
      const e = { stopPropagation: vi.fn() }

      edit.startEditing(node, e)

      expect(e.stopPropagation).toHaveBeenCalled()
    })

    it('should handle node without title', () => {
      const node = { id: 1 }
      edit.startEditing(node)

      expect(edit.editingTitle.value).toBe('')
    })
  })

  describe('title editing - saveEditing', () => {
    it('should not save if not editing', async () => {
      await edit.saveEditing()
      expect(onSaveTitle).not.toHaveBeenCalled()
    })

    it('should clear editing state if node not found', async () => {
      edit.editingCardId.value = 1
      findNode.mockReturnValue(null)

      await edit.saveEditing()

      expect(edit.editingCardId.value).toBeNull()
      expect(onSaveTitle).not.toHaveBeenCalled()
    })

    it('should save if title changed', async () => {
      edit.editingCardId.value = 1
      edit.editingTitle.value = 'New Title'
      findNode.mockReturnValue({ id: 1, title: 'Old Title' })

      await edit.saveEditing()

      expect(onSaveTitle).toHaveBeenCalledWith(1, 'New Title')
      expect(edit.editingCardId.value).toBeNull()
    })

    it('should not save if title unchanged', async () => {
      edit.editingCardId.value = 1
      edit.editingTitle.value = 'Same Title'
      findNode.mockReturnValue({ id: 1, title: 'Same Title' })

      await edit.saveEditing()

      expect(onSaveTitle).not.toHaveBeenCalled()
      expect(edit.editingCardId.value).toBeNull()
    })
  })

  describe('title editing - cancelEditing', () => {
    it('should clear editing state', () => {
      edit.editingCardId.value = 1
      edit.editingTitle.value = 'Test'

      edit.cancelEditing()

      expect(edit.editingCardId.value).toBeNull()
      expect(edit.editingTitle.value).toBe('')
    })
  })

  describe('title editing - handleEditKeydown', () => {
    it('should cancel on Escape', () => {
      edit.editingCardId.value = 1
      const e = { key: 'Escape', preventDefault: vi.fn() }

      edit.handleEditKeydown(e)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(edit.editingCardId.value).toBeNull()
    })

    it('should save on Enter', async () => {
      edit.editingCardId.value = 1
      edit.editingTitle.value = 'New'
      findNode.mockReturnValue({ id: 1, title: 'Old' })
      const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() }

      edit.handleEditKeydown(e)
      await vi.runAllTimersAsync()

      expect(e.preventDefault).toHaveBeenCalled()
      expect(onSaveTitle).toHaveBeenCalled()
    })

    it('should not save on Shift+Enter', () => {
      edit.editingCardId.value = 1
      const e = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() }

      edit.handleEditKeydown(e)

      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(onSaveTitle).not.toHaveBeenCalled()
    })
  })

  describe('title editing - isEditing', () => {
    it('should return true for editing node', () => {
      edit.editingCardId.value = 5
      expect(edit.isEditing(5)).toBe(true)
    })

    it('should return false for non-editing node', () => {
      edit.editingCardId.value = 5
      expect(edit.isEditing(3)).toBe(false)
    })
  })

  describe('notes editing - startInlineNotes', () => {
    it('should set inlineNotesId and inlineNotesText', async () => {
      const node = { id: 1, notes: 'Test notes' }
      await edit.startInlineNotes(node)

      expect(edit.inlineNotesId.value).toBe(1)
      expect(edit.inlineNotesText.value).toBe('Test notes')
    })

    it('should stop event propagation', async () => {
      const node = { id: 1, notes: '' }
      const e = { stopPropagation: vi.fn() }

      await edit.startInlineNotes(node, e)

      expect(e.stopPropagation).toHaveBeenCalled()
    })

    it('should handle node without notes', async () => {
      const node = { id: 1 }
      await edit.startInlineNotes(node)

      expect(edit.inlineNotesText.value).toBe('')
    })

    it('should focus textarea ref', async () => {
      const mockRef = { focus: vi.fn() }
      edit.inlineNotesRef.value = mockRef

      await edit.startInlineNotes({ id: 1 })
      await vi.runAllTimersAsync()

      expect(mockRef.focus).toHaveBeenCalled()
    })

    it('should handle array of refs', async () => {
      const mockRef = { focus: vi.fn() }
      edit.inlineNotesRef.value = [mockRef, { focus: vi.fn() }]

      await edit.startInlineNotes({ id: 1 })
      await vi.runAllTimersAsync()

      expect(mockRef.focus).toHaveBeenCalled()
    })
  })

  describe('notes editing - auto-save', () => {
    it('should auto-save after 500ms of no typing', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'initial'

      // Trigger the watcher
      edit.inlineNotesText.value = 'changed'
      await vi.advanceTimersByTimeAsync(500)

      expect(onSaveNotes).toHaveBeenCalledWith(1, 'changed', { autoSave: true })
    })

    it('should debounce auto-save', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'a'

      // Multiple changes
      edit.inlineNotesText.value = 'ab'
      await vi.advanceTimersByTimeAsync(200)
      edit.inlineNotesText.value = 'abc'
      await vi.advanceTimersByTimeAsync(200)
      edit.inlineNotesText.value = 'abcd'
      await vi.advanceTimersByTimeAsync(500)

      // Should only save once with final value
      expect(onSaveNotes).toHaveBeenCalledTimes(1)
      expect(onSaveNotes).toHaveBeenCalledWith(1, 'abcd', { autoSave: true })
    })

    it('should not auto-save if not editing notes', async () => {
      edit.inlineNotesId.value = null
      edit.inlineNotesText.value = 'changed'
      await vi.advanceTimersByTimeAsync(500)

      expect(onSaveNotes).not.toHaveBeenCalled()
    })
  })

  describe('notes editing - saveInlineNotes', () => {
    it('should not save if not editing', async () => {
      await edit.saveInlineNotes()
      expect(onSaveNotes).not.toHaveBeenCalled()
    })

    it('should clear editing state if node not found', async () => {
      edit.inlineNotesId.value = 1
      findNode.mockReturnValue(null)

      await edit.saveInlineNotes()

      expect(edit.inlineNotesId.value).toBeNull()
      expect(onSaveNotes).not.toHaveBeenCalled()
    })

    it('should save if notes changed', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'New notes'
      findNode.mockReturnValue({ id: 1, notes: 'Old notes' })

      await edit.saveInlineNotes()

      expect(onSaveNotes).toHaveBeenCalledWith(1, 'New notes', { autoSave: false })
      expect(edit.inlineNotesId.value).toBeNull()
    })

    it('should not save if notes unchanged', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'Same notes'
      findNode.mockReturnValue({ id: 1, notes: 'Same notes' })

      await edit.saveInlineNotes()

      expect(onSaveNotes).not.toHaveBeenCalled()
      expect(edit.inlineNotesId.value).toBeNull()
    })

    it('should clear pending auto-save', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'initial'

      // Trigger auto-save
      edit.inlineNotesText.value = 'changed'

      // Save before timeout
      findNode.mockReturnValue({ id: 1, notes: 'old' })
      await edit.saveInlineNotes()

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(600)

      // Should only have been called once (manual save, not auto-save)
      expect(onSaveNotes).toHaveBeenCalledTimes(1)
      expect(onSaveNotes).toHaveBeenCalledWith(1, 'changed', { autoSave: false })
    })
  })

  describe('notes editing - cancelInlineNotes', () => {
    it('should clear notes editing state', () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'Test'

      edit.cancelInlineNotes()

      expect(edit.inlineNotesId.value).toBeNull()
      expect(edit.inlineNotesText.value).toBe('')
    })

    it('should clear pending auto-save', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'initial'

      // Trigger auto-save
      edit.inlineNotesText.value = 'changed'

      // Cancel before timeout
      edit.cancelInlineNotes()

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(600)

      // Should not have been called
      expect(onSaveNotes).not.toHaveBeenCalled()
    })
  })

  describe('notes editing - handleInlineNotesKeydown', () => {
    it('should cancel on Escape', () => {
      edit.inlineNotesId.value = 1
      const e = { key: 'Escape', preventDefault: vi.fn() }

      edit.handleInlineNotesKeydown(e)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(edit.inlineNotesId.value).toBeNull()
    })

    it('should save on Cmd+Enter', async () => {
      edit.inlineNotesId.value = 1
      edit.inlineNotesText.value = 'New'
      findNode.mockReturnValue({ id: 1, notes: 'Old' })
      const e = { key: 'Enter', metaKey: true, preventDefault: vi.fn() }

      edit.handleInlineNotesKeydown(e)
      await vi.runAllTimersAsync()

      expect(e.preventDefault).toHaveBeenCalled()
      expect(onSaveNotes).toHaveBeenCalled()
    })

    it('should not save on plain Enter', () => {
      edit.inlineNotesId.value = 1
      const e = { key: 'Enter', metaKey: false, preventDefault: vi.fn() }

      edit.handleInlineNotesKeydown(e)

      expect(e.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('notes editing - isEditingNotes', () => {
    it('should return true for editing node', () => {
      edit.inlineNotesId.value = 5
      expect(edit.isEditingNotes(5)).toBe(true)
    })

    it('should return false for non-editing node', () => {
      edit.inlineNotesId.value = 5
      expect(edit.isEditingNotes(3)).toBe(false)
    })
  })

  describe('without callbacks', () => {
    it('should work without onSaveTitle', async () => {
      const e = useInlineEdit({ findNode: () => ({ id: 1, title: 'old' }) })
      e.editingCardId.value = 1
      e.editingTitle.value = 'new'
      await e.saveEditing()
      // Should not throw
      expect(e.editingCardId.value).toBeNull()
    })

    it('should work without onSaveNotes', async () => {
      const e = useInlineEdit({ findNode: () => ({ id: 1, notes: 'old' }) })
      e.inlineNotesId.value = 1
      e.inlineNotesText.value = 'new'
      await e.saveInlineNotes()
      // Should not throw
      expect(e.inlineNotesId.value).toBeNull()
    })

    it('should work without findNode', async () => {
      const e = useInlineEdit({})
      e.editingCardId.value = 1
      await e.saveEditing()
      // Should clear state even without findNode
      expect(e.editingCardId.value).toBeNull()
    })
  })
})
