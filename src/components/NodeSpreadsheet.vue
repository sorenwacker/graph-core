<script setup>
import { ref, computed, onUnmounted, onMounted, shallowRef, watch, nextTick } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import {
  copySelection as clipboardCopy,
  cutSelection as clipboardCut,
  deleteSelectedCells as clipboardDelete,
  fillSelectionWithValue as clipboardFill,
  pasteSelection as clipboardPaste
} from '../composables/useSpreadsheetClipboard.js'

// ============================================================================
// Constants
// ============================================================================

const COLORS = {
  bg: '#000000',
  bgHeader: '#080808',
  bgOddRow: '#040404',
  bgHover: '#0a1520',
  bgSelected: '#102030',
  text: '#d0d0d0',
  textMuted: '#666666',
  border: '#1a1a1a',
  accent: '#4a8af4',
}

// Colorblind-friendly palette (Wong's palette)
const COLOR_OPTIONS = [
  { name: 'Default', value: null },
  { name: 'Blue', value: '#56B4E9' },
  { name: 'Orange', value: '#E69F00' },
  { name: 'Green', value: '#009E73' },
  { name: 'Pink', value: '#CC79A7' },
  { name: 'Red', value: '#D55E00' },
]

// ============================================================================
// AG Grid Setup
// ============================================================================

ModuleRegistry.registerModules([AllCommunityModule])

const darkTheme = themeQuartz.withParams({
  backgroundColor: COLORS.bg,
  foregroundColor: COLORS.text,
  headerBackgroundColor: COLORS.bgHeader,
  headerTextColor: COLORS.textMuted,
  oddRowBackgroundColor: COLORS.bgOddRow,
  rowHoverColor: COLORS.bgHover,
  selectedRowBackgroundColor: COLORS.bgSelected,
  borderColor: COLORS.border,
  rowBorder: { style: 'solid', width: 1, color: COLORS.border },
  columnBorder: { style: 'solid', width: 1, color: COLORS.border },
  headerColumnBorder: { style: 'solid', width: 1, color: COLORS.border },
  headerRowBorder: { style: 'solid', width: 1, color: COLORS.border },
  accentColor: COLORS.accent,
  fontSize: 11,
  headerFontSize: 11,
  rowHeight: 24,
  headerHeight: 28,
})

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps({
  nodeId: { type: Number, required: true },
  tableData: { type: Object, default: null },
  cellData: { type: Array, default: () => [] },
})

const emit = defineEmits(['create', 'delete', 'cell-change', 'structure-change', 'style-change'])

// ============================================================================
// State
// ============================================================================

const gridApi = shallowRef(null)
const gridWrapper = ref(null)
let saveTimeout = null

// Selection
const isSelecting = ref(false)
const selectionStart = ref(null)
const selectionEnd = ref(null)
const dragStartPos = ref(null)
const isDragging = ref(false)
const lastSelectedColumn = ref(null) // For shift-click column range selection

// Multi-cell typing buffer
const typingBuffer = ref('')
let typingTimeout = null

// Context menus
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const showColumnMenu = ref(false)
const columnMenuPos = ref({ x: 0, y: 0 })
const columnMenuIndex = ref(null)

// Column editing
const editingColumn = ref(null)
const editingColumnName = ref('')
const columnInputPos = ref({ x: 0, y: 0 })
const columnInput = ref(null)

// Auto-focus column input
watch(editingColumn, (val) => {
  if (val !== null) nextTick(() => { columnInput.value?.focus(); columnInput.value?.select() })
})


// ============================================================================
// Computed Properties
// ============================================================================

const selectionBounds = computed(() => {
  if (!selectionStart.value || !selectionEnd.value) return null
  return {
    minRow: Math.min(selectionStart.value.row, selectionEnd.value.row),
    maxRow: Math.max(selectionStart.value.row, selectionEnd.value.row),
    minCol: Math.min(selectionStart.value.col, selectionEnd.value.col),
    maxCol: Math.max(selectionStart.value.col, selectionEnd.value.col)
  }
})

// ============================================================================
// Cell Style Helpers
// ============================================================================

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
  const colIndex = params.colDef.context?.colIndex
  if (colIndex === undefined) return null
  const style = getCellStyle(params.node.rowIndex, colIndex)
  if (!style) return null
  return {
    fontWeight: style.bold ? '700' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color || null
  }
}

