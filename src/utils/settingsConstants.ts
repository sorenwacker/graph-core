/**
 * Settings and timing constants for the application.
 * Centralizes magic numbers to improve maintainability and readability.
 */

// Autosave timing
export const AUTOSAVE_DELAY_MS = 500

// Undo/Redo stack limits
export const MAX_UNDO_STACK_SIZE = 50

// Debounce timing
export const DEBOUNCE_DELAY_MS = 50

// Layout and graph timing delays
export const LAYOUT_SETTLE_DELAY_MS = 500
export const LAYOUT_SAVE_DELAY_MS = 600
export const LAYOUT_RELAYOUT_DELAY_MS = 800

// Search debounce timing
export const SEARCH_DEBOUNCE_MS = 200

// Dropdown blur delay (for closing dropdowns after blur)
export const DROPDOWN_BLUR_DELAY_MS = 150

// DOM highlight duration
export const SEARCH_HIGHLIGHT_DURATION_MS = 2000

// AI provider fetch debounce
export const AI_FETCH_DEBOUNCE_MS = 500

// Double-click detection threshold
export const DOUBLE_CLICK_THRESHOLD_MS = 350

// Animation durations
export const FIT_ANIMATION_DURATION_MS = 200
export const FIT_INTERVAL_MS = 300

// Local relax timing
export const LOCAL_RELAX_UNLOCK_DELAY_MS = 300

// Layout animation durations
export const LAYOUT_ANIMATION_DURATION_MS = 300

// Node positioning delays
export const NODE_POSITION_SETTLE_DELAY_MS = 100
