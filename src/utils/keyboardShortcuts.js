/**
 * Keyboard shortcuts configuration.
 * Each section contains an array of shortcuts with keys and descriptions.
 * Keys can include platform-specific placeholders: {modifier}, {option}, {shift}, {delete}
 */

export const shortcuts = {
  navigation: [
    { keys: ['Space'], desc: 'View details' },
    { keys: ['Enter'], desc: 'Drill down into node' },
    { keys: ['{shift}', 'Enter'], desc: 'Go to parent' },
    { keys: ['{modifier}', '↑'], desc: 'Go to parent' },
    { keys: ['{modifier}', '↓'], desc: 'First child' },
    { keys: ['{modifier}', '←', '→'], desc: 'Previous/next sibling' },
    { keys: ['↑', '↓'], desc: 'Navigate items' },
    { keys: ['Tab'], desc: 'Next item' },
  ],
  actions: [
    { keys: ['N'], desc: 'Create new node' },
    { keys: ['{modifier}', 'K'], desc: 'Quick search' },
    { keys: ['{modifier}', 'Z'], desc: 'Undo' },
    { keys: ['{modifier}', '{shift}', 'Z'], desc: 'Redo' },
    { keys: ['{modifier}', 'Y'], desc: 'Redo' },
    { keys: ['{modifier}', '{delete}'], desc: 'Delete selected' },
    { keys: ['{modifier}', ','], desc: 'Open settings' },
  ],
  views: [
    { keys: ['{modifier}', '1'], desc: 'Graph' },
    { keys: ['{modifier}', '2'], desc: 'Cards' },
    { keys: ['{modifier}', '3'], desc: 'Table' },
    { keys: ['{modifier}', '4'], desc: 'Tasks' },
    { keys: ['{modifier}', '5'], desc: 'Timeline' },
    { keys: ['{modifier}', '6'], desc: 'People' },
    { keys: ['{modifier}', '7'], desc: 'Trash' },
  ],
  global: [
    // Registered by the main process, so it works while another app has focus.
    // Configurable in Settings > General; this is the default.
    { keys: ['{modifier}', '{shift}', 'N'], desc: 'Quick capture (from any app)' },
    { keys: ['?'], desc: 'Show this list' },
    { keys: ['{modifier}', '/'], desc: 'Show this list' },
  ],
  selection: [
    { keys: ['Click'], desc: 'Select node' },
    { keys: ['{shift}', 'Click'], desc: 'Multi-select' },
    { keys: ['{modifier}', 'A'], desc: 'Select all' },
    { keys: ['Esc'], desc: 'Clear selection' },
  ],
  graphView: [
    { keys: ['{shift}', 'Drag'], desc: 'Lasso select' },
    { keys: ['{option}'], desc: 'Hold for link mode' },
    { keys: ['{option}', 'Drag'], desc: 'Create link' },
    { keys: ['{modifier}', 'Click'], desc: 'Add child' },
    { keys: ['Double-click'], desc: 'Enter node' },
    { keys: ['{option}', '{modifier}', 'Click'], desc: 'Delete node' },
  ],
}

export const sectionTitles = {
  navigation: 'Navigation',
  actions: 'Actions',
  selection: 'Selection',
  graphView: 'Graph View',
}

/**
 * Resolve platform placeholders in a key array.
 * @param {string[]} keys - Array of key strings with possible placeholders
 * @param {Object} platform - Platform keys object with modifierKey, optionKey, shiftKey, deleteKey
 * @returns {string[]} Resolved key array
 */
export function resolveKeys(keys, platform) {
  return keys.map(key => {
    switch (key) {
      case '{modifier}':
        return platform.modifierKey
      case '{option}':
        return platform.optionKey
      case '{shift}':
        return platform.shiftKey
      case '{delete}':
        return platform.deleteKey
      default:
        return key
    }
  })
}
