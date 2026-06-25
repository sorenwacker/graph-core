// Node types - single source of truth
export const nodeTypes = [
  'task',
  'note',
  'project',
  'milestone',
  'topic',
  'component',
  'group',
  'event',
  'person',
  'organization',
  'tag',
]

// Type display config - icons, colors, CSS classes
// Colors optimized for: distinct hues, good contrast, semantic meaning, accessibility
export const typeConfig = {
  project: {
    label: 'Project',
    cssClass: 'project',
    bg: '#1e3a5f', // Deep blue - structure, planning
    text: '#60a5fa',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`,
  },
  task: {
    label: 'Task',
    cssClass: 'task',
    bg: '#4a3f1a', // Amber - action, attention
    text: '#fbbf24',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  },
  note: {
    label: 'Note',
    cssClass: 'note',
    bg: '#1a4025', // Green - information, growth
    text: '#4ade80',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  },
  milestone: {
    label: 'Milestone',
    cssClass: 'milestone',
    bg: '#3d1a5a', // Violet - achievement, special
    text: '#a78bfa',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`,
  },
  group: {
    label: 'Group',
    cssClass: 'group',
    bg: '#2d3748', // Slate - neutral, organizational
    text: '#94a3b8',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  },
  person: {
    label: 'Person',
    cssClass: 'person',
    bg: '#4a2c1a', // Warm orange - human, friendly
    text: '#fb923c',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/></svg>`,
  },
  event: {
    label: 'Event',
    cssClass: 'event',
    bg: '#4a1a2e', // Rose - time-sensitive, important
    text: '#fb7185',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>`,
  },
  topic: {
    label: 'Topic',
    cssClass: 'topic',
    bg: '#1a4a4a', // Teal - discussion, knowledge
    text: '#2dd4bf',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-2V4c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM7 4h10v2H7V4zm14 16H3V8h18v12z"/></svg>`,
  },
  organization: {
    label: 'Organization',
    cssClass: 'organization',
    bg: '#2a2a5a', // Indigo - corporate, formal
    text: '#818cf8',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>`,
  },
  component: {
    label: 'Component',
    cssClass: 'component',
    bg: '#1a3a3a', // Cyan - technical, modular
    text: '#22d3d3',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 13v8h8v-8h-8zM3 21h8v-8H3v8zM3 3v8h8V3H3zm13.66-1.31L11 7.34 16.66 13l5.66-5.66-5.66-5.65z"/></svg>`,
  },
  tag: {
    label: 'Tag',
    cssClass: 'tag',
    bg: '#1a3a4a', // Blue-teal - categorization, labeling
    text: '#5dade2',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`,
  },
}

// Legacy export for backward compatibility
export const personIconSvg = typeConfig.person.icon

// Person color palette - warm, distinct colors for individual persons
export const personColors = [
  { bg: '#4a1a3a', text: '#e07da0' },
  { bg: '#1a3a4a', text: '#7dc0e0' },
  { bg: '#3a4a1a', text: '#c0e07d' },
  { bg: '#4a2a1a', text: '#e0a07d' },
  { bg: '#2a1a4a', text: '#a07de0' },
  { bg: '#1a4a3a', text: '#7de0c0' },
  { bg: '#4a3a1a', text: '#e0c07d' },
  { bg: '#1a2a4a', text: '#7da0e0' },
  { bg: '#3a1a4a', text: '#c07de0' },
  { bg: '#4a1a2a', text: '#e07da0' },
]

// Get consistent random color for a person based on their ID
export function getPersonColor(personId) {
  if (!personId) return personColors[0]
  const index = Math.abs(personId) % personColors.length
  return personColors[index]
}

// Helper functions for consistent type display
export function getTypeIcon(type) {
  const config = typeConfig[type]
  if (!config) return `<span>${type?.[0]?.toUpperCase() || '?'}</span>`
  return config.icon
}

export function getTypeLabel(type) {
  return typeConfig[type]?.label || type || 'Unknown'
}

export function getTypeCssClass(type) {
  return typeConfig[type]?.cssClass || 'task'
}

export function getTypeColors(type, nodeId = null) {
  // For persons, use random color based on node ID
  if (type === 'person' && nodeId !== null) {
    return getPersonColor(nodeId)
  }
  const config = typeConfig[type]
  if (!config) return { bg: '#4a4a4a', text: '#cccccc' }
  return { bg: config.bg, text: config.text }
}

// Graph view colors: dark background with type-colored border
export function getGraphColors(type, nodeId = null) {
  const config = typeConfig[type]
  const defaultColors = { bg: '#0d0d0d', border: '#666666', text: '#ffffff' }

  if (!config) return defaultColors

  // Persons get unique border color based on their ID
  if (type === 'person' && nodeId !== null) {
    const hue = (nodeId * 137.508) % 360
    return { bg: '#0d0d0d', border: `hsl(${hue}, 65%, 55%)`, text: '#ffffff' }
  }

  // Tags get unique border color based on their ID (different offset than persons)
  if (type === 'tag' && nodeId !== null) {
    const hue = (nodeId * 137.508 + 60) % 360
    return { bg: '#0d0d0d', border: `hsl(${hue}, 70%, 50%)`, text: '#ffffff' }
  }

  return { bg: '#0d0d0d', border: config.text, text: '#ffffff' }
}

// Importance labels
// Importance scale: higher number = more important (5 = Critical). This matches
// the task list display and the "higher importance first" sort.
export const importanceLabels = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent',
  5: 'Critical',
}

export function getImportanceLabel(level) {
  return importanceLabels[level] || ''
}

/**
 * CSS class for importance styling (higher number = more important).
 * @param {number} level - Importance level 1-5
 * @returns {string} CSS class name, or '' when unset
 */
export function getImportanceClass(level) {
  if (!level) return ''
  if (level >= 4) return 'importance-critical'
  if (level >= 3) return 'importance-high'
  if (level >= 2) return 'importance-medium'
  return 'importance-low'
}
