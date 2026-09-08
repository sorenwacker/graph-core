import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { annotatedTagMessage, toPreviousReleases } from '../../scripts/check-release-policy.mjs'

/**
 * The wrapper feeds the cadence policy. Both of its inputs have a plausible
 * reading that silently defeats the gate: `git tag -l --format=%(contents)`
 * follows a lightweight tag through to its commit message, and a release's
 * `createdAt` is the tagged commit's date rather than the release's own.
 * See docs/contributing/development.md.
 */

let repo

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'release-policy-'))
  git('init', '-q', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  writeFileSync(join(repo, 'file.txt'), 'x')
  git('add', 'file.txt')
  git('commit', '-q', '-m', 'fix: a commit that mentions the marker\n\nRELEASE-EXCEPTION: security')
})

afterAll(() => rmSync(repo, { recursive: true, force: true }))

describe('annotatedTagMessage', () => {
  it('reads the message of an annotated tag', () => {
    git('tag', '-a', 'v2.0.0', '-m', 'Ship it\n\nRELEASE-EXCEPTION: critical')

    expect(annotatedTagMessage('v2.0.0', { cwd: repo })).toContain('RELEASE-EXCEPTION: critical')
  })

  it('returns nothing for a lightweight tag, whatever its commit message says', () => {
    git('tag', 'v2.1.0')

    expect(annotatedTagMessage('v2.1.0', { cwd: repo })).not.toContain('RELEASE-EXCEPTION')
  })

  it('returns nothing for a tag that does not exist', () => {
    expect(annotatedTagMessage('v9.9.9', { cwd: repo })).toBe('')
  })
})

describe('toPreviousReleases', () => {
  const releases = [
    { tagName: 'v1.18.0', createdAt: '2026-08-28T11:27:23Z', publishedAt: '2026-10-01T09:00:00Z', isDraft: false },
    { tagName: 'v1.17.0', createdAt: '2026-08-27T11:52:33Z', publishedAt: '2026-08-27T16:10:32Z', isDraft: false },
    { tagName: 'v1.16.0', createdAt: '2026-08-26T08:00:00Z', publishedAt: null, isDraft: true },
  ]

  it('dates a release by when it was published, not by its commit', () => {
    const dated = toPreviousReleases(releases, 'v1.19.0')

    expect(dated.find(r => r.tag === 'v1.18.0').date).toBe('2026-10-01T09:00:00Z')
  })

  it('leaves drafts out, so an abandoned draft cannot block a release', () => {
    expect(toPreviousReleases(releases, 'v1.19.0').map(r => r.tag)).not.toContain('v1.16.0')
  })

  it('excludes the tag being released', () => {
    expect(toPreviousReleases(releases, 'v1.18.0').map(r => r.tag)).not.toContain('v1.18.0')
  })

  it('falls back to createdAt when a release has no publication date', () => {
    const dated = toPreviousReleases(
      [{ tagName: 'v1.15.0', createdAt: '2026-07-01T00:00:00Z', publishedAt: null, isDraft: false }],
      'v1.19.0'
    )

    expect(dated[0].date).toBe('2026-07-01T00:00:00Z')
  })
})
