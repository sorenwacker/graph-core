<script setup>
import { computed } from 'vue'
import { formatDate } from '../../utils/formatting.js'

const props = defineProps({
  id: { type: [String, Number], required: true },
  createdAt: { type: String, default: null },
  updatedAt: { type: String, default: null }
})

const formattedCreatedDate = computed(() => formatDate(props.createdAt))
const formattedUpdatedDate = computed(() => formatDate(props.updatedAt))
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
