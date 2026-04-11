<script setup>
import { computed } from 'vue'
import { getInitials } from '../utils/formatting.js'
import { decodeHtml } from '../utils/html.js'
import CardTitleEdit from './CardTitleEdit.vue'
import CardNotes from './CardNotes.vue'
import TableMiniature from './TableMiniature.vue'

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

function formatDueDate(node) {
  if (!node.due_date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(node.due_date)
  due.setHours(0, 0, 0, 0)
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days}d`
}

function getDueDateClass(node) {
  if (!node.due_date) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(node.due_date)
  due.setHours(0, 0, 0, 0)
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

  if (days < 0) return 'overdue'
  if (days === 0) return 'due-today'
  if (days === 1) return 'due-tomorrow'
  if (days <= 7) return 'due-soon'
  return 'due-later'
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

// Calculate task/project completion progress from children
// Uses _progress if available (pre-calculated before filtering)
function getChildProgress(node) {
  if (node._progress) return node._progress
  if (!node.children?.length) return null
  const tasks = node.children.filter(c => c.type === 'task' || c.type === 'project')
  if (tasks.length === 0) return null
  const completed = tasks.filter(c => c.completed).length
  return {
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100)
  }
}

function nestedGridStyle(count) {
  const cols = count <= 1 ? 1 : 2
  return { gridTemplateColumns: `repeat(${cols}, 1fr)` }
}

function getNestedCardSize(count, parentSize) {
  // Larger parent cards can support larger child cards
  const isLargeParent = parentSize === 'card-xl' || parentSize === 'card-lg'
  const isMediumParent = parentSize === 'card-md'

  if (isLargeParent) {
    if (count <= 4) return 'child-lg'
    if (count <= 8) return 'child-md'
    return 'child-sm'
  }

  if (isMediumParent) {
    if (count <= 2) return 'child-lg'
    if (count <= 6) return 'child-md'
    return 'child-sm'
  }

  // Small parent cards
  if (count <= 2) return 'child-md'
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
      :style="getNodeColor(node) ? { background: `linear-gradient(135deg, ${getNodeColor(node)}55 0%, var(--bg-primary) 80%)` } : {}"
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
        <span v-if="node.due_date && cardSizeClass !== 'card-xs'" class="card-due-date" :class="getDueDateClass(node)" :title="node.due_date">
          {{ formatDueDate(node) }}
        </span>
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

      <!-- Task/Project progress bar -->
      <div
        v-if="(node.type === 'task' || node.type === 'project') && getChildProgress(node)"
        class="task-progress"
        :title="`${getChildProgress(node).completed}/${getChildProgress(node).total} completed`"
      >
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="{ complete: getChildProgress(node).percent === 100 }"
            :style="{ width: getChildProgress(node).percent + '%' }"
          ></div>
        </div>
        <span class="progress-text">{{ getChildProgress(node).completed }}/{{ getChildProgress(node).total }}</span>
      </div>

      <!-- Person card specialization -->
      <div v-if="node.type === 'person'" class="person-info">
        <div class="person-avatar" :style="{ backgroundColor: getNodeColor(node) || 'var(--type-person-bg)' }">
          {{ getInitials(node.title) }}
        </div>
        <div class="person-details">
          <div v-if="node.role" class="person-role">{{ node.role }}</div>
          <div v-if="node.organization" class="person-org">{{ node.organization }}</div>
          <div v-if="node.email" class="person-contact email">
            <span class="contact-icon">@</span>
            <a :href="'mailto:' + node.email" @click.stop title="Send email">{{ node.email }}</a>
          </div>
          <div v-if="node.phone" class="person-contact phone">
            <span class="contact-icon">#</span>
            <a :href="'tel:' + node.phone" @click.stop title="Call">{{ node.phone }}</a>
          </div>
          <div v-if="node.website" class="person-contact website">
            <span class="contact-icon">W</span>
            <a :href="node.website.startsWith('http') ? node.website : 'https://' + node.website"
               target="_blank" @click.stop title="Open website">
              {{ node.website.replace(/^https?:\/\//, '').replace(/\/$/, '') }}
            </a>
          </div>
          <div v-if="node.location" class="person-location">
            <span class="contact-icon">L</span>
            {{ node.location }}
          </div>
          <div v-if="node.tags && node.tags.length > 0" class="person-tags">
            <span v-for="tag in node.tags.slice(0, 3)" :key="tag" class="person-tag">{{ tag }}</span>
            <span v-if="node.tags.length > 3" class="person-tag-more">+{{ node.tags.length - 3 }}</span>
          </div>
          <div v-if="node.notes && !node.role && !node.organization" class="person-notes-preview">
            {{ node.notes.split('\n')[0].substring(0, 60) }}{{ node.notes.length > 60 ? '...' : '' }}
          </div>
        </div>
      </div>

      <!-- Table miniature preview for cards with tables -->
      <TableMiniature
        v-if="node.has_table"
        :node-id="node.id"
        :max-rows="cardSizeClass === 'card-xl' ? 4 : cardSizeClass === 'card-lg' ? 3 : 2"
        :max-cols="cardSizeClass === 'card-xl' ? 5 : cardSizeClass === 'card-lg' ? 4 : 3"
      />

      <!-- Metadata - xl/lg only (start date) -->
      <div v-if="(cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg') && node.start_date" class="node-card-meta">
        <span class="meta-item start">
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
          :class="[child.type, getNestedCardSize(node.children.length, cardSizeClass), { selected: isCardSelected(child.id) }, getCardDropClass(child)]"
          :style="getNodeColor(child) ? { background: `linear-gradient(135deg, ${getNodeColor(child)}55 0%, var(--bg-secondary) 80%)` } : {}"
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
          <CardNotes
            v-if="child.notes && !child.notes_sensitive"
            :notes="child.notes"
            :sensitive="child.notes_sensitive"
            size="child"
            class="child-card-notes"
          />

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
              <span v-if="grandchild.children?.length" class="grandchild-count">{{ grandchild.children.length }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer metadata for smaller cards (header has less space) -->
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

<style scoped src="./CardsView.css"></style>
