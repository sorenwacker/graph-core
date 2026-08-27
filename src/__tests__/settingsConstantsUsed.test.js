import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'

/**
 * settingsConstants collects the app's timing values so they can be tuned in
 * one place. That only holds while every one of them is actually used: nine of
 * the sixteen were referenced nowhere, which makes the file a place to read
 * numbers that no longer govern anything.
 */

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..')
const CONSTANTS_FILE = join(srcRoot, 'utils/settingsConstants.ts')

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc)
    } else if (['.js', '.ts', '.vue'].includes(extname(entry)) && full !== CONSTANTS_FILE) {
      acc.push(full)
    }
  }
  return acc
}

describe('settingsConstants', () => {
  it('exports nothing that no other file references', () => {
    const declared = [...readFileSync(CONSTANTS_FILE, 'utf-8').matchAll(/export const (\w+)/g)].map(m => m[1])
    expect(declared.length).toBeGreaterThan(0)

    const corpus = sourceFiles(srcRoot)
      .map(f => readFileSync(f, 'utf-8'))
      .join('\n')

    const unused = declared.filter(name => !new RegExp(`\\b${name}\\b`).test(corpus))
    expect(unused).toEqual([])
  })
})
