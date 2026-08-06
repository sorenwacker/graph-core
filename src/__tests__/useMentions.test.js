import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMentions } from '../composables/useMentions.js'

// The production consumer (NotesEditor) drives useMentions through checkMention;
// this adapter keeps the textarea-shaped fixtures below while exercising that API.
function inputFrom(checkMention, textarea) {
  checkMention({
    text: textarea.value,
    cursorPos: textarea.selectionStart,
    getCoords: () => textarea.getBoundingClientRect(),
  })
}

// Mock the api service
vi.mock('../services/api.js', () => ({
  api: {
    getNodes: vi.fn().mockResolvedValue([
      { id: 1, title: 'Alice Smith', type: 'person' },
      { id: 2, title: 'Bob Jones', type: 'person' },
      { id: 3, title: 'Charlie Brown', type: 'person' },
    ]),
    linkNodes: vi.fn().mockResolvedValue(true),
  },
}))

// Mock useErrorHandler
vi.mock('../composables/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn(),
  }),
}))

// Mock getComputedStyle
const mockComputedStyle = {
  lineHeight: '20px',
  paddingTop: '0',
  paddingLeft: '0',
  fontSize: '13px',
}

const originalGetComputedStyle = global.getComputedStyle
global.getComputedStyle = vi.fn().mockReturnValue(mockComputedStyle)

