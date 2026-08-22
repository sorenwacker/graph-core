import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

/**
 * Documentation, README files and commit-adjacent markdown carry no emoji.
 *
 * The rule was previously prose only, and drifted: a status table reached the
 * repository using check-mark emoji as its pass/fail column. Emoji also render
 * inconsistently across platforms and are noise in a screen reader.
 *
 * Typographic characters are deliberately NOT emoji here. The docs legitimately
 * use box-drawing characters for tree diagrams, em dashes, and arrows, and
 * flagging those would make the gate unusable.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

// The variation selector and keycap mark are combining characters, so they are
// matched as alternatives rather than inside the class: combining marks in a
// character class are misleading (and eslint rejects them).
const EMOJI = new RegExp(
  '[\\u{1F000}-\\u{1FAFF}' + // pictographs, transport, supplemental symbols
    '\\u{2600}-\\u{27BF}' + // misc symbols and dingbats (check marks, warning signs)
    '\\u{2B00}-\\u{2BFF}' + // misc symbols and arrows (stars)
    '\\u{1F1E6}-\\u{1F1FF}]' + // regional indicators (flags)
    '|\\u{FE0F}' + // variation selector-16, which forces emoji presentation
    '|\\u{20E3}', // combining enclosing keycap, as in a keycap digit sequence
  'gu'
)

const SKIP_DIRS = new Set(['node_modules', '.git', 'site', 'dist', 'dist-electron', 'release'])

/**
 * Collect every markdown file in the repository worth checking.
 *
 * @param {string} dir - Directory to walk.
 * @param {string[]} found - Accumulator.
 * @returns {string[]} Absolute paths to markdown files.
 */
function markdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) markdownFiles(full, found)
    else if (entry.endsWith('.md')) found.push(full)
  }
  return found
}

describe('documentation contains no emoji', () => {
  const files = markdownFiles(repoRoot)

  it('finds markdown to check', () => {
    // Guards against the walker silently matching nothing and passing vacuously.
    expect(files.length).toBeGreaterThan(10)
  })

  it('has no emoji in any markdown file', () => {
    const offenders = []

    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, i) => {
        const hits = line.match(EMOJI)
        if (hits) offenders.push(`${relative(repoRoot, file)}:${i + 1}: ${[...new Set(hits)].join(' ')}`)
      })
    }

    expect(offenders).toEqual([])
  })

  it('does not flag the box drawing, dashes and arrows the docs rely on', () => {
    // These appear in the architecture tree diagrams and the views guide.
    const legitimate = '├─ Parent │ └─ Child — em dash → arrow ⟷ link · dot − minus … ellipsis'

    expect(legitimate.match(EMOJI)).toBeNull()
  })
})
