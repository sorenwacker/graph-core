<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'

const props = defineProps({
  node: Object,
  selected: Boolean,
  hideSensitive: Boolean
})

const emit = defineEmits(['select', 'toggle-complete', 'update-notes', 'add-child', 'delete'])

const typeLabel = computed(() => getTypeIcon(props.node.type))
const isPerson = computed(() => props.node.type === 'person')

const personStyle = computed(() => {
  if (isPerson.value) {
    const colors = getTypeColors('person', props.node.id)
    return { background: colors.bg, color: colors.text }
  }
  return {}
})
const editingNotes = ref(false)
const notesText = ref('')
const notesTextarea = ref(null)

watch(() => props.node.notes, (newNotes) => {
  if (!editingNotes.value) {
    notesText.value = newNotes || ''
  }
}, { immediate: true })

function selectNode(event) {
  const hasCmd = event.metaKey || event.ctrlKey
  const hasAlt = event.altKey

  if (hasCmd && hasAlt) {
    emit('delete', props.node.id)
  } else if (hasCmd) {
    emit('add-child', { parentId: props.node.id, title: '', prompt: true })
  } else {
    emit('select', props.node)
  }
}

function toggleComplete(event) {
  event.stopPropagation()
  emit('toggle-complete', props.node)
}

async function startEditingNotes(event) {
  event.stopPropagation()
  notesText.value = props.node.notes || ''
  editingNotes.value = true
  await nextTick()
  notesTextarea.value?.focus()
}

function saveNotes() {
  editingNotes.value = false
  if (notesText.value !== (props.node.notes || '')) {
    emit('update-notes', { node: props.node, notes: notesText.value })
  }
}

function cancelNotes(event) {
  event.stopPropagation()
  editingNotes.value = false
  notesText.value = props.node.notes || ''
}

function handleNotesKeydown(event) {
  if (event.key === 'Escape') {
    cancelNotes(event)
  } else if (event.key === 'Enter' && event.metaKey) {
    saveNotes()
  }
}
</script>

<template>
  <div
    class="node-card"
    :class="[{ selected }, `type-${node.type}`]"
    @click="selectNode($event)"
  >
    <div class="node-card-header">
      <span v-if="isPerson" class="node-card-type person" :style="personStyle" v-html="personIconSvg"></span>
      <span v-else class="node-card-type" :class="node.type">{{ typeLabel }}</span>
      <input
        v-if="node.type === 'task'"
        type="checkbox"
        :checked="node.completed"
        @change="toggleComplete"
        @click.stop
      />
    </div>
    <div class="node-card-title" :class="{ completed: node.completed }">
      {{ node.title }}
    </div>

    <!-- Interactive notes area -->
    <div class="node-card-notes-area" @click.stop>
      <textarea
        v-if="editingNotes"
        ref="notesTextarea"
        v-model="notesText"
        class="notes-textarea"
        placeholder="Add notes..."
        @blur="saveNotes"
        @keydown="handleNotesKeydown"
      ></textarea>
      <div
        v-else
        class="notes-display"
        :class="{ empty: !node.notes, sensitive: node.notes_sensitive && hideSensitive }"
        @click="startEditingNotes"
      >
        <template v-if="node.notes_sensitive && hideSensitive">
          [Sensitive content hidden]
        </template>
        <template v-else>
          {{ node.notes || 'Add notes...' }}
        </template>
      </div>
    </div>

    <div v-if="node.due_date" class="node-card-due">
      Due: {{ node.due_date }}
    </div>
  </div>
</template>

<style scoped>
.node-card.selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
}

.node-card-title.completed {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.node-card-notes-area {
  margin-top: var(--spacing-sm);
  width: 100%;
}

.notes-display {
  font-size: 0.85rem;
  color: var(--text-secondary);
  cursor: text;
  padding: 4px 6px;
  border-radius: 4px;
  min-height: 1.4em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-display:hover {
  background: var(--bg-hover);
}

.notes-display.empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.notes-display.sensitive {
  color: var(--text-tertiary);
  font-style: italic;
}

.notes-textarea {
  width: 100%;
  min-height: 1.6em;
  max-height: 50%;
  font-size: 0.85rem;
  font-family: inherit;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 6px;
  resize: vertical;
  field-sizing: content;
}

.notes-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.node-card-due {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: var(--spacing-sm);
}

/* Person type with SVG icon */
.node-card-type.person {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 3px;
}

.node-card-type.person :deep(svg) {
  width: 12px;
  height: 12px;
}
</style>
