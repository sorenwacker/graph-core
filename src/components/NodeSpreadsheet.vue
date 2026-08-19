<script setup>
import { ref, computed, onUnmounted, onMounted, shallowRef, watch } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import {
  copySelection as clipboardCopy,
  cutSelection as clipboardCut,
  deleteSelectedCells as clipboardDelete,
  fillSelectionWithValue as clipboardFill,
  pasteSelection as clipboardPaste,
} from '../composables/useSpreadsheetClipboard.js'
import { useSpreadsheetSelection } from '../composables/useSpreadsheetSelection.js'
import { useSpreadsheetKeyboard } from '../composables/useSpreadsheetKeyboard.js'
import { useColumnOperations } from '../composables/useColumnOperations.js'
import { isFormula, getColumnName } from '../utils/spreadsheetFormulas.js'
import {
  getCellStyleFromData,
  selectionHasStyle as checkSelectionHasStyle,
  getSelectionColor as getSelectionColorFromData,
  createCellStyleCallback,
} from '../utils/spreadsheetCellStyles.js'

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
const saveTimeouts = new Map()

// Context menu state (cell formatting)
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

// ============================================================================
// Computed Properties
// ============================================================================

// Get columns list
const columns = computed(() => {
  return props.tableData?.column_definitions || [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]
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

// ============================================================================
// Composables Setup
// ============================================================================

// Repaint the selection highlight. Deliberately not redrawRows(): that rebuilds
// the row DOM and takes any open cell editor with it, discarding what the user
// has typed. refreshCells re-evaluates cellStyle and cellClassRules and leaves
// cells that are being edited alone.
function refreshCells() {
  if (gridApi.value) {
    gridApi.value.refreshCells({ force: true })
  }
}

// Rows are identified by their index so that recomputing rowData (which happens
// on every cell save, because saving appends to the shared cell list) updates
// the existing rows in place instead of rebuilding all of them.
function getRowId(params) {
  return String(params.data._rowIndex)
}

// Selection composable
const selection = useSpreadsheetSelection({
  getColumns: () => columns.value,
  getRowCount: () => rowData.value.length,
  getGridWrapper: () => gridWrapper.value,
  refreshCells,
  clearTypingBuffer: () => keyboard.clearTypingBuffer(),
})

// Column operations composable
const columnOps = useColumnOperations({
  getTableData: () => props.tableData,
  getColumns: () => columns.value,
  emit,
})

// ============================================================================
// Cell Style Helpers
// ============================================================================

function getCellStyle(row, col) {
  return getCellStyleFromData(props.cellData, row, col)
}

function selectionHasStyle(styleProp) {
  return checkSelectionHasStyle(selection.selectionBounds.value, props.cellData, styleProp)
}

function getSelectionColor() {
  return getSelectionColorFromData(selection.selectionBounds.value, props.cellData)
}

const cellStyleCallback = computed(() => createCellStyleCallback(props.cellData))

// ============================================================================
// Style Operations
// ============================================================================

function applyStyleToSelection(styleUpdater) {
  const bounds = selection.selectionBounds.value
  if (!bounds) return

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const currentStyle = getCellStyle(r, c) || {}
      emit('style-change', {
        row: r,
        col: c,
        style: styleUpdater(currentStyle),
      })
    }
  }

  showContextMenu.value = false
  setTimeout(() => refreshCells(), 100)
}

function toggleBold() {
  const hasBold = selectionHasStyle('bold')
  applyStyleToSelection(style => ({ ...style, bold: !hasBold }))
}

function toggleItalic() {
  const hasItalic = selectionHasStyle('italic')
  applyStyleToSelection(style => ({ ...style, italic: !hasItalic }))
}

function setColor(color) {
  applyStyleToSelection(style => ({ ...style, color }))
}

// ============================================================================
// Clipboard Operations
// ============================================================================

