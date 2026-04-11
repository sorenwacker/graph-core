<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../services/api.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'

const { handleError } = useErrorHandler()

const props = defineProps({
  nodeId: { type: Number, required: true },
  maxRows: { type: Number, default: 3 },
  maxCols: { type: Number, default: 4 },
})

const tableData = ref(null)
const cells = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const table = await api.getNodeTable(props.nodeId)
    if (table) {
      tableData.value = table
      const cellData = await api.getTableCells(props.nodeId)
      cells.value = cellData || []
    }
  } catch (e) {
    handleError(e, { context: 'Loading table miniature', silent: true })
  } finally {
    loading.value = false
  }
})

function getCellValue(rowIndex, colIndex) {
  const cell = cells.value.find(c => c.row_index === rowIndex && c.col_index === colIndex)
  return cell?.value || cell?.computed_value || ''
}

function getColumnName(index) {
  let name = ''
  let i = index
  while (i >= 0) {
    name = String.fromCharCode(65 + (i % 26)) + name
    i = Math.floor(i / 26) - 1
  }
  return name
}
</script>

<template>
  <div class="table-miniature">
    <div v-if="loading" class="mini-loading">...</div>
    <div v-else-if="tableData" class="mini-grid">
      <!-- Header row -->
      <div class="mini-row mini-header">
        <div
          v-for="col in Math.min(tableData.column_definitions?.length || 4, maxCols)"
          :key="'h' + col"
          class="mini-cell mini-header-cell"
        >
          {{ tableData.column_definitions?.[col - 1]?.name || getColumnName(col - 1) }}
        </div>
        <div v-if="(tableData.column_definitions?.length || 4) > maxCols" class="mini-cell mini-more">...</div>
      </div>
      <!-- Data rows -->
      <div v-for="row in Math.min(tableData.row_count || 5, maxRows)" :key="'r' + row" class="mini-row">
        <div
          v-for="col in Math.min(tableData.column_definitions?.length || 4, maxCols)"
          :key="'c' + row + '-' + col"
          class="mini-cell"
        >
          {{ getCellValue(row - 1, col - 1) }}
        </div>
        <div v-if="(tableData.column_definitions?.length || 4) > maxCols" class="mini-cell mini-more">...</div>
      </div>
      <!-- Show truncation indicator -->
      <div v-if="(tableData.row_count || 5) > maxRows" class="mini-row mini-truncated">
        <div class="mini-cell mini-more">{{ (tableData.row_count || 5) - maxRows }} more rows</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-miniature {
  margin: 8px 12px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mini-loading {
  padding: 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 10px;
}

.mini-grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mini-row {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
}

.mini-row:last-child {
  border-bottom: none;
}

.mini-header {
  background: var(--bg-secondary);
}

.mini-cell {
  flex: 1;
  padding: 3px 6px;
  font-size: 9px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-right: 1px solid var(--border-subtle);
  max-width: 60px;
}

.mini-cell:last-child {
  border-right: none;
}

.mini-header-cell {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 8px;
  text-transform: uppercase;
}

.mini-more {
  flex: none;
  width: auto;
  color: var(--text-tertiary);
  font-style: italic;
}

.mini-truncated {
  background: var(--bg-secondary);
}

.mini-truncated .mini-cell {
  text-align: center;
  font-style: italic;
  max-width: none;
}
</style>
