// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import { startMcpServer } from '../../electron/mcp/server.js'
import { createBridgeClient, NOT_RUNNING } from '../../electron/mcp/stdio.js'
import { createMcpBridge } from '../../electron/mcp/bridge.js'
import { TOOLS } from '../../electron/mcp/tools.js'

/**
 * The stdio side: tool declarations and forwarding (docs/architecture/mcp.md).
 */
describe('MCP tools', () => {
  it('declares exactly the methods the bridge handles', () => {
    const { METHODS } = createMcpBridge({ db: {}, onDataChanged: () => {}, getOpenWorkspace: () => 'work' })
    expect(TOOLS.map(t => t.name).sort()).toEqual([...METHODS].sort())
  })
})

describe('MCP bridge client', () => {
  let server
  const connectionFile = path.join(os.tmpdir(), `graphcore-mcp-stdio-${process.pid}.json`)
  const bridge = {
    handle: method => {
      if (method === 'fail') throw new Error('boom')
      return { ok: method }
    },
  }

  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('forwards a call and returns the result', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    const client = createBridgeClient(connectionFile)
    expect(await client.request('get_roots', {})).toEqual({ ok: 'get_roots' })
  })

  it('passes a bridge error through', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    await expect(createBridgeClient(connectionFile).request('fail', {})).rejects.toThrow('boom')
  })

  it('reports the app as not running when there is no connection file', async () => {
    await expect(createBridgeClient(connectionFile).request('get_roots', {})).rejects.toThrow(NOT_RUNNING)
  })

  it('reconnects after the app restarts', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    const client = createBridgeClient(connectionFile)
    await client.request('get_roots', {})
    await server.stop()
    server = await startMcpServer({ bridge, connectionFile })
    await new Promise(r => setTimeout(r, 20))
    expect(await client.request('get_roots', {})).toEqual({ ok: 'get_roots' })
  })
})