function getClipboardOptions() {
  return {
    selectionBounds: selection.selectionBounds.value,
    columns: columns.value,
    rowData: rowData.value,
    gridApi: gridApi.value,
    emit,
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

// ============================================================================
// Keyboard Composable Setup
// ============================================================================

const keyboard = useSpreadsheetKeyboard({
  getGridWrapper: () => gridWrapper.value,
  getSelectionBounds: () => selection.selectionBounds.value,
  actions: {
    copySelection,
    pasteSelection,
    cutSelection,
    toggleBold,
    toggleItalic,
    deleteSelectedCells,
    fillSelectionWithValue,
    clearSelection: () => selection.clearSelection(),
    closeColumnMenu: () => columnOps.closeColumnMenu(),
    closeContextMenu: () => {
      showContextMenu.value = false
    },
  },
  isColumnMenuOpen: () => columnOps.showColumnMenu.value,
  isContextMenuOpen: () => showContextMenu.value,
})

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
  valueGetter: params => params.node.rowIndex + 1,
}

const columnDefs = computed(() => {
  // No fixed width: defaultColDef.flex distributes the panel width evenly so
  // the table always spans the detail panel.
  const dataCols = columns.value.map((col, idx) => ({
    field: col.name,
    headerName: col.name,
    editable: true,
    context: { colIndex: idx },
    cellStyle: cellStyleCallback.value,
    cellClassRules: {
      'cell-selected': params => selection.isCellSelected(params.node.rowIndex, idx),
    },
  }))

  return [rowIndexCol, ...dataCols]
})

const defaultColDef = {
  editable: true,
  resizable: true,
  sortable: false,
  suppressMovable: true,
  flex: 1,
  minWidth: 80,
}

// ============================================================================
// Event Handlers
// ============================================================================

function onGridReady(params) {
  gridApi.value = params.api
  // The grid often mounts into DOM the browser has not laid out yet (the table
  // section renders only after the async table load), so AG Grid measures a
  // 0-width viewport, leaves every flex column at its default width, and its
  // own resize detection never corrects it. Re-fit once layout has happened.
  requestAnimationFrame(() => fitColumns())
}

function fitColumns() {
  const api = gridApi.value
  if (!api || api.isDestroyed?.()) return
  if (!gridWrapper.value || gridWrapper.value.clientWidth === 0) return
  api.sizeColumnsToFit()
}

function handleMouseDown(event) {
  selection.handleMouseDown(event, {
    onContextMenuClose: () => {
      showContextMenu.value = false
    },
  })
}

function handleContextMenu(event) {
  const colIndex = selection.getColumnIndexFromHeader(event)
  if (colIndex !== -1) {
    columnOps.openColumnMenu(colIndex, event.clientX, event.clientY)
    showContextMenu.value = false
    return
  }

  const cell = selection.getCellFromPoint(event.clientX, event.clientY)
  if (!cell) return

  if (!selection.selectionBounds.value || !selection.isCellSelected(cell.row, cell.col)) {
    selection.selectionStart.value = { ...cell }
    selection.selectionEnd.value = { ...cell }
    refreshCells()
  }

  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  columnOps.showColumnMenu.value = false
}

function handleMouseMove(event) {
  selection.handleMouseMove(event)
}

function handleMouseUp() {
  selection.handleMouseUp(showContextMenu.value)
}

function onCellValueChanged(params) {
  const rowIndex = params.node.rowIndex
  const colIndex = columnDefs.value.findIndex(c => c.field === params.colDef.field) - 1
  if (colIndex < 0) return
  const value = params.newValue ?? ''
  const valueStr = String(value)

  // Debounce per cell: a shared timer would drop an earlier cell's pending
  // save when a second cell is edited within the debounce window.
  const key = `${rowIndex}:${colIndex}`
  const pending = saveTimeouts.get(key)
  if (pending) clearTimeout(pending.timer)

  // The save itself is kept alongside the timer so unmount can flush it
  // instead of dropping the edit (see onUnmounted).
  const save = () => {
    saveTimeouts.delete(key)
    emit('cell-change', {
      row: rowIndex,
      col: colIndex,
      value: valueStr,
      isFormula: isFormula(valueStr),
    })
  }

  saveTimeouts.set(key, { timer: setTimeout(save, 300), save })
}

// Run every debounced cell save immediately. Called on unmount so closing the
// panel within the debounce window does not silently discard edits.
function flushPendingSaves() {
  const pending = Array.from(saveTimeouts.values())
  saveTimeouts.clear()
  for (const { timer, save } of pending) {
    clearTimeout(timer)
    try {
      save()
    } catch (e) {
      // The component may already be torn down; never let a failed flush
      // break the rest of the unmount cleanup.
      console.error('Failed to flush pending cell save', e)
    }
  }
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
      { id: 'col0', name: 'A', type: 'text' },
      { id: 'col1', name: 'B', type: 'text' },
      { id: 'col2', name: 'C', type: 'text' },
      { id: 'col3', name: 'D', type: 'text' },
      { id: 'col4', name: 'E', type: 'text' },
    ]
    emit('structure-change', { type: 'column_definitions', value: defaultCols })
    return
  }

  const plainCols = currentCols.map(col => ({
    id: col.id,
    name: col.name,
    type: col.type || 'text',
  }))
  const newColName = getColumnName(plainCols.length)
  const newCols = [...plainCols, { id: `col${plainCols.length}`, name: newColName, type: 'text' }]
  emit('structure-change', { type: 'column_definitions', value: newCols })
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
  if (event.button === 2) return

  if (showContextMenu.value && !event.target.closest('.context-menu')) {
    showContextMenu.value = false
  }
  if (columnOps.showColumnMenu.value && !event.target.closest('.column-menu')) {
    columnOps.closeColumnMenu()
  }
  if (columnOps.editingColumn.value !== null && !event.target.closest('.column-rename-input')) {
    columnOps.cancelColumnRename()
  }
}

// AG Grid's built-in resize detection does not fire in this environment
// (verified against a bare grid: growing the container never re-flexes the
// columns), so observe the wrapper ourselves and re-fit the columns to the
// panel. Watching the ref (not onMounted/onGridReady) because the wrapper only
// renders once a table exists and is replaced when the :key remounts the grid.
// ResizeObserver fires once on observe, which also covers the initial fit.
// Debounced: resize fires continuously while dragging the panel resize handle.
let wrapperResizeObserver = null
let fitDebounceTimer = null

