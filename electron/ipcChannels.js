/**
 * IPC Channel Constants
 *
 * Centralized definitions for all IPC channel names used between
 * the main process and renderer process.
 */

// ===========================================
// DATABASE - Node CRUD
// ===========================================
const DB_GET_NODES = 'db:getNodes'
const DB_GET_NODE = 'db:getNode'
const DB_CREATE_NODE = 'db:createNode'
const DB_UPDATE_NODE = 'db:updateNode'
const DB_DELETE_NODE = 'db:deleteNode'

// ===========================================
// DATABASE - Tree Operations
// ===========================================
const DB_GET_ROOTS = 'db:getRoots'
const DB_GET_PROJECTS = 'db:getProjects'
const DB_GET_INBOX = 'db:getInbox'
const DB_GET_RECENT = 'db:getRecent'
const DB_GET_FAVORITES = 'db:getFavorites'
const DB_GET_TASKS = 'db:getTasks'
const DB_GET_CHILDREN = 'db:getChildren'
const DB_GET_DESCENDANTS = 'db:getDescendants'
const DB_GET_DESCENDANTS_BATCH = 'db:getDescendantsBatch'
const DB_GET_ANCESTORS = 'db:getAncestors'
const DB_MOVE_NODE = 'db:moveNode'

// ===========================================
// DATABASE - Links
// ===========================================
const DB_LINK_NODES = 'db:linkNodes'
const DB_UNLINK_NODES = 'db:unlinkNodes'
const DB_GET_ALL_LINKS = 'db:getAllLinks'
const DB_GET_LINKED_NODES = 'db:getLinkedNodes'

// ===========================================
// DATABASE - Tree View
// ===========================================
const DB_GET_TREE = 'db:getTree'

// ===========================================
// DATABASE - Search
// ===========================================
const DB_SEARCH = 'db:search'
const DB_SEARCH_COUNT = 'db:searchCount'

// ===========================================
// DATABASE - Reorder
// ===========================================
const DB_REORDER_NODE = 'db:reorderNode'

// ===========================================
// DATABASE - Export
// ===========================================
const DB_EXPORT_MARKDOWN = 'db:exportMarkdown'
const DB_EXPORT_JSON = 'db:exportJSON'
const DB_EXPORT_CSV = 'db:exportCSV'

// ===========================================
// DATABASE - Import
// ===========================================
const DB_IMPORT_JSON = 'db:importJSON'
const DB_IMPORT_CSV = 'db:importCSV'

// ===========================================
// DATABASE - Trash
// ===========================================
const DB_GET_TRASH = 'db:getTrash'
const DB_RESTORE_NODE = 'db:restoreNode'
const DB_EMPTY_TRASH = 'db:emptyTrash'

// ===========================================
// DATABASE - Lost & Found
// ===========================================
const DB_GET_ORPHANED_NODES = 'db:getOrphanedNodes'
const DB_REPARENT_TO_ROOT = 'db:reparentToRoot'

// ===========================================
// DATABASE - Tags (string-based, legacy)
// ===========================================
const DB_GET_ALL_TAGS = 'db:getAllTags'
const DB_GET_NODES_BY_TAG = 'db:getNodesByTag'

// ===========================================
// DATABASE - Tags (first-class nodes)
// ===========================================
const DB_GET_TAG_NODES = 'db:getTagNodes'
const DB_GET_OR_CREATE_TAG_NODE = 'db:getOrCreateTagNode'
const DB_GET_NODES_LINKED_TO_TAG = 'db:getNodesLinkedToTag'
const DB_SEARCH_TAG_NODES = 'db:searchTagNodes'

// ===========================================
// DATABASE - Workspaces
// ===========================================
const DB_GET_WORKSPACES = 'db:getWorkspaces'
const DB_GET_WORKSPACE = 'db:getWorkspace'
const DB_CREATE_WORKSPACE = 'db:createWorkspace'
const DB_UPDATE_WORKSPACE = 'db:updateWorkspace'
const DB_DELETE_WORKSPACE = 'db:deleteWorkspace'

// ===========================================
// DATABASE - Backups & Reload
// ===========================================
const DB_BACKUP = 'db:backup'
const DB_LIST_BACKUPS = 'db:listBackups'
const DB_RESTORE_BACKUP = 'db:restoreBackup'
const DB_RELOAD = 'db:reload'
const DB_GET_DATA_PATH = 'db:getDataPath'

// ===========================================
// DATABASE - Node Tables (Spreadsheet)
// ===========================================
const DB_GET_NODE_TABLE = 'db:getNodeTable'
const DB_CREATE_NODE_TABLE = 'db:createNodeTable'
const DB_UPDATE_NODE_TABLE = 'db:updateNodeTable'
const DB_DELETE_NODE_TABLE = 'db:deleteNodeTable'
const DB_GET_TABLE_CELLS = 'db:getTableCells'
const DB_SET_CELLS = 'db:setCells'
const DB_CLEAR_CELLS = 'db:clearCells'

// ===========================================
// DATABASE - Settings
// ===========================================
const DB_GET_SETTING = 'db:getSetting'
const DB_GET_ALL_SETTINGS = 'db:getAllSettings'
const DB_SET_SETTING = 'db:setSetting'
const DB_SET_SETTINGS = 'db:setSettings'
const DB_DELETE_SETTING = 'db:deleteSetting'

// ===========================================
// SHELL
// ===========================================
const SHELL_OPEN_EXTERNAL = 'shell:openExternal'

// ===========================================
// WINDOW
// ===========================================
const WINDOW_OPEN_DETACHED = 'window:openDetached'

