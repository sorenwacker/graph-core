<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../services/api.js'

const props = defineProps({
  tags: { type: Array, default: () => [] }
})

const emit = defineEmits(['update'])

const inputValue = ref('')
const showSuggestions = ref(false)
const allTags = ref([])
const inputRef = ref(null)

// Load all existing tags for autocomplete
async function loadAllTags() {
  try {
    allTags.value = await api.getAllTags()
  } catch (err) {
    console.error('Failed to load tags:', err)
    allTags.value = []
  }
}

loadAllTags()

const filteredSuggestions = computed(() => {
  if (!inputValue.value) return allTags.value.slice(0, 10)
  const query = inputValue.value.toLowerCase().replace(/^#/, '')
  return allTags.value
    .filter(tag => tag.toLowerCase().includes(query) && !props.tags.includes(tag))
    .slice(0, 10)
})

function addTag(tagName) {
  const tag = tagName.replace(/^#/, '').trim()
  if (tag && !props.tags.includes(tag)) {
    emit('update', [...props.tags, tag])
  }
  inputValue.value = ''
  showSuggestions.value = false
}

function removeTag(tag) {
  emit('update', props.tags.filter(t => t !== tag))
}

function handleKeydown(e) {
  if (e.key === 'Enter' && inputValue.value.trim()) {
    e.preventDefault()
    addTag(inputValue.value)
  } else if (e.key === 'Backspace' && !inputValue.value && props.tags.length > 0) {
    // Remove last tag when backspace on empty input
    removeTag(props.tags[props.tags.length - 1])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
    inputRef.value?.blur()
  }
}

function handleInput(e) {
  inputValue.value = e.target.value
  showSuggestions.value = true
}

function selectSuggestion(tag) {
  addTag(tag)
  inputRef.value?.focus()
}
</script>

<template>
  <div class="tag-input-container">
    <div class="tags-row">
      <span
        v-for="tag in tags"
        :key="tag"
        class="tag-chip"
      >
        #{{ tag }}
        <button class="remove-tag" @click="removeTag(tag)">x</button>
      </span>
      <input
        ref="inputRef"
        :value="inputValue"
        type="text"
        placeholder="Add tag..."
        class="tag-input"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="showSuggestions = true"
        @blur="setTimeout(() => showSuggestions = false, 150)"
      />
    </div>
    <div v-if="showSuggestions && filteredSuggestions.length > 0" class="tag-suggestions">
      <div
        v-for="tag in filteredSuggestions"
        :key="tag"
        class="tag-suggestion"
        @mousedown.prevent="selectSuggestion(tag)"
      >
        #{{ tag }}
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
  gap: 4px;
  align-items: center;
  min-height: 28px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(74, 144, 226, 0.2);
  color: #5dade2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.tag-chip .remove-tag {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0 2px;
  font-size: 11px;
  opacity: 0.7;
  line-height: 1;
}

.tag-chip .remove-tag:hover {
  opacity: 1;
}

.tag-input {
  flex: 0 0 auto;
  width: 60px;
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 11px;
  padding: 2px 8px;
  outline: none;
  transition: all 0.15s;
}

.tag-input:focus {
  border-style: solid;
  border-color: var(--accent-color);
  width: 100px;
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
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}

.tag-suggestion:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
