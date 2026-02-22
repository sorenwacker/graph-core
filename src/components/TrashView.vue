<script setup>
const props = defineProps({
  items: { type: Array, default: () => [] }
})

const emit = defineEmits(['empty-all', 'restore', 'delete'])
</script>

<template>
  <div class="trash-view">
    <div class="trash-header">
      <h2>Trash ({{ items.length }} items)</h2>
      <button v-if="items.length > 0" class="danger" @click="emit('empty-all')">Empty Trash</button>
    </div>
    <div v-if="items.length === 0" class="trash-empty">
      Trash is empty
    </div>
    <table v-else class="trash-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Type</th>
          <th>Deleted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ item.title }}</td>
          <td>{{ item.type }}</td>
          <td>{{ item.deleted_at?.split('T')[0] }}</td>
          <td class="trash-actions">
            <button class="small" @click="emit('restore', item)">Restore</button>
            <button class="small danger" @click="emit('delete', item)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.trash-view {
  padding: var(--spacing-lg);
  height: 100%;
  overflow-y: auto;
}

.trash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}

.trash-header h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.trash-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: var(--spacing-xl);
}

.trash-table {
  width: 100%;
  border-collapse: collapse;
}

.trash-table th,
.trash-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.trash-table th {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
}

.trash-table td {
  font-size: 0.9rem;
}

.trash-actions {
  display: flex;
  gap: 8px;
}

.trash-actions button {
  padding: 4px 10px;
  font-size: 0.8rem;
}

button.small {
  padding: 4px 10px;
  font-size: 0.8rem;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

button.small:hover {
  background: var(--bg-hover);
}

button.danger {
  background: #e74c3c;
  border-color: #e74c3c;
  color: white;
}

button.danger:hover {
  background: #c0392b;
}
</style>
