import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parse } from 'yaml'

/**
 * The CI `test` job is the only gate most changes pass through, and Dependabot
 * auto-merge polls it by name, so every check it drops becomes a check nothing
 * runs. Type-checking is the one that has already been lost this way: neither
 * the unit suite nor eslint invokes the TypeScript compiler, so the TypeScript
 * 7 bump - which breaks `vue-tsc` outright - showed green CI.
 * See docs/contributing/development.md.
 */

const workflowPath = join(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows/ci.yml')

function testJob() {
  const wf = parse(readFileSync(workflowPath, 'utf-8'))
  return wf.jobs.test
}

function runCommands() {
  return testJob()
    .steps.filter(s => typeof s.run === 'string')
    .map(s => s.run)
}

describe('CI workflow', () => {
  it('runs on pull requests against main', () => {
    const wf = parse(readFileSync(workflowPath, 'utf-8'))
    // YAML parses the bare key `on:` as boolean true.
    const triggers = wf.on ?? wf[true]
    expect(triggers.pull_request.branches).toContain('main')
  })

  it('keeps the job named test, which dependabot auto-merge polls by name', () => {
    expect(testJob()).toBeDefined()
  })

  it.each([
    ['formatting', 'format:check'],
    ['linting', 'lint'],
    ['type checking', 'type-check'],
    ['unit tests', 'test:run'],
    ['the renderer build', 'build'],
  ])('gates %s', (_label, script) => {
    expect(runCommands()).toContain(`npm run ${script}`)
  })

  it('fails the job on high-severity advisories rather than continuing', () => {
    const auditStep = testJob().steps.find(s => typeof s.run === 'string' && s.run.includes('npm audit'))
    expect(auditStep.run).toContain('--audit-level=high')
    expect(auditStep['continue-on-error']).toBe(false)
  })
})
