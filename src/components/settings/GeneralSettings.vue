<script setup>
import { useTheme } from '../../composables/useTheme.js'

const { currentTheme, setTheme, themes } = useTheme()

const props = defineProps({
  graphDetailThreshold: { type: Number, required: true },
  graphMaxDepth: { type: Number, required: true },
  graphRootMaxDepth: { type: Number, required: true },
  graphNotesPreviewLength: { type: Number, default: 200 },
  openDetailFullscreen: { type: Boolean, required: true },
  hoverPreviewEnabled: { type: Boolean, required: true },
  inheritColors: { type: Boolean, default: true },
  showHintBar: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:graphDetailThreshold',
  'update:graphMaxDepth',
  'update:graphRootMaxDepth',
  'update:graphNotesPreviewLength',
  'update:openDetailFullscreen',
  'update:hoverPreviewEnabled',
  'update:inheritColors',
  'update:showHintBar',
])
</script>

<template>
  <!-- Graph Settings -->
  <section class="settings-section">
    <h3 class="section-title">Graph</h3>
    <div class="settings-item">
      <label>Detail threshold</label>
      <input
        type="number"
        :value="graphDetailThreshold"
        min="5"
        max="100"
        @input="emit('update:graphDetailThreshold', Number($event.target.value))"
      />
      <span class="settings-hint">Show details when &le; {{ graphDetailThreshold }} nodes</span>
    </div>
    <div class="settings-item">
      <label
        >Max depth <span class="slider-value">{{ graphMaxDepth === 0 ? 'All' : graphMaxDepth }}</span></label
      >
      <input
        type="range"
        :value="graphMaxDepth"
        min="0"
        max="20"
        step="1"
        class="settings-slider"
        @input="emit('update:graphMaxDepth', Number($event.target.value))"
      />
      <span class="settings-hint">{{
        graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels`
      }}</span>
    </div>
    <div class="settings-item">
      <label
        >Root depth <span class="slider-value">{{ graphRootMaxDepth === 0 ? 'All' : graphRootMaxDepth }}</span></label
      >
      <input
        type="range"
        :value="graphRootMaxDepth"
        min="0"
        max="10"
        step="1"
        class="settings-slider"
        @input="emit('update:graphRootMaxDepth', Number($event.target.value))"
      />
      <span class="settings-hint">{{
        graphRootMaxDepth === 0 ? 'Show all levels at root' : `Show ${graphRootMaxDepth} levels at root`
      }}</span>
    </div>
    <div class="settings-item">
      <label
        >Notes preview <span class="slider-value">{{ graphNotesPreviewLength }}</span></label
      >
      <input
        type="range"
        :value="graphNotesPreviewLength"
        min="50"
        max="500"
        step="10"
        class="settings-slider"
        @input="emit('update:graphNotesPreviewLength', Number($event.target.value))"
      />
      <span class="settings-hint">Max characters shown in node notes preview</span>
    </div>
  </section>

  <!-- Display Settings -->
  <section class="settings-section">
    <h3 class="section-title">Display</h3>
    <div class="settings-item">
      <label>Theme</label>
      <div class="theme-switcher">
        <button
          v-for="theme in themes"
          :key="theme"
          class="theme-btn"
          :class="{ active: currentTheme === theme }"
          @click="setTheme(theme)"
        >
          <span class="theme-icon">
            {{ theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto' }}
          </span>
          <span class="theme-label">{{ theme.charAt(0).toUpperCase() + theme.slice(1) }}</span>
        </button>
      </div>
      <span class="settings-hint">Choose light, dark, or follow system preference</span>
    </div>
    <div class="settings-item">
      <label>
        <input
          type="checkbox"
          :checked="openDetailFullscreen"
          @change="emit('update:openDetailFullscreen', $event.target.checked)"
        />
        Open details fullscreen
      </label>
      <span class="settings-hint">Open detail panel in fullscreen mode by default</span>
    </div>
    <div class="settings-item">
      <label>
        <input
          type="checkbox"
          :checked="hoverPreviewEnabled"
          @change="emit('update:hoverPreviewEnabled', $event.target.checked)"
        />
        Hover preview
      </label>
      <span class="settings-hint">Show preview tooltip when hovering over nodes</span>
    </div>
    <div class="settings-item">
      <label>
        <input type="checkbox" :checked="inheritColors" @change="emit('update:inheritColors', $event.target.checked)" />
        Inherit colors
      </label>
      <span class="settings-hint">Child nodes inherit colors from parent nodes</span>
    </div>
    <div class="settings-item">
      <label>
        <input type="checkbox" :checked="showHintBar" @change="emit('update:showHintBar', $event.target.checked)" />
        Show hint bar
      </label>
      <span class="settings-hint">Show keyboard shortcut hints at bottom of screen</span>
    </div>
  </section>
</template>
