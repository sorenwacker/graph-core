<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: Object,
  selected: Boolean
})

const emit = defineEmits(['select', 'toggle-complete'])

const typeLabel = computed(() => props.node.type.toUpperCase())

function selectNode() {
  emit('select', props.node)
}

function toggleComplete(event) {
  event.stopPropagation()
  emit('toggle-complete', props.node)
}
</script>

<template>
  <div
    class="node-card"
    :class="[{ selected }, `type-${node.type}`]"
    @click="selectNode"
  >
    <div class="node-card-header">
      <span class="node-card-type" :class="node.type">{{ typeLabel }}</span>
      <input
        v-if="node.type === 'task'"
        type="checkbox"
        :checked="node.completed"
        @change="toggleComplete"
        @click.stop
      />
    </div>
    <div class="node-card-title" :class="{ completed: node.completed }">
      {{ node.title }}
    </div>
    <div v-if="node.notes" class="node-card-notes">
      {{ node.notes }}
    </div>
    <div v-if="node.due_date" class="node-card-due">
      Due: {{ node.due_date }}
    </div>
  </div>
</template>

<style scoped>
.node-card.selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
}

.node-card-title.completed {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.node-card-due {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: var(--spacing-sm);
}
</style>
