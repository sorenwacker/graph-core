<script setup>
/**
 * Earlier versions of a node's title and notes, one shown in full so it can
 * be read before it is restored (docs/guides/detail-panel.md, "Version
 * history"). Shown in place of the notes editor.
 *
 * A node read withholds sensitive notes, and so does the history; a version's
 * notes are fetched through getNodeVersionNotes only once the node's own notes
 * have been revealed (docs/architecture/sensitive-notes.md).
 */
import { ref, watch, computed } from 'vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { api } from '../../services/api'
import { notesForDisplay } from '../../utils/nodeDisplay.js'

const props = defineProps({
  nodeId: { type: Number, required: true },
  // The node's own notes are still withheld: no version's notes are shown either
  notesWithheld: { type: Boolean, default: false },
})

const emit = defineEmits(['restore'])

const versions = ref([])
const selected = ref(null)
// Notes fetched for the selected version when the history withheld them
const fetchedNotes = ref(null)
const error = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    versions.value = await api.getNodeHistory(props.nodeId)
  } catch (e) {
    console.error('getNodeHistory failed:', e)
    versions.value = []
    error.value = 'The history could not be loaded'
  } finally {
    loading.value = false
  }
  select(versions.value[0] ?? null)
}

async function select(version) {
  selected.value = version
  fetchedNotes.value = null
  error.value = ''
  if (!version || !version.notes_withheld || props.notesWithheld) return
  try {
    const { notes, locked } = await api.getNodeVersionNotes(version.id)
    if (selected.value?.id !== version.id) return
    if (locked) {
      error.value = 'This version cannot be decrypted with the current key'
      return
    }
    fetchedNotes.value = notes ?? ''
  } catch (e) {
    console.error('getNodeVersionNotes failed:', e)
    error.value = 'The notes of this version could not be loaded'
  }
}

watch(() => props.nodeId, load, { immediate: true })

// A version's text comes from the one display function, like every view's;
// a withheld version's text is what getNodeVersionNotes handed out
const selectedNotes = computed(() => {
  if (!selected.value) return null
  return selected.value.notes_withheld ? fetchedNotes.value : notesForDisplay(selected.value).text
})

// The notes are at hand, or the version never had any
const canRestore = computed(
  () => Boolean(selected.value) && (selectedNotes.value !== null || !selected.value.notes_withheld)
)

function savedAt(version) {
  return new Date(version.saved_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Each version names the write that replaced it */
function replacedBy(version) {
  return version.source === 'restore' ? 'before a restore' : 'before an edit'
}

function restore() {
  if (!canRestore.value) return
  emit('restore', { title: selected.value.title, notes: selectedNotes.value })
}
</script>

<template>
  <div class="node-history" data-testid="node-history">
    <ul class="history-list">
      <li v-if="!loading && versions.length === 0" class="history-empty">
        No earlier versions yet. A version is kept whenever the title or notes change after a pause of ten minutes or
        more.
      </li>
      <li
        v-for="version in versions"
        :key="version.id"
        class="history-item"
        :class="{ selected: selected?.id === version.id }"
        @click="select(version)"
      >
        <span class="history-time">{{ savedAt(version) }}</span>
        <span class="history-meta">{{ replacedBy(version) }}</span>
        <span class="history-title">{{ version.title || 'Untitled' }}</span>
      </li>
    </ul>
    <div v-if="selected" class="history-version">
      <div class="history-version-bar">
        <span class="history-version-title">{{ selected.title || 'Untitled' }}</span>
        <button class="history-restore" :disabled="!canRestore" @click="restore">Restore this version</button>
      </div>
      <p v-if="error" class="history-error" role="alert">{{ error }}</p>
      <p v-else-if="notesWithheld && selected.notes_withheld" class="history-hint">
        Show the sensitive notes first to read this version.
      </p>
      <div v-else class="history-notes markdown-body">
        <MarkdownRenderer v-if="selectedNotes" :content="selectedNotes" />
        <p v-else class="placeholder">No notes in this version</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-history {
  display: flex;
  min-height: 200px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 200px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border-color);
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.history-item:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.history-item.selected {
  background: var(--bg-secondary);
  box-shadow: inset 3px 0 0 var(--accent-color);
}

.history-time {
  font-size: 12px;
  color: var(--text-primary);
}

.history-meta,
.history-title {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-empty,
.history-hint,
.history-error {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.history-error {
  color: var(--error-color, #c0392b);
}

.history-version {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.history-version-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
}

.history-version-title {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-restore {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: white;
  cursor: pointer;
}

.history-restore:disabled {
  opacity: 0.5;
  cursor: default;
}

.history-notes {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 13px;
}
</style>
