<script setup>
import { ref, computed } from 'vue'
import { api } from '../../services/api.js'

const props = defineProps({
  snapshotMessage: { type: String, default: '' },
  showSnapshotList: { type: Boolean, default: false },
  availableSnapshots: { type: Array, default: () => [] },
  showLostFound: { type: Boolean, default: false },
  orphanedNodes: { type: Array, default: () => [] },
  dataPath: { type: String, default: '' },
  currentWorkspace: { type: String, default: 'work' },
})

const emit = defineEmits([
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan',
  'import-complete',
])

// Import functionality
const importFileInput = ref(null)
const importType = ref('json')
const importAccept = computed(() => (importType.value === 'json' ? '.json' : '.csv'))

function formatSnapshotDate(timestamp) {
  if (!timestamp) return 'Unknown'
  const d = new Date(timestamp)
  return d.toLocaleString()
}

function triggerImport(type) {
  importType.value = type
  // Need to wait for accept attribute to update
  setTimeout(() => {
    importFileInput.value?.click()
  }, 0)
}

/**
 * Build the user-facing summary of an import, including rows the importer had
 * to skip (malformed or title-less CSV rows) so silent data loss is visible.
 * @param {{nodesImported?: number, linksCreated?: number, rowsSkipped?: number}} result
 * @returns {string} Summary message
 */
function buildImportMessage(result) {
  const parts = [`Imported ${result.nodesImported ?? 0} nodes`]
  if (result.linksCreated) parts.push(`${result.linksCreated} links`)
  let message = parts.join(' and ')
  if (result.rowsSkipped) {
    message += `\nSkipped ${result.rowsSkipped} malformed or title-less row${result.rowsSkipped === 1 ? '' : 's'}`
  }
  return message
}

async function handleImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    let result

    if (importType.value === 'json') {
      const data = JSON.parse(text)
      result = await api.importJSON(data, null, props.currentWorkspace)
    } else {
      result = await api.importCSV(text, null, props.currentWorkspace)
    }

    emit('import-complete', result)
    alert(buildImportMessage(result))
  } catch (err) {
    alert(`Import failed: ${err.message}`)
  }

  // Reset file input
  e.target.value = ''
}
</script>

<template>
  <!-- Data Management -->
  <section class="settings-section">
    <h3 class="section-title">Data</h3>
    <div v-if="dataPath" class="settings-item">
      <label>Storage Location</label>
      <code class="data-path">{{ dataPath }}</code>
      <span class="settings-hint">Database and backups are stored here</span>
    </div>
    <div class="settings-item">
      <label>Snapshots</label>
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="emit('create-snapshot')" title="Create a backup snapshot">Create</button>
        <button class="snapshot-btn" @click="emit('toggle-snapshots')" title="Show available snapshots">
          {{ showSnapshotList ? 'Hide' : 'Show' }}
        </button>
      </div>
      <span v-if="snapshotMessage" class="settings-hint snapshot-message">{{ snapshotMessage }}</span>
    </div>
    <div v-if="showSnapshotList && availableSnapshots.length > 0" class="snapshot-list">
      <div v-for="snapshot in availableSnapshots.slice(0, 10)" :key="snapshot.path" class="snapshot-item">
        <span class="snapshot-date">{{ formatSnapshotDate(snapshot.created) }}</span>
        <button
          class="snapshot-restore-btn"
          @click="emit('restore-snapshot', snapshot.path)"
          title="Restore this snapshot"
        >
          Restore
        </button>
      </div>
    </div>
    <div v-else-if="showSnapshotList" class="settings-hint">No snapshots available</div>

    <div class="settings-item">
      <button class="snapshot-btn reload-btn" @click="emit('reload-database')" title="Reload database from disk">
        Reload Database
      </button>
      <span class="settings-hint">Reload from disk (picks up external changes)</span>
    </div>

    <div class="settings-item">
      <label>Import</label>
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="triggerImport('json')" title="Import JSON export file">JSON</button>
        <button class="snapshot-btn" @click="triggerImport('csv')" title="Import CSV file">CSV</button>
      </div>
      <span class="settings-hint">Import data into current workspace root</span>
      <input
        ref="importFileInput"
        type="file"
        :accept="importAccept"
        style="display: none"
        @change="handleImportFile"
      />
    </div>
  </section>

  <!-- Lost & Found -->
  <section class="settings-section">
    <h3 class="section-title">Lost & Found</h3>
    <div class="settings-item">
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="emit('toggle-lost-found')" title="Show orphaned nodes without parents">
          {{ showLostFound ? 'Hide' : 'Show' }} ({{ orphanedNodes.length }})
        </button>
      </div>
    </div>
    <div v-if="showLostFound && orphanedNodes.length > 0" class="snapshot-list">
      <div v-for="node in orphanedNodes" :key="node.id" class="snapshot-item">
        <span class="snapshot-date"
          >{{ node.title }} <span class="orphan-type">({{ node.type }})</span></span
        >
        <div class="lost-actions">
          <button class="snapshot-restore-btn" @click="emit('move-to-root', node)" title="Move to root">Root</button>
          <button class="snapshot-restore-btn danger" @click="emit('delete-orphan', node)" title="Delete permanently">
            Del
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="showLostFound" class="settings-hint">No orphaned nodes</div>
  </section>
</template>
