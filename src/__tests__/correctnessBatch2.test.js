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
