<script setup>
import { ref, computed, onUnmounted, onMounted, shallowRef } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule])

// Create dark theme
const darkTheme = themeQuartz.withParams({
  backgroundColor: '#12121a',
  foregroundColor: '#d0d0d0',
  headerBackgroundColor: '#1a1a24',
  headerTextColor: '#888888',
  oddRowBackgroundColor: '#14141c',
  rowHoverColor: '#1e2e3e',
  selectedRowBackgroundColor: '#2a3a4a',
  borderColor: '#3a3a4a',
  cellHorizontalBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  cellVerticalBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  headerColumnBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  headerRowBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  accentColor: '#4a8af4',
  fontSize: 12,
  headerFontSize: 12,
  rowHeight: 28,
  headerHeight: 32
})

const props = defineProps({
  nodeId: { type: Number, required: true },
  tableData: { type: Object, default: null },
  cellData: { type: Array, default: () => [] }
})

const emit = defineEmits(['create', 'delete', 'cell-change', 'structure-change', 'style-change'])

const gridApi = shallowRef(null)
const gridWrapper = ref(null)
let saveTimeout = null

// Range selection state
const isSelecting = ref(false)
const selectionStart = ref(null)
const selectionEnd = ref(null)
const showColorPicker = ref(false)

// Colorblind-friendly palette (based on Wong's palette)
const colorOptions = [
  { name: 'Default', value: null },
  { name: 'Blue', value: '#56B4E9' },
  { name: 'Orange', value: '#E69F00' },
  { name: 'Green', value: '#009E73' },
  { name: 'Pink', value: '#CC79A7' },
  { name: 'Red', value: '#D55E00' }
]

// Computed selection bounds
const selectionBounds = computed(() => {
  if (!selectionStart.value || !selectionEnd.value) return null
  return {
    minRow: Math.min(selectionStart.value.row, selectionEnd.value.row),
    maxRow: Math.max(selectionStart.value.row, selectionEnd.value.row),
    minCol: Math.min(selectionStart.value.col, selectionEnd.value.col),
    maxCol: Math.max(selectionStart.value.col, selectionEnd.value.col)
  }
})

// Get cell style from cellData
function getCellStyle(row, col) {
  const cell = props.cellData.find(c => c.row_index === row && c.col_index === col)
  if (!cell?.style) return null
  try {
    return typeof cell.style === 'string' ? JSON.parse(cell.style) : cell.style
  } catch {
    return null
  }
}

// AG Grid cellStyle callback
function cellStyleCallback(params) {
  if (!params.colDef.colIndex && params.colDef.colIndex !== 0) return null
  const style = getCellStyle(params.node.rowIndex, params.colDef.colIndex)
  if (!style) return null
  return {
    fontWeight: style.bold ? '700' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color || null
  }
}

// Row index column
const rowIndexCol = {
  headerName: '',
  field: '_rowIndex',
  width: 45,
  minWidth: 45,
  maxWidth: 45,
  editable: false,
  sortable: false,
  filter: false,
  resizable: false,
  suppressMovable: true,
  suppressNavigable: true,
  lockPosition: 'left',
  cellClass: 'row-index-cell',
  headerClass: 'row-index-header',
  valueGetter: (params) => params.node.rowIndex + 1
}

// Get columns list
const columns = computed(() => {
  return props.tableData?.column_definitions || [
    { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }
  ]
})

// Check if cell is selected
function isCellSelected(row, col) {
  const bounds = selectionBounds.value
  if (!bounds) return false
  return row >= bounds.minRow && row <= bounds.maxRow &&
         col >= bounds.minCol && col <= bounds.maxCol
}

// Column definitions
const columnDefs = computed(() => {
  const dataCols = columns.value.map((col, idx) => ({
    field: col.name,
    headerName: col.name,
    editable: true,
    width: col.width || 100,
    colIndex: idx,
    cellStyle: cellStyleCallback,
    cellClassRules: {
      'cell-selected': (params) => isCellSelected(params.node.rowIndex, idx)
    }
  }))

  return [rowIndexCol, ...dataCols]
})

// Row data
const rowData = computed(() => {
  const rowCount = props.tableData?.row_count || 5
  const cols = columns.value

  const rows = []
  for (let r = 0; r < rowCount; r++) {
    const row = { _rowIndex: r }
    cols.forEach((col, c) => {
      const cell = props.cellData.find(cl => cl.row_index === r && cl.col_index === c)
      row[col.name] = cell?.value || cell?.formula || ''
    })
    rows.push(row)
  }
  return rows
})

