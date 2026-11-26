/**
 * stdio MCP server that forwards tool calls to the running app's bridge
 * (docs/architecture/mcp.md). An MCP client runs it with the app's executable
 * and ELECTRON_RUN_AS_NODE=1; GRAPH_CORE_MCP_FILE names the connection file.
 */

const fs = require('fs')
const WebSocket = require('ws')
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const { TOOLS } = require('./tools')

const NOT_RUNNING = 'Graph Core is not running or its MCP server is disabled'

/**
 * Forwards requests to the bridge over one lazily opened socket, reopened
 * after the app restarts.
 * @param {string} connectionFile - Path of mcp.json
 * @returns {{request: Function}} The forwarding client
 */
function createBridgeClient(connectionFile) {
  let socket = null
  let nextId = 1
  const pending = new Map()

  function connect() {
    let info
    try {
      info = JSON.parse(fs.readFileSync(connectionFile, 'utf8'))
    } catch {
      return Promise.reject(new Error(NOT_RUNNING))
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${info.port}`, { headers: { authorization: `Bearer ${info.token}` } })
      ws.once('open', () => resolve(ws))
      ws.once('error', () => reject(new Error(NOT_RUNNING)))
      ws.on('message', raw => {
        const reply = JSON.parse(String(raw))
        const waiter = pending.get(reply.id)
        if (!waiter) return
        pending.delete(reply.id)
        if (reply.error) waiter.reject(new Error(reply.error.message))
        else waiter.resolve(reply.result)
      })
      ws.on('close', () => {
        if (socket === ws) socket = null
        for (const waiter of pending.values()) waiter.reject(new Error(NOT_RUNNING))
        pending.clear()
      })
    })
  }

  async function request(method, params) {
    if (!socket || socket.readyState !== WebSocket.OPEN) socket = await connect()
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  return { request }
}

async function main() {
  const client = createBridgeClient(process.env.GRAPH_CORE_MCP_FILE)
  const server = new Server({ name: 'graph-core', version: '1.0.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async req => {
    try {
      const result = await client.request(req.params.name, req.params.arguments || {})
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true }
    }
  })

  await server.connect(new StdioServerTransport())
}

if (require.main === module) main()

module.exports = { createBridgeClient, NOT_RUNNING }
