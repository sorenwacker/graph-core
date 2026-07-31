import { ref, nextTick, toValue } from 'vue'
import { api } from '../services/api.js'
import { useErrorHandler } from './useErrorHandler'

/**
 * Composable for @person mentions in textarea fields
 * @param {Object} options - Configuration options
 * @param {Function} options.onMentionInserted - Callback when a mention is inserted (receives personId, nodeId)
 * @param {string|import('vue').Ref<string>|(() => string)} options.workspaceId - Current
 *   workspace ID. Pass a ref or getter when the workspace can change while the
 *   editor stays mounted; it is read at load time, so refreshPersons() then
 *   re-scopes the list to the current workspace.
 * @returns {Object} - Mention handlers and state
 */
export function useMentions(options = {}) {
  const { onMentionInserted, workspaceId = 'work' } = options
  const { handleError } = useErrorHandler()

  const showMentions = ref(false)
  const mentionQuery = ref('')
  const mentionPosition = ref({ top: 0, left: 0 })
  const mentionStartIndex = ref(-1)
  const mentionEndIndex = ref(-1)
  const persons = ref([])
  const filteredPersons = ref([])
  const selectedMentionIndex = ref(0)
  const textareaEl = ref(null)

  // Load all persons from the workspace that is current *now*. Concurrent loads
  // (rapid workspace switches) are sequenced so a slow earlier response cannot
  // overwrite the newer workspace's list.
  let loadToken = 0
  async function loadPersons() {
    const token = ++loadToken
    try {
      const result = await api.getNodes({ type: 'person', workspace_id: toValue(workspaceId) ?? 'work' })
      if (token !== loadToken) return
      persons.value = result
    } catch (err) {
      if (token !== loadToken) return
      handleError(err, { context: 'Loading persons', silent: true })
      persons.value = []
    }
  }

  // Filter persons based on query
  function filterPersons(query) {
    if (!query) {
      filteredPersons.value = persons.value.slice(0, 10)
    } else {
      const q = query.toLowerCase()
      filteredPersons.value = persons.value.filter(p => p.title?.toLowerCase().includes(q)).slice(0, 10)
    }
    selectedMentionIndex.value = 0
  }

  // Calculate position for mention dropdown
  function calculatePosition(textarea, cursorPos) {
    // Get approximate position based on cursor
    const textBeforeCursor = textarea.value.substring(0, cursorPos)
    const lines = textBeforeCursor.split('\n')
    const currentLine = lines.length - 1
    const charInLine = lines[lines.length - 1].length

    // Get textarea position and style
    const rect = textarea.getBoundingClientRect()
    const style = getComputedStyle(textarea)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const fontSize = parseFloat(style.fontSize) || 13
    const charWidth = fontSize * 0.6 // Approximate char width

    // Calculate position
    const top = rect.top + paddingTop + (currentLine + 1) * lineHeight + window.scrollY
    const left = rect.left + paddingLeft + charInLine * charWidth + window.scrollX

    return {
      top: Math.min(top, window.innerHeight - 200),
      left: Math.min(left, window.innerWidth - 250),
    }
  }

  // Editor-agnostic mention detection. Callers provide the current text, the
  // cursor offset, and a getCoords() callback returning the dropdown position
  // ({ top, left } in viewport pixels), invoked only when a mention is active.
  function checkMention({ text, cursorPos, getCoords }) {
    // Look for @ that starts a mention
    const textBeforeCursor = text.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex >= 0) {
      // Check if this @ is the start of a mention (not part of email)
      const charBefore = lastAtIndex > 0 ? text[lastAtIndex - 1] : ' '
      const isValidStart = /[\s\n(]/.test(charBefore) || lastAtIndex === 0

      if (isValidStart) {
        const query = textBeforeCursor.substring(lastAtIndex + 1)
        // Check if query contains spaces (might be completing or invalid)
        const hasNewline = query.includes('\n')
        // '@[' is an already-inserted mention (@[Name](person:id)) - don't re-trigger
        const isCompletedMention = query.startsWith('[')

        if (!hasNewline && !isCompletedMention && query.length <= 30) {
          mentionStartIndex.value = lastAtIndex
          mentionEndIndex.value = cursorPos
          mentionQuery.value = query
          filterPersons(query)
          mentionPosition.value = getCoords()
          showMentions.value = true
          return
        }
      }
    }

    showMentions.value = false
  }

  // Handle keyboard navigation in mentions
  function handleKeydown(e, modelValue, updateValue, currentNodeId = null) {
    if (!showMentions.value) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedMentionIndex.value = Math.min(selectedMentionIndex.value + 1, filteredPersons.value.length - 1)
      return true
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
      return true
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(modelValue, updateValue, currentNodeId)
      return true
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      showMentions.value = false
      return true
    }

    return false
  }

  // Insert selected mention. updateValue receives the new text and the cursor
  // offset just after the inserted mention (so non-textarea editors can restore
  // the caret themselves).
  async function insertMention(modelValue, updateValue, currentNodeId = null) {
    const person = filteredPersons.value[selectedMentionIndex.value]
    if (!person) return

    const text = modelValue
    const cursorPos = mentionEndIndex.value >= 0 ? mentionEndIndex.value : 0

    // Replace @query with @[Person Name](person:id)
    const beforeMention = text.substring(0, mentionStartIndex.value)
    const afterMention = text.substring(cursorPos)
    const mentionText = `@[${person.title}](person:${person.id})`

    const newText = beforeMention + mentionText + ' ' + afterMention
    const newCursorPos = beforeMention.length + mentionText.length + 1
    updateValue(newText, newCursorPos)

    showMentions.value = false

    // Auto-link person to current node if callback provided
    if (onMentionInserted && currentNodeId) {
      try {
        await api.linkNodes(currentNodeId, person.id)
        onMentionInserted(person.id, currentNodeId)
      } catch (err) {
        handleError(err, { context: 'Linking mention' })
      }
    }
  }

  // Select mention by clicking
  function selectMention(index, modelValue, updateValue, currentNodeId = null) {
    selectedMentionIndex.value = index
    insertMention(modelValue, updateValue, currentNodeId)
  }

  // Initialize - load persons
  loadPersons()

  return {
    showMentions,
    mentionPosition,
    filteredPersons,
    selectedMentionIndex,
    checkMention,
    handleKeydown,
    selectMention,
    hideMentions: () => {
      showMentions.value = false
    },
    refreshPersons: loadPersons,
  }
}
