<script setup>
import { ref, computed, onUnmounted, onMounted, shallowRef, watch, nextTick } from 'vue'
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
  rowBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  columnBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  headerColumnBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  headerRowBorder: { style: 'solid', width: 1, color: '#3a3a4a' },
  accentColor: '#4a8af4',
  fontSize: 11,
  headerFontSize: 11,
  rowHeight: 24,
  headerHeight: 28
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
const dragStartPos = ref(null)
const isDragging = ref(false)

// Context menu state
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

// Column rename state
const editingColumn = ref(null)
const editingColumnName = ref('')
const columnInputPos = ref({ x: 0, y: 0 })
const columnInput = ref(null)

// Column context menu state
const showColumnMenu = ref(false)
const columnMenuPos = ref({ x: 0, y: 0 })
const columnMenuIndex = ref(null)

// Auto-focus column input when editing starts
watch(editingColumn, (newVal) => {
  if (newVal !== null) {
    nextTick(() => {
      columnInput.value?.focus()
      columnInput.value?.select()
    })
  }
})

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

// Check if any selected cell has a style property
function selectionHasStyle(styleProp) {
  const bounds = selectionBounds.value
  if (!bounds) return false

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const style = getCellStyle(r, c)
      if (style?.[styleProp]) return true
    }
  }
  return false
}

// Get common color of selected cells (or null if mixed)
function getSelectionColor() {
  const bounds = selectionBounds.value
  if (!bounds) return null

  let commonColor = undefined
  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const style = getCellStyle(r, c)
      const color = style?.color || null
      if (commonColor === undefined) {
        commonColor = color
      } else if (commonColor !== color) {
        return null // Mixed colors
      }
    }
  }
  return commonColor
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

  // Close context menu on left click
  showContextMenu.value = false

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) {
    // Clicked outside data cells, clear selection
    clearSelection()
    return
  }

  // Record start position for potential drag detection
  dragStartPos.value = { x: event.clientX, y: event.clientY }
  isDragging.value = false
  isSelecting.value = true
  selectionStart.value = { ...cell }
  selectionEnd.value = { ...cell }
  // Don't call refreshCells() here - let AG Grid handle the click for editing
}

function handleContextMenu(event) {
  // Check if right-clicking on a header
  const headerCell = event.target.closest('.ag-header-cell')
  if (headerCell) {
    const colId = headerCell.getAttribute('col-id')
    if (colId && colId !== '_rowIndex') {
      const colIndex = columns.value.findIndex(c => c.name === colId)
      if (colIndex !== -1) {
        columnMenuIndex.value = colIndex
        columnMenuPos.value = { x: event.clientX, y: event.clientY }
        showColumnMenu.value = true
        showContextMenu.value = false
        return
      }
    }
  }

  // Check if in header row area (fallback)
  const headerRow = event.target.closest('.ag-header-row')
  if (headerRow) {
    // Find column from x position
    const headerCells = gridWrapper.value?.querySelectorAll('.ag-header-cell')
    if (headerCells) {
      for (const cell of headerCells) {
        const rect = cell.getBoundingClientRect()
        const colId = cell.getAttribute('col-id')
        if (colId && colId !== '_rowIndex' &&
            event.clientX >= rect.left && event.clientX <= rect.right) {
          const colIndex = columns.value.findIndex(c => c.name === colId)
          if (colIndex !== -1) {
            columnMenuIndex.value = colIndex
            columnMenuPos.value = { x: event.clientX, y: event.clientY }
            showColumnMenu.value = true
            showContextMenu.value = false
            return
          }
        }
      }
    }
  }

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  // If no selection or right-clicking outside current selection, select this cell
  if (!selectionBounds.value || !isCellSelected(cell.row, cell.col)) {
    selectionStart.value = { ...cell }
    selectionEnd.value = { ...cell }
    refreshCells()
  }

  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  showColumnMenu.value = false
}

function closeContextMenu() {
  showContextMenu.value = false
}

