<script setup>
import TagInput from '../TagInput.vue'

defineProps({
  tags: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:tags'])

function onUpdate(newTags) {
  emit('update:tags', newTags)
}
</script>

<template>
  <div v-if="tags && tags.length > 0" class="tags-section">
    <label>Tags</label>
    <TagInput
      :tags="tags"
      @update="onUpdate"
    />
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
