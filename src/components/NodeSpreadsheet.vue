<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import jspreadsheet from 'jspreadsheet-ce'
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jsuites/dist/jsuites.css'

const props = defineProps({
  nodeId: { type: Number, required: true },
  tableData: { type: Object, default: null },
  cellData: { type: Array, default: () => [] }
})

const emit = defineEmits(['create', 'delete', 'cell-change', 'structure-change'])

const spreadsheetEl = ref(null)
let jspreadsheetInstance = null

// Debounce timer for cell changes
let saveTimeout = null

// Convert cell array to jspreadsheet data format
function cellsToData(cells, rowCount, colCount) {
  const data = []
  for (let r = 0; r < rowCount; r++) {
    const row = []
    for (let c = 0; c < colCount; c++) {
      const cell = cells.find(cl => cl.row_index === r && cl.col_index === c)
      row.push(cell?.value || cell?.formula || '')
    }
    data.push(row)
  }
  return data
}

// Get column headers from definitions
function getColumns(columnDefs) {
  return columnDefs.map(col => ({
    title: col.name,
    width: col.width || 100,
    type: col.type || 'text'
  }))
}

function initSpreadsheet() {
  if (!spreadsheetEl.value || !props.tableData) return

  // Destroy existing instance
  if (jspreadsheetInstance) {
    jspreadsheetInstance.destroy()
    jspreadsheetInstance = null
  }

  const rowCount = props.tableData.row_count || 5
  const colDefs = props.tableData.column_definitions || []
  const colCount = colDefs.length || 4

  const data = cellsToData(props.cellData, rowCount, colCount)
  const columns = getColumns(colDefs)

  jspreadsheetInstance = jspreadsheet(spreadsheetEl.value, {
    data: data,
    columns: columns,
    minDimensions: [colCount, rowCount],
    tableOverflow: true,
    tableWidth: '100%',
    tableHeight: '300px',
    allowInsertRow: true,
    allowInsertColumn: true,
    allowDeleteRow: true,
    allowDeleteColumn: true,
    allowRenameColumn: true,
    columnSorting: false,
    defaultColWidth: 100,
    parseFormulas: true,
    autoIncrement: true,
    onchange: handleCellChange,
    oninsertrow: handleInsertRow,
    oninsertcolumn: handleInsertColumn,
    ondeleterow: handleDeleteRow,
    ondeletecolumn: handleDeleteColumn,
    contextMenu: function(instance, x, y, e) {
      // Custom context menu items
      const items = []

      if (y !== null) {
        items.push({
          title: 'Insert row above',
          onclick: function() {
            instance.insertRow(1, parseInt(y), true)
          }
        })
        items.push({
          title: 'Insert row below',
          onclick: function() {
            instance.insertRow(1, parseInt(y), false)
          }
        })
        items.push({
          title: 'Delete row',
          onclick: function() {
            instance.deleteRow(parseInt(y), 1)
          }
        })
      }

      if (x !== null) {
        items.push({
          title: 'Insert column left',
          onclick: function() {
            instance.insertColumn(1, parseInt(x), true)
          }
        })
        items.push({
          title: 'Insert column right',
          onclick: function() {
            instance.insertColumn(1, parseInt(x), false)
          }
        })
        items.push({
          title: 'Delete column',
          onclick: function() {
            instance.deleteColumn(parseInt(x), 1)
          }
        })
      }

      return items
    }
  })
}

function handleCellChange(instance, cell, x, y, value) {
  // Debounce saves
  if (saveTimeout) clearTimeout(saveTimeout)

  saveTimeout = setTimeout(() => {
    const isFormula = value && value.toString().startsWith('=')
    emit('cell-change', {
      row: parseInt(y),
      col: parseInt(x),
      value: value,
      isFormula: isFormula
    })
  }, 300)
}

function handleInsertRow(instance, rowNumber, numRows, insertAfter) {
  if (!jspreadsheetInstance) return

  // Get new row count from instance
  const data = jspreadsheetInstance.getData()
  emit('structure-change', {
    type: 'row_count',
    value: data.length
  })
}

function handleInsertColumn(instance, colNumber, numCols, insertAfter) {
  if (!jspreadsheetInstance) return

  // Get column info from instance
  const headers = jspreadsheetInstance.getHeaders(true)
  const newDefs = headers.map((name, i) => ({
    id: `col${i}`,
    name: name,
    type: 'text',
    width: 100
  }))

  emit('structure-change', {
    type: 'column_definitions',
    value: newDefs
  })
}

function handleDeleteRow(instance, rowNumber, numRows) {
  if (!jspreadsheetInstance) return

  const data = jspreadsheetInstance.getData()
  emit('structure-change', {
    type: 'row_count',
    value: data.length
  })
}

function handleDeleteColumn(instance, colNumber, numCols) {
  if (!jspreadsheetInstance) return

  const headers = jspreadsheetInstance.getHeaders(true)
  const newDefs = headers.map((name, i) => ({
    id: `col${i}`,
    name: name,
    type: 'text',
    width: 100
  }))

  emit('structure-change', {
    type: 'column_definitions',
    value: newDefs
  })
}

