/**
 * Application settings type definitions for graph-core.
 */

import type { Ref } from 'vue'

/**
 * Available view modes for displaying nodes.
 */
export type ViewMode = 'graph' | 'cards' | 'list' | 'table' | 'timeline' | 'persons' | 'tasks' | 'trash' | 'tree'

/**
 * AI provider options.
 */
export type AIProvider = 'ollama' | 'openai'

/**
 * Custom AI prompt definition.
 */
export interface AICustomPrompt {
  /** Prompt name/label */
  name: string
  /** Prompt template text */
  prompt: string
}

/**
 * Graph-specific display settings.
 */
export interface GraphSettings {
  /** Number of nodes at which to show simplified view */
  detailThreshold: number
  /** Maximum depth for graph rendering (0 = unlimited) */
  maxDepth: number
  /** Maximum length of notes preview in graph nodes */
  notesPreviewLength: number
}

/**
 * Ollama LLM connection settings.
 */
export interface OllamaSettings {
  /** Ollama API endpoint URL */
  endpoint: string
  /** Model name to use */
  model: string
  /** Context size for the model */
  contextSize: number
}

/**
 * OpenAI-compatible API settings.
 */
export interface OpenAISettings {
  /** API endpoint URL */
  endpoint: string
  /** API key for authentication */
  apiKey: string
  /** Model name to use */
  model: string
  /** Skip SSL certificate verification */
  skipSslVerification: boolean
}

/**
 * Detail panel display settings.
 */
export interface DetailPanelSettings {
  /** Open detail panel in fullscreen by default */
  openFullscreen: boolean
  /** Enable hover preview tooltips */
  hoverPreviewEnabled: boolean
  /** Inherit colors from parent nodes */
  inheritColors: boolean
}

/**
 * Sidebar settings.
 */
export interface SidebarSettings {
  /** Whether sidebar is pinned open */
  pinned: boolean
}

/**
 * Visibility filter settings.
 */
export interface VisibilitySettings {
  /** Hide completed items */
  hideCompleted: boolean
  /** Hide sensitive content */
  hideSensitive: boolean
}

/**
 * Onboarding state.
 */
export interface OnboardingSettings {
  /** Whether user has seen onboarding */
  hasSeenOnboarding: boolean
}

/**
 * Hint bar settings.
 */
export interface HintBarSettings {
  /** Whether to show the hint bar */
  showHintBar: boolean
}

/**
 * All application settings combined.
 * These are persisted to localStorage.
 */
export interface AppSettings {
  // View
  viewMode: ViewMode
  containerId: number | null

  // Visibility
  hideCompleted: boolean
  hideSensitive: boolean

  // Graph
  graphDetailThreshold: number
  graphMaxDepth: number
  graphNotesPreviewLength: number

  // Detail panel
  openDetailFullscreen: boolean
  hoverPreviewEnabled: boolean
  inheritColors: boolean

  // Sidebar
  sidebarPinned: boolean

  // Workspace
  workspace: string

  // AI provider
  aiProvider: AIProvider
  aiEnabled: boolean
  aiCustomPrompts: AICustomPrompt[]
  aiPromptOrder: string[]
  aiEnabledTools: string[]

  // Ollama
  ollamaEndpoint: string
  ollamaModel: string
  ollamaContextSize: number

  // OpenAI
  openaiEndpoint: string
  openaiApiKey: string
  openaiModel: string
  openaiSkipSslVerification: boolean

  // Legacy (backwards compatibility)
  ollamaEnabled: boolean
  ollamaCustomPrompts: AICustomPrompt[]

  // Onboarding
  hasSeenOnboarding: boolean

  // Hint bar
  showHintBar: boolean
}

/**
 * Settings refs returned by useSettings composable.
 * Each setting is wrapped in a Vue ref for reactivity.
 */
export interface UseSettingsReturn {
  // View
  viewMode: Ref<ViewMode>
  containerId: Ref<number | null>

  // Visibility
  hideCompleted: Ref<boolean>
  hideSensitive: Ref<boolean>

  // Graph
  graphDetailThreshold: Ref<number>
  graphMaxDepth: Ref<number>
  graphNotesPreviewLength: Ref<number>

  // Detail panel
  openDetailFullscreen: Ref<boolean>
  hoverPreviewEnabled: Ref<boolean>
  inheritColors: Ref<boolean>

  // Sidebar
  sidebarPinned: Ref<boolean>

  // Workspace
  workspace: Ref<string>

  // AI provider
  aiProvider: Ref<AIProvider>
  aiEnabled: Ref<boolean>
  aiCustomPrompts: Ref<AICustomPrompt[]>
  aiPromptOrder: Ref<string[]>
  aiEnabledTools: Ref<string[]>

  // Ollama
  ollamaEndpoint: Ref<string>
  ollamaModel: Ref<string>
  ollamaContextSize: Ref<number>

  // OpenAI
  openaiEndpoint: Ref<string>
  openaiApiKey: Ref<string>
  openaiModel: Ref<string>
  openaiSkipSslVerification: Ref<boolean>

  // Legacy
  ollamaEnabled: Ref<boolean>
  ollamaCustomPrompts: Ref<AICustomPrompt[]>

  // Onboarding
  hasSeenOnboarding: Ref<boolean>

  // Hint bar
  showHintBar: Ref<boolean>
}
