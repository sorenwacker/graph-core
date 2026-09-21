import { describe, it, expect, vi, beforeEach } from 'vitest'
import wikipedia from '../../electron/wikipedia.js'
import agentConfig from '../../electron/agentConfig.js'

/**
 * The Wikipedia lookup (docs/guides/ai-notes.md, "Wikipedia lookup"). It used to
 * be called Research while reading one paragraph of one article: the article
 * tool fetched Wikipedia's page summary, and the text shown as the preset's
 * editable prompt was never sent to the model.
 */

const { buildLookupMessages, articleCharBudget, DEFAULT_LOOKUP_PROMPT, TOOL_PROTOCOL } = agentConfig

describe('reading an article', () => {
  const FULL_TEXT = `Lead paragraph.\n\n== History ==\nBuilt in 1953.\n\n== Cost ==\n${'x'.repeat(500)}`
  let httpRequest

  beforeEach(() => {
    httpRequest = vi.fn(async () => ({
      query: { pages: { 42: { pageid: 42, title: 'Delta Works', extract: FULL_TEXT } } },
    }))
  })

  it('asks for the full plain text, not the page summary', async () => {
    await wikipedia.getContent(httpRequest, 'Delta Works')
    const url = new URL(httpRequest.mock.calls[0][0])
    expect(url.pathname).not.toContain('/page/summary/')
    expect(url.searchParams.get('prop')).toBe('extracts')
    expect(url.searchParams.get('explaintext')).toBe('1')
    expect(url.searchParams.has('exintro')).toBe(false)
    expect(url.searchParams.get('redirects')).toBe('1')
    expect(url.searchParams.get('titles')).toBe('Delta Works')
  })

  it('returns the sections beyond the introduction, and a link', async () => {
    const article = await wikipedia.getContent(httpRequest, 'Delta Works')
    expect(article.title).toBe('Delta Works')
    expect(article.content).toContain('Built in 1953.')
    expect(article.url).toBe('https://en.wikipedia.org/wiki/Delta_Works')
  })

  it('cuts the text to the budget and says that it did', async () => {
    const article = await wikipedia.getContent(httpRequest, 'Delta Works', { maxChars: 60 })
    expect(article.content.length).toBeLessThan(140)
    expect(article.content).toContain('Lead paragraph.')
    expect(article.content).toMatch(/article continues/i)
  })

  it('fails with the title when Wikipedia has no such article', async () => {
    httpRequest.mockResolvedValue({ query: { pages: { '-1': { title: 'Nope', missing: '' } } } })
    await expect(wikipedia.getContent(httpRequest, 'Nope')).rejects.toThrow(/Nope/)
  })
})

describe('searching', () => {
  it('asks for five results by default', async () => {
    const httpRequest = vi.fn(async () => ({ query: { search: [] } }))
    await wikipedia.search(httpRequest, 'delta works')
    expect(new URL(httpRequest.mock.calls[0][0]).searchParams.get('srlimit')).toBe('5')
  })
})

describe('the article budget', () => {
  it('scales with the context size and leaves room for more than one article', () => {
    expect(articleCharBudget(32768)).toBeGreaterThan(articleCharBudget(8192))
    // Roughly four characters per token: two articles must fit in the window.
    expect(articleCharBudget(8192) * 2).toBeLessThan(8192 * 4)
  })

  it('has a default when the provider reports no context size', () => {
    expect(articleCharBudget(undefined)).toBeGreaterThan(10000)
  })
})

describe('the messages sent to the model', () => {
  const node = { title: 'Oosterscheldekering', type: 'note', parentTitle: 'Delta Works' }

  it('use the edited prompt as the instructions', () => {
    const [system] = buildLookupMessages({ question: 'When was it finished?', instructions: 'Answer in Dutch.' })
    expect(system.role).toBe('system')
    expect(system.content).toContain('Answer in Dutch.')
    expect(system.content).not.toContain(DEFAULT_LOOKUP_PROMPT)
  })

  it('fall back to the default prompt when none is given or it is blank', () => {
    for (const instructions of [undefined, '', '   ']) {
      const [system] = buildLookupMessages({ question: 'q', instructions })
      expect(system.content).toContain(DEFAULT_LOOKUP_PROMPT)
    }
  })

  it('always carry the tool protocol, which is not part of the editable text', () => {
    const [system] = buildLookupMessages({ question: 'q', instructions: 'Answer in Dutch.' })
    expect(system.content).toContain(TOOL_PROTOCOL)
    expect(DEFAULT_LOOKUP_PROMPT).not.toContain(TOOL_PROTOCOL)
  })

  it('leave the tool protocol out when the app reads the articles itself', () => {
    const [system] = buildLookupMessages({ question: 'q', withTools: false })
    expect(system.content).not.toContain(TOOL_PROTOCOL)
  })

  it('put the question in the context of the node, without note text', () => {
    const [, user] = buildLookupMessages({ question: 'When was it finished?', node: { ...node, notes: 'PRIVATE' } })
    expect(user.content).toContain('When was it finished?')
    expect(user.content).toContain('Oosterscheldekering')
    expect(user.content).toContain('Delta Works')
    expect(user.content).not.toContain('PRIVATE')
  })

  it('send the bare question when there is no node', () => {
    const [, user] = buildLookupMessages({ question: 'When was it finished?' })
    expect(user.content).toBe('When was it finished?')
  })
})