// ===========================================
// OLLAMA
// ===========================================
const OLLAMA_GENERATE = 'ollama:generate'
const OLLAMA_TEST_CONNECTION = 'ollama:testConnection'
const OLLAMA_LIST_MODELS = 'ollama:listModels'

// ===========================================
// OPENAI
// ===========================================
const OPENAI_GENERATE = 'openai:generate'
const OPENAI_TEST_CONNECTION = 'openai:testConnection'
const OPENAI_LIST_MODELS = 'openai:listModels'

// ===========================================
// AGENT
// ===========================================
const AGENT_RESEARCH = 'agent:research'

// ===========================================
// APP
// ===========================================
// Renderer -> main ack that pre-quit autosave has finished (see APP_BEFORE_QUIT)
// ===========================================
// SECURITY - At-rest encryption
// ===========================================
const SECURITY_STATUS = 'security:status'
const SECURITY_UNLOCK = 'security:unlock'
const SECURITY_ENABLE = 'security:enable'
const SECURITY_DISABLE = 'security:disable'
const SECURITY_SET_TOUCH_ID = 'security:setTouchId'

const APP_QUIT_SAVE_DONE = 'app:quitSaveDone'

// ===========================================
// MENU EVENTS (main -> renderer)
// ===========================================
const MENU_UNDO = 'menu-undo'
const MENU_REDO = 'menu-redo'
const OPEN_SETTINGS = 'open-settings'
const SHOW_SHORTCUTS = 'show-shortcuts'

// ===========================================
// APP LIFECYCLE (main -> renderer)
// ===========================================
const APP_BEFORE_QUIT = 'app-before-quit'

module.exports = {
  // Database - Node CRUD
  DB_GET_NODES,
  DB_GET_NODE,
  DB_CREATE_NODE,
  DB_UPDATE_NODE,
  DB_DELETE_NODE,

  // Database - Tree Operations
  DB_GET_ROOTS,
  DB_GET_PROJECTS,
  DB_GET_INBOX,
  DB_GET_RECENT,
  DB_GET_FAVORITES,
  DB_GET_TASKS,
  DB_GET_CHILDREN,
  DB_GET_DESCENDANTS,
  DB_GET_DESCENDANTS_BATCH,
  DB_GET_ANCESTORS,
  DB_MOVE_NODE,

  // Database - Links
  DB_LINK_NODES,
  DB_UNLINK_NODES,
  DB_GET_ALL_LINKS,
  DB_GET_LINKED_NODES,

  // Database - Tree View
  DB_GET_TREE,

  // Database - Search
  DB_SEARCH,
  DB_SEARCH_COUNT,

  // Database - Reorder
  DB_REORDER_NODE,

  // Database - Export
  DB_EXPORT_MARKDOWN,
  DB_EXPORT_JSON,
  DB_EXPORT_CSV,

  // Database - Import
  DB_IMPORT_JSON,
  DB_IMPORT_CSV,

  // Database - Trash
  DB_GET_TRASH,
  DB_RESTORE_NODE,
  DB_EMPTY_TRASH,

  // Database - Lost & Found
  DB_GET_ORPHANED_NODES,
  DB_REPARENT_TO_ROOT,

  // Database - Tags (string-based, legacy)
  DB_GET_ALL_TAGS,
  DB_GET_NODES_BY_TAG,

  // Database - Tags (first-class nodes)
  DB_GET_TAG_NODES,
  DB_GET_OR_CREATE_TAG_NODE,
  DB_GET_NODES_LINKED_TO_TAG,
  DB_SEARCH_TAG_NODES,

  // Database - Workspaces
  DB_GET_WORKSPACES,
  DB_GET_WORKSPACE,
  DB_CREATE_WORKSPACE,
  DB_UPDATE_WORKSPACE,
  DB_DELETE_WORKSPACE,

  // Database - Backups & Reload
  DB_BACKUP,
  DB_LIST_BACKUPS,
  DB_RESTORE_BACKUP,
  DB_RELOAD,
  DB_GET_DATA_PATH,

  // Database - Node Tables
  DB_GET_NODE_TABLE,
  DB_CREATE_NODE_TABLE,
  DB_UPDATE_NODE_TABLE,
  DB_DELETE_NODE_TABLE,
  DB_GET_TABLE_CELLS,
  DB_SET_CELLS,
  DB_CLEAR_CELLS,

  // Database - Settings
  DB_GET_SETTING,
  DB_GET_ALL_SETTINGS,
  DB_SET_SETTING,
  DB_SET_SETTINGS,
  DB_DELETE_SETTING,

  // Shell
  SHELL_OPEN_EXTERNAL,

  // Window
  WINDOW_OPEN_DETACHED,

  // Ollama
  OLLAMA_GENERATE,
  OLLAMA_TEST_CONNECTION,
  OLLAMA_LIST_MODELS,

  // OpenAI
  OPENAI_GENERATE,
  OPENAI_TEST_CONNECTION,
  OPENAI_LIST_MODELS,

  // Agent
  AGENT_RESEARCH,

  // Security
  SECURITY_STATUS,
  SECURITY_UNLOCK,
  SECURITY_ENABLE,
  SECURITY_DISABLE,
  SECURITY_SET_TOUCH_ID,

  // App
  APP_QUIT_SAVE_DONE,

  // Menu Events
  MENU_UNDO,
  MENU_REDO,
  OPEN_SETTINGS,
  SHOW_SHORTCUTS,

  // App Lifecycle
  APP_BEFORE_QUIT,
}
