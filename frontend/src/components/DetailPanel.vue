<script setup>
import { ref, watch, computed } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const props = defineProps({
  node: Object
})

const showPreview = ref(false)

const emit = defineEmits(['update', 'delete', 'close', 'wrap-with-parent'])

const editedNode = ref({})

watch(() => props.node, (newNode) => {
  if (newNode) {
    editedNode.value = { ...newNode }
  }
}, { immediate: true })

const nodeTypes = ['project', 'task', 'note', 'milestone', 'topic', 'folder', 'person']

// Check if current node is a person
const isPerson = computed(() => editedNode.value.type === 'person')

function saveChanges() {
  emit('update', editedNode.value)
}

function deleteNode() {
  if (confirm('Delete this node?')) {
    emit('delete', props.node.id)
  }
}

function wrapWithParent() {
  const title = prompt('New parent title:')
  if (title) {
    emit('wrap-with-parent', { nodeId: props.node.id, parentTitle: title })
  }
}
</script>

<template>
  <div class="detail-panel" v-if="node">
    <div class="detail-header">
      <h2>Node Details</h2>
      <button @click="$emit('close')">X</button>
    </div>

    <div class="detail-content">
      <div class="detail-field">
        <label>Title</label>
        <input
          v-model="editedNode.title"
          @blur="saveChanges"
          @keyup.enter="saveChanges"
        />
      </div>

      <div class="detail-field">
        <label>Type</label>
        <select v-model="editedNode.type" @change="saveChanges">
          <option v-for="t in nodeTypes" :key="t" :value="t">
            {{ t }}
          </option>
        </select>
      </div>

      <div class="detail-field" v-if="editedNode.type !== 'person'">
        <label>
          <input
            type="checkbox"
            v-model="editedNode.completed"
            @change="saveChanges"
          />
          Completed
        </label>
      </div>

      <div class="detail-field">
        <div class="notes-header">
          <label>Notes</label>
          <button
            class="preview-toggle"
            :class="{ active: showPreview }"
            @click="showPreview = !showPreview"
          >
            {{ showPreview ? 'Edit' : 'Preview' }}
          </button>
        </div>
        <textarea
          v-if="!showPreview"
          v-model="editedNode.notes"
          @blur="saveChanges"
          placeholder="Add notes... (supports markdown, tables, mermaid)"
        ></textarea>
        <div v-else class="notes-preview">
          <MarkdownRenderer :content="editedNode.notes" />
        </div>
      </div>

      <div class="detail-field checkbox-field">
        <label class="checkbox-label">
          <input
            type="checkbox"
            v-model="editedNode.notes_sensitive"
            @change="saveChanges"
          />
          <span>Sensitive content</span>
        </label>
        <span class="field-hint">Hide notes when sensitive mode is enabled</span>
      </div>

      <div class="detail-field">
        <label>Due Date</label>
        <input
          type="date"
          v-model="editedNode.due_date"
          @change="saveChanges"
        />
      </div>

      <div class="detail-field">
        <label>Start Date</label>
        <input
          type="date"
          v-model="editedNode.start_date"
          @change="saveChanges"
        />
      </div>

      <div class="detail-field">
        <label>End Date</label>
        <input
          type="date"
          v-model="editedNode.end_date"
          @change="saveChanges"
        />
      </div>

      <div class="detail-field">
        <label>Color</label>
        <input
          type="color"
          v-model="editedNode.color"
          @change="saveChanges"
        />
      </div>

      <div class="detail-field">
        <label>Importance (1-5)</label>
        <input
          type="number"
          v-model.number="editedNode.importance"
          min="1"
          max="5"
          @change="saveChanges"
        />
      </div>

      <!-- Person-specific fields -->
      <template v-if="isPerson">
        <div class="person-fields-header">Contact Information</div>

        <div class="detail-field">
          <label>Email</label>
          <input
            type="email"
            v-model="editedNode.email"
            @blur="saveChanges"
            placeholder="email@example.com"
          />
        </div>

        <div class="detail-field">
          <label>Phone</label>
          <input
            type="tel"
            v-model="editedNode.phone"
            @blur="saveChanges"
            placeholder="+1 234 567 890"
          />
        </div>

        <div class="detail-field">
          <label>Organization</label>
          <input
            type="text"
            v-model="editedNode.organization"
            @blur="saveChanges"
            placeholder="Company or organization"
          />
        </div>

        <div class="detail-field">
          <label>Role</label>
          <input
            type="text"
            v-model="editedNode.role"
            @blur="saveChanges"
            placeholder="Job title or role"
          />
        </div>

        <div class="detail-field">
          <label>Address</label>
          <textarea
            v-model="editedNode.address"
            @blur="saveChanges"
            placeholder="Street, City, Country"
            rows="2"
          ></textarea>
        </div>

        <div class="detail-field">
          <label>Website</label>
          <input
            type="url"
            v-model="editedNode.website"
            @blur="saveChanges"
            placeholder="https://example.com"
          />
        </div>
      </template>

      <div class="detail-meta">
        <p>ID: {{ node.id }}</p>
        <p>Depth: {{ node.depth }}</p>
        <p>Path: {{ node.path || '-' }}</p>
        <p>Created: {{ node.created_at }}</p>
        <p>Updated: {{ node.updated_at }}</p>
      </div>

      <div class="detail-actions">
        <button @click="wrapWithParent">Wrap with Parent</button>
        <button class="danger" @click="deleteNode">Delete Node</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-meta {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.detail-meta p {
  margin-bottom: var(--spacing-xs);
}

.detail-actions {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

button.danger {
  background: #4a1a1a;
  border-color: #7a2a2a;
  color: #e07d7d;
}

button.danger:hover {
  background: #5a2a2a;
}

.detail-field label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

input[type="color"] {
  width: 50px;
  height: 30px;
  padding: 2px;
  cursor: pointer;
}

.checkbox-field label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.checkbox-label {
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
}

.field-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.preview-toggle {
  padding: 4px 10px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.preview-toggle:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.preview-toggle.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.notes-preview {
  min-height: 150px;
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

/* Person-specific fields */
.person-fields-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.detail-field input[type="email"],
.detail-field input[type="tel"],
.detail-field input[type="url"] {
  font-family: inherit;
}

.detail-field input::placeholder,
.detail-field textarea::placeholder {
  color: var(--text-tertiary);
  opacity: 0.6;
}
</style>
