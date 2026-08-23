import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parse } from 'yaml'

/**
 * Dependabot PRs are auto-merged only when they are patch or minor updates,
 * only when opened by Dependabot itself, and only via GitHub auto-merge so the
 * required `test` check gates the merge. Each property is load-bearing: losing
 * the update-type guard would merge majors that CI cannot meaningfully vet
 * (the AG Grid tests mock the grid; CI never packages the app), losing the
 * actor guard would let any PR author trigger a merge, and losing `--auto`
 * would merge immediately without waiting for checks.
 */

const workflowPath = join(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows/dependabot-automerge.yml')

function workflow() {
  return parse(readFileSync(workflowPath, 'utf-8'))
}

describe('dependabot auto-merge workflow', () => {
  it('exists and triggers on pull_request', () => {
    const wf = workflow()
    // YAML parses the bare key `on:` as boolean true.
    const triggers = wf.on ?? wf[true]
    expect(JSON.stringify(triggers)).toContain('pull_request')
  })

  it('runs only for PRs opened by dependabot', () => {
    const jobs = Object.values(workflow().jobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].if).toContain("github.actor == 'dependabot[bot]'")
  })

  it('merges only patch and minor updates, never majors', () => {
    const job = Object.values(workflow().jobs)[0]
    const mergeStep = job.steps.find(s => typeof s.run === 'string' && s.run.includes('gh pr merge'))
    expect(mergeStep).toBeDefined()
    expect(mergeStep.if).toContain('version-update:semver-patch')
    expect(mergeStep.if).toContain('version-update:semver-minor')
    expect(mergeStep.if).not.toContain('semver-major')
  })

  it('uses GitHub auto-merge so the required test check gates the merge', () => {
    const job = Object.values(workflow().jobs)[0]
    const mergeStep = job.steps.find(s => typeof s.run === 'string' && s.run.includes('gh pr merge'))
    expect(mergeStep.run).toContain('--auto')
    expect(mergeStep.run).toContain('--squash')
  })

  it('waits for the test check itself, so red CI blocks the merge even without branch protection', () => {
    const job = Object.values(workflow().jobs)[0]
    const steps = job.steps
    const waitIndex = steps.findIndex(s => typeof s.run === 'string' && s.run.includes('check-runs'))
    const mergeIndex = steps.findIndex(s => typeof s.run === 'string' && s.run.includes('gh pr merge'))

    expect(waitIndex, 'no step polls the check-runs API').toBeGreaterThan(-1)
    expect(waitIndex, 'the wait must come before the merge').toBeLessThan(mergeIndex)

    const wait = steps[waitIndex]
    // It must poll the named test check (watching all checks would deadlock on
    // this job itself), be gated to patch/minor like the merge, and hard-fail
    // on anything but success.
    expect(wait.run).toContain('select(.name == "test")')
    expect(wait.if).toContain('version-update:semver-patch')
    expect(wait.run).toMatch(/exit 1/)
  })

  it('derives the update type from dependabot metadata, not the PR title', () => {
    const job = Object.values(workflow().jobs)[0]
    const metaStep = job.steps.find(s => s.uses?.startsWith('dependabot/fetch-metadata'))
    expect(metaStep).toBeDefined()
  })
})
