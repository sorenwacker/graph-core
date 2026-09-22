import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import sharedConfig from '../../shared/agentConfig.json'
import { appendLookupResult } from '../utils/wikipediaLookup.js'

/**
 * The renderer half of the Wikipedia lookup (docs/guides/ai-notes.md,
 * "Wikipedia lookup"): the preset is named for its source, its editable prompt
 * is what the model is given, and a result is appended to the note.
 */

const settings = {
  aiProvider: ref('ollama'),
  aiEnabled: ref(true),
  aiCustomPrompts: ref([]),
  aiPromptOrder: ref([]),
  aiEnabledTools: ref(['wikipedia']),
  ollamaEndpoint: ref('http://localhost:11434'),
  ollamaModel: ref('llama3.2'),
  ollamaContextSize: ref(32768),
  openaiEndpoint: ref('https://api.openai.com/v1'),
  openaiApiKey: ref(''),
  openaiModel: ref('gpt-4o-mini'),
  openaiSkipSslVerification: ref(false),
  ollamaEnabled: ref(true),
  ollamaCustomPrompts: ref([]),
}

vi.mock('../composables/useSettings.js', () => ({ useSettings: () => settings }))
vi.mock('../composables/useSettings', () => ({ useSettings: () => settings }))

const api = {
  wikipediaLookup: vi.fn(async () => 'the answer'),
  getNode: vi.fn(async id =>
    id === 7
      ? { id: 7, title: 'Oosterscheldekering', type: 'note', parent_id: 3, notes: 'PRIVATE NOTE TEXT' }
      : { id: 3, title: 'Delta Works', type: 'project', parent_id: null }
  ),
}
vi.mock('../services/api.js', () => ({ api }))
vi.mock('../services/api', () => ({ api }))

const { useAiNotes } = await import('../composables/useAiNotes.js')

beforeEach(() => {
  settings.aiCustomPrompts.value = []
  settings.aiPromptOrder.value = []
  api.wikipediaLookup.mockClear()
})

describe('the preset', () => {
  it('is named for its source, not called Research', () => {
    const { presetPrompts } = useAiNotes()
    const preset = presetPrompts.value.find(p => p.isAgent)
    expect(preset).toMatchObject({ id: 'wikipedia', label: 'Wikipedia' })
    expect(presetPrompts.value.some(p => /research/i.test(`${p.id} ${p.label}`))).toBe(false)
  })

  it('shows the prompt the model is actually given', () => {
    const { presetPrompts } = useAiNotes()
    expect(presetPrompts.value.find(p => p.id === 'wikipedia').prompt).toBe(sharedConfig.lookupPrompt)
  })
})

describe('a lookup', () => {
  it('sends the question, the default prompt and the node context without note text', async () => {
    const { lookUpOnWikipedia } = useAiNotes()
    const result = await lookUpOnWikipedia('When was it finished?', 7)

    expect(result).toBe('the answer')
    const sent = api.wikipediaLookup.mock.calls[0][0]
    expect(sent.question).toBe('When was it finished?')
    expect(sent.instructions).toBe(sharedConfig.lookupPrompt)
    expect(sent.node).toEqual({ title: 'Oosterscheldekering', type: 'note', parentTitle: 'Delta Works' })
    expect(JSON.stringify(sent)).not.toContain('PRIVATE NOTE TEXT')
    expect(sent.enabledTools).toEqual(['wikipedia'])
  })

  it('sends the prompt as the user edited it', async () => {
    const { savePrompt, lookUpOnWikipedia } = useAiNotes()
    savePrompt({ id: 'wikipedia', label: 'Wikipedia', prompt: 'Answer in Dutch.', isAgent: true })

    await lookUpOnWikipedia('q', 7)

    expect(api.wikipediaLookup.mock.calls[0][0].instructions).toBe('Answer in Dutch.')
  })

  it('goes back to the default prompt after a reset', async () => {
    const { savePrompt, resetPrompt, lookUpOnWikipedia } = useAiNotes()
    savePrompt({ id: 'wikipedia', label: 'Wikipedia', prompt: 'Answer in Dutch.', isAgent: true })
    resetPrompt('wikipedia')

    await lookUpOnWikipedia('q', 7)

    expect(api.wikipediaLookup.mock.calls[0][0].instructions).toBe(sharedConfig.lookupPrompt)
  })
})

describe('settings saved while the preset was called Research', () => {
  it('drop an edited Research prompt, whose text never reached the model', () => {
    settings.aiCustomPrompts.value = [{ id: 'research', label: 'Research', prompt: 'old text', isAgent: true }]
    const { presetPrompts } = useAiNotes()
    expect(settings.aiCustomPrompts.value).toEqual([])
    expect(presetPrompts.value.filter(p => p.isAgent)).toHaveLength(1)
  })

  it('keep the preset deleted for someone who had deleted it', () => {
    settings.aiCustomPrompts.value = [{ id: 'research', _deleted: true }]
    const { presetPrompts } = useAiNotes()
    expect(settings.aiCustomPrompts.value).toEqual([{ id: 'wikipedia', _deleted: true }])
    expect(presetPrompts.value.some(p => p.id === 'wikipedia')).toBe(false)
  })

  it('keep its place in a custom order', () => {
    settings.aiPromptOrder.value = ['research', 'improve']
    useAiNotes()
    expect(settings.aiPromptOrder.value).toEqual(['wikipedia', 'improve'])
  })
})

describe('applying a result', () => {
  it('appends it under a heading and keeps the existing note', () => {
    const merged = appendLookupResult('Existing note.', 'When was it finished?', 'In 1986.')
    expect(merged).toBe('Existing note.\n\n## Wikipedia: When was it finished?\n\nIn 1986.')
  })

  it('needs no separator on an empty note', () => {
    expect(appendLookupResult('', 'Q', 'A')).toBe('## Wikipedia: Q\n\nA')
    expect(appendLookupResult(null, 'Q', 'A')).toBe('## Wikipedia: Q\n\nA')
  })

  it('keeps a multi-line question on the heading line', () => {
    expect(appendLookupResult('', 'line one\nline two', 'A')).toBe('## Wikipedia: line one line two\n\nA')
  })
})

/**
 * The feature reads Wikipedia and nothing else, so nothing may call it
 * research. The one allowed mention is the id the preset used to have, kept so
 * that saved settings can be carried over.
 */
describe('the name', () => {
  const { readFileSync, readdirSync, statSync } = require('fs')
  const { join, relative } = require('path')
  const root = join(__dirname, '../..')

  function files(dir) {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)
      return /\.(vue|js|ts|json)$/.test(name) && !/demoData|preload\.build/.test(name) ? [path] : []
    })
  }

  it('is not Research anywhere in the app code', () => {
    const offenders = ['src', 'electron', 'shared']
      .flatMap(dir => files(join(root, dir)))
      .flatMap(file =>
        readFileSync(file, 'utf-8')
          .split('\n')
          .filter(line => /research/i.test(line) && !/LEGACY_LOOKUP_PRESET_ID|labelled Research/.test(line))
          .map(line => `${relative(root, file)}: ${line.trim()}`)
      )
    expect(offenders).toEqual([])
  })
})
