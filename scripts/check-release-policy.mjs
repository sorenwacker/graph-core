#!/usr/bin/env node
/**
 * Workflow wrapper around the release cadence policy.
 *
 * Reads the pushed tag, its annotated message, and the releases already made,
 * then applies scripts/releasePolicy.js. Exits non-zero when the tag may not be
 * released, so the workflow stops before anything is created or built.
 * See docs/contributing/development.md.
 */
import { execFileSync } from 'child_process'
import { evaluateReleasePolicy } from './releasePolicy.mjs'

const tag = process.argv[2] || (process.env.GITHUB_REF || '').replace(/^refs\/tags\//, '')

/** The annotated tag's message. A lightweight tag has none, which is not an error. */
function tagMessage(name) {
  try {
    return execFileSync('git', ['tag', '-l', '--format=%(contents)', name], { encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** Releases already published, newest first. */
function previousReleases(currentTag) {
  try {
    const raw = execFileSync('gh', ['release', 'list', '--limit', '100', '--json', 'tagName,createdAt'], {
      encoding: 'utf8',
    })
    return JSON.parse(raw)
      .filter(r => r.tagName !== currentTag)
      .map(r => ({ tag: r.tagName, date: r.createdAt }))
  } catch (e) {
    // Without the release history the policy cannot be applied, and releasing
    // anyway would silently skip the gate.
    console.error(`::error::Could not list previous releases: ${e.message}`)
    process.exit(1)
  }
}

if (!tag) {
  console.error('::error::No tag to check. Pass one, or run this from a tag push.')
  process.exit(1)
}

const result = evaluateReleasePolicy({
  tag,
  tagMessage: tagMessage(tag),
  previousReleases: previousReleases(tag),
  now: new Date(),
})

if (!result.allowed) {
  console.error(`::error::${result.reason}`)
  process.exit(1)
}

console.log(result.reason)
if (result.exception) console.log(`Released under the ${result.exception} exception.`)
