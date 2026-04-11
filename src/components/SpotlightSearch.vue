<script setup>
import { ref, nextTick, watch } from 'vue'
import { getTypeIcon } from '../utils/constants.js'
import { decodeHtml } from '../utils/html.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  searchMode: { type: String, default: 'navigate' },
  searchQuery: { type: String, default: '' },
  searchResults: { type: Array, default: () => [] },
  recentItems: { type: Array, default: () => [] },
  selectedResultIndex: { type: Number, default: 0 },
  viewMode: { type: String, default: 'tree' },
  hasMoreResults: { type: Boolean, default: false },
  isLoadingMore: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'update:searchQuery',
  'update:selectedResultIndex',
  'search-input',
  'keydown',
  'select-result',
  'clear-recent',
  'load-more',
])

const resultsRef = ref(null)

function handleScroll(e) {
  if (!props.hasMoreResults || props.isLoadingMore) return
  const el = e.target
  // Load more when scrolled near bottom (within 100px)
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    emit('load-more')
  }
}

function onSearchInput(event) {
  emit('update:searchQuery', event.target.value)
  emit('search-input')
}

const searchInputRef = ref(null)

watch(
  () => props.visible,
  val => {
    if (val) {
      nextTick(() => searchInputRef.value?.focus())
    }
  }
)

function getImportanceLabel(importance) {
  const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }
  return labels[importance] || importance
}

function getSearchActionLabel(_result) {
  if (props.searchMode === 'link') return 'Link'
  if (props.searchMode === 'move') return 'Move to'
  return 'Go to'
}

function getPlaceholder() {
  if (props.searchMode === 'link') return 'Search to link...'
  if (props.searchMode === 'move') return 'Search for new parent...'
  return 'Search nodes...'
}

function getModeBadge() {
  if (props.searchMode === 'link') return 'Link mode'
  if (props.searchMode === 'move') return 'Move mode'
  return null
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="spotlight-overlay" @click.self="emit('close')">
      <div class="spotlight-modal">
        <div class="spotlight-header">
          <input
            ref="searchInputRef"
            :value="searchQuery"
            type="text"
            :placeholder="getPlaceholder()"
            class="spotlight-input"
            @input="onSearchInput"
            @keydown="emit('keydown', $event)"
          />
          <span class="spotlight-hint">
            <span class="key">esc</span> close <span class="key">up</span><span class="key">down</span> navigate
            <span class="key">enter</span> select
          </span>
        </div>

        <div ref="resultsRef" class="spotlight-results" v-if="searchResults.length > 0" @scroll="handleScroll">
          <div class="spotlight-results-header">
            <span v-if="getModeBadge()" class="link-mode-badge">{{ getModeBadge() }}</span>
            {{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }}
            <span class="current-view-badge">{{ viewMode }}</span>
          </div>
          <div
            v-for="(result, index) in searchResults"
            :key="result.id"
            class="spotlight-result"
            :class="{ selected: index === selectedResultIndex, completed: result.completed }"
            @click="emit('select-result', result)"
            @mouseenter="emit('update:selectedResultIndex', index)"
          >
            <div class="result-type-badge" :class="result.type">
              <span v-html="getTypeIcon(result.type)"></span>
            </div>
            <div class="result-body">
              <div class="result-title">{{ result.title }}</div>
              <div class="result-breadcrumb" v-if="result.breadcrumb">{{ result.breadcrumb }}</div>
              <div class="result-meta" v-if="result.due_date || result.importance">
                <span v-if="result.due_date" class="result-due">Due: {{ result.due_date.split('T')[0] }}</span>
                <span v-if="result.importance" class="result-priority">{{
                  getImportanceLabel(result.importance)
                }}</span>
              </div>
              <div v-if="result.notes" class="result-notes">
                {{ decodeHtml(result.notes).substring(0, 80) }}{{ result.notes.length > 80 ? '...' : '' }}
              </div>
            </div>
            <div class="result-action">
              {{ getSearchActionLabel(result) }}
              <span class="action-arrow">-></span>
            </div>
          </div>
          <div v-if="isLoadingMore" class="loading-more">Loading more...</div>
          <div v-else-if="hasMoreResults" class="load-more-hint">Scroll for more results</div>
        </div>

        <div class="spotlight-empty" v-else-if="searchQuery && searchQuery.length > 0">
          <div class="empty-text">No results for "{{ searchQuery }}"</div>
          <div class="empty-hint">Try different keywords</div>
        </div>

        <div class="spotlight-recents" v-else-if="recentItems.length > 0">
          <div class="spotlight-results-header">
            Recent
            <span class="clear-recents" @click="emit('clear-recent')">clear</span>
          </div>
          <div
            v-for="(item, index) in recentItems.slice(0, 10)"
            :key="'recent-' + item.id"
            class="spotlight-result"
            :class="{ selected: index === selectedResultIndex }"
            @click="emit('select-result', item)"
            @mouseenter="emit('update:selectedResultIndex', index)"
          >
            <div class="result-type-badge" :class="item.type">
              <span v-html="getTypeIcon(item.type)"></span>
            </div>
            <div class="result-body">
              <div class="result-title">{{ item.title }}</div>
            </div>
          </div>
        </div>

        <div class="spotlight-hint-footer" v-else>
          <div class="hint-text">Type to search all nodes</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Spotlight Search Modal - global styles for Teleport */
.spotlight-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.spotlight-modal {
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  width: 90%;
  max-width: 640px;
  max-height: 70vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.spotlight-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spotlight-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 18px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  outline: none;
}

.spotlight-input::placeholder {
  color: var(--text-tertiary);
}

.spotlight-hint {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.spotlight-hint .key {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: monospace;
  margin-right: 4px;
}

.spotlight-results,
.spotlight-recents {
  max-height: calc(70vh - 100px);
  overflow-y: auto;
}

.spotlight-results-header {
  padding: 10px 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  gap: 10px;
}

.link-mode-badge {
  background: #3b82f6;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
}

.current-view-badge {
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
}

.clear-recents {
  margin-left: auto;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.15s;
}

.clear-recents:hover {
  color: var(--text-primary);
}

.spotlight-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border-subtle);
}

