<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Add notes (Markdown supported)...' }
})

const emit = defineEmits(['update:modelValue', 'blur'])

const editorContainer = ref(null)
let editorView = null

// Custom dark theme to match app
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)'
  },
  '.cm-content': {
    fontFamily: 'inherit',
    lineHeight: '1.5',
    padding: '8px',
    caretColor: 'var(--accent-color)'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent-color)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.4) !important'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-tertiary)',
    border: 'none',
    borderRight: '1px solid var(--border-color)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-hover)'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  '.cm-placeholder': {
    color: 'var(--text-tertiary)',
    fontStyle: 'italic'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-scroller': {
    overflow: 'auto'
  }
}, { dark: true })

function initEditor() {
  if (!editorContainer.value || editorView) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const newContent = update.state.doc.toString()
      emit('update:modelValue', newContent)
    }
    if (update.focusChanged && !update.view.hasFocus) {
      emit('blur')
    }
  })

  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      markdown(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap
      ]),
      appTheme,
      EditorView.placeholder(props.placeholder),
      updateListener,
      EditorView.lineWrapping
    ]
  })

  editorView = new EditorView({
    state,
    parent: editorContainer.value
  })
}

function destroyEditor() {
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
}

// Update content when modelValue changes externally
watch(() => props.modelValue, (newValue) => {
  if (!editorView) return
  const currentContent = editorView.state.doc.toString()
  const newContent = newValue || ''
  if (currentContent !== newContent) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newContent
      }
    })
  }
})

onMounted(() => {
  nextTick(() => {
    initEditor()
  })
})

onUnmounted(() => {
  destroyEditor()
})
</script>

<template>
  <div ref="editorContainer" class="notes-editor-container"></div>
</template>

<style scoped>
.notes-editor-container {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-primary);
}

.notes-editor-container :deep(.cm-editor) {
  height: 100%;
}

.notes-editor-container :deep(.cm-scroller) {
  font-family: inherit;
}
</style>
