<template>
  <textarea
    v-if="isEditing"
    ref="textareaRef"
    class="card-notes-textarea"
    :class="sizeClass"
    :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value)"
    @blur="$emit('save')"
    @keydown="handleKeydown"
    @click.stop
    @dblclick.stop
    @dragstart.prevent.stop
    placeholder="Add notes..."
  ></textarea>
  <!-- Rendered even with no notes: without a placeholder an empty card has no
       click target, so its notes can never be started. -->
  <div
    v-else
    class="card-notes-display"
    :class="[sizeClass, { sensitive, empty: !hasNotes && !sensitive }]"
    @click.stop="!sensitive && $emit('startEdit')"
    @dblclick.stop
  >
    <span v-if="sensitive" class="lock-icon-display">&#128274;</span>
    <div v-else-if="hasNotes" class="markdown-content" v-html="renderedNotes"></div>
    <span v-else class="notes-placeholder">Add notes...</span>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { decodeHtmlEntities } from '../utils/html.js'
import { sanitizeHtml } from '../utils/markdown.js'

const props = defineProps({
  notes: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  isEditing: { type: Boolean, default: false },
  sensitive: { type: Boolean, default: false },
  size: { type: String, default: 'normal' }, // 'normal', 'child', 'grandchild'
})

const emit = defineEmits(['update:modelValue', 'startEdit', 'save', 'cancel'])

const textareaRef = ref(null)

const hasNotes = computed(() => props.notes && props.notes.trim().length > 0)

const sizeClass = computed(() => {
  return (
    {
      normal: 'size-normal',
      child: 'size-child',
      grandchild: 'size-grandchild',
    }[props.size] || 'size-normal'
  )
})

const renderedNotes = computed(() => {
  if (!props.notes) return ''
  return sanitizeHtml(marked.parse(decodeHtmlEntities(props.notes)))
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
  // Allow Enter for multiline notes (no save on Enter)
}

// Auto-focus when editing starts
watch(
  () => props.isEditing,
  editing => {
    if (editing) {
      nextTick(() => {
        textareaRef.value?.focus()
      })
    }
  }
)
</script>

<style scoped>
.card-notes-textarea {
  width: 100%;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.card-notes-textarea.size-normal {
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 16px;
  flex: 1;
  min-height: 60px;
}

.card-notes-textarea.size-child {
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  flex: 1;
  min-height: 40px;
}

.card-notes-textarea.size-grandchild {
  font-size: 11px;
  line-height: 1.4;
  padding: 6px 8px;
  flex: 1;
  min-height: 30px;
}

.card-notes-display {
  cursor: pointer;
  color: var(--text-secondary);
}

.card-notes-display.sensitive {
  cursor: default;
}

.card-notes-display.size-normal {
  font-size: 11px;
  line-height: 1.5;
  padding: 0 16px 0 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.card-notes-display.size-child {
  font-size: 10px;
  line-height: 1.4;
  padding: 4px 8px;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.card-notes-display.size-grandchild {
  font-size: 9px;
  line-height: 1.3;
}

/*
 * The empty placeholder is a click target, not content. It must come after the
 * size rules to override their flex values: a real note grows to fill the card
 * (flex: 1), but letting an empty one do the same would steal the space a
 * note-less card gives to its children.
 */
.card-notes-display.empty {
  opacity: 0.5;
  font-style: italic;
  flex: 0 0 auto;
  overflow: hidden;
}

.lock-icon-display {
  font-size: 1.2em;
}

/*
 * Markdown element styles must use :deep() because the content is injected
 * via v-html and therefore carries no scope attribute. Sizes are em-based so
 * they scale with the size-normal/child/grandchild font-size set above.
 * Colors mirror the sidebar markdown (MarkdownRenderer.vue) for consistency.
 */
.markdown-content {
  color: var(--text-primary);
  line-height: 1.6;
}

.markdown-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(del),
.markdown-content :deep(s) {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.markdown-content :deep(a) {
  color: #5dade2;
  text-decoration: underline;
  text-decoration-color: rgba(93, 173, 226, 0.4);
  text-underline-offset: 2px;
}

.markdown-content :deep(a:hover) {
  color: #7ec8f0;
  text-decoration-color: rgba(93, 173, 226, 0.8);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 0.5em 0 0.25em 0;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 1.5em;
}
.markdown-content :deep(h2) {
  font-size: 1.3em;
}
.markdown-content :deep(h3) {
  font-size: 1.1em;
}
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-size: 1em;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.2em;
  margin: 0.3em 0;
}

.markdown-content :deep(li) {
  margin: 0.15em 0;
}

.markdown-content :deep(code) {
  background: var(--bg-tertiary);
  padding: 0.1em 0.4em;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.9em;
  color: #a0e0a0;
}

.markdown-content :deep(pre) {
  background: var(--bg-tertiary);
  padding: 0.6em 0.8em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-content :deep(blockquote) {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid var(--accent-color);
  color: var(--text-secondary);
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 0.5em 0;
}

.markdown-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.9em;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.3em 0.5em;
  text-align: left;
}

.markdown-content :deep(th) {
  background: var(--bg-tertiary);
  font-weight: 600;
  color: var(--text-secondary);
}

.markdown-content :deep(tr:nth-child(even)) {
  background: var(--bg-secondary);
}

/* Task list checkboxes - scale based on context size */
.markdown-content :deep(input[type='checkbox']) {
  width: 1em;
  height: 1em;
  margin-right: 0.3em;
  vertical-align: middle;
}

.size-child .markdown-content :deep(input[type='checkbox']) {
  width: 0.9em;
  height: 0.9em;
}

.size-grandchild .markdown-content :deep(input[type='checkbox']) {
  width: 0.8em;
  height: 0.8em;
}
</style>