// ============================================================================
// AG Grid Column Definitions
// ============================================================================

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
    context: { colIndex: idx },
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


// ============================================================================
// Event Handlers
// ============================================================================

function onGridReady(params) {
  gridApi.value = params.api
}

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

  // Check if clicking on column header
  const colIndex = getColumnIndexFromHeader(event)
  if (colIndex !== -1) {
    const rowCount = rowData.value.length
    if (rowCount === 0) return

    if (event.shiftKey && lastSelectedColumn.value !== null) {
      // Shift-click: extend selection to column range
      const minCol = Math.min(lastSelectedColumn.value, colIndex)
      const maxCol = Math.max(lastSelectedColumn.value, colIndex)
      selectionStart.value = { row: 0, col: minCol }
      selectionEnd.value = { row: rowCount - 1, col: maxCol }
    } else {
      // Regular click: select entire column
      selectionStart.value = { row: 0, col: colIndex }
      selectionEnd.value = { row: rowCount - 1, col: colIndex }
      lastSelectedColumn.value = colIndex
    }
    typingBuffer.value = '' // Reset typing buffer on column selection
    if (typingTimeout) clearTimeout(typingTimeout)
    refreshCells()
    // Focus grid for keyboard shortcuts
    gridWrapper.value?.focus()
    return
  }

  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) {
    // Clicked outside data cells, clear selection
    clearSelection()
    return
  }

  // Shift-click to extend selection
  if (event.shiftKey && selectionStart.value) {
    selectionEnd.value = { ...cell }
    refreshCells()
    gridWrapper.value?.focus()
    return
  }

  // Record start position for potential drag detection
  dragStartPos.value = { x: event.clientX, y: event.clientY }
  isDragging.value = false
  isSelecting.value = true
  selectionStart.value = { ...cell }
  selectionEnd.value = { ...cell }
  lastSelectedColumn.value = null // Reset column tracking when selecting cells
  typingBuffer.value = '' // Reset typing buffer on new selection
  if (typingTimeout) clearTimeout(typingTimeout)
  // Focus grid for keyboard shortcuts after selection
  gridWrapper.value?.focus()
  // Don't call refreshCells() here - let AG Grid handle the click for editing
}

// Get column index from header click event
function getColumnIndexFromHeader(event) {
  // Direct header cell click
  const headerCell = event.target.closest('.ag-header-cell')
  if (headerCell) {
    const colId = headerCell.getAttribute('col-id')
    if (colId && colId !== '_rowIndex') {
      return columns.value.findIndex(c => c.name === colId)
    }
  }

  // Fallback: find column from x position in header row
  if (event.target.closest('.ag-header-row')) {
    const headerCells = gridWrapper.value?.querySelectorAll('.ag-header-cell')
    for (const cell of headerCells || []) {
      const rect = cell.getBoundingClientRect()
      const colId = cell.getAttribute('col-id')
      if (colId && colId !== '_rowIndex' &&
          event.clientX >= rect.left && event.clientX <= rect.right) {
        return columns.value.findIndex(c => c.name === colId)
      }
    }
  }
  return -1
}

function handleContextMenu(event) {
  // Handle header right-click
  const colIndex = getColumnIndexFromHeader(event)
  if (colIndex !== -1) {
    columnMenuIndex.value = colIndex
    columnMenuPos.value = { x: event.clientX, y: event.clientY }
    showColumnMenu.value = true
    showContextMenu.value = false
    return
  }

  // Handle cell right-click
  const cell = getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  // Select cell if not already selected
  if (!selectionBounds.value || !isCellSelected(cell.row, cell.col)) {
    selectionStart.value = { ...cell }
    selectionEnd.value = { ...cell }
    refreshCells()
  }

  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  showColumnMenu.value = false
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

function handleMouseUp() {
  // Don't clear selection if context menu is open
  if (showContextMenu.value) {
    isSelecting.value = false
    isDragging.value = false
    dragStartPos.value = null
    return
  }

  // Keep single-cell selection for copy/paste even without drag
  // Only refresh cells (show highlight) if we dragged
  if (isDragging.value) {
    refreshCells()
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
  typingBuffer.value = ''
  if (typingTimeout) clearTimeout(typingTimeout)
  refreshCells()
}

// Apply style transformation to all selected cells
function applyStyleToSelection(styleUpdater) {
  const bounds = selectionBounds.value
  if (!bounds) return

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      emit('style-change', {
        row: r,
        col: c,
        style: styleUpdater(currentStyle)
      })
    }
  }

  showContextMenu.value = false
  setTimeout(() => refreshCells(), 100)
}

