<script setup>
import { computed } from 'vue'

const props = defineProps({
  id: { type: [String, Number], required: true },
  createdAt: { type: String, default: null },
  updatedAt: { type: String, default: null }
})

const formattedCreatedDate = computed(() => {
  if (!props.createdAt) return ''
  const d = new Date(props.createdAt)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

const formattedUpdatedDate = computed(() => {
  if (!props.updatedAt) return ''
  const d = new Date(props.updatedAt)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})
</script>

<template>
  <div class="meta-info">
    <span>ID: {{ id }}</span>
    <span>Created: {{ formattedCreatedDate }}</span>
    <span>Modified: {{ formattedUpdatedDate }}</span>
  </div>
</template>

<style scoped>
.meta-info {
  padding-top: 12px;
  margin-top: auto;
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-tertiary);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
