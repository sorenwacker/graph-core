<script setup>
import { computed } from 'vue'
import CardTitleEdit from './CardTitleEdit.vue'
import CardNotes from './CardNotes.vue'

const props = defineProps({
  nodes: { type: Array, required: true },
  selectedId: Number,
  selectedIds: { type: Array, default: () => [] },
  hideCompleted: { type: Boolean, default: false },
  currentContainerId: [Number, String],
  colorMap: { type: Object, default: () => ({}) },
  cardSizeClass: { type: String, default: 'card-md' },
  gridStyle: { type: Object, default: () => ({}) },
  editingCardId: Number,
  editingTitle: String,
  inlineNotesId: Number,
  inlineNotesText: String,
  dragOverNodeId: Number,
  dragPosition: String
})

const emit = defineEmits([
  'select',
  'select-multiple',
  'enter',
  'toggle-complete',
  'delete',
  'add-child',
  'create',
  'context-menu',
  'show-tooltip',
  'hide-tooltip',
  'drag-start',
  'drag-end',
  'drag-over',
  'drag-leave',
  'drop',
  'start-edit',
  'save-edit',
  'cancel-edit',
  'start-notes',
  'save-notes',
  'cancel-notes',
  'update:editingTitle',
  'update:inlineNotesText'
])

function isCardSelected(nodeId) {
  return props.selectedId === nodeId || props.selectedIds.includes(nodeId)
}

function getNodeColor(node) {
  return props.colorMap[node.id]
}

function getCardDropClass(node) {
  if (props.dragOverNodeId !== node.id) return ''
  return props.dragPosition === 'before' ? 'drop-before' :
         props.dragPosition === 'after' ? 'drop-after' :
         props.dragPosition === 'inside' ? 'drop-inside' : ''
}

function handleCardClick(e, node) {
  const hasCmd = e.metaKey || e.ctrlKey
  const hasAlt = e.altKey

  if (hasCmd && hasAlt) {
    // Cmd/Ctrl+Alt+click: delete node
    emit('delete', node.id)
  } else if (hasCmd) {
    // Cmd/Ctrl+click: add child node
    emit('add-child', node.id, e)
  } else if (e.shiftKey) {
    // Shift+click: multi-select
    emit('select-multiple', node)
  } else {
    emit('select', node)
  }
}

function handleChildCardClick(e, child) {
  e.stopPropagation()
  handleCardClick(e, child)
}

function handleGrandchildClick(e, grandchild) {
  e.stopPropagation()
  handleCardClick(e, grandchild)
}

function getImportanceLabel(importance) {
  const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }
  return labels[importance] || importance
}

function getDateCountdown(node) {
  const targetDate = node.start_date || node.due_date || node.end_date
  if (!targetDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)

  const days = Math.ceil((target - today) / (1000 * 60 * 60 * 24))

  if (node.start_date && days > 0) {
    return { text: `in ${days}d`, type: 'future' }
  } else if (days < 0) {
    return { text: `${Math.abs(days)}d ago`, type: 'past' }
  } else if (days === 0) {
    return { text: 'today', type: 'today' }
  } else if (days <= 7) {
    return { text: `${days}d`, type: 'soon' }
  }
  return null
}

function getDueDateStatus(dueDate) {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (days < 0) return { text: 'overdue', type: 'overdue' }
  if (days === 0) return { text: 'today', type: 'today' }
  return null
}

function isSensitiveNode(node) {
  return node.notes_sensitive
}

function decodeHtml(html) {
  if (!html) return ''
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}

function nestedGridStyle(count, depth) {
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3
  return { gridTemplateColumns: `repeat(${cols}, 1fr)` }
}

function getNestedCardSize(count, depth) {
  if (count <= 2) return 'child-lg'
  if (count <= 4) return 'child-md'
  return 'child-sm'
}

const filteredNodes = computed(() => {
  if (!props.hideCompleted) return props.nodes
  return props.nodes.filter(n => !n.completed && !n.inheritedCompleted)
})

function handleCanvasClick(e) {
  if (e.metaKey || e.ctrlKey) {
    // Cmd/Ctrl+click on canvas: create new node
    emit('create')
  } else {
    // Regular click: deselect
    emit('select', null)
  }
}
</script>