function createTable() {
  emit('create')
}

function deleteTable() {
  if (confirm('Delete this table? This cannot be undone.')) {
    emit('delete')
  }
}

// Watch for table data changes
watch(() => props.tableData, (newData) => {
  if (newData) {
    nextTick(() => initSpreadsheet())
  }
}, { deep: true })

watch(() => props.cellData, () => {
  if (props.tableData) {
    nextTick(() => initSpreadsheet())
  }
}, { deep: true })

onMounted(() => {
  if (props.tableData) {
    initSpreadsheet()
  }
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  if (jspreadsheetInstance) {
    jspreadsheetInstance.destroy()
    jspreadsheetInstance = null
  }
})
</script>

<template>
  <div class="node-spreadsheet">
    <div v-if="!tableData" class="no-table">
      <button class="create-table-btn" @click="createTable">
        + Add Table
      </button>
    </div>
    <div v-else class="spreadsheet-container">
      <div class="spreadsheet-toolbar">
        <span class="table-name">{{ tableData.name || 'Table' }}</span>
        <div class="toolbar-actions">
          <button class="toolbar-btn delete-btn" @click="deleteTable" title="Delete table">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div ref="spreadsheetEl" class="spreadsheet-element"></div>
    </div>
  </div>
</template>

<style scoped>
.node-spreadsheet {
  margin-top: 0.5rem;
}

.no-table {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.create-table-btn {
  background: transparent;
  border: 1px dashed var(--border-color, #374151);
  color: var(--text-secondary, #9ca3af);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.create-table-btn:hover {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
  background: var(--bg-hover, rgba(59, 130, 246, 0.1));
}

.spreadsheet-container {
  border: 1px solid var(--border-color, #374151);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary, #1a1a2e);
}

.spreadsheet-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  background: var(--bg-tertiary, #252540);
  border-bottom: 1px solid var(--border-color, #374151);
}

.table-name {
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
  font-weight: 500;
}

.toolbar-actions {
  display: flex;
  gap: 0.25rem;
}

.toolbar-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #9ca3af);
  padding: 0.25rem;
  cursor: pointer;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.1));
  color: var(--text-primary, #fff);
}

.delete-btn:hover {
  color: var(--error-color, #ef4444);
}

.spreadsheet-element {
  background: var(--bg-primary, #0f0f23);
}

/* jspreadsheet overrides for dark theme */
:deep(.jexcel) {
  background: var(--bg-primary, #0f0f23);
  color: var(--text-primary, #e5e7eb);
  font-family: inherit;
  font-size: 0.8125rem;
}

:deep(.jexcel td) {
  background: var(--bg-primary, #0f0f23);
  color: var(--text-primary, #e5e7eb);
  border-color: var(--border-color, #374151);
}

:deep(.jexcel td.readonly) {
  background: var(--bg-secondary, #1a1a2e);
}

:deep(.jexcel thead td) {
  background: var(--bg-tertiary, #252540);
  color: var(--text-secondary, #9ca3af);
  border-color: var(--border-color, #374151);
  font-weight: 500;
}

:deep(.jexcel tbody tr td:first-child) {
  background: var(--bg-tertiary, #252540);
  color: var(--text-secondary, #9ca3af);
}

:deep(.jexcel td.highlight) {
  background: var(--primary-bg, rgba(59, 130, 246, 0.2));
}

:deep(.jexcel td.selected) {
  background: var(--primary-bg, rgba(59, 130, 246, 0.3));
  border: 1px solid var(--primary-color, #3b82f6);
}

:deep(.jexcel_content) {
  background: var(--bg-primary, #0f0f23);
}

:deep(.jexcel_corner) {
  background: var(--bg-tertiary, #252540);
  border-color: var(--border-color, #374151);
}

/* Input editing */
:deep(.jexcel input) {
  background: var(--bg-primary, #0f0f23);
  color: var(--text-primary, #e5e7eb);
  border: 1px solid var(--primary-color, #3b82f6);
}

/* Context menu styling */
:deep(.jexcel_contextmenu) {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border-color, #374151);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

:deep(.jexcel_contextmenu > div) {
  color: var(--text-primary, #e5e7eb);
  padding: 0.5rem 1rem;
}

:deep(.jexcel_contextmenu > div:hover) {
  background: var(--bg-hover, rgba(59, 130, 246, 0.2));
}

:deep(.jexcel_contextmenu hr) {
  border-color: var(--border-color, #374151);
}

/* Scrollbar styling */
:deep(.jexcel_content::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(.jexcel_content::-webkit-scrollbar-track) {
  background: var(--bg-secondary, #1a1a2e);
}

:deep(.jexcel_content::-webkit-scrollbar-thumb) {
  background: var(--border-color, #374151);
  border-radius: 4px;
}

:deep(.jexcel_content::-webkit-scrollbar-thumb:hover) {
  background: var(--text-secondary, #9ca3af);
}
</style>
