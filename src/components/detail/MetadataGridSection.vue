<script setup>
import { computed } from 'vue'
import { formatDate, getDueStatus } from '../../utils/formatting.js'
import { nodeTypes, getTypeIcon, personIconSvg } from '../../utils/constants.js'
import TagInput from '../TagInput.vue'

const props = defineProps({
  editedNode: { type: Object, required: true },
  linkedNodes: { type: Array, default: () => [] },
  workspaces: { type: Array, default: () => [] },
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:collapsed',
  'update:field',
  'update:tags',
  'update:color',
  'change-workspace',
  'select-link',
  'remove-link',
  'add-link',
  'toggle-links-visibility',
  'save',
])

const formattedCreatedDate = computed(() => formatDate(props.editedNode?.created_at))
const formattedUpdatedDate = computed(() => formatDate(props.editedNode?.updated_at))

function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}

function setImportance(level) {
  emit('update:field', { field: 'importance', value: level })
  emit('save')
}

function updateDate(field, value) {
  emit('update:field', { field, value: value || null })
  emit('save')
}

function clearDate(field) {
  emit('update:field', { field, value: null })
  emit('save')
}

function updateColor(value) {
  emit('update:color', value)
  emit('save')
}

function clearColor() {
  emit('update:color', '#0f4c75')
  emit('save')
}

function updateGraphDepth(value) {
  const numValue = value === '' ? null : Number(value)
  emit('update:field', { field: 'graph_max_depth', value: numValue })
  emit('save')
}

function onTypeChange(event) {
  emit('update:field', { field: 'type', value: event.target.value })
  emit('save')
}

function clearLocation() {
  emit('update:field', { field: 'location', value: null })
  emit('save')
}
</script>

