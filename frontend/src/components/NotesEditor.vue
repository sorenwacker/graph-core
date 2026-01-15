<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

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
        history(),
        markdown(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        theme,
        EditorView.lineWrapping,
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
</script>

<template>
  <div ref="container" class="cm-container"></div>
</template>

<style scoped>
.cm-container {
  height: 100%;
  min-height: 150px;
  background: #0d0d0d;
  border-radius: 4px;
  overflow: hidden;
}

.cm-container :deep(.cm-editor) {
  height: 100%;
  background: #0d0d0d;
  color: #e0e0e0;
}
</style>