const defaultColDef = {
  editable: true,
  resizable: true,
  sortable: false,
  suppressMovable: true,
  flex: 1,
  minWidth: 80
}


function onGridReady(params) {
  gridApi.value = params.api
}

// Get cell coordinates from mouse event
function getCellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y)
  if (!element) return null

  let cellEl = element.closest('.ag-cell')
  if (!cellEl) return null

  const colId = cellEl.getAttribute('col-id')
  if (!colId || colId === '_rowIndex') return null

  const rowEl = cellEl.closest('.ag-row')
  if (!rowEl) return null

  const rowIndex = parseInt(rowEl.getAttribute('row-index'), 10)
  if (isNaN(rowIndex)) return null

  const colIndex = columns.value.findIndex(c => c.name === colId)
  if (colIndex === -1) return null

  return { row: rowIndex, col: colIndex }
}

function handleMouseDown(event) {
  if (event.button !== 0) return
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  event.preventDefault()
  isSelecting.value = true
  selectionStart.value = { ...cell }
  selectionEnd.value = { ...cell }
  refreshCells()
}

function handleMouseMove(event) {
  if (!isSelecting.value) return

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  if (!selectionEnd.value || selectionEnd.value.row !== cell.row || selectionEnd.value.col !== cell.col) {
    selectionEnd.value = { ...cell }
    refreshCells()
  }
}

function handleMouseUp() {
  isSelecting.value = false
}

function refreshCells() {
  if (gridApi.value) {
    gridApi.value.refreshCells({ force: true })
  }
}

function clearSelection() {
  selectionStart.value = null
  selectionEnd.value = null
  refreshCells()
}

// Toggle bold on selected cells
function toggleBold() {
  const bounds = selectionBounds.value
  if (!bounds) return

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      const newStyle = { ...currentStyle, bold: !currentStyle.bold }

      emit('style-change', {
        row: r,
        col: c,
        style: newStyle
      })
    }
  }

  // Refresh after a short delay to allow state to update
  setTimeout(() => refreshCells(), 100)
}

// Toggle italic on selected cells
function toggleItalic() {
  const bounds = selectionBounds.value
  if (!bounds) return

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      const newStyle = { ...currentStyle, italic: !currentStyle.italic }

      emit('style-change', {
        row: r,
        col: c,
        style: newStyle
      })
    }
  }

  setTimeout(() => refreshCells(), 100)
}

// Set color on selected cells
function setColor(color) {
  const bounds = selectionBounds.value
  if (!bounds) return

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      const newStyle = { ...currentStyle, color: color }

      emit('style-change', {
        row: r,
        col: c,
        style: newStyle
      })
    }
  }

  showColorPicker.value = false
  setTimeout(() => refreshCells(), 100)
}

// Copy selected cells to clipboard
async function copySelection() {
  const bounds = selectionBounds.value
  if (!bounds) return

  const cols = columns.value
  const lines = []

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    const row = rowData.value[r]
    const cells = []
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const colName = cols[c]?.name
      cells.push(row?.[colName] ?? '')
    }
    lines.push(cells.join('\t'))
  }

  const text = lines.join('\n')

  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Copy failed:', err)
  }
}

// Paste from clipboard
async function pasteSelection() {
  const bounds = selectionBounds.value
  const startRow = bounds?.minRow ?? 0
  const startCol = bounds?.minCol ?? 0

  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch (err) {
    console.error('Paste failed:', err)
    return
  }

  if (!text) return

  const lines = text.split('\n')
  const cols = columns.value

  for (let r = 0; r < lines.length; r++) {
    const cells = lines[r].split('\t')
    for (let c = 0; c < cells.length; c++) {
      const targetRow = startRow + r
      const targetCol = startCol + c

      if (targetRow < rowData.value.length && targetCol < cols.length) {
        const value = cells[c]
        const isFormula = value.startsWith('=')

        emit('cell-change', {
          row: targetRow,
          col: targetCol,
          value: value,
          isFormula: isFormula
        })

        if (gridApi.value) {
          const rowNode = gridApi.value.getRowNode(String(targetRow))
          if (rowNode) {
            rowNode.setDataValue(cols[targetCol].name, value)
          }
        }
      }
    }
  }
}