describe('useMentions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.getComputedStyle = vi.fn().mockReturnValue(mockComputedStyle)
  })

  describe('initialization', () => {
    it('should return all expected properties', () => {
      const result = useMentions()

      expect(result).toHaveProperty('showMentions')
      expect(result).toHaveProperty('mentionPosition')
      expect(result).toHaveProperty('filteredPersons')
      expect(result).toHaveProperty('selectedMentionIndex')
      expect(result).toHaveProperty('handleKeydown')
      expect(result).toHaveProperty('selectMention')
      expect(result).toHaveProperty('hideMentions')
      expect(result).toHaveProperty('refreshPersons')
    })

    it('should start with showMentions false', () => {
      const { showMentions } = useMentions()
      expect(showMentions.value).toBe(false)
    })

    it('should start with selectedMentionIndex at 0', () => {
      const { selectedMentionIndex } = useMentions()
      expect(selectedMentionIndex.value).toBe(0)
    })
  })

  describe('checkMention', () => {
    it('should show mentions when @ is typed at start', async () => {
      const { showMentions, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: '@',
        selectionStart: 1,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }

      inputFrom(checkMention, mockTextarea)

      expect(showMentions.value).toBe(true)
    })

    it('should filter persons based on query', async () => {
      const { filteredPersons, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: '@ali',
        selectionStart: 4,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }

      inputFrom(checkMention, mockTextarea)

      expect(filteredPersons.value.length).toBe(1)
      expect(filteredPersons.value[0].title).toBe('Alice Smith')
    })

    it('should hide mentions when @ is not found', async () => {
      const { showMentions, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: 'hello world',
        selectionStart: 11,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }

      inputFrom(checkMention, mockTextarea)

      expect(showMentions.value).toBe(false)
    })

    it('should not show mentions if @ is part of email', async () => {
      const { showMentions, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: 'test@example.com',
        selectionStart: 16,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }

      inputFrom(checkMention, mockTextarea)

      expect(showMentions.value).toBe(false)
    })
  })

  describe('checkMention (editor-agnostic detection)', () => {
    it('should show mentions for @query given text and cursor position', async () => {
      const { showMentions, filteredPersons, mentionPosition, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      checkMention({ text: 'hello @bob', cursorPos: 10, getCoords: () => ({ top: 42, left: 24 }) })

      expect(showMentions.value).toBe(true)
      expect(filteredPersons.value.length).toBe(1)
      expect(filteredPersons.value[0].title).toBe('Bob Jones')
      expect(mentionPosition.value).toEqual({ top: 42, left: 24 })
    })

    it('should hide mentions when cursor is not after an @query', async () => {
      const { showMentions, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      checkMention({ text: '@bob', cursorPos: 4, getCoords: () => ({ top: 0, left: 0 }) })
      expect(showMentions.value).toBe(true)

      checkMention({ text: 'plain text', cursorPos: 10, getCoords: () => ({ top: 0, left: 0 }) })
      expect(showMentions.value).toBe(false)
    })

    it('should not re-trigger over an already-inserted @[Name](person:id) mention', async () => {
      const { showMentions, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const text = '@[Alice Smith](person:1) '
      checkMention({ text, cursorPos: text.length, getCoords: () => ({ top: 0, left: 0 }) })

      expect(showMentions.value).toBe(false)
    })
  })

  describe('handleKeydown', () => {
    it('should return false when mentions are not shown', async () => {
      const { handleKeydown, refreshPersons } = useMentions()
      await refreshPersons()

      const result = handleKeydown({ key: 'ArrowDown', preventDefault: vi.fn() }, '', vi.fn())

      expect(result).toBe(false)
    })

    it('should navigate down with ArrowDown', async () => {
      const { showMentions, selectedMentionIndex, handleKeydown, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      // Trigger mention mode
      const mockTextarea = {
        value: '@',
        selectionStart: 1,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }
      inputFrom(checkMention, mockTextarea)

      expect(showMentions.value).toBe(true)
      expect(selectedMentionIndex.value).toBe(0)

      const mockEvent = { key: 'ArrowDown', preventDefault: vi.fn() }
      const result = handleKeydown(mockEvent, '@', vi.fn())

      expect(result).toBe(true)
      expect(selectedMentionIndex.value).toBe(1)
      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })

    it('should navigate up with ArrowUp', async () => {
      const { showMentions, selectedMentionIndex, handleKeydown, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: '@',
        selectionStart: 1,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }
      inputFrom(checkMention, mockTextarea)

      // First go down
      handleKeydown({ key: 'ArrowDown', preventDefault: vi.fn() }, '@', vi.fn())
      expect(selectedMentionIndex.value).toBe(1)

      // Then go up
      const mockEvent = { key: 'ArrowUp', preventDefault: vi.fn() }
      handleKeydown(mockEvent, '@', vi.fn())

      expect(selectedMentionIndex.value).toBe(0)
    })

    it('should insert mention on Enter, passing new text and cursor position to updateValue', async () => {
      const { showMentions, handleKeydown, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: 'hi @ali',
        selectionStart: 7,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
        focus: vi.fn(),
        setSelectionRange: vi.fn(),
      }
      inputFrom(checkMention, mockTextarea)
      expect(showMentions.value).toBe(true)

      const updateValue = vi.fn()
      handleKeydown({ key: 'Enter', preventDefault: vi.fn() }, 'hi @ali', updateValue)

      const expectedText = 'hi @[Alice Smith](person:1) '
      expect(updateValue).toHaveBeenCalledWith(expectedText, expectedText.length)
      expect(showMentions.value).toBe(false)
    })

    it('should close mentions on Escape', async () => {
      const { showMentions, handleKeydown, checkMention, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: '@',
        selectionStart: 1,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }
      inputFrom(checkMention, mockTextarea)
      expect(showMentions.value).toBe(true)

      const mockEvent = { key: 'Escape', preventDefault: vi.fn() }
      handleKeydown(mockEvent, '@', vi.fn())

      expect(showMentions.value).toBe(false)
    })
  })

  describe('hideMentions', () => {
    it('should hide mentions', async () => {
      const { showMentions, checkMention, hideMentions, refreshPersons } = useMentions()
      await refreshPersons()

      const mockTextarea = {
        value: '@',
        selectionStart: 1,
        getBoundingClientRect: () => ({ top: 100, left: 100 }),
      }
      inputFrom(checkMention, mockTextarea)
      expect(showMentions.value).toBe(true)

      hideMentions()

      expect(showMentions.value).toBe(false)
    })
  })

  describe('refreshPersons', () => {
    it('should reload persons from API', async () => {
      const { api } = await import('../services/api.js')
      const { refreshPersons } = useMentions()

      await refreshPersons()

      expect(api.getNodes).toHaveBeenCalledWith(expect.objectContaining({ type: 'person' }))
    })
  })
})
