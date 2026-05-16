<script setup>
import { computed } from 'vue'
import TagInput from '../TagInput.vue'

const props = defineProps({
  nodeId: { type: Number, required: true },
  workspaceId: { type: [String, Number], default: null },
  linkedNodes: { type: Array, default: () => [] },
})

const emit = defineEmits(['refresh'])

// Filter linked nodes to get only tag nodes
const linkedTags = computed(() => (props.linkedNodes || []).filter(n => n && n.type === 'tag'))
</script>

<template>
  <div class="tags-section">
    <label>Tags</label>
    <TagInput :node-id="nodeId" :workspace-id="workspaceId" :linked-tags="linkedTags" @refresh="emit('refresh')" />
  </div>
</template>

<style scoped>
.tags-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tags-section label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
</style>
