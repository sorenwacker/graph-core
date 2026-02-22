<script setup>
const props = defineProps({
  graphDetailThreshold: { type: Number, required: true },
  graphMaxDepth: { type: Number, required: true },
  graphRootMaxDepth: { type: Number, required: true },
  openDetailFullscreen: { type: Boolean, required: true },
  hoverPreviewEnabled: { type: Boolean, required: true },
  snapshotMessage: { type: String, default: '' },
  showSnapshotList: { type: Boolean, default: false },
  availableSnapshots: { type: Array, default: () => [] },
  showLostFound: { type: Boolean, default: false },
  orphanedNodes: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'update:graphDetailThreshold',
  'update:graphMaxDepth',
  'update:graphRootMaxDepth',
  'update:openDetailFullscreen',
  'update:hoverPreviewEnabled',
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan'
])

function formatSnapshotDate(timestamp) {
  if (!timestamp) return 'Unknown'
  const d = new Date(timestamp)
  return d.toLocaleString()
}
</script>

<template>
  <div class="settings-panel" @click.stop>
    <div class="settings-item">
      <label>Graph detail threshold</label>
      <input
        type="number"
        :value="graphDetailThreshold"
        min="5"
        max="100"
        @input="emit('update:graphDetailThreshold', Number($event.target.value))"
      />
      <span class="settings-hint">Show details when &le; {{ graphDetailThreshold }} nodes</span>
    </div>
    <div class="settings-item">
      <label>Graph max depth <span class="slider-value">{{ graphMaxDepth === 0 ? 'All' : graphMaxDepth }}</span></label>
      <input
        type="range"
        :value="graphMaxDepth"
        min="0"
        max="20"
        step="1"
        class="settings-slider"
        @input="emit('update:graphMaxDepth', Number($event.target.value))"
      />
      <span class="settings-hint">{{ graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels` }}</span>
    </div>
    <div class="settings-item">
      <label>Root graph depth <span class="slider-value">{{ graphRootMaxDepth === 0 ? 'All' : graphRootMaxDepth }}</span></label>
      <input
        type="range"
        :value="graphRootMaxDepth"
        min="0"
        max="10"
        step="1"
        class="settings-slider"
        @input="emit('update:graphRootMaxDepth', Number($event.target.value))"
      />
      <span class="settings-hint">{{ graphRootMaxDepth === 0 ? 'Show all levels at root' : `Show ${graphRootMaxDepth} levels at root` }}</span>
    </div>
    <div class="settings-item">
      <label>
        <input
          type="checkbox"
          :checked="openDetailFullscreen"
          @change="emit('update:openDetailFullscreen', $event.target.checked)"
        />
        Open details fullscreen
      </label>
      <span class="settings-hint">Open detail panel in fullscreen mode by default</span>
    </div>
    <div class="settings-item">
      <label>
        <input
          type="checkbox"
          :checked="hoverPreviewEnabled"
          @change="emit('update:hoverPreviewEnabled', $event.target.checked)"
        />
        Hover preview
      </label>
      <span class="settings-hint">Show preview tooltip when hovering over nodes</span>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <label>Database Snapshots</label>
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="emit('create-snapshot')">Create Snapshot</button>
        <button class="snapshot-btn" @click="emit('toggle-snapshots')">
          {{ showSnapshotList ? 'Hide' : 'Show' }} Snapshots
        </button>
      </div>
      <span v-if="snapshotMessage" class="settings-hint snapshot-message">{{ snapshotMessage }}</span>
    </div>
    <div v-if="showSnapshotList && availableSnapshots.length > 0" class="snapshot-list">
      <div
        v-for="snapshot in availableSnapshots.slice(0, 10)"
        :key="snapshot.path"
        class="snapshot-item"
      >
        <span class="snapshot-date">{{ formatSnapshotDate(snapshot.created) }}</span>
        <button class="snapshot-restore-btn" @click="emit('restore-snapshot', snapshot.path)">Restore</button>
      </div>
    </div>
    <div v-else-if="showSnapshotList" class="settings-hint">No snapshots available</div>
    <div class="settings-item" style="margin-top: 8px;">
      <button class="snapshot-btn" @click="emit('reload-database')" style="background: #e67e22;">
        Reload Database
      </button>
      <span class="settings-hint">Reload from disk (picks up external changes)</span>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-item">
      <label>Lost & Found</label>
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="emit('toggle-lost-found')">
          {{ showLostFound ? 'Hide' : 'Show' }} ({{ orphanedNodes.length }})
        </button>
      </div>
    </div>
    <div v-if="showLostFound && orphanedNodes.length > 0" class="snapshot-list">
      <div
        v-for="node in orphanedNodes"
        :key="node.id"
        class="snapshot-item"
      >
        <span class="snapshot-date">{{ node.title }} <span class="orphan-type">({{ node.type }})</span></span>
        <div class="lost-actions">
          <button class="snapshot-restore-btn" @click="emit('move-to-root', node)" title="Move to root">Root</button>
          <button class="snapshot-restore-btn danger" @click="emit('delete-orphan', node)" title="Delete permanently">Del</button>
        </div>
      </div>
    </div>
    <div v-else-if="showLostFound" class="settings-hint">No orphaned nodes</div>
  </div>
</template>

<style scoped>
.settings-panel {
  position: fixed;
  top: 50px;
  right: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 16px;
  min-width: 280px;
  max-width: 340px;
  z-index: 1100;
}

.settings-item {
  margin-bottom: 12px;
}

.settings-item label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.settings-item input[type="number"] {
  width: 70px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.settings-item input[type="checkbox"] {
  margin-right: 6px;
  cursor: pointer;
}

.settings-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.settings-slider {
  width: 100%;
  margin-top: 4px;
}

.slider-value {
  font-weight: normal;
  color: var(--accent-color);
}

.settings-divider {
  height: 1px;
  background: var(--border-color);
  margin: 12px 0;
}

.snapshot-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.snapshot-btn {
  padding: 4px 12px;
  font-size: 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.snapshot-btn:hover {
  background: var(--bg-hover);
}

.snapshot-message {
  color: var(--accent-color);
  font-weight: 500;
}

.snapshot-list {
  margin-top: 8px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.snapshot-item:last-child {
  border-bottom: none;
}

.snapshot-date {
  color: var(--text-secondary);
}

.snapshot-restore-btn {
  padding: 2px 8px;
  font-size: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.snapshot-restore-btn:hover {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
}

.snapshot-restore-btn.danger:hover {
  background: #fee2e2;
  border-color: #ef4444;
  color: #ef4444;
}

.orphan-type {
  color: var(--text-tertiary);
  font-size: 0.7rem;
}

.lost-actions {
  display: flex;
  gap: 4px;
}
</style>
