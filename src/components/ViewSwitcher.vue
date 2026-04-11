<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import tippy from 'tippy.js'
import { viewModes } from '../utils/viewConfig.js'

defineProps({
  modelValue: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])

const buttonRefs = ref([])
let tippyInstances = []

function setView(id) {
  emit('update:modelValue', id)
}

onMounted(() => {
  buttonRefs.value.forEach((el, index) => {
    if (el && viewModes[index]) {
      const instance = tippy(el, {
        content: viewModes[index].label,
        placement: 'bottom',
        delay: [200, 0],
        duration: [150, 100],
        theme: 'toolbar',
      })
      tippyInstances.push(instance)
    }
  })
})

onUnmounted(() => {
  tippyInstances.forEach(instance => instance.destroy())
  tippyInstances = []
})
</script>

<template>
  <div class="view-switcher">
    <button
      v-for="(view, index) in viewModes"
      :key="view.id"
      :ref="el => (buttonRefs[index] = el)"
      class="view-btn"
      :class="{ active: modelValue === view.id }"
      @click="setView(view.id)"
      v-html="view.icon"
    ></button>
  </div>
</template>

<style scoped>
.view-switcher {
  display: flex;
  gap: 6px;
  align-items: center;
}

.view-btn {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.view-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.view-btn :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