function handleMouseMove(event) {
  if (!isSelecting.value) return

  // Check if we've moved enough to consider it a drag (5px threshold)
  if (!isDragging.value && dragStartPos.value) {
    const dx = Math.abs(event.clientX - dragStartPos.value.x)
    const dy = Math.abs(event.clientY - dragStartPos.value.y)
    if (dx > 5 || dy > 5) {
      isDragging.value = true
      refreshCells() // Show initial selection now that we're dragging
    }
  }

  if (!isDragging.value) return

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  if (!selectionEnd.value || selectionEnd.value.row !== cell.row || selectionEnd.value.col !== cell.col) {
    selectionEnd.value = { ...cell }
    refreshCells()
  }
}

function handleMouseUp(event) {
  // Don't clear selection if context menu is open
  if (showContextMenu.value) {
    isSelecting.value = false
    isDragging.value = false
    dragStartPos.value = null
    return
  }

  // If we didn't drag, clear the selection so AG Grid can handle the click
  if (!isDragging.value) {
    selectionStart.value = null
    selectionEnd.value = null
  }
  isSelecting.value = false
  isDragging.value = false
  dragStartPos.value = null
}

function refreshCells() {
  if (gridApi.value) {
    // Force re-evaluation of cellClassRules
    gridApi.value.redrawRows()
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

  const hasBold = selectionHasStyle('bold')

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      const newStyle = { ...currentStyle, bold: !hasBold }

      emit('style-change', {
        row: r,
        col: c,
        style: newStyle
      })
    }
  }

  showContextMenu.value = false
  setTimeout(() => refreshCells(), 100)
}

// Toggle italic on selected cells
function toggleItalic() {
  const bounds = selectionBounds.value
  if (!bounds) return

  const hasItalic = selectionHasStyle('italic')

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      const newStyle = { ...currentStyle, italic: !hasItalic }

      emit('style-change', {
        row: r,
        col: c,
        style: newStyle
      })
    }
  }

  showContextMenu.value = false
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

  showContextMenu.value = false
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

// Delete selected cells
function deleteSelectedCells() {
  const bounds = selectionBounds.value
  if (!bounds) return

  const cols = columns.value

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      emit('cell-change', {
        row: r,
        col: c,
        value: '',
        isFormula: false
      })

      // Update grid display
      if (gridApi.value) {
        const rowNode = gridApi.value.getRowNode(String(r))
        if (rowNode && cols[c]) {
          rowNode.setDataValue(cols[c].name, '')
        }
      }
    }
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

  // Delete/Backspace - Clear selected cells
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectionBounds.value) {
      event.preventDefault()
      event.stopPropagation()
      deleteSelectedCells()
    }
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

function handleDocumentClick(event) {
  // Close context menu when clicking outside
  if (showContextMenu.value && !event.target.closest('.context-menu')) {
    showContextMenu.value = false
  }
  // Close column menu when clicking outside
  if (showColumnMenu.value && !event.target.closest('.column-menu')) {
    closeColumnMenu()
  }
  // Close column rename input when clicking outside
  if (editingColumn.value !== null && !event.target.closest('.column-rename-input')) {
    cancelColumnRename()
  }
}

function handleHeaderDoubleClick(event) {
  const headerCell = event.target.closest('.ag-header-cell')
  if (!headerCell) return

  const colId = headerCell.getAttribute('col-id')
  if (!colId || colId === '_rowIndex') return

  const colIndex = columns.value.findIndex(c => c.name === colId)
  if (colIndex === -1) return

  event.preventDefault()
  event.stopPropagation()

  const rect = headerCell.getBoundingClientRect()
  editingColumn.value = colIndex
  editingColumnName.value = columns.value[colIndex].name
  columnInputPos.value = { x: rect.left, y: rect.top, width: rect.width }
}

