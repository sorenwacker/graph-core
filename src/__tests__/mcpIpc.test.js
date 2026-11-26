// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createTestDatabase } from './helpers/testDatabase.js'
import { registerMcpHandlers } from '../../electron/ipc/mcp.js'
import { createBridgeClient } from '../../electron/mcp/stdio.js'
import { MCP_GET_STATUS, MCP_SET_ENABLED, MCP_SET_OPEN_WORKSPACE } from '../../electron/ipcChannels.js'

/**
 * Settings > MCP server, main-process side (docs/guides/mcp.md).
 */
describe('MCP IPC handlers', () => {
  let db
  let handlers
  let mcp
  let sendDataChanged
  const connectionFile = path.join(os.tmpdir(), `graphcore-mcp-ipc-${process.pid}.json`)

  const register = () => {
    handlers = {}
    const ipcMain = { handle: (channel, fn) => (handlers[channel] = fn) }
    mcp = registerMcpHandlers(ipcMain, {
      db,
      connectionFile,
      executable: '/Applications/Graph Core.app/Contents/MacOS/Graph Core',
      sendDataChanged,
      sendStatus: () => {},
    })
  }

  beforeEach(async () => {
    db = await createTestDatabase()
    sendDataChanged = vi.fn()
    register()
  })

  afterEach(async () => {
    await mcp.stop()
    db.close()
  })

  it('is off by default', async () => {
    expect(await handlers[MCP_GET_STATUS]()).toMatchObject({ enabled: false, running: false })
    expect(fs.existsSync(connectionFile)).toBe(false)
  })

  it('starts and stops the server', async () => {
    expect(await handlers[MCP_SET_ENABLED](null, true)).toMatchObject({ enabled: true, running: true })
    expect(fs.existsSync(connectionFile)).toBe(true)
    expect(await handlers[MCP_SET_ENABLED](null, false)).toMatchObject({ enabled: false, running: false })
    expect(fs.existsSync(connectionFile)).toBe(false)
  })

  it('starts the server at launch when it was left enabled', async () => {
    db.setSetting('mcpEnabled', 'true')
    await mcp.stop()
    register()
    await new Promise(r => setTimeout(r, 50))
    expect((await handlers[MCP_GET_STATUS]()).running).toBe(true)
  })

  it('gives a client configuration that runs the bundled stdio server', async () => {
    const { clientConfig } = await handlers[MCP_GET_STATUS]()
    expect(clientConfig.args[0]).toMatch(/electron[/\\]mcp[/\\]stdio\.js$/)
    expect(fs.existsSync(clientConfig.args[0])).toBe(true)
    expect(clientConfig.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', GRAPH_CORE_MCP_FILE: connectionFile })
  })

  it('creates nodes in the workspace the app reports as open, and refreshes the windows', async () => {
    await handlers[MCP_SET_ENABLED](null, true)
    handlers[MCP_SET_OPEN_WORKSPACE](null, 'personal')
    const node = await createBridgeClient(connectionFile).request('create_node', { title: 'From agent' })
    expect(node.workspace_id).toBe('personal')
    expect(sendDataChanged).toHaveBeenCalledTimes(1)
  })
})
