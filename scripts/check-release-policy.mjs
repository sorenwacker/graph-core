#!/usr/bin/env node
/**
 * Workflow wrapper around the release cadence policy.
 *
 * Reads the pushed tag, its annotated message, and the releases already made,
 * then applies scripts/releasePolicy.mjs. Exits non-zero when the tag may not be
 * released, so the workflow stops before anything is created or built.
 * See docs/contributing/development.md.
 */
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { evaluateReleasePolicy } from './releasePolicy.mjs'

/**
 * The message of an annotated tag.
 *
 * Only a tag object carries a message. `git tag -l --format=%(contents)` follows
 * a lightweight tag through to the commit it points at and returns the commit
 * message, so a commit that happened to contain the exception marker would claim
 * the exception with no annotated tag involved. Check the object type first.
 *
 * @param {string} name - Tag name.
 * @param {Object} [options] - Passed to git, e.g. `cwd` for tests.
 * @returns {string} The tag's message, or an empty string when it has none.
 */
export function annotatedTagMessage(name, options = {}) {
  // stderr is discarded: a missing tag is an ordinary answer here, not a fault
  // worth printing.
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options })
  try {
    if (git(['cat-file', '-t', name]).trim() !== 'tag') return ''
    return git(['tag', '-l', '--format=%(contents)', name])
  } catch {
    return ''
  }
}

/**
 * Released tags with the dates the cadence policy should judge them by.
 *
 * `createdAt` is the tagged commit's date, not the release's: a release cut on
 * the 1st from the previous month's commit would book into the wrong month and
 * leave the current month's slot free. Drafts are excluded, since an abandoned
 * draft would otherwise count as the month's release.
 *
 * @param {Array<Object>} releases - Raw `gh release list --json` entries.
 * @param {string} currentTag - The tag being released, which is not a previous one.
 * @returns {Array<{tag: string, date: string}>} Releases with their publication dates.
 */
export function toPreviousReleases(releases, currentTag) {
  return releases
    .filter(r => !r.isDraft && r.tagName !== currentTag)
    .map(r => ({ tag: r.tagName, date: r.publishedAt ?? r.createdAt }))
}

/** Releases already published, newest first. */
function previousReleases(currentTag) {
  try {
    const raw = execFileSync(
      'gh',
      ['release', 'list', '--limit', '100', '--json', 'tagName,createdAt,publishedAt,isDraft'],
      { encoding: 'utf8' }
    )
    return toPreviousReleases(JSON.parse(raw), currentTag)
  } catch (e) {
    // Without the release history the policy cannot be applied, and releasing
    // anyway would silently skip the gate.
    console.error(`::error::Could not list previous releases: ${e.message}`)
    process.exit(1)
  }
}

function main() {
  const tag = process.argv[2] || (process.env.GITHUB_REF || '').replace(/^refs\/tags\//, '')

  if (!tag) {
    console.error('::error::No tag to check. Pass one, or run this from a tag push.')
    process.exit(1)
  }

  const result = evaluateReleasePolicy({
    tag,
    tagMessage: annotatedTagMessage(tag),
    previousReleases: previousReleases(tag),
    now: new Date(),
  })

  if (!result.allowed) {
    console.error(`::error::${result.reason}`)
    process.exit(1)
  }

  console.log(result.reason)
  if (result.exception) console.log(`Released under the ${result.exception} exception.`)
}

// Importing this module - the tests do - must not run the check.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
