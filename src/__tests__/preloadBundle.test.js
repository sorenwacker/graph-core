import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.resolve(here, '../../scripts/bundle-preload.js')
const outfile = path.join(os.tmpdir(), `preload.build.test.${process.pid}.js`)

describe('preload bundle', () => {
  afterAll(() => {
    if (fs.existsSync(outfile)) fs.unlinkSync(outfile)
  })

  it('inlines local requires so the sandboxed preload has none', () => {
    // Run the real build script as a subprocess: esbuild's synchronous API
    // cannot run inside the vitest worker, and this exercises the exact artifact
    // packaging produces.
    execFileSync('node', [script, outfile], { stdio: 'pipe' })
    const code = fs.readFileSync(outfile, 'utf8')

    // A sandboxed preload cannot resolve relative requires; ipcChannels must be
    // inlined rather than required at runtime.
    expect(code).not.toMatch(/require\(['"]\.\/ipcChannels['"]\)/)

    // electron stays external because the sandbox polyfill provides it.
    expect(code).toMatch(/require\(['"]electron['"]\)/)

    // A known channel constant proves ipcChannels was inlined, not dropped.
    expect(code).toContain('db:getNodes')
  })
})