<template>
  <div class="meta-section" :class="{ collapsed }">
    <div class="section-header" @click="toggleCollapsed">
      <span class="section-title">Metadata</span>
      <span class="collapse-indicator">{{ collapsed ? '+' : '-' }}</span>
    </div>
    <div v-show="!collapsed" class="section-content">
      <div class="meta-grid">
        <!-- Type -->
        <div class="meta-item">
          <label>Type</label>
          <select :value="editedNode.type" @change="onTypeChange">
            <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <!-- Workspace -->
        <div class="meta-item">
          <label>Workspace</label>
          <select :value="editedNode.workspace_id" @change="emit('change-workspace', $event.target.value)">
            <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">{{ ws.name }}</option>
          </select>
        </div>

        <!-- Importance -->
        <div class="meta-item">
          <label>Importance</label>
          <div class="importance-picker">
            <button
              v-for="level in 5"
              :key="level"
              class="importance-btn"
              :class="{ active: editedNode.importance === level }"
              @click="setImportance(level)"
            >
              {{ level }}
            </button>
          </div>
        </div>

        <!-- Start Date -->
        <div class="meta-item">
          <label>Start</label>
          <div class="date-field">
            <input
              type="date"
              :value="editedNode.start_date?.split('T')[0] || ''"
              @change="updateDate('start_date', $event.target.value)"
            />
            <button v-if="editedNode.start_date" class="clear-btn" @click="clearDate('start_date')" title="Clear">
              x
            </button>
          </div>
        </div>

        <!-- Due Date -->
        <div class="meta-item">
          <label
            :class="{
              'due-warning': getDueStatus(editedNode) === 'soon',
              'due-overdue': getDueStatus(editedNode) === 'overdue',
            }"
            >Due</label
          >
          <div
            class="date-field"
            :class="{
              'due-warning': getDueStatus(editedNode) === 'soon',
              'due-overdue': getDueStatus(editedNode) === 'overdue',
            }"
          >
            <input
              type="date"
              :value="editedNode.due_date?.split('T')[0] || ''"
              @change="updateDate('due_date', $event.target.value)"
            />
            <button v-if="editedNode.due_date" class="clear-btn" @click="clearDate('due_date')" title="Clear">x</button>
          </div>
        </div>

        <!-- End Date -->
        <div class="meta-item">
          <label>End</label>
          <div class="date-field">
            <input
              type="date"
              :value="editedNode.end_date?.split('T')[0] || ''"
              @change="updateDate('end_date', $event.target.value)"
            />
            <button v-if="editedNode.end_date" class="clear-btn" @click="clearDate('end_date')" title="Clear">x</button>
          </div>
        </div>

        <!-- Color -->
        <div class="meta-item">
          <label>Color</label>
          <div class="color-field">
            <input type="color" :value="editedNode.color || '#0f4c75'" @change="updateColor($event.target.value)" />
            <button
              v-if="editedNode.color && editedNode.color !== '#0f4c75'"
              class="clear-btn"
              @click="clearColor"
              title="Reset"
            >
              x
            </button>
          </div>
        </div>

        <!-- Graph Depth -->
        <div class="meta-item">
          <label>Graph Depth</label>
          <select :value="editedNode.graph_max_depth ?? ''" @change="updateGraphDepth($event.target.value)">
            <option value="">Default</option>
            <option value="1">1 level</option>
            <option value="2">2 levels</option>
            <option value="3">3 levels</option>
            <option value="4">4 levels</option>
            <option value="5">5 levels</option>
            <option value="0">All levels</option>
          </select>
        </div>

        <!-- Location, Tags, Links -->
        <div class="meta-item compact-row">
          <div v-if="editedNode.location" class="compact-field location-field">
            <label>Location</label>
            <input
              type="text"
              :value="editedNode.location"
              @input="emit('update:field', { field: 'location', value: $event.target.value })"
              @blur="emit('save')"
              class="location-input"
            />
            <button class="clear-btn" @click="clearLocation" title="Clear">x</button>
          </div>
          <button
            v-else
            class="add-field-btn compact"
            @click="emit('update:field', { field: 'location', value: ' ' })"
            title="Add location"
          >
            +Location
          </button>

          <div class="compact-field tags-field">
            <label>Tags</label>
            <TagInput :tags="editedNode.tags || []" @update="emit('update:tags', $event)" />
          </div>

          <template v-if="editedNode.show_links !== 0">
            <div v-if="linkedNodes.length" class="compact-field links-field">
              <label>
                Links
                <button class="toggle-links-btn" @click.stop="emit('toggle-links-visibility', 0)" title="Hide">
                  -
                </button>
              </label>
              <div class="links-inline">
                <span
                  v-for="linked in linkedNodes"
                  :key="linked.id"
                  class="link-chip"
                  @click="emit('select-link', linked.id)"
                >
                  <span v-if="linked.type === 'person'" class="link-type person" v-html="personIconSvg"></span>
                  <span v-else class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
                  {{ linked.title }}
                  <button class="remove-link-btn" @click.stop="emit('remove-link', linked)" title="Remove">x</button>
                </span>
                <button class="add-link-btn" @click="emit('add-link')" title="Add link">+</button>
              </div>
            </div>
            <button v-else class="add-field-btn compact" @click="emit('add-link')" title="Add link">+Link</button>
          </template>
          <button v-else class="add-field-btn compact" @click="emit('toggle-links-visibility', 1)" title="Show links">
            +Link
          </button>
        </div>

        <!-- System info -->
        <div class="meta-item compact-row system-info">
          <div class="compact-field">
            <label>ID</label>
            <span class="meta-value mono">{{ editedNode.id }}</span>
          </div>
          <div class="compact-field">
            <label>Created</label>
            <span class="meta-value">{{ formattedCreatedDate }}</span>
          </div>
          <div class="compact-field">
            <label>Modified</label>
            <span class="meta-value">{{ formattedUpdatedDate }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meta-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 4px;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.collapse-indicator {
  margin-left: 8px;
  font-size: 14px;
  color: var(--text-tertiary);
}

.section-content {
  padding: 8px 0;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.meta-item select,
.meta-item input[type='text'],
.meta-item input[type='date'] {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.meta-item select:focus,
.meta-item input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.importance-picker {
  display: flex;
  gap: 4px;
}

.importance-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.importance-btn.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.date-field,
.color-field {
  display: flex;
  gap: 4px;
  align-items: center;
}

.date-field input,
.color-field input {
  flex: 1;
}

.color-field input[type='color'] {
  width: 40px;
  height: 28px;
  padding: 2px;
  cursor: pointer;
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
}

.clear-btn:hover {
  color: var(--danger-color);
}

.due-warning {
  color: #f39c12;
}

.due-overdue {
  color: #e74c3c;
}

.compact-row {
  grid-column: 1 / -1;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
}

.compact-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.location-field {
  flex: 1;
}

.location-input {
  min-width: 100px;
}

.tags-field {
  flex: 2;
}

.links-field {
  flex: 2;
}

.links-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.link-chip:hover {
  background: var(--bg-hover);
}

.link-type {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.link-type :deep(svg) {
  width: 10px;
  height: 10px;
}

.remove-link-btn,
.toggle-links-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
}

.remove-link-btn:hover,
.toggle-links-btn:hover {
  color: var(--danger-color);
}

.add-link-btn,
.add-field-btn {
  background: none;
  border: 1px dashed var(--border-color);
  color: var(--text-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.add-link-btn:hover,
.add-field-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.system-info {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  margin-top: 8px;
}

.system-info .compact-field {
  flex: 1;
}

.meta-value {
  font-size: 11px;
  color: var(--text-secondary);
}

.meta-value.mono {
  font-family: monospace;
}
</style>
