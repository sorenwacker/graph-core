<script setup>
/**
 * The row of buttons that opens and closes the detail panel's sections
 * (docs/guides/detail-panel.md#section-bar). It is the only place a section is
 * named, and it renders the same buttons in the same order whatever is open,
 * so a button never moves when a section opens beside or below it.
 */
defineProps({
  // [{ key, label, open, count? }] in display order
  sections: { type: Array, required: true },
})

defineEmits(['toggle'])
</script>

<template>
  <div class="section-bar" role="toolbar" aria-label="Sections">
    <button
      v-for="section in sections"
      :key="section.key"
      type="button"
      class="section-toggle"
      :class="{ open: section.open }"
      :data-section="section.key"
      :aria-pressed="section.open"
      @click="$emit('toggle', section.key)"
    >
      <span class="section-toggle-label">{{ section.label }}</span>
      <span v-if="section.count" class="section-toggle-count">{{ section.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.section-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
  /* Lines the buttons up with the contents of the sections below, which sit
     inside the same padding. */
  padding: 0 4px;
  margin-bottom: 6px;
}

.section-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  cursor: pointer;
  user-select: none;
}

/* The app-wide button style lifts a button on hover and shrinks it on press.
   These buttons must not move at all. */
.section-toggle:hover,
.section-toggle:active {
  transform: none;
  box-shadow: none;
}

.section-toggle:hover {
  background: var(--bg-hover);
}

/* Open and closed differ in colour only: a change of border width or weight
   would change the button's size and move the ones after it. */
.section-toggle.open {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.section-toggle-count {
  color: var(--text-tertiary);
  font-weight: 400;
}
</style>
