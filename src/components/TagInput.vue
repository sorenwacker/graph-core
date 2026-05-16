<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../services/api.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { getGraphColors } from '../utils/constants.js'

const { handleError } = useErrorHandler()

const props = defineProps({
  nodeId: { type: Number, required: true },
  workspaceId: { type: [String, Number], default: null },
  linkedTags: { type: Array, default: () => [] },
})

const emit = defineEmits(['link', 'unlink', 'refresh'])

const inputValue = ref('')
const showSuggestions = ref(false)
const allTagNodes = ref([])
const inputRef = ref(null)
const isLoading = ref(false)

async function loadTagNodes() {
  try {
    const tags = await api.getTagNodes(props.workspaceId)
    allTagNodes.value = tags || []
  } catch (err) {
    handleError(err, { context: 'Loading tag nodes', silent: true })
    allTagNodes.value = []
  }
}

loadTagNodes()

watch(() => props.workspaceId, loadTagNodes)

const filteredSuggestions = computed(() => {
  const linkedIds = new Set((props.linkedTags || []).map(t => t?.id).filter(Boolean))
  const query = inputValue.value.toLowerCase().replace(/^#/, '').trim()

  let filtered = allTagNodes.value.filter(tag => tag && !linkedIds.has(tag.id))

  if (query) {
    filtered = filtered.filter(tag => tag.title && tag.title.toLowerCase().includes(query))
  }

  return filtered.slice(0, 10)
})

const showCreateOption = computed(() => {
  if (!inputValue.value.trim()) return false
  const query = inputValue.value.toLowerCase().replace(/^#/, '').trim()
  return !allTagNodes.value.some(tag => tag.title && tag.title.toLowerCase() === query)
})

async function addTag(tagNode) {
  if (isLoading.value || !props.nodeId || !tagNode?.id) return
  isLoading.value = true

  try {
    await api.linkNodes(props.nodeId, tagNode.id)
    emit('link', tagNode)
    emit('refresh')
  } catch (err) {
    handleError(err, { context: 'Linking tag' })
  } finally {
    isLoading.value = false
    inputValue.value = ''
    showSuggestions.value = false
  }
}

async function createAndAddTag() {
  if (isLoading.value || !props.nodeId) return
  const tagName = inputValue.value.replace(/^#/, '').trim()
  if (!tagName) return

  isLoading.value = true

  try {
    const tagNode = await api.getOrCreateTagNode(tagName, props.workspaceId)
    if (tagNode?.id) {
      await api.linkNodes(props.nodeId, tagNode.id)
      await loadTagNodes()
      emit('link', tagNode)
      emit('refresh')
    }
  } catch (err) {
    handleError(err, { context: 'Creating tag' })
  } finally {
    isLoading.value = false
    inputValue.value = ''
    showSuggestions.value = false
  }
}

async function removeTag(tagNode) {
  if (isLoading.value || !props.nodeId || !tagNode?.id) return
  isLoading.value = true

  const tagId = tagNode.id

  try {
    // Unlink the tag from this node
    await api.unlinkNodes(props.nodeId, tagId)

    // Emit unlink first so parent can update its local state
    emit('unlink', tagNode)

    // Check if tag has any remaining links - if not, delete it
    // Do this after emitting unlink so the UI has already updated
    const remainingLinks = await api.getLinkedNodes(tagId)
    if (!remainingLinks || remainingLinks.length === 0) {
      try {
        await api.deleteNode(tagId, true) // hard delete orphan tag
      } catch (deleteErr) {
        // Ignore deletion errors - tag may already be gone
        console.warn('Could not delete orphan tag:', deleteErr)
      }
    }

    // Refresh the tag list after all operations
    await loadTagNodes()

    // Emit refresh last
    emit('refresh')
  } catch (err) {
    handleError(err, { context: 'Unlinking tag' })
  } finally {
    isLoading.value = false
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && inputValue.value.trim()) {
    e.preventDefault()
    if (filteredSuggestions.value.length > 0) {
      addTag(filteredSuggestions.value[0])
    } else if (showCreateOption.value) {
      createAndAddTag()
    }
  } else if (e.key === 'Backspace' && !inputValue.value && props.linkedTags?.length > 0) {
    removeTag(props.linkedTags[props.linkedTags.length - 1])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
    inputRef.value?.blur()
  }
}

function handleInput(e) {
  inputValue.value = e.target.value
  showSuggestions.value = true
}

function selectSuggestion(tagNode) {
  addTag(tagNode)
  inputRef.value?.focus()
}

function getTagColor(tagId) {
  const colors = getGraphColors('tag', tagId)
  return colors.border
}

function handleBlur() {
  setTimeout(() => {
    showSuggestions.value = false
  }, 150)
}
</script>

<template>
  <div class="tag-input-container">
    <div class="tags-row">
      <span v-for="tag in linkedTags" :key="tag.id" class="tag-chip" :style="{ borderColor: getTagColor(tag.id) }">
        <span class="tag-dot" :style="{ backgroundColor: getTagColor(tag.id) }"></span>
        {{ tag.title }}
        <button class="remove-tag" @click="removeTag(tag)" :disabled="isLoading">x</button>
      </span>
      <input
        ref="inputRef"
        :value="inputValue"
        type="text"
        placeholder="Add tag..."
        class="tag-input"
        :disabled="isLoading"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="showSuggestions = true"
        @blur="handleBlur"
      />
    </div>
    <div v-if="showSuggestions && (filteredSuggestions.length > 0 || showCreateOption)" class="tag-suggestions">
      <div
        v-for="tag in filteredSuggestions"
        :key="tag.id"
        class="tag-suggestion"
        @mousedown.prevent="selectSuggestion(tag)"
      >
        <span class="tag-dot" :style="{ backgroundColor: getTagColor(tag.id) }"></span>
        {{ tag.title }}
      </div>
      <div v-if="showCreateOption" class="tag-suggestion create-new" @mousedown.prevent="createAndAddTag">
        <span class="create-icon">+</span>
        Create "{{ inputValue.replace(/^#/, '').trim() }}"
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-input-container {
  position: relative;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  min-height: 22px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(93, 173, 226, 0.1);
  border: 1px solid;
  padding: 1px 5px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tag-chip .remove-tag {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0 1px;
  font-size: 10px;
  opacity: 0.7;
  line-height: 1;
}

.tag-chip .remove-tag:hover {
  opacity: 1;
}

.tag-chip .remove-tag:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.tag-input {
  flex: 0 0 auto;
  width: 50px;
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 11px;
  padding: 1px 5px;
  outline: none;
  transition: all 0.15s;
}

.tag-input:focus {
  border-style: solid;
  border-color: var(--accent-color);
  width: 80px;
}

.tag-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tag-input::placeholder {
  color: var(--text-tertiary);
  font-size: 11px;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elevated, #1a1f2e);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tag-suggestion {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
}

.tag-suggestion:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tag-suggestion.create-new {
  border-top: 1px solid var(--border-color);
  color: var(--accent-color);
}

.create-icon {
  font-weight: bold;
}
</style>