// Toggle bold on selected cells
function toggleBold() {
  const hasBold = selectionHasStyle('bold')
  applyStyleToSelection(style => ({ ...style, bold: !hasBold }))
}

// Toggle italic on selected cells
function toggleItalic() {
  const hasItalic = selectionHasStyle('italic')
  applyStyleToSelection(style => ({ ...style, italic: !hasItalic }))
}

// Set color on selected cells
function setColor(color) {
  applyStyleToSelection(style => ({ ...style, color }))
}

// Clipboard operation wrappers
function getClipboardOptions() {
  return {
    selectionBounds: selectionBounds.value,
    columns: columns.value,
    rowData: rowData.value,
    gridApi: gridApi.value,
    emit
  }
}

async function copySelection() {
  await clipboardCopy(getClipboardOptions())
}

async function cutSelection() {
  await clipboardCut(getClipboardOptions())
}

function deleteSelectedCells() {
  clipboardDelete(getClipboardOptions())
}

function fillSelectionWithValue(value) {
  clipboardFill({ ...getClipboardOptions(), value })
}

async function pasteSelection() {
  await clipboardPaste(getClipboardOptions())
}

// Keyboard shortcut definitions
const shortcuts = {
  c: { handler: copySelection, needsSelection: true },
  v: { handler: pasteSelection, needsSelection: false },
  x: { handler: cutSelection, needsSelection: true },
  b: { handler: toggleBold, needsSelection: true },
  i: { handler: toggleItalic, needsSelection: true },
}

function handleKeyDown(event) {
  if (!gridWrapper.value?.contains(document.activeElement) &&
      document.activeElement !== document.body) {
    return
  }

  // Handle Cmd/Ctrl shortcuts
  if (event.metaKey || event.ctrlKey) {
    const shortcut = shortcuts[event.key]
    if (shortcut && (!shortcut.needsSelection || selectionBounds.value)) {
      event.preventDefault()
      event.stopPropagation()
      shortcut.handler()
      return
    }
  }

  // Escape - Close menus and clear selection
  if (event.key === 'Escape') {
    if (showColumnMenu.value) closeColumnMenu()
    else if (showContextMenu.value) showContextMenu.value = false
    else clearSelection()
    return
  }

  // Delete/Backspace - Clear selected cells
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectionBounds.value) {
    event.preventDefault()
    event.stopPropagation()
    deleteSelectedCells()
    return
  }

  // Type into multiple selected cells
  // Only handle if we have a multi-cell selection (more than 1 cell)
  const bounds = selectionBounds.value
  if (bounds) {
    const cellCount = (bounds.maxRow - bounds.minRow + 1) * (bounds.maxCol - bounds.minCol + 1)

    // Check if it's a printable character (single char, not special key)
    if (cellCount > 1 && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()

      // Accumulate characters in typing buffer
      typingBuffer.value += event.key

      // Clear existing timeout
      if (typingTimeout) clearTimeout(typingTimeout)

      // Fill all selected cells with accumulated buffer
      fillSelectionWithValue(typingBuffer.value)

      // Clear buffer after 1.5 seconds of no typing
      typingTimeout = setTimeout(() => {
        typingBuffer.value = ''
      }, 1500)

      return
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

function handleDocumentMouseDown(event) {
  // Don't close menus on right-click (let contextmenu handler deal with it)
  if (event.button === 2) return

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
  document.addEventListener('mousedown', handleDocumentMouseDown, true)
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  if (typingTimeout) clearTimeout(typingTimeout)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('mousedown', handleDocumentMouseDown, true)
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
          :rowSelection="{ mode: 'multiRow', enableClickSelection: false, copySelectedRows: false }"
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
          v-for="color in COLOR_OPTIONS"
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

<style scoped src="./NodeSpreadsheet.css"></style>
