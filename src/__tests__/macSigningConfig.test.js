import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * Local macOS builds are ad-hoc signed, which gives the app a designated
 * requirement that is a bare hash of the binary. macOS ties a keychain
 * "Always Allow" to that requirement, so every rebuild invalidates the grant
 * and the app asks for keychain access again at boot.
 *
 * `make install-mac-signed` fixes that with a stable signing identity, passed
 * to electron-builder on the command line. It must stay a command-line
 * override: CI has no certificate, so a signing identity committed to
 * `package.json` would break the release workflow for everyone.
 * See docs/contributing/development.md.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
const makefile = readFileSync(join(repoRoot, 'Makefile'), 'utf-8')

/** The recipe lines of one Makefile target. */
function target(name) {
  const match = new RegExp(`^${name}:[^\\n]*\\n((?:\\t[^\\n]*\\n|\\n)*)`, 'm').exec(makefile)
  return match ? match[1] : null
}

describe('macOS signing configuration', () => {
  it('keeps the committed build config unsigned, since CI has no certificate', () => {
    expect(pkg.build.mac.identity).toBeNull()
  })

  it('offers a signed local install', () => {
    expect(target('install-mac-signed')).not.toBeNull()
  })

  it('takes the identity from the environment rather than hardcoding one', () => {
    const recipe = target('install-mac-signed')

    expect(recipe).toContain('SIGN_IDENTITY')
    expect(recipe).toMatch(/-c\.mac\.identity/)
  })

  it('fails loudly when no identity is given, rather than silently going ad-hoc', () => {
    // Falling back to an unsigned build would reproduce the exact problem the
    // target exists to avoid, and look like it had worked.
    expect(target('install-mac-signed')).toMatch(/if \[ -z "\$\$SIGN_IDENTITY" \]/)
  })

  it('declares the target as phony, like the other build targets', () => {
    expect(makefile).toMatch(/^\.PHONY:[^\n]*install-mac-signed/m)
  })
})