<template>
  <div class="cards-view" :style="gridStyle" @click.self="handleCanvasClick">
    <div
      v-for="node in filteredNodes"
      :key="node.id"
      class="node-card"
      :class="[cardSizeClass, `type-${node.type}`, { selected: isCardSelected(node.id) }, getCardDropClass(node)]"
      :style="getNodeColor(node) ? { background: `linear-gradient(135deg, ${getNodeColor(node)}33 0%, var(--bg-primary) 80%)` } : {}"
      :draggable="editingCardId !== node.id && inlineNotesId !== node.id"
      @click="handleCardClick($event, node)"
      @dblclick="emit('enter', node)"
      @dragstart="emit('drag-start', $event, node)"
      @dragend="emit('drag-end')"
      @dragover="emit('drag-over', $event, node)"
      @dragleave="emit('drag-leave')"
      @drop="emit('drop', $event, node)"
      @mouseenter="emit('show-tooltip', $event, node)"
      @mouseleave="emit('hide-tooltip')"
      @contextmenu.prevent="emit('context-menu', $event, node)"
    >
      <!-- Header -->
      <div class="node-card-header">
        <span v-if="node.favorite" class="card-favorite-star" title="Favorite">&#9733;</span>
        <span v-if="cardSizeClass !== 'card-xs'" class="drag-handle card-drag" title="Drag to reorder">::</span>
        <span class="node-card-type" :class="node.type" :title="'Type: ' + node.type">
          {{ cardSizeClass === 'card-xs' ? node.type[0].toUpperCase() : node.type.toUpperCase() }}
        </span>
        <span v-if="node.importance" class="card-importance" :class="'imp-' + node.importance" :title="getImportanceLabel(node.importance)">
          {{ cardSizeClass === 'card-xs' ? node.importance : getImportanceLabel(node.importance) }}
        </span>
        <span v-if="node.children?.length && cardSizeClass !== 'card-xs'" class="node-card-children" :title="node.children.length + ' children'">
          {{ node.children.length }}
        </span>
        <span
          v-if="getDateCountdown(node)"
          class="date-countdown"
          :class="getDateCountdown(node).type"
          :title="node.start_date ? 'Start: ' + node.start_date : 'Due: ' + (node.due_date || node.end_date)"
        >{{ getDateCountdown(node).text }}</span>
        <span
          v-if="getDueDateStatus(node.due_date) && !node.completed && getDueDateStatus(node.due_date).type === 'overdue'"
          class="due-warning"
          :class="getDueDateStatus(node.due_date).type"
          :title="'Due: ' + node.due_date"
        >{{ getDueDateStatus(node.due_date).text }}</span>
        <button class="card-add-btn" @click.stop="emit('add-child', node.id, $event)" title="Add child item">+</button>
        <button class="card-delete-btn" @click.stop="emit('delete', node.id)" title="Delete">x</button>
      </div>

      <!-- Title row with checkbox -->
      <div class="node-card-title-row">
        <input
          v-if="node.type === 'task'"
          type="checkbox"
          class="card-checkbox"
          :checked="node.completed"
          @click.stop
          @change.stop="emit('toggle-complete', node)"
          title="Mark as complete"
        />
        <CardTitleEdit
          :title="node.title"
          :model-value="editingTitle"
          :is-editing="editingCardId === node.id"
          :completed="node.completed"
          size="normal"
          @start-edit="emit('start-edit', node, $event)"
          @save="emit('save-edit')"
          @cancel="emit('cancel-edit')"
          @update:model-value="emit('update:editingTitle', $event)"
        />
      </div>

      <!-- Interactive notes area -->
      <CardNotes
        :notes="node.notes"
        :model-value="inlineNotesText"
        :is-editing="inlineNotesId === node.id"
        :sensitive="isSensitiveNode(node)"
        size="normal"
        @start-edit="emit('start-notes', node, $event)"
        @save="emit('save-notes')"
        @cancel="emit('cancel-notes')"
        @update:model-value="emit('update:inlineNotesText', $event)"
      />

      <!-- Metadata - xl/lg only -->
      <div v-if="(cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg') && (node.due_date || node.start_date)" class="node-card-meta">
        <span v-if="node.due_date" class="meta-item due">
          <span class="meta-icon">D</span>{{ node.due_date }}
        </span>
        <span v-if="node.start_date && cardSizeClass === 'card-xl'" class="meta-item start">
          <span class="meta-icon">S</span>{{ node.start_date }}
        </span>
      </div>

      <!-- Nested children cards -->
      <div
        v-if="node.children?.length"
        class="node-card-children-grid"
        :class="{ compact: cardSizeClass === 'card-sm' || cardSizeClass === 'card-xs' }"
        :style="nestedGridStyle(node.children.length, 1)"
        @click.stop
      >
        <div
          v-for="child in node.children"
          :key="child.id"
          class="child-card"
          :class="[child.type, getNestedCardSize(node.children.length, 1), { selected: isCardSelected(child.id) }, getCardDropClass(child)]"
          :style="getNodeColor(child) ? { background: `linear-gradient(135deg, ${getNodeColor(child)}33 0%, var(--bg-secondary) 80%)` } : {}"
          :draggable="editingCardId !== child.id && inlineNotesId !== child.id"
          @click.stop="handleChildCardClick($event, child)"
          @dblclick.stop="emit('enter', child)"
          @dragstart.stop="emit('drag-start', $event, child)"
          @dragend="emit('drag-end')"
          @dragover.stop="emit('drag-over', $event, child)"
          @dragleave="emit('drag-leave')"
          @drop.stop="emit('drop', $event, child)"
          @mouseenter="emit('show-tooltip', $event, child)"
          @mouseleave="emit('hide-tooltip')"
          @contextmenu.prevent="emit('context-menu', $event, child)"
        >
          <div class="child-card-header">
            <input
              v-if="child.type === 'task'"
              type="checkbox"
              class="child-card-checkbox"
              :checked="child.completed"
              @click.stop
              @change.stop="emit('toggle-complete', child)"
            />
            <CardTitleEdit
              :title="child.title"
              :model-value="editingTitle"
              :is-editing="editingCardId === child.id"
              :completed="child.completed"
              size="child"
              @start-edit="emit('start-edit', child, $event)"
              @save="emit('save-edit')"
              @cancel="emit('cancel-edit')"
              @update:model-value="emit('update:editingTitle', $event)"
            />
            <button class="child-add-btn" @click.stop="emit('add-child', child.id, $event)" title="Add child">+</button>
            <button class="child-delete-btn" @click.stop="emit('delete', child.id)" title="Delete">x</button>
          </div>
          <div v-if="child.notes && !child.notes_sensitive" class="child-card-notes">{{ decodeHtml(child.notes) }}</div>

          <!-- Grandchildren -->
          <div v-if="child.children?.length" class="grandchild-list" @click.stop>
            <div
              v-for="grandchild in child.children"
              :key="grandchild.id"
              class="grandchild-item"
              :class="[grandchild.type, { selected: isCardSelected(grandchild.id), completed: grandchild.completed }]"
              @click.stop="handleGrandchildClick($event, grandchild)"
              @dblclick.stop="emit('enter', grandchild)"
              @contextmenu.prevent="emit('context-menu', $event, grandchild)"
            >
              <input
                v-if="grandchild.type === 'task'"
                type="checkbox"
                class="grandchild-check"
                :checked="grandchild.completed"
                @click.stop
                @change.stop="emit('toggle-complete', grandchild)"
              />
              <span class="grandchild-title" :class="{ completed: grandchild.completed }">{{ grandchild.title }}</span>
              <span v-if="grandchild.notes && !grandchild.notes_sensitive" class="grandchild-notes">{{ decodeHtml(grandchild.notes) }}</span>
              <span v-if="grandchild.children?.length" class="grandchild-count">{{ grandchild.children.length }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer metadata for smaller cards -->
      <div v-if="(cardSizeClass === 'card-md' || cardSizeClass === 'card-sm' || cardSizeClass === 'card-xs') && (node.importance || node.children?.length || getDateCountdown(node))" class="node-card-footer">
        <span v-if="node.importance" class="card-importance" :class="'imp-' + node.importance">{{ node.importance }}</span>
        <span v-if="node.children?.length" class="node-card-children">{{ node.children.length }}</span>
        <span v-if="getDateCountdown(node)" class="date-countdown" :class="getDateCountdown(node).type">{{ getDateCountdown(node).text }}</span>
      </div>
    </div>

    <div v-if="filteredNodes.length === 0" class="empty-state">
      <h3>Empty</h3>
      <p>Add a {{ currentContainerId ? 'child node' : 'project' }} to get started</p>
    </div>
  </div>
</template>

<style scoped>
.cards-view {
  display: grid;
  gap: 12px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  align-content: start;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-weight: 500;
}

.empty-state p {
  margin: 0;
  font-size: 0.9rem;
}

/* Card children indicator */
.node-card-children {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.node-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-favorite-star {
  color: #ffd700;
  font-size: 14px;
  text-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
}

.card-edit-btn,
.card-add-btn,
.card-delete-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 11px;
  border-radius: 50%;
  opacity: 0.4;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.card-add-btn {
  font-size: 14px;
  font-weight: bold;
}

.card-delete-btn {
  font-size: 16px;
  font-weight: bold;
  position: absolute;
  top: 8px;
  right: 8px;
}

.card-edit-btn:hover,
.card-add-btn:hover {
  opacity: 1;
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.card-delete-btn:hover {
  opacity: 1;
  background: #e74c3c;
  border-color: #e74c3c;
  color: white;
}

/* Inline editing styles */
.node-card-title-input {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 8px;
  outline: none;
  width: calc(100% - 32px);
  padding: 8px 12px;
  margin: 12px 16px 8px 16px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.child-card-title-input {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  outline: none;
  flex: 1;
  padding: 4px 8px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.grandchild-title-input {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 3px;
  outline: none;
  flex: 1;
  padding: 2px 6px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.node-card-notes-input {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  width: calc(100% - 32px);
  min-height: 60px;
  padding: 8px 12px;
  margin: 0 16px 8px 16px;
  resize: vertical;
  font-family: inherit;
}

.node-card-notes-input:focus {
  border-color: var(--accent-color);
}

/* Inline notes area */
.node-card-notes-area {
  margin: 8px 16px 16px 16px;
  width: calc(100% - 32px);
}

.node-card-notes-area.no-children {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.node-card-notes-area.no-children .inline-notes-display {
  max-height: none;
}

/* Compact notes for sm/xs cards */
.node-card-notes-area.compact {
  margin: 4px 8px 8px 8px;
  width: calc(100% - 16px);
}

.node-card-notes-area.compact .inline-notes-display {
  font-size: 10px;
  line-height: 1.3;
  max-height: 40px;
  padding: 2px 4px;
}

/* Notes expand when no children, even in compact mode */
.node-card-notes-area.compact.no-children .inline-notes-display {
  max-height: none;
}

.inline-notes-display {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: text;
  padding: 4px 8px 4px 16px;
  border-radius: 4px;
  transition: background 0.15s;
  max-height: 150px;
  overflow-y: auto;
}

/* Larger max-height for bigger cards */
.node-card.card-xl .inline-notes-display { max-height: 250px; }
.node-card.card-lg .inline-notes-display { max-height: 180px; }

/* Scale notes font size with card size */
.node-card.card-xl .inline-notes-display { font-size: 12px; }
.node-card.card-lg .inline-notes-display { font-size: 11px; }
.node-card.card-md .inline-notes-display { font-size: 10px; }

.inline-notes-display:hover {
  background: rgba(255, 255, 255, 0.05);
}

.inline-notes-display.empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.inline-notes-display.sensitive {
  color: var(--text-tertiary);
  font-style: normal;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lock-icon-display {
  font-size: 18px;
  opacity: 0.5;
}

.inline-notes-textarea {
  width: 100%;
  min-height: 1.6em;
  max-height: 120px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  resize: vertical;
  field-sizing: content;
}

.inline-notes-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* Markdown content in notes */
.markdown-content {
  font-size: inherit;
  line-height: 1.5;
}

.markdown-content p {
  margin: 0 0 0.5em 0;
}

.markdown-content p:last-child {
  margin-bottom: 0;
}

.markdown-content ul, .markdown-content ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}

.markdown-content li {
  margin: 0.1em 0;
}

.markdown-content code {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}

.markdown-content pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.5em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

.markdown-content a {
  color: #ffffff !important;
}

.node-card a,
.child-card a,
.node-cards a {
  color: #ffffff !important;
}

.markdown-content strong {
  color: var(--text-primary);
}

.markdown-content h1, .markdown-content h2, .markdown-content h3,
.markdown-content h4, .markdown-content h5, .markdown-content h6 {
  margin: 0.5em 0 0.25em 0;
  color: var(--text-primary);
  font-weight: 600;
}

.markdown-content h1 { font-size: 1.3em; }
.markdown-content h2 { font-size: 1.2em; }
.markdown-content h3 { font-size: 1.1em; }

.markdown-content blockquote {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid var(--border-color);
  color: var(--text-tertiary);
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 0.5em 0;
}

.markdown-content img {
  max-width: 100%;
  border-radius: 4px;
}

.card-edit-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px 16px;
}

.card-save-btn,
.card-cancel-btn {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.card-save-btn {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.card-save-btn:hover {
  background: var(--accent-hover);
}

.card-cancel-btn {
  background: var(--bg-tertiary);
}

/* Sensitive notes styling */
.notes-sensitive {
  filter: blur(6px);
  user-select: none;
  cursor: pointer;
  transition: filter 0.2s;
}

.notes-sensitive:hover {
  filter: blur(3px);
}

/* Adaptive card sizes */
.node-card.card-xl {
  padding: 0;
}

.node-card.card-xl .node-card-title {
  font-size: 22px;
}

.node-card.card-xl .node-card-notes {
  font-size: 15px;
  padding: 0 20px 16px 20px;
  max-height: none;
}

.node-card.card-lg .node-card-title {
  font-size: 18px;
}

.node-card.card-md .node-card-title {
  font-size: 16px;
}

.node-card.card-md .node-card-notes {
  font-size: 13px;
  padding: 0 14px 12px 14px;
}

.node-card.card-sm {
  padding: 0;
}

.node-card.card-sm .node-card-header {
  padding: 8px 10px 0 10px;
}

.node-card.card-sm .node-card-title {
  font-size: 14px;
}

.node-card.card-xs {
  padding: 0;
}

.node-card.card-xs .node-card-header {
  padding: 6px 8px 0 8px;
  gap: 4px;
}

.node-card.card-xs .node-card-type {
  font-size: 8px;
  padding: 2px 6px;
}

.node-card.card-xs .node-card-title {
  font-size: 12px;
  line-height: 1.2;
}

/* Truncated text */
.title-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-height: 3em;
}

/* Card metadata */
.node-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px 16px;
  font-size: 11px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}

.meta-icon {
  font-weight: 600;
  font-size: 9px;
  opacity: 0.7;
}

.meta-item.due {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.meta-item.start {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.meta-item.importance {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.meta-item.imp-1 { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.meta-item.imp-2 { background: rgba(249, 115, 22, 0.2); color: #fb923c; }
.meta-item.imp-3 { background: rgba(234, 179, 8, 0.2); color: #fbbf24; }

/* Inline date editing */
.card-dates-inline {
  display: flex;
  gap: 12px;
  padding: 0 16px 12px 16px;
}

.card-date-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-date-field label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-tertiary);
  font-weight: 600;
}

.card-date-field input[type="date"] {
  padding: 6px 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

/* Compact children indicator */
.node-card-children-compact {
  position: absolute;
  bottom: 6px;
  right: 6px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--accent-subtle);
  color: var(--accent-color);
}

/* Child card sizes */
.child-card.child-lg {
  padding: 10px 12px;
}

.child-card.child-lg .child-card-title {
  font-size: 13px;
  white-space: normal;
}

.child-card.child-md {
  padding: 8px 10px;
}

.child-card.child-sm {
  padding: 3px 6px;
  min-height: 24px;
}

.child-card.child-sm .child-card-title {
  font-size: 10px;
}

.child-card.child-sm .child-card-header {
  gap: 4px;
}

.child-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.child-card-header :deep(.card-title),
.child-card-header :deep(.card-title-input) {
  flex: 1;
  min-width: 0;
}

.child-card-checkbox {
  width: 12px;
  height: 12px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--accent-color);
}

.child-add-btn {
  margin-left: auto;
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 12px;
  font-weight: bold;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
}

.child-card:hover .child-add-btn {
  opacity: 0.5;
}

.child-add-btn:hover {
  opacity: 1 !important;
  color: var(--accent-color);
}

.child-delete-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 12px;
  font-weight: bold;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
}

.child-card:hover .child-delete-btn {
  opacity: 0.5;
}

.child-delete-btn:hover {
  opacity: 1 !important;
  color: #e74c3c;
}

.child-card-notes {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Card title row with checkbox */
.node-card-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-card.card-xl .node-card-title-row {
  padding: 16px 20px 10px 20px;
}

.node-card.card-lg .node-card-title-row {
  padding: 14px 16px 8px 16px;
}

.node-card.card-md .node-card-title-row {
  padding: 10px 14px 6px 14px;
}

.node-card.card-sm .node-card-title-row {
  padding: 6px 10px;
}

.node-card.card-xs .node-card-title-row {
  padding: 4px 8px;
}

/* Card checkbox */
.card-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--accent-color);
}

.node-card.card-sm .card-checkbox,
.node-card.card-xs .card-checkbox {
  width: 12px;
  height: 12px;
}

/* Importance badge inline in header */
.card-importance {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.card-importance.imp-1 {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.card-importance.imp-2 {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.card-importance.imp-3 {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}

.card-importance.imp-4 {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.card-importance.imp-5 {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.node-card.card-sm .card-importance,
.node-card.card-xs .card-importance {
  font-size: 8px;
  padding: 1px 4px;
}

/* Hide header metadata on smaller cards - shown in footer instead */
.node-card.card-md .node-card-header .card-importance,
.node-card.card-md .node-card-header .node-card-children,
.node-card.card-md .node-card-header .date-countdown,
.node-card.card-sm .node-card-header .card-importance,
.node-card.card-sm .node-card-header .node-card-children,
.node-card.card-sm .node-card-header .date-countdown,
.node-card.card-xs .node-card-header .card-importance,
.node-card.card-xs .node-card-header .node-card-children,
.node-card.card-xs .node-card-header .date-countdown {
  display: none;
}

/* Footer for small cards */
.node-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-top: auto;
  border-top: 1px solid var(--border-subtle);
  font-size: 10px;
}

/* Completed card styling */
.node-card:has(.card-checkbox:checked) {
  opacity: 0.6;
}

.node-card:has(.card-checkbox:checked) .node-card-title,
.node-card-title.completed {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

/* Due date warning */
.due-warning {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.due-warning.overdue {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  animation: pulse-warning 2s ease-in-out infinite;
}

.due-warning.today {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.due-warning.soon {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}

.due-warning.upcoming {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.due-warning.future {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Date countdown badges */
.date-countdown {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.date-countdown.to-start {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.date-countdown.to-end {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.date-countdown.ends-today {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

/* Card drag and drop */
.node-card.dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.node-card.drop-inside {
  outline: 2px solid #4a9eff;
  background: rgba(74, 158, 255, 0.15);
  box-shadow: 0 0 0 4px rgba(74, 158, 255, 0.2);
}

.node-card.drop-before {
  box-shadow: -4px 0 0 0 #4a9eff, 0 2px 4px rgba(0,0,0,0.2);
}

.node-card.drop-after {
  box-shadow: 4px 0 0 0 #4a9eff, 0 2px 4px rgba(0,0,0,0.2);
}

.card-drag {
  cursor: grab;
  color: var(--text-tertiary);
  font-weight: bold;
  opacity: 0.3;
  user-select: none;
  margin-right: 4px;
  font-size: 0.9rem;
  transition: opacity 0.15s;
}

.node-card:hover .card-drag {
  opacity: 0.7;
}

.card-drag:hover {
  opacity: 1;
  color: var(--text-primary);
}

.node-card.dragging .card-drag {
  cursor: grabbing;
}
</style>
