// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import WebSocket from 'ws'
import { startMcpServer } from '../../electron/mcp/server.js'

/**
 * The bridge server's connection file and token check
 * (docs/architecture/mcp.md, "Connection and authentication").
 */
describe('MCP bridge server', () => {
  let server
  const connectionFile = path.join(os.tmpdir(), `graphcore-mcp-${process.pid}.json`)
  const bridge = { handle: (method, params) => ({ method, params }) }

  afterEach(async () => {
    await server?.stop()
    server = null
  })

  const open = headers =>
    new Promise(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers })
      ws.on('open', () => resolve(ws))
      ws.on('error', () => resolve(null))
    })

  it('writes port and token to a file only the user can read', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    const info = JSON.parse(fs.readFileSync(connectionFile, 'utf8'))
    expect(info.port).toBe(server.port)
    expect(info.token).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.statSync(connectionFile).mode & 0o077).toBe(0)
  })

  it('refuses a connection without the token', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    expect(await open({})).toBeNull()
    expect(await open({ authorization: 'Bearer wrong' })).toBeNull()
  })

  it('answers requests from a client with the token', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    const { token } = JSON.parse(fs.readFileSync(connectionFile, 'utf8'))
    const ws = await open({ authorization: `Bearer ${token}` })
    const reply = await new Promise(resolve => {
      ws.on('message', m => resolve(JSON.parse(String(m))))
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'get_roots', params: {} }))
    })
    expect(reply).toEqual({ jsonrpc: '2.0', id: 7, result: { method: 'get_roots', params: {} } })
    ws.close()
  })

  it('deletes the connection file when stopped', async () => {
    server = await startMcpServer({ bridge, connectionFile })
    await server.stop()
    server = null
    expect(fs.existsSync(connectionFile)).toBe(false)
  })
})
