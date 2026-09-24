import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'
import { notesForDisplay } from '../utils/nodeDisplay.js'
import { buildTooltipHTML } from '../utils/tooltip.js'

/**
 * utils/nodeDisplay.js is the one place a view gets note text to show
 * (docs/architecture/sensitive-notes.md, "Display policy"). Masking used to be
 * decided per view - the tooltip, the graph hover handler, three copies of
 * shouldShowTooltip, the graph node HTML, the table, the cards - each with its
 * own rule, and the views that forgot to decide leaked.
 */

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..')

describe('notesForDisplay', () => {
  it('returns no text for a node whose notes were withheld', () => {
    const shown = notesForDisplay({ notes: null, notes_withheld: true, has_notes: true })
    expect(shown).toEqual({ text: '', withheld: 'sensitive' })
  })

  it('never returns text for a withheld node, even if a stale copy still carries some', () => {
    expect(notesForDisplay({ notes: 'stale secret', notes_withheld: true }).text).toBe('')
  })

  it('treats a node still flagged sensitive as withheld, whatever else it carries', () => {
    expect(notesForDisplay({ notes: 'just flagged', notes_sensitive: true }).text).toBe('')
  })

  it('returns an ordinary note', () => {
    expect(notesForDisplay({ notes: 'plain', notes_withheld: false })).toEqual({ text: 'plain', withheld: null })
  })

  it('masks a keyword note only while Hide Sensitive is on', () => {
    const node = { notes: 'my Password is here', notes_withheld: false }
    expect(notesForDisplay(node).text).toBe('my Password is here')
    expect(notesForDisplay(node, { hideSensitive: true })).toEqual({ text: '', withheld: 'keyword' })
  })

  it('copes with no node and no notes', () => {
    expect(notesForDisplay(null)).toEqual({ text: '', withheld: null })
    expect(notesForDisplay({ notes: null })).toEqual({ text: '', withheld: null })
  })
})

describe('the hover tooltip', () => {
  it('shows a placeholder, not text, for a withheld note', () => {
    const html = buildTooltipHTML({ id: 1, title: 'Vault', type: 'note', notes: null, notes_withheld: true })
    expect(html).toContain('Sensitive content hidden')
  })

  it('shows nothing a stale sensitive copy still carries', () => {
    const html = buildTooltipHTML({ id: 1, title: 'Vault', type: 'note', notes: 'stale secret', notes_sensitive: true })
    expect(html).not.toContain('stale secret')
  })
})

/**
 * Files that may read `.notes` directly: the display function, and the code
 * that edits or writes notes. Everything else shows notes and must ask
 * notesForDisplay.
 */
const MAY_READ_NOTES = new Set([
  'utils/nodeDisplay.js',
  // Editors: they hold text the user is changing.
  'components/DetailPanel.vue',
  'components/detail/NotesSection.vue',
  'components/detail/PersonDetailForm.vue',
  'components/detail/OrganizationDetailForm.vue',
  'components/NotesAIToolbar.vue',
  'components/CardNotes.vue',
  'components/PersonsView.vue',
  'composables/useInlineEdit.js',
  'composables/useNodeActionsUI.ts',
  'composables/useAiNotes.js',
  // Reads the previous text through getNodeNotes, for undo.
  'composables/useNodeOperations.ts',
  // Writes and fixtures, not display.
  'utils/demoData.js',
  'App.vue',
])

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'commands' ? [] : sourceFiles(path)
    return /\.(vue|js|ts)$/.test(name) ? [path] : []
  })
}

describe('views do not read note text themselves', () => {
  for (const file of sourceFiles(srcRoot)) {
    const name = relative(srcRoot, file)
    if (MAY_READ_NOTES.has(name)) continue
    it(`${name} goes through notesForDisplay`, () => {
      const source = readFileSync(file, 'utf-8')
      // `.notes` as a property read: not `.notes-preview` CSS, `notes_sensitive`,
      // or the table's `colWidths.notes` column width.
      const reads = source
        .split('\n')
        .filter(line => /(?<!colWidths)\.notes\b(?![-_\w])/.test(line) && !/^\s*(\/\/|\*|\.|<!--)/.test(line))
      expect(reads, `${name} reads .notes directly:\n${reads.join('\n')}`).toEqual([])
    })
  }

  it('the allowlist names only files that exist', () => {
    const existing = new Set(sourceFiles(srcRoot).map(f => relative(srcRoot, f)))
    expect([...MAY_READ_NOTES].filter(name => !existing.has(name))).toEqual([])
  })
})

describe('no view decides sensitivity for itself', () => {
  const VIEWS = ['App.vue', 'components/GraphView.vue', 'components/TableView.vue', 'components/CardsView.vue']
  for (const name of VIEWS) {
    it(`${name} does not branch on notes_sensitive`, () => {
      const source = readFileSync(join(srcRoot, name), 'utf-8')
      expect(source).not.toMatch(/notes_sensitive/)
    })
  }

  it('the graph hover handler does not branch on notes_sensitive', () => {
    const source = readFileSync(join(srcRoot, 'composables/useGraphEvents.js'), 'utf-8')
    expect(source).not.toMatch(/notes_sensitive/)
  })
})
