import { describe, it, expect } from 'vitest'
import { evaluateReleasePolicy } from '../../scripts/releasePolicy.mjs'

/**
 * One full release per calendar month; release candidates in between. Critical
 * bugfixes and security patches are the only exceptions, claimed in the
 * annotated tag's message. See docs/contributing/development.md.
 *
 * The rule exists because tags publish and deploy: without it, every merged
 * feature could ship a version, and the version number stops meaning anything.
 */

const previous = [
  { tag: 'v1.18.0', date: '2026-08-14T10:00:00Z' },
  { tag: 'v1.18.0-rc.1', date: '2026-08-12T10:00:00Z' },
]

const evaluate = over => evaluateReleasePolicy({ tag: 'v1.19.0', tagMessage: '', previousReleases: previous, ...over })

describe('release policy', () => {
  it('always allows a release candidate', () => {
    const result = evaluate({ tag: 'v1.19.0-rc.1', now: '2026-08-20T10:00:00Z' })

    expect(result.allowed).toBe(true)
  })

  it('allows several release candidates in the same month as a full release', () => {
    const result = evaluate({
      tag: 'v1.19.0-rc.3',
      previousReleases: [...previous, { tag: 'v1.19.0-rc.2', date: '2026-08-20T10:00:00Z' }],
      now: '2026-08-21T10:00:00Z',
    })

    expect(result.allowed).toBe(true)
  })

  it('allows the first full release of a month', () => {
    const result = evaluate({ now: '2026-09-03T10:00:00Z' })

    expect(result.allowed).toBe(true)
  })

  it('blocks a second full release in the same month', () => {
    const result = evaluate({ now: '2026-08-28T10:00:00Z' })

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('v1.18.0')
  })

  it('lets a security patch through in a month that already released', () => {
    const result = evaluate({
      now: '2026-08-28T10:00:00Z',
      tagMessage: 'Patch the unlock bypass\n\nRELEASE-EXCEPTION: security\n',
    })

    expect(result.allowed).toBe(true)
    expect(result.exception).toBe('security')
  })

  it('lets a critical bugfix through, whatever the case', () => {
    const result = evaluate({
      now: '2026-08-28T10:00:00Z',
      tagMessage: 'release-exception: Critical\n',
    })

    expect(result.allowed).toBe(true)
    expect(result.exception).toBe('critical')
  })

  it('rejects an exception reason that is not one of the two', () => {
    const result = evaluate({
      now: '2026-08-28T10:00:00Z',
      tagMessage: 'RELEASE-EXCEPTION: the customer asked nicely\n',
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/critical|security/)
  })

  it('ignores the marker mentioned mid-sentence rather than claimed', () => {
    const result = evaluate({
      now: '2026-08-28T10:00:00Z',
      tagMessage: 'This is not a RELEASE-EXCEPTION: security release, just a feature.',
    })

    expect(result.allowed).toBe(false)
  })

  it('counts the month in UTC so a local evening does not shift it', () => {
    const result = evaluate({
      previousReleases: [{ tag: 'v1.18.0', date: '2026-09-01T00:30:00Z' }],
      now: '2026-09-30T23:30:00Z',
    })

    expect(result.allowed).toBe(false)
  })

  it('allows a full release when the last one was in the previous month', () => {
    const result = evaluate({
      previousReleases: [{ tag: 'v1.18.0', date: '2026-08-31T23:00:00Z' }],
      now: '2026-09-01T01:00:00Z',
    })

    expect(result.allowed).toBe(true)
  })

  it('allows the very first release the project ever makes', () => {
    const result = evaluate({ previousReleases: [], now: '2026-09-03T10:00:00Z' })

    expect(result.allowed).toBe(true)
  })

  it('refuses a tag that is not semver rather than guessing', () => {
    const result = evaluate({ tag: 'nightly', now: '2026-09-03T10:00:00Z' })

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('nightly')
  })
})
