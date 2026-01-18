<template>
  <Teleport to="body">
    <div v-if="visible" class="add-node-modal-overlay" @click.self="$emit('close')">
      <div class="add-node-modal" @keydown="handleKeydown">
        <div class="add-node-modal-header">
          <h3>{{ title }}</h3>
          <button class="modal-close" @click="$emit('close')">x</button>
        </div>
        <div class="add-node-modal-content">
          <input
            ref="inputRef"
            v-model="nodeTitle"
            placeholder="Enter title..."
            class="add-node-input"
            @keydown.enter.prevent="createWithType('task')"
          />
          <div class="type-buttons">
            <button
              v-for="t in nodeTypes"
              :key="t"
              class="type-btn"
              :style="getButtonStyle(t)"
              :disabled="!nodeTitle.trim()"
              @click="createWithType(t)"
            >
              {{ t }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { nodeTypes, typeConfig } from '../utils/constants.js'

function getButtonStyle(type) {
  const config = typeConfig[type]
  if (!config) return {}
  return {
    borderColor: config.text,
    color: config.text,
    background: `${config.bg}4d` // 30% opacity
  }
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Add Node' },
  parentId: { type: [Number, String], default: null },
  position: { type: Object, default: null },
  insertBetween: { type: Object, default: null }
})

const emit = defineEmits(['close', 'create'])
const nodeTitle = ref('')
const inputRef = ref(null)

function createWithType(type) {
  const title = nodeTitle.value.trim()
  if (!title) return

  emit('create', {
    title,
    type,
    parentId: props.parentId,
    position: props.position,
    insertBetween: props.insertBetween
  })

  nodeTitle.value = ''
  emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

// Auto-focus when modal opens
watch(() => props.visible, (visible) => {
  if (visible) {
    nodeTitle.value = ''
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})
</script>