function handleKeyDown(event) {
  if (!gridWrapper.value?.contains(document.activeElement) &&
      document.activeElement !== document.body) {
    return
  }

  // Cmd/Ctrl+C - Copy
  if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
    if (selectionBounds.value) {
      event.preventDefault()
      event.stopPropagation()
      copySelection()
    }
  }

  // Cmd/Ctrl+V - Paste
  if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
    event.preventDefault()
    event.stopPropagation()
    pasteSelection()
  }

  // Cmd/Ctrl+B - Bold
  if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
    if (selectionBounds.value) {
      event.preventDefault()
      event.stopPropagation()
      toggleBold()
    }
  }

  // Cmd/Ctrl+I - Italic
  if ((event.metaKey || event.ctrlKey) && event.key === 'i') {
    if (selectionBounds.value) {
      event.preventDefault()
      event.stopPropagation()
      toggleItalic()
    }
  }

  // Escape - Clear selection
  if (event.key === 'Escape') {
    clearSelection()
  }
}

function onCellValueChanged(params) {
  if (saveTimeout) clearTimeout(saveTimeout)

  saveTimeout = setTimeout(() => {
    const rowIndex = params.node.rowIndex
    const colIndex = columnDefs.value.findIndex(c => c.field === params.colDef.field) - 1
    if (colIndex < 0) return
    // Handle null/undefined but preserve 0 and empty string
    const value = params.newValue ?? ''
    const valueStr = String(value)
    const isFormula = valueStr.startsWith('=')

    emit('cell-change', {
      row: rowIndex,
      col: colIndex,
      value: valueStr,
      isFormula: isFormula
    })
  }, 300)
}

function addRow() {
  if (!props.tableData) return
  const newRowCount = (props.tableData.row_count || 5) + 1
  emit('structure-change', { type: 'row_count', value: newRowCount })
}

