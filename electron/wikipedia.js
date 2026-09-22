/**
 * Wikipedia API functions for the main process.
 * Uses Node.js http requests via the shared httpRequest helper.
 */

const WIKIPEDIA_ACTION_API = 'https://en.wikipedia.org/w/api.php'
const WIKIPEDIA_ARTICLE_BASE = 'https://en.wikipedia.org/wiki'

/**
 * Search Wikipedia for articles matching a query.
 * @param {Function} httpRequest - HTTP request function from main.js
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array<{title: string, description: string, pageid: number}>>}
 */
async function search(httpRequest, query, limit = 5) {
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
 * Get the full plain text of a Wikipedia article: every section, not only the
 * introduction that the REST page summary returns.
 * @param {Function} httpRequest - HTTP request function from main.js
 * @param {string} title - Article title
 * @param {Object} [options]
 * @param {number} [options.maxChars] - Cut the text here, at a paragraph break where possible
 * @returns {Promise<{title: string, content: string, url: string}>}
 * @throws {Error} When Wikipedia has no article with that title
 */
async function getContent(httpRequest, title, { maxChars } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: title,
    format: 'json',
  })
  const response = await httpRequest(`${WIKIPEDIA_ACTION_API}?${params}`, {
    headers: { 'User-Agent': 'graph-core/1.0' },
  })
  const page = Object.values(response.query?.pages || {})[0]
  if (!page || 'missing' in page || !page.extract) {
    throw new Error(`Wikipedia has no article titled "${title}"`)
  }
  return {
    title: page.title,
    content: cutAtParagraph(page.extract, maxChars),
    url: `${WIKIPEDIA_ARTICLE_BASE}/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  }
}

/**
 * Cut text to a length, at the last paragraph break before it, and say so.
 * @param {string} text - The text
 * @param {number} [maxChars] - Maximum length; no cut when absent
 * @returns {string} The text, possibly shortened
 */
function cutAtParagraph(text, maxChars) {
  if (!maxChars || text.length <= maxChars) return text
  const cut = text.lastIndexOf('\n\n', maxChars)
  const kept = text.slice(0, cut > 0 ? cut : maxChars)
  return `${kept}\n\n[The article continues; it was cut here to fit the context window.]`
}

module.exports = {
  search,
  getContent,
  WIKIPEDIA_ACTION_API,
}
