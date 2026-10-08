import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * The release pipeline builds installers for three platforms and publishes them,
 * but the documentation opened with `git clone` and Node 22 — so the only
 * documented way in was to be a developer, and the artifacts went unused.
 *
 * Both entry points must offer the download before the build instructions.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const DOWNLOAD_URL = 'https://sorenwacker.net/nodus/'

const ENTRY_POINTS = [
  { name: 'README.md', path: 'README.md' },
  { name: 'installation guide', path: 'docs/getting-started/installation.md' },
]

describe.each(ENTRY_POINTS)('$name', ({ path }) => {
  const text = readFileSync(join(root, path), 'utf-8')

  it('links the download page', () => {
    expect(text).toContain(DOWNLOAD_URL)
  })

  it('offers the download before telling anyone to clone the repository', () => {
    const clone = text.indexOf('git clone')
    if (clone === -1) return
    expect(text.indexOf(DOWNLOAD_URL)).toBeLessThan(clone)
  })

  it('says what the unsigned first launch needs on macOS', () => {
    // Without this the app appears broken on first open, and the download is
    // worse than no download.
    expect(text).toMatch(/xattr -cr/)
  })
})
