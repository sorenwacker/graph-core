/**
 * Wikipedia API functions for the main process.
 * Uses Node.js http requests via the shared httpRequest helper.
 */

const WIKIPEDIA_ACTION_API = 'https://en.wikipedia.org/w/api.php'
const WIKIPEDIA_REST_API = 'https://en.wikipedia.org/api/rest_v1'

/**
 * Search Wikipedia for articles matching a query.
 * @param {Function} httpRequest - HTTP request function from main.js
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array<{title: string, description: string, pageid: number}>>}
 */
async function search(httpRequest, query, limit = 3) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
    srlimit: String(limit),
  })
  const url = `${WIKIPEDIA_ACTION_API}?${params}`
  const response = await httpRequest(url, {
    headers: { 'User-Agent': 'graph-core/1.0' },
  })
  const results = response.query?.search || []
  return results.map(item => ({
    title: item.title,
    description: item.snippet?.replace(/<[^>]+>/g, '') || '',
    pageid: item.pageid,
  }))
}

/**
 * Get article content from Wikipedia.
 * @param {Function} httpRequest - HTTP request function from main.js
 * @param {string} title - Article title
 * @returns {Promise<{title: string, content: string}>}
 */
async function getContent(httpRequest, title) {
  const url = `${WIKIPEDIA_REST_API}/page/summary/${encodeURIComponent(title)}`
  const response = await httpRequest(url, {
    headers: { 'User-Agent': 'graph-core/1.0' },
  })
  let content = response.extract || ''
  if (response.description && !content.toLowerCase().includes(response.description.toLowerCase())) {
    content = `${response.description}\n\n${content}`
  }
  return { title: response.title, content }
}

module.exports = {
  search,
  getContent,
  WIKIPEDIA_ACTION_API,
  WIKIPEDIA_REST_API,
}