function saveColumnRename() {
  if (editingColumn.value === null) return

  const newName = editingColumnName.value.trim()
  if (!newName) {
    cancelColumnRename()
    return
  }

  const currentCols = props.tableData?.column_definitions || []

  // Check for duplicate names (excluding current column)
  const isDuplicate = currentCols.some((col, idx) =>
    idx !== editingColumn.value && col.name === newName
  )

  if (isDuplicate) {
    // Append number to make unique
    let uniqueName = newName
    let counter = 2
    while (currentCols.some((col, idx) => idx !== editingColumn.value && col.name === uniqueName)) {
      uniqueName = `${newName}${counter}`
      counter++
    }
    editingColumnName.value = uniqueName
  }

  const finalName = isDuplicate ? editingColumnName.value : newName

  // Create plain objects to avoid Vue Proxy issues
  const updatedCols = currentCols.map((col, idx) => ({
    id: col.id,
    name: idx === editingColumn.value ? finalName : col.name,
    type: col.type || 'text',
    width: col.width || 100
  }))

  emit('structure-change', { type: 'column_definitions', value: updatedCols })
  editingColumn.value = null
  editingColumnName.value = ''
}

function cancelColumnRename() {
  editingColumn.value = null
  editingColumnName.value = ''
}

function handleColumnInputKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveColumnRename()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelColumnRename()
  }
}

function handleHeaderContextMenu(event) {
  const headerCell = event.target.closest('.ag-header-cell')
  if (!headerCell) return

  const colId = headerCell.getAttribute('col-id')
  if (!colId || colId === '_rowIndex') return

  const colIndex = columns.value.findIndex(c => c.name === colId)
  if (colIndex === -1) return

  event.preventDefault()
  event.stopPropagation()

  columnMenuIndex.value = colIndex
  columnMenuPos.value = { x: event.clientX, y: event.clientY }
  showColumnMenu.value = true
  showContextMenu.value = false
}

function renameColumnFromMenu() {
  if (columnMenuIndex.value === null) return

  const headerCells = document.querySelectorAll('.ag-header-cell')
  const colName = columns.value[columnMenuIndex.value].name

  for (const cell of headerCells) {
    if (cell.getAttribute('col-id') === colName) {
      const rect = cell.getBoundingClientRect()
      editingColumn.value = columnMenuIndex.value
      editingColumnName.value = colName
      columnInputPos.value = { x: rect.left, y: rect.top, width: rect.width }
      break
    }
  }

  showColumnMenu.value = false
  columnMenuIndex.value = null
}

function deleteColumn() {
  if (columnMenuIndex.value === null) return

  const currentCols = props.tableData?.column_definitions || []
  if (currentCols.length <= 1) {
    // Don't delete the last column
    showColumnMenu.value = false
    columnMenuIndex.value = null
    return
  }

  // Create plain objects to avoid Vue Proxy issues
  const updatedCols = currentCols
    .filter((_, idx) => idx !== columnMenuIndex.value)
    .map(col => ({
      id: col.id,
      name: col.name,
      type: col.type || 'text',
      width: col.width || 100
    }))

  emit('structure-change', { type: 'column_definitions', value: updatedCols })

  showColumnMenu.value = false
  columnMenuIndex.value = null
}

