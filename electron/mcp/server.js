/**
 * MCP bridge server: a token-protected WebSocket on 127.0.0.1
 * (docs/architecture/mcp.md, "Connection and authentication").
 *
 * Each message is a JSON-RPC 2.0 request whose method is a bridge method.
 */

const crypto = require('crypto')
const fs = require('fs')
const { WebSocketServer } = require('ws')

/**
 * Start the server and write the connection file.
 * @param {Object} options - Server options
 * @param {{handle: Function}} options.bridge - The MCP bridge
 * @param {string} options.connectionFile - Path of mcp.json
 * @param {Function} [options.onClientsChanged] - Called with the client count when it changes
 * @returns {Promise<{port: number, clientCount: Function, stop: Function}>} The running server
 */
function startMcpServer({ bridge, connectionFile, onClientsChanged = () => {} }) {
  const token = crypto.randomBytes(32).toString('hex')
  const expected = Buffer.from(`Bearer ${token}`)

  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: ({ req }) => {
      const given = Buffer.from(String(req.headers.authorization || ''))
      return given.length === expected.length && crypto.timingSafeEqual(given, expected)
    },
  })

  wss.on('connection', socket => {
    const connection = {}
    onClientsChanged(wss.clients.size)
    socket.on('close', () => onClientsChanged(wss.clients.size))
    socket.on('message', raw => {
      let request
      try {
        request = JSON.parse(String(raw))
      } catch {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
        return
      }
      let response
      try {
        const result = bridge.handle(request.method, request.params, connection)
        response = { jsonrpc: '2.0', id: request.id, result: result ?? null }
      } catch (error) {
        response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } }
      }
      socket.send(JSON.stringify(response))
    })
  })

  return new Promise((resolve, reject) => {
    wss.once('error', reject)
    wss.once('listening', () => {
      const { port } = wss.address()
      fs.writeFileSync(connectionFile, JSON.stringify({ port, token }), { mode: 0o600 })
      resolve({
        port,
        clientCount: () => wss.clients.size,
        stop: () =>
          new Promise(done => {
            fs.rmSync(connectionFile, { force: true })
            for (const client of wss.clients) client.terminate()
            wss.close(() => done())
          }),
      })
    })
  })
}

module.exports = { startMcpServer }