describe('the default prompt', () => {
  it('names its only source and does not call itself research', () => {
    expect(DEFAULT_LOOKUP_PROMPT).toMatch(/Wikipedia/)
    expect(DEFAULT_LOOKUP_PROMPT).not.toMatch(/research/i)
  })

  it('asks for what the old one did not', () => {
    expect(DEFAULT_LOOKUP_PROMPT).toMatch(/answer the question/i)
    expect(DEFAULT_LOOKUP_PROMPT).toMatch(/dates|figures|names/i)
    expect(DEFAULT_LOOKUP_PROMPT).toMatch(/do not (answer|fill|guess)|say so/i)
    expect(DEFAULT_LOOKUP_PROMPT).toMatch(/Sources/)
  })
})

/**
 * The whole lookup, driven through the injected HTTP function: Wikipedia and
 * the model are both reached through it, so nothing needs mocking by module.
 */
describe('a lookup, end to end', () => {
  const ARTICLE = `Lead paragraph.\n\n== Completion ==\nThe barrier was finished in 1986.`
  const options = {
    question: 'When was it finished?',
    instructions: 'Answer in one sentence.',
    node: { title: 'Oosterscheldekering', type: 'note', parentTitle: 'Delta Works' },
    provider: 'ollama',
    endpoint: 'http://llm.test',
    model: 'm',
    contextSize: 8192,
    enabledTools: ['wikipedia'],
  }

  /** Fake network: Wikipedia answers, and the model replies with `replies` in order. */
  function network(replies) {
    const chats = []
    const http = vi.fn(async (url, request) => {
      if (url.startsWith('http://llm.test')) {
        chats.push(request.body)
        return { message: replies[chats.length - 1] }
      }
      const params = new URL(url).searchParams
      if (params.get('list') === 'search') {
        return { query: { search: [{ title: 'Oosterscheldekering', snippet: 'storm surge barrier', pageid: 1 }] } }
      }
      return { query: { pages: { 1: { title: params.get('titles'), extract: ARTICLE } } } }
    })
    return { http, chats }
  }

  async function handler(http) {
    const { registerAgentHandlers } = await import('../../electron/ipc/agent.js')
    let registered
    registerAgentHandlers({ handle: (_channel, fn) => (registered = fn) }, http)
    return opts => registered({}, opts)
  }

  it('gives a tool-calling model the edited prompt, the node context and the full article', async () => {
    const { http, chats } = network([
      {
        content: '',
        tool_calls: [
          { id: 'a', function: { name: 'wikipedia_get_content', arguments: { title: 'Oosterscheldekering' } } },
        ],
      },
      { content: 'It was finished in 1986. (Oosterscheldekering)' },
    ])
    const lookup = await handler(http)

    const result = await lookup(options)

    expect(result).toContain('1986')
    const [system, user] = chats[0].messages
    expect(system.content).toContain('Answer in one sentence.')
    expect(user.content).toContain('Delta Works')
    const toolResult = chats[1].messages.at(-1)
    expect(toolResult.role).toBe('tool')
    expect(toolResult.content).toContain('finished in 1986')
    expect(toolResult.content).toContain('https://en.wikipedia.org/wiki/Oosterscheldekering')
  })

  it('gives a model without tool calling the same prompt and the full article', async () => {
    const { http, chats } = network([{ content: '<|channel|> garbage' }, { content: 'Finished in 1986.' }])
    const lookup = await handler(http)

    const result = await lookup(options)

    expect(result).toBe('Finished in 1986.')
    const [system, user] = chats[1].messages
    expect(chats[1].tools).toBeUndefined()
    expect(system.content).toContain('Answer in one sentence.')
    expect(user.content).toContain('When was it finished?')
    expect(user.content).toContain('finished in 1986')
  })

  it('names the Wikipedia tool when it is disabled, not a feature called Research', async () => {
    const { http } = network([])
    const lookup = await handler(http)
    const result = await lookup({ ...options, enabledTools: [] })
    expect(result).toMatch(/Wikipedia tool is disabled/)
    expect(result).not.toMatch(/research/i)
  })
})
