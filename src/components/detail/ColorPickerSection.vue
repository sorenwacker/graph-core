<script setup>
defineProps({
  color: { type: String, default: null },
  defaultColor: { type: String, default: '#0f4c75' }
})

const emit = defineEmits(['update:color'])

function onColorChange(e) {
  emit('update:color', e.target.value)
}

function clearColor() {
  emit('update:color', null)
}
</script>

<template>
  <div v-if="color && color !== defaultColor" class="color-picker-section">
    <label>Color</label>
    <div class="color-field">
      <input
        type="color"
        :value="color"
        @change="onColorChange"
      />
      <button
        class="clear-btn"
        title="Inherit from parent"
        @click="clearColor"
      >x</button>
    </div>
  </div>
</template>

<style scoped>
.color-picker-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker-section label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.color-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-field input[type="color"] {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}

.clear-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-btn:hover {
  background: var(--danger-color);
  color: white;
}
</style>
