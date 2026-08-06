import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import https from 'node:https'

// httpClient runs in the Electron main process and hard-requires node's https
// module. Patch https.request on the shared module object (vi.mock cannot
// intercept the native require used for electron/ files) to capture the
// request options the client builds.
//
// Policy gate: "Skip SSL verification" bypasses certificate verification for
// LOCAL endpoints only. Certificates for remote hosts are always verified,
// even with the setting enabled. Deliberate decision — do not widen it without
// a security review.
const captured = { options: null }
const fakeRequest = { on: () => {}, write: () => {}, end: () => {} }
let originalRequest

beforeAll(() => {
  originalRequest = https.request
  https.request = (options, _cb) => ((captured.options = options), fakeRequest)
})

afterAll(() => {
  https.request = originalRequest
})

beforeEach(() => {
  captured.options = null
})

const { HttpClient } = await import('../../electron/ipc/httpClient.js')

describe('HttpClient SSL bypass policy', () => {
  it('keeps verifying certificates for remote hosts even when the skip setting is enabled', () => {
    const client = new HttpClient()
    client.request('https://ai-proxy.example.com/v1/models', { skipSslVerification: true }).catch(() => {})
    expect(captured.options).not.toBeNull()
    expect(captured.options.rejectUnauthorized).toBe(true)
  })

  it('disables certificate verification for localhost when the skip setting is enabled', () => {
    const client = new HttpClient()
    client.request('https://localhost:11434/api/tags', { skipSslVerification: true }).catch(() => {})
    expect(captured.options.rejectUnauthorized).toBe(false)
  })

  it('treats the bracketed IPv6 loopback as local', () => {
    const client = new HttpClient()
    client.request('https://[::1]:11434/api/tags', { skipSslVerification: true }).catch(() => {})
    expect(captured.options.rejectUnauthorized).toBe(false)
  })

  it('does not use the bypass transport when the skip setting is off', () => {
    const client = new HttpClient()
    // Without the skip setting the request goes through Electron's net module
    // (unavailable here), which always verifies certificates; the https bypass
    // transport must not be touched.
    client.request('https://ai-proxy.example.com/v1/models', {}).catch(() => {})
    expect(captured.options).toBeNull()
  })
})

describe('HttpClient.isLocalhost', () => {
  it('accepts only local endpoints', () => {
    expect(HttpClient.isLocalhost('localhost')).toBe(true)
    expect(HttpClient.isLocalhost('127.0.0.1')).toBe(true)
    expect(HttpClient.isLocalhost('[::1]')).toBe(true)
    expect(HttpClient.isLocalhost('printer.local')).toBe(true)
    expect(HttpClient.isLocalhost('ai-proxy.example.com')).toBe(false)
    expect(HttpClient.isLocalhost('localhost.evil.com')).toBe(false)
  })
})

describe('HttpClient.isCertError', () => {
  it('recognizes certificate-related errors', () => {
    expect(HttpClient.isCertError(new Error('unable to verify the first certificate'))).toBe(true)
    expect(HttpClient.isCertError(new Error('ERR_SSL_PROTOCOL_ERROR'))).toBe(true)
    expect(HttpClient.isCertError(new Error('ECONNREFUSED'))).toBe(false)
  })
})