.spotlight-result:last-child {
  border-bottom: none;
}

.spotlight-result:hover,
.spotlight-result.selected {
  background: var(--bg-hover);
}

.spotlight-result.completed {
  opacity: 0.6;
}

.spotlight-result.completed .result-title {
  text-decoration: line-through;
}

.result-type-badge {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.result-type-badge.project {
  background: var(--type-project-bg);
  color: var(--type-project-text);
}
.result-type-badge.task {
  background: var(--type-task-bg);
  color: var(--type-task-text);
}
.result-type-badge.note {
  background: var(--type-note-bg);
  color: var(--type-note-text);
}
.result-type-badge.milestone {
  background: var(--type-milestone-bg);
  color: var(--type-milestone-text);
}
.result-type-badge.group {
  background: var(--type-group-bg);
  color: var(--type-group-text);
}
.result-type-badge.event {
  background: var(--type-event-bg);
  color: var(--type-event-text);
}
.result-type-badge.topic {
  background: var(--type-topic-bg);
  color: var(--type-topic-text);
}
.result-type-badge.person {
  background: var(--type-person-bg);
  color: var(--type-person-text);
}
.result-type-badge.organization {
  background: var(--type-organization-bg);
  color: var(--type-organization-text);
}
.result-type-badge.component {
  background: var(--type-component-bg);
  color: var(--type-component-text);
}

.result-type-badge :deep(svg) {
  width: 16px;
  height: 16px;
}

.result-body {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.result-breadcrumb {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.result-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.result-due {
  color: var(--warning-color);
}

.result-priority {
  color: #f472b6;
}

.result-notes {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-action {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-arrow {
  color: var(--text-tertiary);
}

.spotlight-empty,
.spotlight-hint-footer {
  padding: 40px 20px;
  text-align: center;
}

.empty-text {
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-hint,
.hint-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.loading-more,
.load-more-hint {
  padding: 12px 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

.loading-more {
  color: var(--text-secondary);
}
</style>