function closeColumnMenu() {
  showColumnMenu.value = false
  columnMenuIndex.value = null
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('click', handleDocumentClick)
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
            <button class="toolbar-btn" @click="copySelection" title="Copy (Cmd+C)">
              Copy
            </button>
            <button class="toolbar-btn" @click="pasteSelection" title="Paste (Cmd+V)">
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
        @mousedown.capture="handleMouseDown"
        @contextmenu.capture.prevent="handleContextMenu"
        @dblclick="handleHeaderDoubleClick"
      >
        <AgGridVue
          :key="nodeId + '-' + columnDefs.length + '-' + rowData.length"
          :theme="darkTheme"
          :columnDefs="columnDefs"
          :rowData="rowData"
          :defaultColDef="defaultColDef"
          domLayout="autoHeight"
          :stopEditingWhenCellsLoseFocus="true"
          :singleClickEdit="true"
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

      <!-- Context Menu -->
      <div
        v-if="showContextMenu && selectionBounds"
        class="context-menu"
        :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        @click.stop
      >
        <button
          class="ctx-btn"
          :class="{ active: selectionHasStyle('bold') }"
          @click="toggleBold"
          title="Bold"
        ><strong>B</strong></button>
        <button
          class="ctx-btn"
          :class="{ active: selectionHasStyle('italic') }"
          @click="toggleItalic"
          title="Italic"
        ><em>I</em></button>
        <span class="ctx-divider"></span>
        <button
          v-for="color in colorOptions"
          :key="color.name"
          class="ctx-color"
          :class="{ active: getSelectionColor() === color.value }"
          :style="{ backgroundColor: color.value || '#888' }"
          :title="color.name"
          @click="setColor(color.value)"
        />
      </div>

      <!-- Column Rename Input -->
      <input
        v-if="editingColumn !== null"
        ref="columnInput"
        v-model="editingColumnName"
        class="column-rename-input"
        :style="{
          left: columnInputPos.x + 'px',
          top: columnInputPos.y + 'px',
          width: columnInputPos.width + 'px'
        }"
        @keydown="handleColumnInputKeydown"
        @blur="saveColumnRename"
      />

      <!-- Column Context Menu -->
      <div
        v-if="showColumnMenu"
        class="column-menu"
        :style="{ left: columnMenuPos.x + 'px', top: columnMenuPos.y + 'px' }"
        @click.stop
      >
        <button class="column-menu-item" @click="renameColumnFromMenu">Rename</button>
        <button class="column-menu-item delete" @click="deleteColumn">Delete</button>
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

.delete-btn:hover {
  background: #4a2a2a;
  border-color: #6a3a3a;
  color: #ff6b6b;
}

/* Context Menu */
.context-menu {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 3px;
  background: #1e1e2e;
  border: 1px solid #3a3a4e;
  border-radius: 4px;
  padding: 4px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.ctx-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a3e;
  border: 1px solid #3a3a4e;
  color: #a0a0b0;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
}

.ctx-btn:hover {
  background: #3a3a4e;
  color: #fff;
}

.ctx-btn.active {
  background: #2a3a4e;
  border-color: #4a8af4;
  color: #4a8af4;
}

.ctx-btn strong {
  font-weight: 700;
}

.ctx-btn em {
  font-style: italic;
}

.ctx-divider {
  width: 1px;
  height: 16px;
  background: #3a3a4e;
  margin: 0 2px;
}

.ctx-color {
  width: 16px;
  height: 16px;
  border: 1px solid #4a4a5e;
  border-radius: 2px;
  cursor: pointer;
}

.ctx-color:hover {
  transform: scale(1.1);
}

.ctx-color.active {
  border: 2px solid #fff;
}

/* Column rename input */
.column-rename-input {
  position: fixed;
  height: 28px;
  background: #1e1e2e;
  border: 1px solid #4a8af4;
  color: #d0d0d0;
  font-size: 11px;
  font-weight: 600;
  padding: 0 8px;
  z-index: 1000;
  outline: none;
  box-sizing: border-box;
}

/* Column context menu */
.column-menu {
  position: fixed;
  background: #1e1e2e;
  border: 1px solid #3a3a4e;
  border-radius: 4px;
  padding: 4px 0;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  min-width: 100px;
}

.column-menu-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #d0d0d0;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.column-menu-item:hover {
  background: #2a2a3e;
}

.column-menu-item.delete {
  color: #ff6b6b;
}

.column-menu-item.delete:hover {
  background: #3a2a2a;
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
  font-size: 10px !important;
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

/* Hide resize handle but keep functional */
.ag-header-cell-resize {
  opacity: 0;
}
.ag-header-cell-resize:hover {
  opacity: 0;
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