watch(
  gridWrapper,
  el => {
    if (wrapperResizeObserver) {
      wrapperResizeObserver.disconnect()
      wrapperResizeObserver = null
    }
    if (!el || typeof ResizeObserver === 'undefined') return
    wrapperResizeObserver = new ResizeObserver(() => {
      if (fitDebounceTimer) clearTimeout(fitDebounceTimer)
      fitDebounceTimer = setTimeout(() => fitColumns(), 100)
    })
    wrapperResizeObserver.observe(el)
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('keydown', keyboard.handleKeyDown, true)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('mousedown', handleDocumentMouseDown, true)
})

onUnmounted(() => {
  if (wrapperResizeObserver) {
    wrapperResizeObserver.disconnect()
    wrapperResizeObserver = null
  }
  if (fitDebounceTimer) clearTimeout(fitDebounceTimer)
  flushPendingSaves()
  keyboard.cleanup()
  document.removeEventListener('keydown', keyboard.handleKeyDown, true)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('mousedown', handleDocumentMouseDown, true)
})
</script>

<template>
  <div class="node-spreadsheet" tabindex="0">
    <div v-if="!tableData" class="no-table">
      <button class="create-table-btn" @click="createTable">+ Add Table</button>
    </div>
    <div v-else class="spreadsheet-container">
      <div class="spreadsheet-toolbar">
        <span class="table-name">{{ tableData.name || 'Table' }}</span>
        <div class="toolbar-actions">
          <template v-if="selection.selectionBounds.value">
            <span class="selection-info">
              {{ selection.selectionBounds.value.maxRow - selection.selectionBounds.value.minRow + 1 }}x{{
                selection.selectionBounds.value.maxCol - selection.selectionBounds.value.minCol + 1
              }}
            </span>
            <button class="toolbar-btn" @click="copySelection" title="Copy (Cmd+C)">Copy</button>
            <button class="toolbar-btn" @click="pasteSelection" title="Paste (Cmd+V)">Paste</button>
          </template>
          <button class="toolbar-btn" @click="addRow" title="Add row">+ Row</button>
          <button class="toolbar-btn" @click="addColumn" title="Add column">+ Col</button>
          <button class="toolbar-btn delete-btn" @click="deleteTable" title="Delete table">Delete</button>
        </div>
      </div>
      <div
        ref="gridWrapper"
        class="grid-wrapper"
        tabindex="0"
        @mousedown.capture="handleMouseDown"
        @contextmenu.capture.prevent="handleContextMenu"
        @dblclick="columnOps.handleHeaderDoubleClick"
      >
        <AgGridVue
          :key="nodeId + '-' + columnDefs.length + '-' + rowData.length"
          :theme="darkTheme"
          :column-defs="columnDefs"
          :row-data="rowData"
          :default-col-def="defaultColDef"
          :get-row-id="getRowId"
          dom-layout="autoHeight"
          :stop-editing-when-cells-lose-focus="true"
          :single-click-edit="true"
          :enter-navigates-vertically="true"
          :enter-navigates-vertically-after-edit="true"
          :enable-cell-text-selection="false"
          :ensure-dom-order="true"
          :suppress-clipboard-paste="true"
          @grid-ready="onGridReady"
          @cell-value-changed="onCellValueChanged"
          @cell-double-clicked="selection.clearSelection"
        />
      </div>

      <!-- Context Menu -->
      <div
        v-if="showContextMenu && selection.selectionBounds.value"
        class="context-menu"
        :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        @click.stop
      >
        <button class="ctx-btn" :class="{ active: selectionHasStyle('bold') }" @click="toggleBold" title="Bold">
          <strong>B</strong>
        </button>
        <button class="ctx-btn" :class="{ active: selectionHasStyle('italic') }" @click="toggleItalic" title="Italic">
          <em>I</em>
        </button>
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
        v-if="columnOps.editingColumn.value !== null"
        :ref="el => (columnOps.columnInput.value = el)"
        v-model="columnOps.editingColumnName.value"
        class="column-rename-input"
        :style="{
          left: columnOps.columnInputPos.value.x + 'px',
          top: columnOps.columnInputPos.value.y + 'px',
          width: columnOps.columnInputPos.value.width + 'px',
        }"
        @keydown="columnOps.handleColumnInputKeydown"
        @blur="columnOps.saveColumnRename"
      />

      <!-- Column Context Menu -->
      <div
        v-if="columnOps.showColumnMenu.value"
        class="column-menu"
        :style="{ left: columnOps.columnMenuPos.value.x + 'px', top: columnOps.columnMenuPos.value.y + 'px' }"
        @click.stop
      >
        <button class="column-menu-item" @click="columnOps.renameColumnFromMenu">Rename</button>
        <button class="column-menu-item delete" @click="columnOps.deleteColumn">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./NodeSpreadsheet.css"></style>
