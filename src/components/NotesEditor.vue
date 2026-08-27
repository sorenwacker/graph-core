<script setup>
// Multi-root component (editor container plus the mention dropdown). Without
// this, a class passed by the parent (e.g. split-editor) is dropped, which
// breaks the split-view flex layout. Route fallthrough attrs to the container.
defineOptions({ inheritAttrs: false })
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorState, EditorSelection, Prec } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { insertNewlineTightList } from '../utils/markdownEditing.js'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import MentionDropdown from './MentionDropdown.vue'
import { useMentions } from '../composables/useMentions.js'

// Custom keymap for multi-cursor (Cmd+Alt+Up/Down)
const multiCursorKeymap = [
  {
    key: 'Alt-ArrowUp',
    mac: 'Cmd-Alt-ArrowUp',
    run: view => {
      const { state } = view
      const ranges = []
      for (const range of state.selection.ranges) {
        const line = state.doc.lineAt(range.head)
        if (line.number > 1) {
          const prevLine = state.doc.line(line.number - 1)
          const col = Math.min(range.head - line.from, prevLine.length)
          const newPos = prevLine.from + col
          ranges.push(EditorSelection.cursor(newPos))
        }
        ranges.push(range)
      }
      if (ranges.length > state.selection.ranges.length) {
        view.dispatch({
          selection: EditorSelection.create(ranges.sort((a, b) => a.from - b.from)),
        })
        return true
      }
      return false
    },
  },
  {
    key: 'Alt-ArrowDown',
    mac: 'Cmd-Alt-ArrowDown',
    run: view => {
      const { state } = view
      const ranges = []
      for (const range of state.selection.ranges) {
        ranges.push(range)
        const line = state.doc.lineAt(range.head)
        if (line.number < state.doc.lines) {
          const nextLine = state.doc.line(line.number + 1)
          const col = Math.min(range.head - line.from, nextLine.length)
          const newPos = nextLine.from + col
          ranges.push(EditorSelection.cursor(newPos))
        }
      }
      if (ranges.length > state.selection.ranges.length) {
        view.dispatch({
          selection: EditorSelection.create(ranges.sort((a, b) => a.from - b.from)),
        })
        return true
      }
      return false
    },
  },
]

const props = defineProps({
  modelValue: { type: String, default: '' },
  // Workspace used to load persons for @mention autocomplete
  workspaceId: { type: String, default: 'work' },
  // When set, inserting a mention auto-links the person to this node
  nodeId: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue', 'blur', 'mention-inserted'])

const container = ref(null)
let editor = null

// @person mention autocomplete
const {
  showMentions,
  mentionPosition,
  filteredPersons,
  selectedMentionIndex,
  checkMention,
  handleKeydown,
  selectMention,
  hideMentions,
  refreshPersons,
} = useMentions({
  // Getter, not a snapshot: the editor stays mounted across workspace switches,
  // so the person list must be re-scoped when the prop changes.
  workspaceId: () => props.workspaceId,
  onMentionInserted: (personId, nodeId) => emit('mention-inserted', { personId, nodeId }),
})

watch(
  () => props.workspaceId,
  () => {
    hideMentions()
    refreshPersons()
  }
)

// Apply the text produced by insertMention to the editor and place the caret
// just after the inserted mention.
function applyMentionText(newText, cursorPos) {
  if (!editor) return
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: newText },
    selection: { anchor: Math.min(cursorPos, newText.length) },
  })
  editor.focus()
}

// Run mention detection against the current document and cursor position.
function detectMention(view) {
  const sel = view.state.selection.main
  if (!sel.empty) {
    hideMentions()
    return
  }
  checkMention({
    text: view.state.doc.toString(),
    cursorPos: sel.head,
    getCoords: () => {
      const coords = view.coordsAtPos(sel.head)
      if (!coords) return { top: 0, left: 0 }
      return {
        top: Math.min(coords.bottom + 4, window.innerHeight - 200),
        left: Math.min(coords.left, window.innerWidth - 250),
      }
    },
  })
}