function addColumn() {
  if (!props.tableData) return

  const currentCols = props.tableData.column_definitions || []
  if (currentCols.length === 0) {
    const defaultCols = [
      { id: 'col0', name: 'A', type: 'text', width: 100 },
      { id: 'col1', name: 'B', type: 'text', width: 100 },
      { id: 'col2', name: 'C', type: 'text', width: 100 },
      { id: 'col3', name: 'D', type: 'text', width: 100 },
      { id: 'col4', name: 'E', type: 'text', width: 100 }
    ]
    emit('structure-change', { type: 'column_definitions', value: defaultCols })
    return
  }

  const plainCols = currentCols.map(col => ({
    id: col.id,
    name: col.name,
    type: col.type || 'text',
    width: col.width || 100
  }))
  const newColName = getColumnName(plainCols.length)
  const newCols = [...plainCols, { id: `col${plainCols.length}`, name: newColName, type: 'text', width: 100 }]
  emit('structure-change', { type: 'column_definitions', value: newCols })
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

function createTable() {
  emit('create')
}

function deleteTable() {
  if (confirm('Delete this table? This cannot be undone.')) {
    emit('delete')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <div class="node-spreadsheet" tabindex="0">
    <div v-if="!tableData" class="no-table">
      <button class="create-table-btn" @click="createTable">
        + Add Table
      </button>
    </div>
    <div v-else class="spreadsheet-container">
      <div class="spreadsheet-toolbar">
        <span class="table-name">{{ tableData.name || 'Table' }}</span>
        <div class="toolbar-actions">
          <template v-if="selectionBounds">
            <span class="selection-info">
              {{ selectionBounds.maxRow - selectionBounds.minRow + 1 }}x{{ selectionBounds.maxCol - selectionBounds.minCol + 1 }}
            </span>
            <button
              class="toolbar-btn format-btn"
              @click="toggleBold"
              title="Bold (Cmd+B)"
            >
              <strong>B</strong>
            </button>
            <button
              class="toolbar-btn format-btn"
              @click="toggleItalic"
              title="Italic (Cmd+I)"
            >
              <em>I</em>
            </button>
            <div class="color-picker-wrapper">
              <button
                class="toolbar-btn format-btn color-btn"
                @click="showColorPicker = !showColorPicker"
                title="Text Color"
              >
                A
              </button>
              <div v-if="showColorPicker" class="color-picker-dropdown">
                <button
                  v-for="color in colorOptions"
                  :key="color.name"
                  class="color-option"
                  :style="{ backgroundColor: color.value || '#d0d0d0' }"
                  :title="color.name"
                  @click="setColor(color.value)"
                />
              </div>
            </div>
            <button
              class="toolbar-btn"
              @click="copySelection"
              title="Copy (Cmd+C)"
            >
              Copy
            </button>
            <button
              class="toolbar-btn"
              @click="pasteSelection"
              title="Paste (Cmd+V)"
            >
              Paste
            </button>
          </template>
          <button class="toolbar-btn" @click="addRow" title="Add row">
            + Row
          </button>
          <button class="toolbar-btn" @click="addColumn" title="Add column">
            + Col
          </button>
          <button class="toolbar-btn delete-btn" @click="deleteTable" title="Delete table">
            Delete
          </button>
        </div>
      </div>
      <div
        ref="gridWrapper"
        class="grid-wrapper"
        tabindex="0"
        @mousedown="handleMouseDown"
      >
        <AgGridVue
          :key="nodeId + '-' + columnDefs.length + '-' + rowData.length"
          :theme="darkTheme"
          :columnDefs="columnDefs"
          :rowData="rowData"
          :defaultColDef="defaultColDef"
                    domLayout="autoHeight"
          :stopEditingWhenCellsLoseFocus="true"
          :singleClickEdit="false"
          :enterNavigatesVertically="true"
          :enterNavigatesVerticallyAfterEdit="true"
          :enableCellTextSelection="false"
          :ensureDomOrder="true"
          :suppressClipboardPaste="true"
          :suppressCopyRowsToClipboard="true"
          :suppressRowClickSelection="true"
          @grid-ready="onGridReady"
          @cell-value-changed="onCellValueChanged"
          @cell-double-clicked="clearSelection"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-spreadsheet {
  margin-top: 0.5rem;
  outline: none;
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
  background: rgba(59, 130, 246, 0.1);
}

.spreadsheet-container {
  border: 1px solid #2a2a3a;
  border-radius: 4px;
  overflow: hidden;
}

.spreadsheet-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  background: #1e1e2e;
  border-bottom: 1px solid #2a2a3a;
}

.table-name {
  font-size: 0.75rem;
  color: #888;
  font-weight: 500;
}

.toolbar-actions {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}

.selection-info {
  font-size: 0.65rem;
  color: #888;
  padding: 0.15rem 0.4rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.toolbar-btn {
  background: #2a2a3e;
  border: 1px solid #3a3a4e;
  color: #a0a0b0;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 3px;
  font-size: 0.7rem;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: #3a3a4e;
  color: #fff;
  border-color: #4a4a5e;
}

.format-btn {
  padding: 0.25rem 0.4rem;
  min-width: 24px;
  text-align: center;
}

.format-btn strong {
  font-weight: 700;
}

.format-btn em {
  font-style: italic;
}

.color-picker-wrapper {
  position: relative;
}

.color-btn {
  text-decoration: underline;
  text-decoration-color: #E69F00;
  text-underline-offset: 2px;
}

.color-picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #1e1e2e;
  border: 1px solid #3a3a4e;
  border-radius: 4px;
  padding: 4px;
  display: flex;
  gap: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.color-option {
  width: 20px;
  height: 20px;
  border: 1px solid #4a4a5e;
  border-radius: 3px;
  cursor: pointer;
  transition: transform 0.1s;
}

.color-option:hover {
  transform: scale(1.15);
  border-color: #fff;
}

.delete-btn:hover {
  background: #4a2a2a;
  border-color: #6a3a3a;
  color: #ff6b6b;
}

.grid-wrapper {
  width: 100%;
  min-height: 150px;
  cursor: cell;
  outline: none;
}

.grid-wrapper:focus {
  outline: none;
}
</style>

<style>
/* Row index column styling */
.row-index-cell {
  background-color: #1a1a24 !important;
  color: #888 !important;
  text-align: center !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  user-select: none !important;
  cursor: default !important;
}

.row-index-header {
  background-color: #1a1a24 !important;
}

/* Bold column headers */
.ag-header-cell-text {
  font-weight: 600 !important;
  color: #a0a0b0 !important;
}

/* Selected cell highlighting */
.cell-selected {
  background-color: rgba(74, 138, 244, 0.35) !important;
}

/* Prevent text selection while dragging */
.grid-wrapper {
  user-select: none;
  -webkit-user-select: none;
}
</style>
