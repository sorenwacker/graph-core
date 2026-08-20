import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'yaml'

/**
 * The release workflow creates the GitHub release as a draft before the build
 * jobs upload artifacts to it. A draft release is not bound to its tag, so
 * `gh release create` will create a SECOND draft for a tag that already has a
 * release: re-running or retrying the workflow silently produced duplicates.
 *
 * Rather than pattern-match the YAML, this runs the step's actual shell script
 * with a stubbed `gh` on PATH and asserts on the commands it issues.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const workflowPath = path.resolve(here, '../../.github/workflows/release.yml')

function createReleaseScript() {
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8'))
  const steps = workflow.jobs['create-release'].steps
  const step = steps.find(s => typeof s.run === 'string' && s.run.includes('gh release'))
  if (!step) throw new Error('create-release job has no step running gh release')
  return step.run
}

let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-wf-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/**
 * Run the create-release step with a stubbed gh.
 *
 * @param {Object} options
 * @param {boolean} options.releaseExists - Whether `gh release view` succeeds.
 * @param {boolean} options.isPrerelease - Value of the is_prerelease output.
 * @returns {string[]} The gh argument lines the script issued, in order.
 */
function runStep({ releaseExists, isPrerelease = false }) {
  const log = path.join(dir, 'gh.log')
  const gh = path.join(dir, 'gh')

  // Stub gh: `release view` reports whether a release already exists, every
  // other subcommand records its arguments and succeeds.
  fs.writeFileSync(
    gh,
    [
      '#!/usr/bin/env bash',
      `echo "$@" >> ${JSON.stringify(log)}`,
      'if [ "$1" = "release" ] && [ "$2" = "view" ]; then',
      `  exit ${releaseExists ? 0 : 1}`,
      'fi',
      'exit 0',
      '',
    ].join('\n')
  )
  fs.chmodSync(gh, 0o755)

  // GitHub Actions expands ${{ ... }} before the shell sees the script.
  const script = createReleaseScript().replace(
    /\$\{\{\s*needs\.validate\.outputs\.is_prerelease\s*\}\}/g,
    String(isPrerelease)
  )
  if (script.includes('${{')) {
    throw new Error(`unexpanded workflow expression in create-release step: ${script.match(/\$\{\{[^}]*\}\}/)[0]}`)
  }

  execFileSync('bash', ['-c', script], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_REF: 'refs/tags/v9.9.9',
      GITHUB_REPOSITORY: 'sorenwacker/graph-core',
    },
  })

  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
}

const creates = calls => calls.filter(c => c.startsWith('release create '))
const edits = calls => calls.filter(c => c.startsWith('release edit '))

describe('release workflow: creating the GitHub release', () => {
  it('creates the draft release when the tag has none', () => {
    const calls = runStep({ releaseExists: false })

    expect(creates(calls)).toHaveLength(1)
    expect(creates(calls)[0]).toContain('v9.9.9')
    expect(creates(calls)[0]).toContain('--draft')
  })

  it('does not create a second release when one already exists for the tag', () => {
    // The duplicate-draft bug: gh happily creates another draft for a tag that
    // already has a release, because drafts are not bound to their tag.
    const calls = runStep({ releaseExists: true })

    expect(creates(calls)).toHaveLength(0)
  })

  it('reuses the existing release by editing it back into a draft', () => {
    const calls = runStep({ releaseExists: true })

    expect(edits(calls)).toHaveLength(1)
    expect(edits(calls)[0]).toContain('v9.9.9')
  })

  it('marks a prerelease tag as a prerelease', () => {
    const calls = runStep({ releaseExists: false, isPrerelease: true })

    expect(creates(calls)[0]).toMatch(/--prerelease(=true)?\b/)
  })

  it('does not leave the prerelease flag set when re-running a full release', () => {
    // A full release re-run over a tag previously marked prerelease must clear
    // the flag, not inherit it.
    const calls = runStep({ releaseExists: true, isPrerelease: false })

    expect(edits(calls)[0]).toContain('--prerelease=false')
  })
})