function onMentionSelect(index) {
  if (!editor) return
  selectMention(index, editor.state.doc.toString(), applyMentionText, props.nodeId)
}

function onMentionHover(index) {
  selectedMentionIndex.value = index
}

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'inherit',
    },
    '.cm-content': {
      padding: '8px',
      caretColor: '#3b82f6',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#3b82f6',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: '#1a1a1a',
      color: '#666',
      border: 'none',
    },
  },
  { dark: true }
)

function setupEditor() {
  if (!container.value) return

  if (editor) {
    editor.destroy()
    editor = null
  }

  const startDoc = props.modelValue || ''

  editor = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: startDoc,
      extensions: [
        // Highest precedence so mention navigation (ArrowUp/Down, Enter, Tab,
        // Escape) wins over the default and markdown keymaps while the
        // mention dropdown is open; handleKeydown returns false otherwise.
        Prec.highest(
          EditorView.domEventHandlers({
            keydown: (e, view) => handleKeydown(e, view.state.doc.toString(), applyMentionText, props.nodeId),
          })
        ),
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        highlightSelectionMatches(),
        history(),
        markdown(),
        // markdown() already binds Enter and Backspace at Prec.high; only Enter
        // is overridden here, to keep lists tight.
        Prec.highest(keymap.of([{ key: 'Enter', run: insertNewlineTightList }])),
        keymap.of([...multiCursorKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        theme,
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(true),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            emit('update:modelValue', update.state.doc.toString())
          }
          if (update.docChanged || (update.selectionSet && showMentions.value)) {
            // Detect on typing; while the dropdown is open, cursor moves
            // re-validate the query (and hide when the cursor leaves it).
            detectMention(update.view)
          }
          if (update.focusChanged && !update.view.hasFocus) {
            hideMentions()
            emit('blur')
          }
        }),
      ],
    }),
  })
}

watch(
  () => props.modelValue,
  newVal => {
    if (!editor) return
    const current = editor.state.doc.toString()
    if (newVal !== current) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: newVal || '' },
      })
    }
  }
)

onMounted(() => {
  nextTick(setupEditor)
})

onUnmounted(() => {
  if (editor) {
    editor.destroy()
    editor = null
  }
})

// Expose methods for selection handling
function getSelection() {
  if (!editor) return { text: '', from: 0, to: 0 }
  const state = editor.state
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)
  return { text, from, to }
}

function replaceSelection(newText) {
  if (!editor) return
  const { from, to } = editor.state.selection.main
  editor.dispatch({
    changes: { from, to, insert: newText },
  })
}

function getScrollElement() {
  if (!editor) return null
  return editor.scrollDOM
}

function getScrollInfo() {
  if (!editor) return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
  const el = editor.scrollDOM
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }
}

function setScrollTop(scrollTop) {
  if (!editor) return
  editor.scrollDOM.scrollTop = scrollTop
}

defineExpose({ getSelection, replaceSelection, getScrollElement, getScrollInfo, setScrollTop })
</script>

<template>
  <div ref="container" class="cm-container" v-bind="$attrs"></div>
  <!-- @person mention autocomplete (teleports itself to body) -->
  <MentionDropdown
    v-if="showMentions"
    :persons="filteredPersons"
    :selected-index="selectedMentionIndex"
    :position="mentionPosition"
    @select="onMentionSelect"
    @hover="onMentionHover"
  />
</template>

<style scoped>
.cm-container {
  height: 100%;
  min-height: 150px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.cm-container :deep(.cm-editor) {
  height: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.cm-container :deep(.cm-gutters) {
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  border: none;
}

.cm-container :deep(.cm-activeLineGutter) {
  background: var(--bg-hover);
}

.cm-container :deep(.cm-activeLine) {
  background: var(--bg-hover);
}
</style>
