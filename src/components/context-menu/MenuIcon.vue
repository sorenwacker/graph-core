<script setup>
/**
 * MenuIcon - Renders SVG icons for context menu items.
 * Uses a data-driven approach with icon name mapping to SVG paths.
 */

defineProps({
  name: { type: String, required: true },
  fill: { type: Boolean, default: false },
  iconClass: { type: String, default: '' },
})

// Icon path definitions mapped by name
const icons = {
  info: {
    paths: ['M12 16v-4M12 8h.01'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },
  external: {
    paths: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
    polylines: ['15 3 21 3 21 9'],
    lines: [{ x1: 10, y1: 14, x2: 21, y2: 3 }],
  },
  expand: {
    paths: ['M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1'],
  },
  add: {
    paths: ['M12 8v8M8 12h8'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },
  circle: {
    circles: [{ cx: 12, cy: 12, r: 10 }],
  },
  'check-circle': {
    paths: ['M22 11.08V12a10 10 0 1 1-5.93-9.14'],
    polylines: ['22 4 12 14.01 9 11.01'],
  },
  star: {
    polygons: ['12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'],
  },
  link: {
    paths: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
  },
  move: {
    paths: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l3 3 3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
  },
  trash: {
    polylines: ['3 6 5 6 21 6'],
    paths: ['M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    lines: [
      { x1: 10, y1: 11, x2: 10, y2: 17 },
      { x1: 14, y1: 11, x2: 14, y2: 17 },
    ],
  },
  close: {
    paths: ['M18 6L6 18M6 6l12 12'],
  },
  home: {
    paths: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    polylines: ['9 22 9 12 15 12 15 22'],
  },
  users: {
    paths: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
    circles: [{ cx: 9, cy: 7, r: 4 }],
  },
  workspace: {
    rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }],
    lines: [
      { x1: 3, y1: 9, x2: 21, y2: 9 },
      { x1: 9, y1: 21, x2: 9, y2: 9 },
    ],
  },
}

function getIcon(name) {
  return icons[name] || icons.info
}
</script>

<template>
  <svg
    class="menu-icon"
    :class="iconClass"
    viewBox="0 0 24 24"
    :fill="fill ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <template v-if="getIcon(name).paths">
      <path v-for="(d, i) in getIcon(name).paths" :key="'path-' + i" :d="d" />
    </template>
    <template v-if="getIcon(name).circles">
      <circle v-for="(c, i) in getIcon(name).circles" :key="'circle-' + i" :cx="c.cx" :cy="c.cy" :r="c.r" />
    </template>
    <template v-if="getIcon(name).polylines">
      <polyline v-for="(points, i) in getIcon(name).polylines" :key="'polyline-' + i" :points="points" />
    </template>
    <template v-if="getIcon(name).polygons">
      <polygon v-for="(points, i) in getIcon(name).polygons" :key="'polygon-' + i" :points="points" />
    </template>
    <template v-if="getIcon(name).lines">
      <line v-for="(l, i) in getIcon(name).lines" :key="'line-' + i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
    </template>
    <template v-if="getIcon(name).rects">
      <rect
        v-for="(r, i) in getIcon(name).rects"
        :key="'rect-' + i"
        :x="r.x"
        :y="r.y"
        :width="r.width"
        :height="r.height"
        :rx="r.rx"
        :ry="r.ry"
      />
    </template>
  </svg>
</template>

<style scoped>
.menu-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: all 0.2s var(--ease-out-expo);
}

.menu-icon.completed {
  color: var(--success-color);
}

.menu-icon.starred {
  color: var(--warning-color);
}
</style>
