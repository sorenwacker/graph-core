import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parse } from 'yaml'

/**
 * A dependency held back needs a rule Dependabot obeys, not a version range.
 * `package.json` already carries `typescript: ^6.0.3`, which excludes 7, and
 * Dependabot proposed 7.0.2 anyway - a major update rewrites the range rather
 * than respecting it. Only an ignore entry stops the PR being reopened weekly.
 * See docs/contributing/development.md.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

function npmUpdateConfig() {
  const config = parse(readFileSync(join(repoRoot, '.github/dependabot.yml'), 'utf-8'))
  return config.updates.find(u => u['package-ecosystem'] === 'npm')
}

describe('dependabot held-back majors', () => {
  it('holds the typescript major back, which vue-tsc cannot resolve', () => {
    const ignored = npmUpdateConfig().ignore ?? []
    const typescript = ignored.find(entry => entry['dependency-name'] === 'typescript')

    expect(typescript).toBeDefined()
    expect(typescript['update-types']).toContain('version-update:semver-major')
  })

  it('leaves minor and patch updates to typescript flowing', () => {
    const typescript = (npmUpdateConfig().ignore ?? []).find(entry => entry['dependency-name'] === 'typescript')

    expect(typescript['update-types']).not.toContain('version-update:semver-minor')
    expect(typescript['update-types']).not.toContain('version-update:semver-patch')
  })

  it('documents why each held-back major is held back', () => {
    const docs = readFileSync(join(repoRoot, 'docs/contributing/development.md'), 'utf-8')

    for (const entry of npmUpdateConfig().ignore ?? []) {
      expect(docs).toContain(entry['dependency-name'])
    }
  })
})
