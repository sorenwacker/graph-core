/**
 * HTTP Client Module
 *
 * Unified HTTP client that handles both standard requests (via Electron's net module)
 * and requests requiring SSL verification bypass (via Node's http/https modules).
 */

const { net } = require('electron')
const https = require('https')
const http = require('http')

/**
 * HTTP client supporting both Electron net and Node http/https modules.
 */
class HttpClient {
  /**
   * Create an HttpClient instance.
   * @param {Object} config - Client configuration
   * @param {string} config.errorPrefix - Prefix for error messages (default: 'API')
   * @param {string} config.connectionError - Custom connection refused message
   */
  constructor(config = {}) {
    this.errorPrefix = config.errorPrefix || 'API'
    this.connectionError = config.connectionError || 'Cannot connect to API endpoint'
  }

  /**
   * Check if an error looks like an SSL/certificate error.
   * @param {Error} error - The error to inspect
   * @returns {boolean} True if the error is certificate-related
   */
  static isCertError(error) {
    return Boolean(
      error.message?.includes('SSL') ||
      error.message?.includes('ERR_SSL') ||
      error.message?.includes('CERT') ||
      error.message?.includes('certificate')
    )
  }

  /**
   * Parse response data, attempting JSON parse first.
   * @param {string} data - Raw response data
   * @returns {Object|string} Parsed JSON or raw string
   */
  static parseResponse(data) {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }

  /**
   * Create an error with status code and data attached.
   * @param {string} prefix - Error message prefix
   * @param {number} statusCode - HTTP status code
   * @param {string} responseData - Raw response data
   * @returns {Error} Error with statusCode and data properties
   */
  static createHttpError(prefix, statusCode, responseData) {
    const error = new Error(`${prefix} error: ${statusCode}`)
    error.statusCode = statusCode
    error.data = HttpClient.parseResponse(responseData)
    return error
  }

  /**
   * Handle request errors with appropriate messages.
   * @param {Error} error - Original error
   * @param {string} connectionError - Custom connection error message
   * @param {boolean} includeSslHint - Whether to include SSL hint for cert errors
   * @returns {Error} Processed error
   */
  static handleRequestError(error, connectionError, includeSslHint = false) {
    // Node's http/https path sets error.code = 'ECONNREFUSED'; Electron's net
    // module emits plain Errors with Chromium-style messages instead.
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) {
      return new Error(connectionError)
    }
    if (includeSslHint && HttpClient.isCertError(error)) {
      return new Error(
        `SSL/TLS error: ${error.message}. For self-signed certificates on local endpoints ` +
          `(localhost, 127.0.0.1, ::1, *.local), enable "Skip SSL verification" in settings. ` +
          `Certificates for remote hosts are always verified.`
      )
    }
    return error
  }

  /**
   * Make an HTTP request using Node's http/https modules with certificate
   * verification disabled. Only reached when the user explicitly enabled
   * "Skip SSL verification", so the bypass applies to the configured endpoint
   * regardless of host — e.g. an internal proxy with a self-signed certificate.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object|string>} Response data
   */
  requestWithNode(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const isHttps = urlObj.protocol === 'https:'
      const transport = isHttps ? https : http

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers: { ...headers },
        rejectUnauthorized: false,
      }

      if (body) {
        const bodyStr = JSON.stringify(body)
        requestOptions.headers['Content-Type'] = 'application/json'
        requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr)
      }

      const request = transport.request(requestOptions, response => {
        let responseData = ''

        response.on('data', chunk => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(HttpClient.parseResponse(responseData))
          } else {
            reject(HttpClient.createHttpError(this.errorPrefix, response.statusCode, responseData))
          }
        })
      })

      request.on('error', error => {
        reject(HttpClient.handleRequestError(error, this.connectionError, false))
      })

      if (body) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  /**
   * Make an HTTP request using Electron's net module.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object|string>} Response data
   */
  requestWithNet(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options

    return new Promise((resolve, reject) => {
      const request = net.request({ method, url })

      Object.entries(headers).forEach(([key, value]) => {
        request.setHeader(key, value)
      })
      if (body) {
        request.setHeader('Content-Type', 'application/json')
      }

      let responseData = ''

      request.on('response', response => {
        response.on('data', chunk => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(HttpClient.parseResponse(responseData))
          } else {
            reject(HttpClient.createHttpError(this.errorPrefix, response.statusCode, responseData))
          }
        })
      })

      request.on('error', error => {
        reject(HttpClient.handleRequestError(error, this.connectionError, true))
      })

      if (body) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  /**
   * Make an HTTP request.
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @param {string} options.method - HTTP method (default: 'GET')
   * @param {Object} options.body - Request body (will be JSON stringified)
   * @param {Object} options.headers - Additional headers
   * @param {boolean} options.skipSslVerification - Skip SSL certificate verification
   * @returns {Promise<Object|string>} Response data
   */
  request(url, options = {}) {
    const { skipSslVerification = false, ...requestOptions } = options

    if (skipSslVerification && url.startsWith('https://')) {
      return this.requestWithNode(url, requestOptions)
    }
    return this.requestWithNet(url, requestOptions)
  }
}

/**
 * Generic HTTP request function (convenience wrapper).
 * @param {string} url - Full URL to request
 * @param {Object} options - Request options
 * @returns {Promise<Object|string>} Response data
 */
function httpRequest(url, options = {}) {
  const { errorPrefix, connectionError, ...requestOptions } = options
  const client = new HttpClient({ errorPrefix, connectionError })
  return client.request(url, requestOptions)
}

module.exports = { HttpClient, httpRequest }
