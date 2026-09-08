import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * The accessibility page is read during procurement, so a claim it cannot back
 * costs more than the missing feature would. It claimed skip links and a
 * high-contrast theme; neither existed anywhere in the source, while the
 * reduced-motion support it also claimed was real.
 *
 * Each claim below is paired with the marker that would exist if it were
 * implemented. Restoring a claim means implementing it, not editing this list.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const doc = readFileSync(join(root, 'docs/reference/accessibility.md'), 'utf-8')

/** Every source file the renderer is built from. */
function sourceFiles(dir = join(root, 'src')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.name === '__tests__') return []
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|js|ts|css)$/.test(entry.name) ? [path] : []
  })
}

const sources = sourceFiles().map(path => readFileSync(path, 'utf-8'))
const implemented = pattern => sources.some(source => pattern.test(source))

/** claim: the wording in the doc. marker: what its implementation looks like. */
const CLAIMS = [
  { claim: /skip link/i, marker: /skip-link|skip to (main|content)/i, name: 'skip links' },
  { claim: /high[- ]contrast theme/i, marker: /high-contrast|highContrast/, name: 'high-contrast theme' },
  { claim: /prefers-reduced-motion|reduced motion/i, marker: /prefers-reduced-motion/, name: 'reduced motion' },
  { claim: /aria-live/i, marker: /aria-live/, name: 'live regions' },
  { claim: /landmark/i, marker: /role="(navigation|complementary|main)"/, name: 'ARIA landmarks' },
]

describe('the accessibility page', () => {
  it.each(CLAIMS)('does not claim $name unless the source implements it', ({ claim, marker }) => {
    if (!claim.test(doc)) return
    expect(implemented(marker)).toBe(true)
  })

  it('still claims the things that are genuinely implemented', () => {
    // Guards the gate: silently emptying the page would otherwise pass.
    expect(doc).toMatch(/prefers-reduced-motion|reduced motion/i)
    expect(doc).toMatch(/aria-live/i)
  })
})
