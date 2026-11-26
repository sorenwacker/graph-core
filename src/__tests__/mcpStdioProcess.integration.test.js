// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createTestDatabase } from './helpers/testDatabase.js'
import { createMcpBridge } from '../../electron/mcp/bridge.js'
import { startMcpServer } from '../../electron/mcp/server.js'
import { TOOLS } from '../../electron/mcp/tools.js'

/**
 * An MCP client talks to the real stdio process, which forwards to a real
 * bridge on a real database (docs/architecture/mcp.md).
 */
describe('MCP stdio process', () => {
  let db
  let server
  let client
  const connectionFile = path.join(os.tmpdir(), `graphcore-mcp-e2e-${process.pid}.json`)

  beforeEach(async () => {
    db = await createTestDatabase()
    const bridge = createMcpBridge({ db, onDataChanged: () => {}, getOpenWorkspace: () => 'work' })
    server = await startMcpServer({ bridge, connectionFile })
    client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve(__dirname, '../../electron/mcp/stdio.js')],
        env: { ...process.env, GRAPH_CORE_MCP_FILE: connectionFile },
      })
    )
  })

  afterEach(async () => {
    await client.close()
    await server.stop()
    db.close()
  })

  it('lists the declared tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual(TOOLS.map(t => t.name).sort())
  })

  it('creates a node through a tool call', async () => {
    const result = await client.callTool({ name: 'create_node', arguments: { title: 'From MCP' } })
    const node = JSON.parse(result.content[0].text)
    expect(db.getNode(node.id).title).toBe('From MCP')
  })

  it('returns a bridge error as a tool error', async () => {
    const result = await client.callTool({ name: 'get_node', arguments: { id: 99999 } })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/not found/)
  })
})
