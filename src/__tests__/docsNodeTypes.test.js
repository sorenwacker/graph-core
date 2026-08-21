import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { nodeTypes, typeConfig } from '../utils/constants.js'

/**
 * The node type reference restates values that live in constants.js. Nothing
 * kept them in step, and they drifted: the colour table listed an older palette
 * in which 8 of 10 hexes no longer matched the code, and the `tag` type was
 * missing from the reference entirely while still appearing in every type
 * picker in the app.
 */

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs/reference/node-types.md'), 'utf-8')

/**
 * Parse a markdown table into rows of trimmed cell values.
 *
 * @param {string} heading - The section heading the table sits under.
 * @returns {string[][]} One array of cells per body row.
 */
function tableUnder(heading) {
  const section = doc.slice(doc.indexOf(heading))
  const lines = section.split('\n')
  const start = lines.findIndex(l => l.trim().startsWith('|'))
  const rows = []
  for (const line of lines.slice(start)) {
    if (!line.trim().startsWith('|')) break
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map(c => c.trim())
    )
  }
  // Drop the header row and the |---| separator.
  return rows.slice(2)
}

describe('node type reference matches the code', () => {
  it('documents every type the app offers in its type pickers', () => {
    const documented = tableUnder('## Available Types').map(r => r[0].replace(/\*\*/g, '').toLowerCase())

    expect([...documented].sort()).toEqual([...nodeTypes].sort())
  })

  it('lists the colour of every type, with the hex the code actually uses', () => {
    const rows = tableUnder('## Color Coding')
    const documented = Object.fromEntries(rows.map(r => [r[0].toLowerCase(), r[2].replace(/`/g, '')]))

    const actual = Object.fromEntries(Object.entries(typeConfig).map(([type, cfg]) => [type, cfg.bg]))

    expect(documented).toEqual(actual)
  })

  it('gives every type its own details section', () => {
    for (const type of nodeTypes) {
      const heading = `### ${type[0].toUpperCase()}${type.slice(1)}`
      expect(doc, `missing details section for "${type}"`).toContain(heading)
    }
  })
})
