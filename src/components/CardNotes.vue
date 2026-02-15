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
  <div
    v-else-if="hasNotes || sensitive"
    class="card-notes-display"
    :class="[sizeClass, { sensitive }]"
    @click.stop="!sensitive && $emit('startEdit')"
    @dblclick.stop
  >
    <span v-if="sensitive" class="lock-icon-display">&#128274;</span>
    <div v-else class="markdown-content" v-html="renderedNotes"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  notes: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  isEditing: { type: Boolean, default: false },
  sensitive: { type: Boolean, default: false },
  size: { type: String, default: 'normal' } // 'normal', 'child', 'grandchild'
})

const emit = defineEmits(['update:modelValue', 'startEdit', 'save', 'cancel'])

const textareaRef = ref(null)

const hasNotes = computed(() => props.notes && props.notes.trim().length > 0)

const sizeClass = computed(() => {
  return {
    normal: 'size-normal',
    child: 'size-child',
    grandchild: 'size-grandchild'
  }[props.size] || 'size-normal'
})

// Decode HTML entities before rendering
function decodeHtmlEntities(text) {
  if (!text) return ''
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const renderedNotes = computed(() => {
  if (!props.notes) return ''
  return marked.parse(decodeHtmlEntities(props.notes))
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
  // Allow Enter for multiline notes (no save on Enter)
}

// Auto-focus when editing starts
watch(() => props.isEditing, (editing) => {
  if (editing) {
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})
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

.card-notes-display.empty {
  opacity: 0.5;
  font-style: italic;
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
}

.card-notes-display.size-grandchild {
  font-size: 9px;
  line-height: 1.3;
}

.lock-icon-display {
  font-size: 1.2em;
}

.markdown-content {
  /* Allow content to flow naturally */
}

.markdown-content a {
  color: #ffffff !important;
}

.markdown-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
