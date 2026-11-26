/**
 * MCP IPC handlers: turn the bridge server on and off, and report its status
 * (docs/guides/mcp.md, docs/architecture/mcp.md).
 */

const path = require('path')
const { createMcpBridge } = require('../mcp/bridge')
const { startMcpServer } = require('../mcp/server')
const { MCP_GET_STATUS, MCP_SET_ENABLED, MCP_SET_OPEN_WORKSPACE } = require('../ipcChannels')

const ENABLED_SETTING = 'mcpEnabled'
const STDIO_SCRIPT = path.join(__dirname, '..', 'mcp', 'stdio.js')

/**
 * Register the MCP handlers and start the server if it was left enabled.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Object} deps - Injected collaborators
 * @param {Object} deps.db - Database instance
 * @param {string} deps.connectionFile - Path of mcp.json
 * @param {string} deps.executable - The app executable an MCP client runs
 * @param {Function} deps.sendDataChanged - Tells all windows to reload data
 * @param {Function} deps.sendStatus - Pushes the status to all windows
 * @returns {{stop: Function}} Stops the server, for app quit
 */
function registerMcpHandlers(ipcMain, { db, connectionFile, executable, sendDataChanged, sendStatus }) {
  let server = null
  let clients = 0
  let openWorkspace = null

  const bridge = createMcpBridge({
    db,
    onDataChanged: sendDataChanged,
    // Until the renderer reports its workspace, the first one stands in
    getOpenWorkspace: () => openWorkspace ?? db.getWorkspaces()[0]?.id ?? null,
  })

  const clientConfig = () => ({
    command: executable,
    args: [STDIO_SCRIPT],
    env: { ELECTRON_RUN_AS_NODE: '1', GRAPH_CORE_MCP_FILE: connectionFile },
  })

  // Read from the database on each apply; the status pushed on a client
  // disconnect must not touch a database that is closing
  let enabled = false

  const status = () => ({
    enabled,
    running: Boolean(server),
    clients,
    clientConfig: clientConfig(),
  })

  // Starts and stops run one at a time, so a stop never races a start
  let queue = Promise.resolve()
  const apply = () => (queue = queue.then(applySetting))

  async function applySetting() {
    enabled = db.getSetting(ENABLED_SETTING) === 'true'
    if (enabled && !server) {
      server = await startMcpServer({
        bridge,
        connectionFile,
        onClientsChanged: count => {
          clients = count
          sendStatus(status())
        },
      })
    } else if (!enabled && server) {
      await server.stop()
      server = null
      clients = 0
    }
    return status()
  }

  ipcMain.handle(MCP_GET_STATUS, () => status())
  ipcMain.handle(MCP_SET_ENABLED, async (_event, enabled) => {
    db.setSetting(ENABLED_SETTING, enabled ? 'true' : 'false')
    return apply()
  })
  ipcMain.handle(MCP_SET_OPEN_WORKSPACE, (_event, workspaceId) => {
    openWorkspace = workspaceId
  })

  apply().catch(error => console.error('[MCP] Failed to start:', error))

  return {
    stop: () =>
      (queue = queue
        .catch(() => {})
        .then(async () => {
          if (server) await server.stop()
          server = null
        })),
  }
}

module.exports = { registerMcpHandlers }
