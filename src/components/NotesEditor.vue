<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

// Custom keymap for multi-cursor (Cmd+Alt+Up/Down)
const multiCursorKeymap = [
  {
    key: 'Alt-ArrowUp',
    mac: 'Cmd-Alt-ArrowUp',
    run: (view) => {
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
          selection: EditorSelection.create(ranges.sort((a, b) => a.from - b.from))
        })
        return true
      }
      return false
    }
  },
  {
    key: 'Alt-ArrowDown',
    mac: 'Cmd-Alt-ArrowDown',
    run: (view) => {
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
          selection: EditorSelection.create(ranges.sort((a, b) => a.from - b.from))
        })
        return true
      }
      return false
    }
  }
]

const props = defineProps({
  modelValue: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'blur'])

const container = ref(null)
let editor = null

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit'
  },
  '.cm-content': {
    padding: '8px',
    caretColor: '#3b82f6'
  },
  '.cm-line': {
    padding: '0 4px'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.3) !important'
  },
  '.cm-cursor': {
    borderLeftColor: '#3b82f6',
    borderLeftWidth: '2px'
  },
  '.cm-gutters': {
    backgroundColor: '#1a1a1a',
    color: '#666',
    border: 'none'
  }
}, { dark: true })

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
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        highlightSelectionMatches(),
        history(),
        markdown(),
        keymap.of([...multiCursorKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        theme,
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(true),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            emit('update:modelValue', update.state.doc.toString())
          }
          if (update.focusChanged && !update.view.hasFocus) {
            emit('blur')
          }
        })
      ]
    })
  })
}

watch(() => props.modelValue, (newVal) => {
  if (!editor) return
  const current = editor.state.doc.toString()
  if (newVal !== current) {
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: newVal || '' }
    })
  }
})

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
    changes: { from, to, insert: newText }
  })
}

defineExpose({ getSelection, replaceSelection })
</script>

<template>
  <div ref="container" class="cm-container"></div>
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
