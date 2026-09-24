import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'

/**
 * The default workspaces are a first-run convenience, not a permanent fixture.
 * Seeding ran on every startup with INSERT OR IGNORE, so a workspace the user
 * deleted was back the next time the app opened.
 */

let dir, path

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gc-ws-'))
  path = join(dir, 'graph.db')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function open() {
  const db = new Database(path)
  await db.ready
  return db
}

describe('the default workspaces', () => {
  it('are created on a fresh database', async () => {
    const db = await open()
    const ids = db.getWorkspaces().map(w => w.id)
    expect(ids).toContain('work')
    expect(ids).toContain('private')
  })

  it('stay deleted once the user deletes one', async () => {
    const first = await open()
    first.deleteWorkspace('private')
    expect(first.getWorkspaces().map(w => w.id)).not.toContain('private')

    // Reopening runs the migrations again, as every startup does.
    const second = await open()
    expect(
      second.getWorkspaces().map(w => w.id),
      'a deleted workspace came back'
    ).not.toContain('private')
  })
})

/**
 * A node with only a due date is drawn from that date to today: the bar's right
 * edge is "now", not a field on the node. Dragging it therefore had nothing to
 * write, and the drag handler discarded the change, so the bar sprang back with
 * no explanation. A control that cannot do anything should not be offered
 * (docs/guides/views.md).
 */
describe('the timeline bar for a node with only a due date', () => {
  it('offers no end handle to drag', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const source = readFileSync(join(__dirname, '../components/TimelineView.vue'), 'utf-8')

    const right = source.indexOf('resize-handle-right')
    expect(right, 'the end handle is gone entirely').toBeGreaterThan(-1)
    // The handle is rendered conditionally, on the node having a real end date.
    const block = source.slice(source.lastIndexOf('<div', right), right)
    expect(block, 'the end handle renders unconditionally').toMatch(/v-if=/)
  })

  it('still offers it for a node with a real range', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const source = readFileSync(join(__dirname, '../components/TimelineView.vue'), 'utf-8')
    const right = source.indexOf('resize-handle-right')
    const block = source.slice(source.lastIndexOf('<div', right), right)
    expect(block).toMatch(/end_date|start_date|hasRange/)
  })
})
