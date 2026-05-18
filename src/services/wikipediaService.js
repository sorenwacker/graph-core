/**
 * Service for interacting with the Wikipedia API.
 * Uses the MediaWiki Action API for search and REST API for content.
 */

const WIKIPEDIA_ACTION_API = 'https://en.wikipedia.org/w/api.php'
const WIKIPEDIA_REST_API = 'https://en.wikipedia.org/api/rest_v1'

/**
 * Search Wikipedia for articles matching a query.
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return (default: 3)
 * @returns {Promise<Array<{title: string, description: string, pageid: number}>>}
 */
export async function search(query, limit = 3) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
    srlimit: String(limit),
    origin: '*',
  })

  const response = await fetch(`${WIKIPEDIA_ACTION_API}?${params}`, {
    headers: {
      'User-Agent': 'graph-core/1.0 (https://github.com/graph-core)',
    },
  })

  if (!response.ok) {
    throw new Error(`Wikipedia search failed: ${response.status}`)
  }

  const data = await response.json()
  const results = data.query?.search || []
  return results.map(item => ({
    title: item.title,
    description: item.snippet?.replace(/<[^>]+>/g, '') || '',
    pageid: item.pageid,
  }))
}

/**
 * Get article summary (first paragraph) from Wikipedia.
 * @param {string} title - Article title
 * @returns {Promise<{title: string, extract: string, description: string}>}
 */
export async function getSummary(title) {
  const url = `${WIKIPEDIA_REST_API}/page/summary/${encodeURIComponent(title)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'graph-core/1.0 (https://github.com/graph-core)',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Article not found: ${title}`)
    }
    throw new Error(`Wikipedia API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    title: data.title,
    extract: data.extract || '',
    description: data.description || '',
  }
}

/**
 * Get extended article content from Wikipedia.
 * @param {string} title - Article title
 * @returns {Promise<{title: string, content: string}>}
 */
export async function getExtract(title) {
  // Use the summary endpoint which provides a good amount of intro text
  const url = `${WIKIPEDIA_REST_API}/page/summary/${encodeURIComponent(title)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'graph-core/1.0 (https://github.com/graph-core)',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Article not found: ${title}`)
    }
    throw new Error(`Wikipedia API error: ${response.status}`)
  }

  const data = await response.json()

  // Get the full extract (summary endpoint provides a good amount of intro text)
  let content = data.extract || ''

  // If we need more content, we can also include the description
  if (data.description && !content.toLowerCase().includes(data.description.toLowerCase())) {
    content = `${data.description}\n\n${content}`
  }

  return {
    title: data.title,
    content,
  }
}

export const wikipediaService = {
  search,
  getSummary,
  getExtract,
}
