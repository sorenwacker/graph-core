<script setup>
/**
 * MenuGroup - Renders a group of menu items from a data-driven configuration.
 * Filters items based on their visible property.
 */
import MenuItem from './MenuItem.vue'

defineProps({
  items: {
    type: Array,
    required: true,
  },
})
</script>

<template>
  <div class="menu-group">
    <MenuItem v-for="item in items.filter(i => i.visible !== false)" :key="item.id" :item="item" />
  </div>
</template>

<style scoped>
.menu-group {
  padding: 2px 0;
}
</style>
