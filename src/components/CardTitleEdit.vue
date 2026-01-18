<template>
  <input
    v-if="isEditing"
    ref="inputRef"
    class="card-title-input"
    :class="sizeClass"
    :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value)"
    @keydown="handleKeydown"
    @blur="$emit('save')"
    @click.stop
    @dblclick.stop
    @dragstart.prevent.stop
    placeholder="Title"
  />
  <span
    v-else
    class="card-title"
    :class="[sizeClass, { completed }]"
    @click.stop
    @dblclick.stop="$emit('startEdit')"
  >{{ title }}</span>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  modelValue: { type: String, default: '' },
  isEditing: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  size: { type: String, default: 'normal' } // 'normal', 'child', 'grandchild'
})

const emit = defineEmits(['update:modelValue', 'startEdit', 'save', 'cancel'])

const inputRef = ref(null)

const sizeClass = computed(() => {
  return {
    normal: 'size-normal',
    child: 'size-child',
    grandchild: 'size-grandchild'
  }[props.size] || 'size-normal'
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('save')
  }
}

// Auto-focus and select when editing starts
watch(() => props.isEditing, (editing) => {
  if (editing) {
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})
</script>

<style scoped>
.card-title-input {
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  outline: none;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.card-title-input.size-normal {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  border-radius: 8px;
  width: 100%;
  padding: 8px 12px;
}

.card-title-input.size-child {
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  flex: 1;
  padding: 4px 8px;
}

.card-title-input.size-grandchild {
  font-size: 11px;
  font-weight: 500;
  border-radius: 3px;
  flex: 1;
  padding: 2px 6px;
}

.card-title {
  cursor: default;
}

.card-title.size-child,
.card-title.size-grandchild {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-title.completed {
  text-decoration: line-through;
  opacity: 0.6;
}
</style>
