# Codebase Review - graph-core

_Full multi-agent review of 2026-08-26 (v1.16.0, commit 719ef04): 304 files across `src/` and `electron/` read file-by-file by 22 review agents; every high and medium finding was then handed to an independent agent instructed to refute it (258 agents, 12.1M tokens, 3764 tool calls). Findings below are the surviving set. CSS was excluded from the review scope; the 180 low-severity notes were not adversarially verified and sit in the appendix._

> **Status: reported, not remediated.** Nothing in this document has been fixed. Three unrelated fixes landed the same day (detached-panel layout, search ranking, notes-editor newline) and are not part of this review's findings.

## Baseline gates

| Gate                    | Command                                       | Result                                              |
| ----------------------- | --------------------------------------------- | --------------------------------------------------- |
| Lint                    | `npm run lint`                                | Pass - 0 errors, 475 warnings (warn-only by config) |
| Format                  | `npm run format:check`                        | Pass - clean                                        |
| Types                   | `npm run type-check` (`vue-tsc --noEmit`)     | Pass - clean                                        |
| Tests                   | `npm run test:run`                            | Pass - 1578/1578 in 96 files                        |
| Docs                    | `make docs-build` (`zensical build --strict`) | Pass - no issues                                    |
| File size (<= 1000 LOC) | -                                             | **Fail** - `src/App.vue` at 1149                    |

The 475 lint warnings break down as 187 `max-nested-callbacks`, 181 `max-lines-per-function`, 61 `complexity`, 30 `no-unused-vars`, 9 `max-lines`, 7 `max-depth`. Two are worth acting on independently of the findings below: the **30 `no-unused-vars`** warnings are real dead code that the gate lets through silently, and the **9 `max-lines`** warnings show eslint already has a file-size rule configured that is not set to fail at the project's 1000-line limit. No TODO/FIXME/HACK markers exist anywhere in the source.

## Summary

- **416 raw findings** -> **205 confirmed** (6 high, 91 medium, 108 low), **31 refuted**, 180 lower-confidence notes not adversarially verified (appendix).
- Confirmed by category: correctness 99, dead-code 63, consistency 17, design 16, typing 8, docstring 1, naming 1.

Severity is the verifier's corrected severity where it differs from the reviewer's. Refutation was real: 31 findings were thrown out, and a number of others were downgraded rather than dropped.

### Recurring themes

1. **Sensitive-note encryption leaks around its own boundary.** Decrypted plaintext is persisted to `sessionStorage` by the undo stack; disabling the feature permanently destroys trashed sensitive notes; masking is absent from person/organization notes and from the table view's Notes column; the wrapped key is handed to the renderer through `DB_GET_ALL_SETTINGS`.
2. **Props and events dropped between component layers.** `MainToolbar` sits between `App.vue` and `SettingsPanel` and silently swallows `currentWorkspace`, the SSL-skip toggle, and `import-complete`. `TableView`, `CardsView` and `DetachedView` each emit a payload shape their handler does not expect.
3. **No in-flight guards on async loaders.** `loadChildren`, `initGraph`, `loadTasks`, the search's `loadMoreResults`, and `PersonDetailForm`'s org watcher all race; several let a stale result win.
4. **Errors collected into refs nothing reads.** `useNodeTable`, `useDataLoading` and others write `loading`/`error` on every path with no UI consumer, so failures are fully silent.
5. **Undo/redo integrity.** Stacks are global and survive a workspace switch; redo of a create mints a new id and orphans later commands; several mutating operations push no command at all; nothing broadcasts to detached windows.
6. **Table and tree invariants in the DB layer.** Deleting a column never reindexes cells, shifting every column's data left; `setCells` uses `INSERT OR REPLACE` and erases omitted columns; `restoreNode` can restore under a still-deleted parent; `moveNode` has no ancestor guard.
7. **Forked logic that has already diverged.** The agent loop exists in both `electron/ipc/agent.js` and `src/services/agentService.js`; sidebar collapse state is forked between `useSidebar.ts` and `AppSidebar.vue`; `isTextInput` duplicates the `inputOwnership` module that was created to own that decision.
8. **Unreachable subsystems.** The graph edit/prompt modal subsystem, most of `useViewStateController`, several `useSelection` helpers and nine timing constants are built but never reached.

## High (6)

Each of these is reachable from the UI and loses or corrupts user data, or breaks a shipped feature outright.

#### 1. reload() bypasses the encryption choke point and always fails on an encrypted database

`electron/database/backup.js`:82 - correctness

`reload()` reads the file with `fs.readFileSync(ctx.dbPath)` and hands the raw bytes straight to `new ctx.SQL.Database(buffer)`. Every other read path goes through `ctx._deserialize` (`index.js:_init` line 61, `restoreBackup` line 66). An encrypted file begins with the ASCII magic `GCENC1` (`encryption.js:isEncrypted`), so sql.js rejects it with "file is not a database" and the handler throws. `docs/architecture/encryption.md:36` names exactly `_save`, `backup`, and `restoreBackup` as the choke-point users and omits `reload`, confirming this is an oversight rather than a deliberate exception. This is reachable from the UI: `electron/ipc/database.js:184` registers `DB_RELOAD` -> `db.reload()`, `useMaintenanceDialogs.js:47` passes `api.reload` into `useSnapshots.reloadDatabase()`, and `App.vue:900` binds `@reload-database`. Result: on any encrypted database, the maintenance "Reload database" action is permanently broken. Note also that `reload()` does not re-run `createTables`/`runMigrations` after swapping `ctx.db`.

**Fix:** Change to `const buffer = ctx._deserialize(fs.readFileSync(ctx.dbPath))`, mirroring `restoreBackup`. Add a test that constructs an encrypted Database, calls `reload()`, and asserts the node count (the existing `database-encryption.test.js` covers `backup()` but not `reload()`). Add `reload` to the choke-point list in docs/architecture/encryption.md.

#### 2. SENSITIVE_DISABLE permanently loses trashed sensitive notes

`electron/ipc/sensitiveNotes.js`:84 - correctness

The disable handler selects every encrypted note including soft-deleted ones:

    const encrypted = db._query("SELECT id FROM nodes WHERE notes LIKE 'SNENC1:%'")
    for (const { id } of encrypted) {
      db.updateNode(id, { notes_sensitive: false })
    }
    db.deleteSetting(SETTINGS_KEY)

but the decrypt path cannot handle a trashed row. `updateNode` -> `_encodeNotesForWrite(id, data)` calls `this.getNode(id)`, whose SQL is `WHERE id = ? AND deleted_at IS NULL`. For a trashed node `existing` is null, so `wasSensitive=false`, `willBeSensitive=false`, `toggling=false`, `'notes' in data` is false, and the function returns `data` unchanged. The subsequent `UPDATE nodes SET notes_sensitive = ?, updated_at = ... WHERE id = ?` has no deleted filter, so the row DOES get `notes_sensitive = 0` while `notes` stays `SNENC1:...`. Then `deleteSetting` + `setSession(null)` drop the only key that could ever decrypt it.

I verified this against the real Database in a throwaway vitest probe (since removed). Output:

    rows selected: [ { id: 1 }, { id: 2 } ]
    after: [
      { id: 1, title: 'live',    notes: 'secret-live',                       notes_sensitive: 0 },
      { id: 2, title: 'trashed', notes: 'SNENC1:bnygcb+FEouNk1R7wJF9NhIT...', notes_sensitive: 0 }
    ]

Restoring that node from the trash afterwards shows raw ciphertext with no flag and no way to recover the plaintext.

**Fix:** Decrypt notes directly rather than going through `updateNode`'s live-node-only toggle path: read `id, notes` in the SELECT, call `session.decryptForRead(notes)` (or `decryptNote`) per row, and write the plaintext back with an explicit `UPDATE nodes SET notes = ?, notes_sensitive = 0 WHERE id = ?`. Add a regression test covering a trashed sensitive note across disable.

#### 3. Hidden quick-capture window blocks window-all-closed and defeats the macOS activate handler

`electron/main.js`:446 - correctness

quickCapture.js builds its capture window once and only ever calls `win.hide()` (quickCapture.js:34, :62) — it is never closed or destroyed. A hidden BrowserWindow is still an open window, so it stays in `BrowserWindow.getAllWindows()`.

Two consequences after the user presses the capture hotkey even once:

1. `app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })` never fires on Windows/Linux, because the hidden capture window is still open after the main window closes. The app becomes an invisible zombie process with no window and no way to quit short of the task manager.
2. `app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })` (main.js:434) sees length 1, so on macOS clicking the dock icon after closing the main window never recreates it.

This is also why `setupSaveOnClose(mainWindow)` closing the last visible window does not lead to quit on Linux/Windows, contradicting the comment at main.js:83-87 which assumes `window-all-closed` calls `app.quit()`.

**Fix:** Exclude the capture window from both checks — e.g. have createQuickCapture expose `getWindow()` / an `isCaptureWindow(win)` predicate and filter it out in `window-all-closed` and `activate`, or destroy the capture window when the last non-capture window closes.

#### 4. Command serialization writes decrypted sensitive-note plaintext to sessionStorage

`src/commands/ApplyNotesEditCommand.js`:25 - correctness

`toJSON()` returns `{ ..., oldNotes: this.oldNotes, newNotes: this.newNotes }`. `useUndoRedo` (src/composables/useUndoRedo.ts:15-23) persists every pushed command with `JSON.stringify(serializeStack(stack))` into `sessionStorage['graphcore-undoStack']`, and re-hydrates it on reload. The same applies to `EditCommand.toJSON()` (oldValues/newValues always contain `notes`, because `pickNodeFields` copies all 28 NODE_UPDATE_FIELDS) and `DeleteCommand.toJSON()` (full `nodeData` including `notes`).

Notes marked `notes_sensitive` are stored as `SNENC1:` ciphertext in the database (electron/database/index.js `_encodeNotesForWrite`) and are decrypted only into memory for the length of an unlocked session; docs/architecture/sensitive-notes.md states relock "clear[s] the sensitive-notes key from memory" and lists only in-memory plaintext as an honest limit. Editing or AI-rewriting a sensitive note therefore deposits its decrypted content in the renderer's sessionStorage backing store on disk, where it survives the idle relock and any later `sensitiveLock()`.

**Fix:** Either exclude sensitive payloads from the persisted stack (e.g. have commands expose a `toJSON({ persist: true })` that omits note bodies and mark such commands non-restorable), or drop persistence for commands touching notes of a node with `notes_sensitive`. Whatever is chosen needs a test asserting no plaintext of a sensitive note reaches sessionStorage, and the honest-limits section of the doc updated.

#### 5. MainToolbar drops the currentWorkspace prop, so JSON/CSV import always targets the 'work' workspace

`src/components/MainToolbar.vue`:109 - correctness

App.vue passes `:current-workspace="currentWorkspace"` (src/App.vue:892). MainToolbar declares no such prop and does not forward it to SettingsPanel, which declares `currentWorkspace: { type: String, default: 'work' }` (SettingsPanel.vue:44) and passes it down to DataSettings (SettingsPanel.vue:192). DataSettings uses it as the import target: `api.importJSON(data, null, props.currentWorkspace)` / `api.importCSV(text, null, props.currentWorkspace)` (DataSettings.vue:72, :74). With the prop dropped, importing while any non-'work' workspace is active silently writes every imported node into the 'work' workspace.

**Fix:** Declare `currentWorkspace: { type: String, default: 'work' }` on MainToolbar and pass `:current-workspace="currentWorkspace"` through to <SettingsPanel>. Cover with an integration test that imports while a second workspace is selected and asserts the nodes land in it.

#### 6. deleteColumn drops a column definition without reindexing cells, shifting every column's data left

`src/composables/useColumnOperations.js`:68 - correctness

deleteColumn filters the column out of `column_definitions` and emits `structure-change`, and nothing anywhere touches the cells. DetailPanel.vue:602 just calls `updateTable(nodeId, { column_definitions })` and reloads; `electron/database/tables.js:70` only does `updates.push('column_definitions = ?')`. Cells are addressed positionally: NodeSpreadsheet.vue:116 builds each row with `cols.forEach((col, c) => row[col.name] = cellData.find(cl => cl.col_index === c)...)`. So after deleting the column at index 1 of [A,B,C,D], the remaining [A,C,D] render cell col_index 0,1,2 - column C now shows B's old data, D shows C's, and the cells that belonged to D are orphaned rows in the DB. The same absence of reindexing means re-adding a column resurrects stale values.

**Fix:** Delete the removed column's cells and decrement col_index for all cells to the right in the same transaction as the column_definitions update (a dedicated `deleteTableColumn(nodeId, colIndex)` DB op), rather than emitting a bare column_definitions replacement.

## Medium (91)

#### 7. restoreBackup and reload replace ctx.db without closing the old handle or re-running migrations

`electron/database/backup.js`:67 - correctness

Both `restoreBackup` (line 67) and `reload` (line 83) do `ctx.db = new ctx.SQL.Database(buffer)` and drop the previous instance without calling `.close()`. sql.js allocates the database inside the WASM heap, so each restore/reload leaks the full previous database. Separately, neither re-runs `createTables`/`runMigrations` afterwards, so restoring a backup taken before a column migration (exactly the backups `runColumnMigrations` writes with the `-pre-workspace-migration` suffix, migrations.js:38) leaves the process running against a schema that lacks `workspace_id`, `tags`, `collapsed` and the `graph_*` columns — every subsequent query referencing them throws.

**Fix:** Call `ctx.db.close()` before reassigning, and run the schema/migration pass on the newly loaded database (extract `_initSchema` into something callable from backup.js, or expose `ctx._initSchema()`). Add a test that restores a pre-workspace_id backup and then calls `getNodes({workspace_id: 'work'})`.

#### 8. File header is not authenticated: a key slot can be stripped undetected

`electron/database/encryption.js`:90 - correctness

function encryptDatabase(plaintext, databaseKey, slots = []) {
const header = [Buffer.from(ENCRYPTION_MAGIC), Buffer.from([FORMAT_VERSION, slots.length])]
...
const cipher = crypto.createCipheriv('aes-256-gcm', databaseKey, nonce)

No `cipher.setAAD(header)` is called, and `decryptDatabase` correspondingly does not `setAuthTag`-bind the header. The slot table (magic, version, slot count, per-slot type/length/blob) therefore sits outside GCM's integrity guarantee. An attacker with write access to `graph.db` can cleanly remove a whole slot — delete its `type|length|blob` bytes and decrement the count byte — and the file still decrypts successfully, because `payloadOffset` recomputes from the modified header. Removing the type-2 password slot silently destroys the documented recovery path ('This slot is the answer to keychain loss'), and `unlockWithPassword` then reports the honest-but-too-late `'This file has no password slot'`.

docs/architecture/encryption.md claims more than the code delivers: 'GCM authenticates as well as encrypts: a tampered or corrupted file, and a wrong password, fail loudly at unwrap or decrypt rather than producing garbage data.'

**Fix:** Pass the concatenated header as AAD on both sides (`cipher.setAAD(headerBytes)` in `encryptDatabase`, `decipher.setAAD(file.subarray(0, offset))` in `decryptDatabase`). This changes the on-disk contract, so bump `FORMAT_VERSION` to 2 and keep a v1 read path, or accept a one-time re-save. Update the doc's file-format section either way.

#### 9. _save overwrites the whole database file in place, so a crash mid-write truncates it

`electron/database/index.js`:262 - correctness

`fs.writeFileSync(this.dbPath, this._serialize(Buffer.from(data)))` replaces the entire database file on every `_run`. `writeFileSync` truncates before writing, so an interruption between truncate and completion leaves a partial file. `_init`'s corrupt-file handling (lines 66-70) then preserves the wreckage and boots an empty database — recoverable, but the user's data is gone from the live file. Given `_save` fires on every single write, the exposure is continuous.

**Fix:** Write to `${dbPath}.tmp` and `fs.renameSync` onto the target — rename is atomic within a filesystem. This is a small change fully contained in `_save` (and `backup`).

#### 10. linkNodes does not check the reverse row, so a bidirectional link can be stored twice

`electron/database/links.js`:45 - correctness

The module docstring states a link is "stored as a single directed row (source_id -> target_id) ... treated as bidirectional on read and removal", and `unlinkNodes` and `getLinkedNodes` do honour both directions. But `linkNodes` inserts blindly and relies only on `UNIQUE(source_id, target_id)`, which does not cover the swapped pair. Verified:

```
link1 { success: true }   // linkNodes(x, y)
link2 { success: true }   // linkNodes(y, x)
allLinks [ {source_id:4,target_id:5}, {source_id:5,target_id:4} ]
```

Visible symptom: `getAllLinks` feeds `addLinkEdges` (useGraphElements.js:299), which keys edges by `link-${sourceId}-${targetId}`, so the pair renders as two separate edges in the graph. `unlinkNodes` then removes both at once, so the counts also disagree with what the user clicked.

**Fix:** Make the insert direction-agnostic - check for an existing row in either direction before inserting (or normalise so the lower id is always `source_id`) - and return `{ success: true }` idempotently when the link already exists.

#### 11. seedDefaultWorkspaces resurrects the 'work' and 'private' workspaces after the user deletes them

`electron/database/migrations.js`:73 - correctness

`seedDefaultWorkspaces` re-inserts `work` and `private` with `INSERT OR IGNORE` on every startup, unconditionally. Deleting a workspace is a supported UI action (`WorkspaceSelector.vue:173` -> `useWorkspace.deleteCurrentWorkspace` -> `api.deleteWorkspace`), and the only guard is that the workspace must have no root nodes. So a user who deletes `Work` sees it reappear at the next launch, and combined with `migrateUnassignedNodesToWork` any of its non-root/trashed nodes are pulled back into it. Seeding is a first-run concern, not a per-boot invariant.

**Fix:** Seed only when the `workspaces` table is empty (or gate it behind the migration ledger from the version-tracking fix), rather than re-asserting the two ids on every startup.

#### 12. No migration version tracking: every data migration re-runs on every startup and rewrites user data

`electron/database/migrations.js`:97 - design

`runMigrations` unconditionally calls all seven functions in `runDataMigrations` on each boot; there is no `schema_version` table, no applied-migrations ledger, and no `settings` marker. Each one re-scans `nodes` and, where its predicate matches, rewrites rows. Because the predicates describe a _state_ rather than a _version_, they undo deliberate user actions on the next launch:

- `migrateShowLinksDefault` (line 112) runs `UPDATE nodes SET show_links = 1 WHERE show_links IS NULL` with no guard at all, so any node whose `show_links` was reset to NULL flips back to 1.
- `migrateUnassignedNodesToWork` (line 119) moves any node with `workspace_id IS NULL` into `'work'`. `deleteWorkspace` (workspaces.js:76) deliberately sets `workspace_id = NULL` on the deleted workspace's nodes, so the orphaning is silently reversed at the next restart.
- `migrateTasksProjectsStartDate` (line 136) re-populates `start_date` for any task/project whose start date the user cleared.
- `migrateOrganizationTextToLinks` (line 196) NULLs the `organization` column of every person node that has one.
  The docs (docs/architecture/database.md:228) describe these as running "conditionally", which understates the behaviour. There is also zero test coverage: `grep -rn 'runMigrations|fixRootNodePaths|migrateUnassigned' src/__tests__ e2e` returns nothing.

**Fix:** Add a `schema_migrations` table (or a `settings` key per migration id) written inside the same `_batch` as the migration body, and skip any migration already recorded. Backfill the ledger for existing installs by marking all current migrations as applied when the database already has the post-migration shape. Add integration tests that run each migration twice and assert the second run is a no-op.

#### 13. moveNode has no ancestor guard: moving a node under its own descendant recurses forever

`electron/database/nodes.js`:310 - correctness

`moveNode` sets `parent_id` to whatever it is given and then calls `updateDescendantPaths(id)`. If `newParentId` is a descendant of `id`, the parent chain becomes cyclic and `updateDescendantPaths` walks A -> ... -> C -> A -> ... forever, each pass writing longer path strings.

Verified against a real DB (A > B > C, then `db.moveNode(A.id, C.id)`):

```
moveNode THREW: RangeError Maximum call stack size exceeded
```

The `_batch` wrapper rolls the transaction back so the file is not corrupted, but the IPC call rejects with a stack-overflow RangeError instead of a meaningful error, and the same hole exists in `updateNode` (reparent branch, line 256) and `reorderNode` (cross-parent branch, line 375).

This is reachable from the UI: `useTableDrag.js:200` and `useCardDrag.js:95` route an 'inside' drop to `onMove` -> `useNodeOperations.moveNode` (line 339), which calls `api.moveNode` with no ancestor check. Only `useGraphEvents.js:614` guards; the tree and cards drag paths do not. The invariant belongs in the layer that owns path/depth, not in each drag composable.

**Fix:** Before writing, reject the move when `newParentId` is the node itself or lies in the node's subtree - e.g. read the target row with `getNodeRow(newParentId)` and check whether its `path` contains `id` as a segment - and throw a named error (or return null) instead of recursing. Add the same check to `updateNode`'s reparent branch and `reorderNode`'s cross-parent branch, and cover all three with tests.

#### 14. decryptForRead has no error path; a stale-key note breaks every list query

`electron/database/sensitiveSession.js`:106 - correctness

function decryptForRead(value) {
if (!isEncryptedNote(value)) return value
if (!isUnlocked()) return value
touch()
return decryptNote(value, key)
}

`decryptNote` throws (`'Wrong key or corrupted sensitive note'`) whenever the ciphertext was produced under a different sensitive-notes key. This is reachable: after the disable bug above strands a `SNENC1:` note, re-enabling sensitive notes generates a _fresh_ key, and the stranded note now fails to decrypt. `decryptForRead` is called from `Database._rowToNode`, which every node-returning query funnels through, so a single undecryptable row makes `getNodes`, `getChildren`, `getTree` and `search` throw for the whole result set — the tree simply fails to load, with the IPC promise rejecting rather than returning an error the UI understands.

A session-level guard is also the only sensible place for it: `_rowToNode` cannot distinguish 'wrong key' from 'corrupt', and the module docstring already promises that a locked value 'is returned unchanged (as the ciphertext marker) ... so the renderer shows a locked placeholder'.

**Fix:** Wrap the `decryptNote` call in try/catch and return `value` (the marker) on failure, matching the locked-session behaviour the docstring already describes. The renderer's `isLockedNote` then renders the locked placeholder instead of the whole query exploding.

#### 15. setSettings performs one full-database serialize-and-write per key instead of using _batch

`electron/database/settings.js`:58 - design

`setSettings` loops over the entries calling `this.setSetting(key, value)`, each of which calls `ctx._run` -> `ctx._save()` -> `db.export()` + `fs.writeFileSync` of the entire database file. `index.js:_batch` (line 288) exists precisely to collapse this into a single write and to make the group atomic, and export.js:247/368, nodes.js and tree.js all use it. The real caller is the localStorage->database settings migration (`src/composables/useSettings.ts:375`), which passes every `graphcore-`-prefixed key at once — dozens of full-file writes on first launch, and a partial migration if any one of them throws.

**Fix:** Wrap the loop: `return ctx._batch(() => { ... })`. Note `_save()` also re-runs the expensive `db.export()`, so the win is proportional to database size.

#### 16. setCells uses INSERT OR REPLACE, so a partial cell update silently erases the columns it omits

`electron/database/tables.js`:142 - correctness

The JSDoc calls `setCells` an "upsert", but `INSERT OR REPLACE INTO node_table_cells (...)` deletes the conflicting row and inserts a fresh one, so every column the caller did not supply is reset. `useNodeTable.saveCell()` (src/composables/useNodeTable.js:117-130) builds `cellData` with only `row_index`, `col_index` and one of `value`/`formula` — no `style`. Line 139 then computes `styleJson = cell.style ? ... : null`, so the stored `style` becomes NULL. Concretely: bold a cell (`saveCellStyle` persists `{bold:true}`), then type a new value into it — the bold is gone. That `saveCellStyle` (line 154-172) goes out of its way to re-attach the existing `value` and `formula` shows the intended semantics are partial-update, and that `saveCell` simply forgot the mirror case.

**Fix:** Make setCells a real upsert: `INSERT INTO node_table_cells (...) VALUES (...) ON CONFLICT(table_id, row_index, col_index) DO UPDATE SET ...`, updating only the keys present in the incoming cell object (use `'style' in cell` rather than truthiness). Wrap the loop in `ctx._batch(...)` so a mid-loop failure rolls back instead of leaving half the cells written.

#### 17. getOrCreateTagNode writes ISO-8601 timestamps into a column every other write fills with SQLite CURRENT_TIMESTAMP

`electron/database/tags.js`:61 - correctness

`getOrCreateTagNode` builds its own INSERT and passes `new Date().toISOString()` for `created_at`/`updated_at`, while `createNode` and every UPDATE in the module group rely on the column default / `CURRENT_TIMESTAMP`. The two formats differ:

```
normal created_at= "2026-08-26 10:26:19"
tag    created_at= "2026-08-26T10:26:19.253Z"
```

These are TEXT columns compared lexicographically. `'T'` (0x54) sorts after `' '` (0x20), so every tag node sorts ahead of every other node created the same day. Verified:

```
db.getRecent(5) -> [ 'mytag', 'Normal' ]   // 'Normal' was created first
```

Every `ORDER BY updated_at DESC` query in search.js (`getRecent`, `getFavorites`, `getNodesByTag`) and tags.js (`getNodesLinkedToTag`) is affected, as is any `updated_at > <cutoff>` comparison downstream.

**Fix:** Drop the hand-rolled INSERT and create the tag through `ctx.createNode({ type: 'tag', title: trimmedName, workspace_id: workspaceId })`, or at minimum let the schema defaults supply `created_at`/`updated_at` so the column holds one format.

#### 18. getNodesLinkedToTag and searchTagNodes are plumbed through IPC but no UI calls them

`electron/database/tags.js`:83 - dead-code

Both are bound in index.js (161-164), handled on `DB_GET_NODES_LINKED_TO_TAG` / `DB_SEARCH_TAG_NODES` (electron/ipc/database.js:168,170), bridged in preload.js:72-73, and implemented in `src/services/api.ts:852,856`. Grepping every `.vue`, `.ts` and `.js` under `src/` and `e2e/` outside the api definition files returns zero call sites for either name; `TagInput.vue` uses only `getTagNodes` and `getOrCreateTagNode`, and `useDataLoading.ts` only `getTagNodes`.

`search.js` `getAllTags` (line 106) is dead in practice for the same reason: its only consumer is the fallback branch at `useDataLoading.ts:251`, guarded by `if (api.getTagNodes)` - and both api implementations define `getTagNodes` unconditionally (`src/services/api.ts:494` and `:845`), so the `else` can never run. The `?` optionality on `getTagNodes` in `src/types/api.ts:246` is what makes the branch look reachable.

**Fix:** Delete `getNodesLinkedToTag` and `searchTagNodes` plus their channels/bridge/api entries, or expose them (e.g. a tag detail view and a tag autocomplete). Remove `getAllTags` and the unreachable legacy fallback in `useDataLoading.ts`, and drop the `?` from `getTagNodes` in `types/api.ts` so the type reflects reality.

#### 19. restoreNode restores a node under a still-deleted parent, producing an invisible orphan

`electron/database/tree.js`:124 - correctness

```js
restoreNode(id) {
  ctx._run('UPDATE nodes SET deleted_at = NULL WHERE id = ?', [id])
  return ctx.getNode(id)
}
```

No check that the parent is live, and no path/depth recomputation. When a child and then its parent are trashed, `deleteNode`'s reparent step skips the child (`AND deleted_at IS NULL`), so the child keeps pointing at the trashed parent. Restoring the child produces a live node whose parent is deleted - it appears in no root list and under no visible parent. Verified:

```
restored child parent_id 6 path "6" orphans [ 'CH' ]
```

It is only recoverable through the separate Lost & Found screen (`getOrphanedNodes` / `reparentToRoot`), which the user has no reason to visit after a restore. `emptyTrash` (line 133) already carries exactly this reasoning for its own survivors; `restoreNode` does not.

**Fix:** Inside a `ctx._batch`, clear `deleted_at`, and if the node's `parent_id` names a row that is missing or still soft-deleted, either restore the ancestor chain or null the `parent_id`; then call `ctx._updateSubtreePath(id)` so path/depth match the restored position.

#### 20. The agent loop is forked between main process and renderer, and the two have diverged

`electron/ipc/agent.js` - design

`electron/ipc/agent.js` and `src/services/agentService.js` are near-identical reimplementations of the same feature: both define `TOOL_GROUPS` with the same two entries, `getEnabledTools`, a tool executor (`executeAgentTool` / `executeTool`), `parseToolArgs`, `processToolCalls`, `runAgentLoop`, and the same 'No agent tools are enabled...' string. `api.ts` picks between them at runtime — line 683 dynamically imports `./agentService.js` for the web build, line 941 routes to the Electron IPC.

They have already diverged in ways that matter:

- Main has the `isGarbageResponse` / `fallbackResearch` path for models that cannot do tool calling; the renderer copy has none, so the web build silently produces garbage for those models.
- Max-iterations handling differs: main sends one more `chatRequest`; the renderer returns `null` and calls a separate `generateFinalSummary` that flattens the transcript into a `generate` prompt.
- `parseToolArgs` has different signatures in the two files (`parseToolArgs(toolCall)` vs `parseToolArgs(args)`) despite the same name.

Only the shared prompt/tool data was factored out (`shared/agentConfig.json`); the control flow was copied. Per the project's own rule, a fork means every fix has to land twice, and here it already hasn't.

**Fix:** Extract the loop into one transport-agnostic module parameterised by a `chat({messages, tools, ...}) => {content, tool_calls}` function and a tool-executor function, and have both `electron/ipc/agent.js` and `src/services/agentService.js` supply their own adapters. Add a test asserting the two entry points produce the same behaviour for the garbage-response and max-iterations cases.

#### 21. DB_GET_ALL_SETTINGS hands the wrapped sensitive-notes key to the renderer; DB_SET/DELETE_SETTING let it destroy it

`electron/ipc/database.js`:198 - design

`electron/ipc/sensitiveNotes.js` persists the scrypt-wrapped sensitive-notes key as a plain settings row (`SETTINGS_KEY = 'sensitiveNotesWrappedKey'`, stored base64 via `db.setSetting`). `DB_GET_ALL_SETTINGS` is an unfiltered `db.getAllSettings()`, and `src/composables/useSettings.ts:58` caches the entire result in the renderer:

    settingsCache = await getElectronAPI()!.getAllSettings()

This contradicts the stated design premise. `electron/database/sensitiveSession.js`'s header says 'The renderer never receives the key', and the whole point of the second layer is that a keychain-only database unlock must not expose sensitive content. Shipping the wrapped blob into renderer memory hands any renderer-side code execution (the app renders user markdown) the exact material needed for an offline scrypt attack on the recovery password.

Symmetrically, `DB_SET_SETTING` / `DB_DELETE_SETTING` / `DB_SET_SETTINGS` are unguarded pass-throughs, so the renderer can overwrite or delete `sensitiveNotesWrappedKey` and permanently destroy the ability to decrypt every sensitive note, with no confirmation anywhere.

**Fix:** Keep a small reserved-key denylist in the settings handlers: strip `sensitiveNotesWrappedKey` from `DB_GET_ALL_SETTINGS` / `DB_GET_SETTING` results, and reject writes and deletes to it from `DB_SET_SETTING`, `DB_SET_SETTINGS` and `DB_DELETE_SETTING`. Export the key name from `electron/ipc/sensitiveNotes.js` (it already exports `SENSITIVE_SETTINGS_KEY`) rather than re-literalling it.

#### 22. No request timeout on either transport, so a hung LLM call wedges the IPC promise forever

`electron/ipc/httpClient.js`:131 - correctness

Neither `requestWithNode` nor `requestWithNet` sets a timeout or an abort path. Both return a Promise that settles only on `response.on('end')` or `request.on('error')`. A server that accepts the TCP connection and then stalls — a common failure mode for a local `ollama serve` mid-model-load, or an OpenAI-compatible proxy behind a dead upstream — leaves the promise pending indefinitely. That pending promise is the return value of `ipcMain.handle(OLLAMA_GENERATE ...)` / `OPENAI_GENERATE` / `AGENT_RESEARCH`, so the renderer's `await` never resolves and the UI spinner never clears with no way to cancel. I grepped `src/services/`, `electron/ipc/` and `electron/wikipedia.js`: there is no timeout, `AbortController` or `setTimeout` anywhere on this path.

The agent loop compounds it — `runAgentLoop` issues up to `MAX_AGENT_ITERATIONS` sequential `chatRequest` calls, any one of which can hang the whole research action.

**Fix:** Add a configurable timeout to `HttpClient` (default in the tens of seconds, longer for generate calls): `request.setTimeout(ms, () => { request.destroy(); reject(new Error(...)) })` on the Node path and the equivalent guard timer plus `request.abort()` on the `net` path. Cover it in src/**tests**/httpClient.test.js alongside the existing SSL-policy tests.

#### 23. SENSITIVE_ENABLE never validates the password it wraps the key under

`electron/ipc/sensitiveNotes.js`:43 - correctness

The handler calls `session.enable(password)` with whatever string arrives, and `createSensitiveSession.enable` does no validation either — it just calls `wrapSensitiveKey(key, password)`. Two consequences:

1. There is no check that the password is the _database recovery password_, even though the UI input is labelled `placeholder="Recovery password"`, the hint says 'Revealing them takes the recovery password', and docs/architecture/sensitive-notes.md states the feature 'reuses the recovery password'. A typo silently wraps the sensitive-notes key under a password the user does not know, and there is no confirm field. The notes then encrypt fine and become permanently unreadable — the failure only surfaces later, at the first unlock attempt.
2. There is no empty/blank rejection, unlike the sibling `keyManager.enable`, which starts with `if (!password || !password.trim()) throw new Error('A recovery password is required...')`. The UI's `:disabled="busy || !password"` is the only guard, and IPC is directly reachable.

The handler already has the pieces available in principle — main.js constructs the `keyManager` and knows `dbPath` — but the sensitive-notes ctx is not given either.

**Fix:** Add `verifyRecoveryPassword` (or `keyManager` + `dbPath`) to the sensitive-notes ctx in electron/main.js, and in SENSITIVE_ENABLE reject a blank password and confirm the supplied password unwraps the database password slot before generating and wrapping the sensitive-notes key.

#### 24. Disable decrypt loop is not wrapped in db._batch: non-atomic and N full-file writes

`electron/ipc/sensitiveNotes.js`:82 - correctness

for (const { id } of encrypted) {
db.updateNode(id, { notes_sensitive: false })
}

Each `updateNode` bottoms out in `ctx._run`, which calls `this._save()` — a full `sql.js` `db.export()`, AES-256-GCM re-encryption of the entire database, and a whole-file write. For a user with N sensitive notes that is N complete database rewrites. `Database` already exposes `_batch(fn)`, which runs the body in one SQL transaction and defers to a single save (`electron/database/index.js:288`), and `deleteNode`/`updateNode`'s reparent branch already use it.

Beyond cost, the loop is not atomic: if any `updateNode` throws partway the catch returns `{success:false}` with some notes decrypted and some not, and the caller has no way to know how far it got.

**Fix:** Wrap the whole decrypt loop plus `db.deleteSetting(SETTINGS_KEY)` in `db._batch(() => { ... })` so it commits or rolls back as one transaction and writes the file once.

#### 25. Comment claims the display-masking flag survives disable; the code clears it

`electron/ipc/sensitiveNotes.js`:83 - docstring

// Decrypt every sensitive note back to plaintext through the tested
// toggle-off path, then drop the key. The display-masking flag stays.
const encrypted = db._query("SELECT id FROM nodes WHERE notes LIKE 'SNENC1:%'")
for (const { id } of encrypted) {
db.updateNode(id, { notes_sensitive: false })
}

`notes_sensitive` IS the display-masking flag (docs/architecture/sensitive-notes.md: 'The `notes_sensitive` flag by itself is display masking'), and the loop explicitly sets it to false. My probe run confirmed `notes_sensitive: 0` on every touched row after the loop. So disabling the encryption layer also silently un-marks every note the user had marked sensitive — the opposite of what the comment promises, and a behaviour the docs never describe.

**Fix:** Decide the intended behaviour and make code, comment and docs agree. If the flag is meant to survive, decrypt `notes` without touching `notes_sensitive`; if it is meant to be cleared, fix the comment and document the disable flow in docs/architecture/sensitive-notes.md.

#### 26. CAPTURE_SET_CONFIG persists an accelerator before validating it, and drops the working hotkey on failure

`electron/main.js`:352 - correctness

```js
ipcMain.handle(CAPTURE_SET_CONFIG, (_event, { enabled, accelerator }) => {
  db.setSetting('quickCaptureEnabled', enabled ? 'true' : 'false')
  if (accelerator) db.setSetting('quickCaptureAccelerator', accelerator)
  const ok = applyCaptureRegistration()
  return { success: ok || !enabled, registered: ok }
})
```

The new accelerator is written to settings before anything checks whether it can be registered. `applyCaptureRegistration` → `quickCapture.register()` first calls `unregister()` (quickCapture.js:67), releasing the accelerator that was working, and only then tries the new one. If the new accelerator is invalid or already owned by another app, `register()` returns false (or throws and is swallowed, quickCapture.js:73-76).

Result of one bad entry in the settings field: the previously working hotkey is gone, the invalid string is persisted, and every subsequent app boot calls `applyCaptureRegistration()` with the bad value and silently fails — quick capture reports `enabled: true` in `CAPTURE_GET_CONFIG` while no hotkey exists.

**Fix:** Try the registration first and only persist `quickCaptureAccelerator` when it succeeds; on failure re-register the previous accelerator and return `{ success: false, error: '...' }` so the UI can say which accelerator was rejected.

#### 27. Two-phase quit save covers only the main window; detached windows lose unsaved edits

`electron/main.js`:461 - correctness

`before-quit` sends APP_BEFORE_QUIT to `mainWindow` only (main.js:461), and `setupSaveOnClose` is applied only to `mainWindow` (main.js:132). Detached windows created by `createDetachedWindow` (electron/ipc/window.js:82) get `setupExternalLinkHandling` but no save hook.

A detached window mounts `DetachedView` (src/main.js:54-63), which renders `DetailPanel` — the same component whose debounced/pending edits `useAppLifecycle`'s onBeforeQuit handler exists to flush in the main window. The detached renderer never receives APP_BEFORE_QUIT (it isn't sent there) and `DetachedView` never registers `onBeforeQuit`, so pending edits in a detached node window are silently discarded on quit and on closing that window.

Related hardening gap: the `APP_QUIT_SAVE_DONE` handler (main.js:427) is not scoped to a sender, so any renderer that acks would resolve the main window's pending save early.

**Fix:** Run the handshake against every window that hosts an editor: call `setupSaveOnClose` in `createDetachedWindow`, fan APP_BEFORE_QUIT out to all such windows in `before-quit` and wait for all acks, and key `pendingSaveRequest` by `event.sender` so an ack only satisfies the window it came from.

#### 28. onNotFound's fallback load to root is swallowed by useNavigation's own re-entrancy guard

`src/App.vue`:427 - correctness

App.vue's `onNotFound` handler calls back into the composable that is currently executing:

```js
onNotFound: async () => {
  currentContainerId.value = null
  localStorage.removeItem(STORAGE_KEYS.CONTAINER_ID)
  await navigation.loadChildren(null)
},
```

In `src/composables/useNavigation.ts`, `loadChildren` sets the module-scoped `isLoadingChildren = true` (line 213) and only clears it in its `finally` block (line 303). `onNotFound` is invoked from inside the `catch` block (line 292), i.e. _before_ that `finally` runs. The nested `loadChildren(null)` therefore hits the guard at line 204-206 (`if (isLoadingChildren) return`) and returns immediately without loading anything. The `await` resolves instantly and gives the false impression the recovery happened.

Net effect: the 404 recovery path is a no-op. `currentContainerId` is nulled, the persisted container id is dropped, but `children`/`breadcrumbs`/`currentContainer` are never refreshed, so the view keeps whatever stale (or empty) content it had and the user is stranded with no error surfaced (`handleError` for that path is called with `silent: true`).

**Fix:** Do not re-enter `loadChildren` synchronously from inside its own catch. Either defer the call (`await nextTick()` / `queueMicrotask` before `navigation.loadChildren(null)`), or better, have `useNavigation` clear `isLoadingChildren` before invoking the `onNotFound`/`onError` callbacks so the recovery load is not blocked by the guard. Add a regression test that makes the first load reject with a 404 and asserts root children are actually loaded.

#### 29. Undo of a completion leaves the auto-set end_date behind

`src/commands/CompleteCommand.js`:18 - correctness

`useNodeOperations.toggleComplete` (src/composables/useNodeOperations.ts:389-395) writes two fields when completing: `{ completed: true, end_date: <today> }` if the node had no `end_date`. `CompleteCommand` records only `oldCompleted`/`newCompleted`, and `undo()` writes back `{ completed: this.oldCompleted }` only. After marking a task done and pressing undo, the node is uncompleted but keeps an `end_date`, which timeline/date rendering and later exports then show as a completion date for an open task. Redo is asymmetric in the other direction: `execute()` never re-applies the `end_date` the original action set.

**Fix:** Capture `oldEndDate`/`newEndDate` in the command (as `EditCommand` does with full snapshots) and restore both fields in `undo()`/`execute()`; add a test asserting `end_date` returns to its pre-completion value.

#### 30. Redo of a create mints a new node id, silently orphaning later commands in the redo stack

`src/commands/CreateCommand.js`:21 - correctness

`execute()` re-creates the node and rebinds `this.nodeId = created.id`, but every other command already on the redo stack still holds the old id. Sequence: create node (id 5) -> edit its title (EditCommand{nodeId:5}) -> Ctrl+Z twice (edit undone, node 5 hard-deleted) -> Ctrl+Shift+Z twice. The create redo yields id 9; the edit redo calls `api.updateNode(5, ...)`, whose SQL matches zero rows and whose `getNode(5)` returns null (electron/database/nodes.js:220-260 does not error on a missing id). The edit is silently lost, and the node position saved under the old id by `saveNodePosition` (App.vue:277) is likewise stranded.

**Fix:** Have the undo stack remap ids after a create redo (e.g. `useUndoRedo` broadcasting an `idChanged(oldId, newId)` that commands apply to their stored ids), or make `undo()` soft-delete plus `restoreNode` so the id is stable. At minimum, add a regression test for undo-past-create-then-redo.

#### 31. Redo deletes parents before children, flattening the trashed subtree's parent_id

`src/commands/DeleteMultipleCommand.js`:12 - correctness

`execute()` iterates `this.nodes` in stored order. Both producers build that array parents-first (`useNodeOperations.ts:265` `[node, ...descendants]`, and `:296-316` roots then descendants), while the original delete deliberately runs deepest-first (`:268` `[...descendants].reverse()`, `:319` sort by descending depth) with the comment "children first to maintain integrity".

`db.deleteNode` reparents live children up to the deleted node's parent (`UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL`). Deleting deepest-first never triggers that (children are already soft-deleted); deleting parents-first does. So a redo of a subtree delete leaves every trashed descendant pointing at the grandparent instead of its real parent. Undo repairs it via the recorded `parent_id`, but restoring those rows from the Trash view instead (useDataLoading.ts:277 -> `api.restoreNode`) then reattaches them to the wrong parent.

**Fix:** Sort by descending `depth` inside `execute()` exactly as `deleteMultipleNodes` does (or have both call one shared helper), and add a test that redo leaves each trashed node's `parent_id` unchanged.

#### 32. AppSidebar forks useSidebar's section-collapse state instead of consuming it

`src/components/AppSidebar.vue`:39 - design

AppSidebar re-implements collapse state locally:

```js
const treeCollapsed = ref(localStorage.getItem('sidebar-tree-collapsed') === 'true')
const favoritesCollapsed = ref(localStorage.getItem('sidebar-favorites-collapsed') === 'true')
const tagsCollapsed = ref(localStorage.getItem('sidebar-tags-collapsed') === 'true')
watch(treeCollapsed, val => localStorage.setItem('sidebar-tree-collapsed', String(val)))
```

useSidebar.ts already owns exactly this: the same three localStorage keys (useSidebar.ts:50-53), the same refs (`treeCollapsed`, `favoritesCollapsed`, `recentCollapsed`, `tagsCollapsed`, lines 146-149), the same persistence watchers (lines 152-170), plus `toggleTreeCollapse` / `toggleFavoritesCollapse` / `toggleRecentCollapse` / `toggleTagsCollapse` (lines 224-250) and documented interface entries (lines 20-45). App.vue's `useSidebar(...)` destructure (lines 134-142) takes only `hovered`, `expandedIds`, `visible`, `onEnter`, `onLeave`, `toggleExpand`, `expandToPath` — none of the collapse API. Grepping src/ and e2e/ for `toggleTreeCollapse|toggleFavoritesCollapse|toggleRecentCollapse|toggleTagsCollapse|recentCollapsed` returns hits only inside useSidebar.ts and src/**tests**/useSidebar.test.js. So roughly 60 lines of composable code plus its documented public interface are dead, kept green only by their own unit test, while the component duplicates the logic. `recentCollapsed` / `toggleRecentCollapse` are doubly dead: AppSidebar has no Recent section at all. This is precisely the fork the project rules forbid — a fix to the persistence logic would now have to land twice.

**Fix:** Delete the local refs and watchers from AppSidebar; pass the collapse refs (or toggle callbacks) down from App.vue's `useSidebar()` instance as props/events, or make AppSidebar call `useSidebar()` itself. Remove `recentCollapsed`/`toggleRecentCollapse` and their tests since no Recent section exists.

#### 33. Quick-capture save swallows failures into an unhandled rejection with no user feedback

`src/components/CaptureView.vue`:22 - correctness

`save()` wraps the API call in `try { ... } finally { busy.value = false }` with no `catch`:

```js
try {
  await api.createNode({ type: 'note', title, parent_id: null, workspace_id: ... })
  text.value = ''
  hide()
} finally {
  busy.value = false
}
```

If `api.createNode` rejects (database locked, encrypted DB not unlocked, IPC error — all reachable states in this app), the rejection propagates out of the async handler bound to `@submit.prevent="save"`, becoming an unhandled promise rejection. The capture window stays open with the text intact, but nothing tells the user the note was not saved, and nothing is logged through the project's error channel. Every sibling view in this group that touches the API (PersonsView) routes failures through `useErrorHandler`; this one does not import it. The test file src/**tests**/captureView.test.js covers only success, empty submit and Escape — there is no red test for the failure path.

**Fix:** Add a `catch` that reports through `useErrorHandler` (or renders an inline error state in the capture window) and keeps the window open, and add a test asserting the window is not hidden and the text is retained when `createNode` rejects.

#### 34. select-multiple emits a bare node; the handler destructures an options object, so shift+click does nothing

`src/components/CardsView.vue`:95 - correctness

```js
} else if (e.shiftKey) {
  emit('select-multiple', node)
}
```

The payload is a plain Node. ViewRenderer forwards `$event` verbatim (line 182) to `App.vue:962 @select-multiple="handleMultiSelect"`, and `useSelection.ts:185` is `function handleMultiSelect({ node, nodes, nodeIds, add, range })`. Destructuring a Node yields `node === undefined`, so the `if (!node) return` guard on line 194 fires and the selection never changes. Every other emitter uses the wrapper shape: `TableView.vue:75` emits `{ node, ...opts }`, `useGraphEvents.js:217/291/428` emit `{ node, add: true }` / `{ nodes, nodeIds }`. Shift+click multi-select is silently inert in cards view.

**Fix:** Emit `{ node, range: true }` (and `{ node, add: true }` for the Cmd path if toggle-select is wanted), matching TableView and the graph.

#### 35. Date-only strings parsed as UTC then compared against local midnight (off-by-one day)

`src/components/CardsView.vue`:112 - correctness

`getDateCountdown` (112), `formatDueDate` (135), `getDueDateClass` (149) and `getDueDateStatus` (164) each do:

```js
const target = new Date(targetDate)
target.setHours(0, 0, 0, 0)
```

`node.due_date` / `start_date` / `end_date` are date-only strings (`YYYY-MM-DD`, written as `new Date().toISOString().split('T')[0]` in `useNodeOperations.ts:392`). `new Date('2026-08-26')` is parsed as UTC midnight; in any negative UTC offset that is 2026-08-25 locally, and `setHours(0,0,0,0)` then snaps it to the previous calendar day. A task due today shows as "1d overdue" and gets the `overdue` class.

`src/utils/formatting.js` already contains the correct shared implementation for exactly this (`parseDateLocal` line 24, with the comment "Date-only strings are parsed as local dates, not UTC midnight", and `daysFromToday` line 40). `config/tableFormatters.js` delegates to it; CardsView reimplements the arithmetic four times instead.

**Fix:** Replace all four helpers' arithmetic with `daysFromToday(node.due_date)` from `../utils/formatting.js`.

#### 36. Child-card notes swallow the click and emit startEdit into the void

`src/components/CardsView.vue`:481 - correctness

The child-card `<CardNotes>` is mounted with only `:notes`, `:sensitive` and `size`; no `:model-value`, no `:is-editing`, and no `@start-edit` / `@save` / `@cancel` listeners. But `CardNotes.vue:22` unconditionally binds

```html
@click.stop="!sensitive && $emit('startEdit')"
```

So clicking a child card's notes emits `startEdit` with no parent handler, and the `.stop` modifier prevents the click from reaching the child card's own `@click.stop="handleChildCardClick(...)"` (line 445). The result is a region of the child card where clicking selects nothing and edits nothing.

**Fix:** Either wire the child instance to the same edit handlers used by the top-level card (line 333), or add a prop such as `readonly` to CardNotes that suppresses both the emit and the `.stop`.

#### 37. DetailPanel affordances are inert in the detached window (detach unhandled, three no-op handlers)

`src/components/DetachedView.vue`:268 - correctness

DetailPanel declares a 'detach' emit and renders the detach button whenever `isElectron` is true (DetailPanel.vue:672-676) — which is true inside the detached window too. DetachedView binds no @detach handler at all, so that button does nothing. Three further events are bound to empty arrows: @toggle-fullscreen="() => {}", @toggle-pin="() => {}" and @open-link-search="() => {}". The pin button is therefore visible and dead, and the links section's "add link" control (DetailPanel.vue:945 `@add-link="emit('open-link-search')"`) silently does nothing in a detached window — a user-visible action that fails without any feedback.

**Fix:** Hide the affordances that cannot work in a detached window (pass a prop that suppresses the detach/pin/fullscreen buttons and the add-link control), or implement the handlers: reuse the link-search flow, and either ignore or forward 'detach' deliberately.

#### 38. props.node watcher discards unsaved edits whenever the same node object is replaced

`src/components/DetailPanel.vue`:290 - correctness

The watcher does `editedNode.value = { ...newNode }` unconditionally on every `props.node` change, and only the _UI reset_ block is guarded by `isNewNode`. Several code paths replace `selectedNode` with a freshly fetched object for the SAME id while the panel is open: `useRefresh.js:81` (`selectedNode.value = await api.getNode(selectedNode.value.id)` after linking), `useAppLifecycle.js:58` (`selectedNode.value = { ...data.node }` on a detached-window broadcast), `useNodeActionsUI.ts:276`. Notes autosave is only 500 ms (`AUTOSAVE_DELAY_MS`), so the round-trip fires constantly while typing. Any keystrokes entered between the fetch and the assignment are silently reverted, and with the same node open in a main and a detached window, the remote copy overwrites what the user is typing.

**Fix:** Only rehydrate editedNode when `newNode.id !== oldNode?.id`; for a same-id refresh, merge non-edited fields (or skip while the notes editor has focus / a save is pending), and cover it with a vitest that mutates editedNode then re-assigns props.node with the same id.

#### 39. changeWorkspace has no error handling, unlike every other async handler in the file

`src/components/DetailPanel.vue`:464 - correctness

`async function changeWorkspace(newWorkspaceId) { editedNode.value.workspace_id = newWorkspaceId; await api.updateNode(...); emit('update', editedNode.value) }`. Every other async function here wraps its api call in try/catch + `handleError` (loadChildren, loadLinkedNodes, removeLink, exportMarkdown/JSON/CSV, toggleChildComplete, onChildReorder). A failed workspace move rejects into the DOM change handler as an unhandled rejection: the select visually shows the new workspace, the node never moved, and nothing is reported. It also emits the reactive proxy (`editedNode.value`) while `saveChanges()` at line 406 deliberately unwraps with `toRaw` for the same emit.

**Fix:** Wrap the call in try/catch with `handleError(err, { context: 'Changing workspace' })`, revert `editedNode.value.workspace_id` on failure, and emit `toRaw(editedNode.value)` for consistency.

#### 40. "Wrap with Parent" uses window.prompt(), which Electron does not implement

`src/components/DetailPanel.vue`:475 - correctness

`function wrapWithParent() { const title = prompt('New parent title:'); if (title) { emit('wrap-with-parent', ...) } }`. Chromium in Electron does not implement `window.prompt()` — it logs "prompt() is and will not be supported" and returns undefined — so the `if (title)` branch never runs and the button is inert in the packaged app. This is the only remaining `prompt()` call in `src/` (grep confirms: App.vue, useDemoWorkspace, useTagActions, useDataLoading, useNodeActionsUI, NodeSpreadsheet, WorkspaceSelector all use `confirm()`, which IS supported). The project already built the replacement: `src/composables/useGraphModals.js:20` declares `promptModal` with the comment "Prompt modal state (replacement for native prompt())".

**Fix:** Route wrapWithParent through the existing prompt modal in useGraphModals (or emit `wrap-with-parent` with no title and let App open the modal), and add a test that asserts the emit fires.

#### 41. Locked sensitive notes are editable and toggleable; the write fails silently

`src/components/DetailPanel.vue`:796 - correctness

`notesLocked` (line 66) is consulted only in the two _preview_ branches (815, 867). The Edit tab (`<NotesEditor v-if="activeTab === 'edit'">`, line 796) and the split-view editor (842) render the raw `SNENC1:...` ciphertext in an editable CodeMirror, and every keystroke schedules `saveChanges()` 500 ms later. `toggleNotesSensitive()` (454) is likewise unguarded. `electron/database/index.js:_encodeNotesForWrite` throws "Sensitive notes are locked" for exactly these cases; `saveChanges()` only `emit('update', ...)`, and `useNodeActionsUI.ts:409` rethrows into a floating promise, so the user gets no feedback at all. docs/architecture/sensitive-notes.md:51 states "Turning the flag off, or editing a sensitive note, requires an unlocked session" — the renderer does not enforce the documented rule.

**Fix:** Force `activeTab` to 'preview' (or render the unlock form in place of the editor) while `notesLocked` is true, disable the sensitive toggle when locked, and surface the rejected update through useErrorHandler instead of dropping it.

#### 42. Radial sliders write to SQLite and localStorage on every input event, while the Apply button implies deferred application

`src/components/GraphControls.vue`:171 - design

Each of the five range inputs fires on `@input` with a whole new object: `emit('update:radialSettings', { ...radialSettings, nodeRepulsion: Number($event.target.value) })`. GraphView binds `@update:radial-settings="radialSettings = $event"`, and its deep watcher (GraphView.vue:421-428) then runs `Object.assign(_radialSettings, v)` — which triggers seven localStorage writes in useGraphSettings — plus `saveNodeSetting(..., 'graph_physics', JSON.stringify(v), ...)`, i.e. one api.updateNode IPC round trip and SQLite write per slider tick. A single drag produces dozens of DB writes. The dropdown also has an explicit "Apply" button (224), so the UI promises that changes are applied on demand while the value is in fact persisted continuously.

**Fix:** Emit on `@change` instead of `@input` (or debounce the persistence watcher in GraphView), and make the Apply button the only thing that runs the layout so the control's contract matches its behaviour.

#### 43. No test covers any component in this group

`src/components/GraphView.vue` - design

src/**tests** contains tests for the graph composables (useGraphEvents, useGraphLayout, useGraphSettings) but grepping src/**tests** and e2e/ for GraphView, GraphControls, GraphEditModal, GraphPromptModal, ViewRenderer or DetachedView returns nothing. The behaviour that lives in the components rather than the composables is therefore untested: the settings-persistence watcher matrix (the root-vs-container invariant broken above), the parent-change resync, the emit/prop contract between GraphView, ViewRenderer and App.vue, and the whole detached-window flow. Per the project rule a feature is done only when it is reachable from the UI and covered by tests.

**Fix:** Add component tests for the GraphView settings watchers (root vs container writes) and the ViewRenderer event forwarding contract, plus an e2e case for the detached window; prove each red against the current code first.

#### 44. relaxLocked / fitLocked / radialSettings watchers overwrite the workspace defaults with a container's values

`src/components/GraphView.vue`:413 - correctness

The block comment at lines 359-365 states the invariant explicitly: "These watchers must only write the workspace default (_xxx) when at root level. Inside a container they persist to that node. Otherwise the act of syncing a container's saved value (via the parent-change watcher below) would overwrite the workspace/home default with the container's value." layoutMode, showRootNode, showExternalLinks, maxDepth and visibleTypes all honour it with an `if (props.parent?.id) ... else ...`. The next three watchers do not:

watch(relaxLocked, v => {
_relaxLocked.value = v
saveNodeSetting(props.parent?.id, 'graph_relax_locked', v ? 1 : 0, 'relax locked')
})
watch(fitLocked, v => { _fitLocked.value = v; saveNodeSetting(props.parent?.id, 'graph_fit_locked', ...) })
watch(radialSettings, v => { Object.assign(_radialSettings, v); saveNodeSetting(props.parent?.id, 'graph_physics', JSON.stringify(v), ...) }, { deep: true })

They write the workspace default unconditionally, and the parent-change watcher at lines 463-469 assigns exactly these three from the container node (`relaxLocked.value = Boolean(props.parent.graph_relax_locked)` etc.), which fires them. So merely navigating into a container overwrites the workspace-wide localStorage defaults (GRAPH_RELAX_LOCKED-<ws>, GRAPH_FIT_LOCKED-<ws>, the seven GRAPH_RADIAL_* keys) with that container's values — the exact failure the comment above forbids.

**Fix:** Mirror the layoutMode/showRootNode pattern: `if (props.parent?.id) saveNodeSetting(...) else { _relaxLocked.value = v }`, and the same for fitLocked and radialSettings (Object.assign(_radialSettings, v) only at root).

#### 45. initGraph is async with no re-entrancy guard; concurrent calls orphan a cytoscape instance

`src/components/GraphView.vue`:604 - correctness

initGraph() awaits graphUpdate.buildElementsWithLinks() before assigning `cy = graphInit.createCytoscapeInstance(...)`. Every caller guards with `if (cy) { cy.destroy(); cy = null }` first, which means a second caller during the await window sees cy === null and starts a second init. A workspace switch at root level does exactly this: watch(() => props.workspace) at 476 reassigns showExternalLinks/showRootNode, whose watchers at 504/512 destroy cy and call initGraph(), while the second workspace watcher at 652 sees cy === null (the first init has not resolved yet) and calls initGraph() again. Both resolve, both call cytoscape({container}), and the first instance is never destroyed — its canvases stay in the container DOM and its event handlers stay live, so the view shows duplicated rendering and leaks an instance per switch. The existing `isInitializing` flag is set but never checked by initGraph itself.

**Fix:** Make initGraph re-entrancy safe: keep a token/generation counter, and after the await discard the result if a newer init started (or destroy any `cy` that exists before assigning the new instance).

#### 46. MainToolbar drops the openaiSkipSslVerification v-model, so the SSL-skip toggle is inert

`src/components/MainToolbar.vue`:106 - correctness

App.vue binds `v-model:openai-skip-ssl-verification="openaiSkipSslVerification"` on <MainToolbar> (src/App.vue:882). MainToolbar declares no `openaiSkipSslVerification` prop (props end at line 109 with `ollamaEnabled`), no `update:openaiSkipSslVerification` emit (list ends line 146), and does not forward it to <SettingsPanel> (lines 244-292). SettingsPanel _does_ declare the prop and emit (SettingsPanel.vue:40, :64) and forwards them to AISettings, which renders the actual checkbox (AISettings.vue:286-287). MainToolbar is the only mount point of SettingsPanel in the whole renderer. Net effect: the prop falls through as a raw HTML attribute onto `<div class="toolbar">`, SettingsPanel always receives the default `false`, and the user's toggle emit dies on the toolbar div. The checkbox appears unchecked on every open and the setting is never persisted, while `useAiNotes` reads `openaiSkipSslVerification` from useSettings and will use the stale stored value.

**Fix:** Add `openaiSkipSslVerification: { type: Boolean, default: false }` to the props, `'update:openaiSkipSslVerification'` to the emits, and `:openai-skip-ssl-verification="openaiSkipSslVerification"` / `@update:openai-skip-ssl-verification="emit('update:openaiSkipSslVerification', $event)"` to the SettingsPanel binding. Then add a gate test that asserts MainToolbar forwards every prop and emit SettingsPanel declares, so this class of drop fails CI instead of shipping.

#### 47. MainToolbar never forwards SettingsPanel's import-complete event, so the tree is not refreshed after an import

`src/components/MainToolbar.vue`:146 - correctness

App.vue listens `@import-complete="loadChildren()"` on <MainToolbar> (src/App.vue:904). MainToolbar's emits array (lines 111-146) does not include `'import-complete'`, and the <SettingsPanel> binding (lines 265-291) has no `@import-complete` handler, even though SettingsPanel declares and re-emits it (SettingsPanel.vue:75, :200) from DataSettings (DataSettings.vue:24, :77). The event stops at SettingsPanel; App's `loadChildren()` never runs, so imported nodes do not appear until a manual reload or navigation.

**Fix:** Add `'import-complete'` to MainToolbar's emits and `@import-complete="emit('import-complete', $event)"` to the SettingsPanel binding.

#### 48. processMathFormulas rewrites the raw markdown, so $ inside code fences and plain currency text become KaTeX

`src/components/MarkdownRenderer.vue`:70 - correctness

`renderContent` calls `processMathFormulas(props.content)` on the raw markdown _before_ `marked.parse` (lines 200-203). The regexes at lines 72 and 84 are applied to the whole document with no awareness of fenced or inline code, and no awareness of escaped `\$`. Two concrete failures: (1) a ```python fence containing `cost = $x$` has its content replaced by KaTeX `<span>` markup, which marked then escapes, so the reader sees raw KaTeX HTML as literal text in the code block — this contradicts the file's own comment at lines 202-204 claiming code fences render literally; (2) prose like `it costs $5 and $10 more` matches the inline rule and renders `5 and ` as a math formula. The file's own test suite (src/**tests**/markdown.test.js) has no math coverage at all, so neither case is gated.

**Fix:** Tokenize math with a `marked` inline/block extension (the same mechanism already used for personMention at lines 36-52), so code spans and fences are structurally excluded, instead of regexing the source. Require `\$` escaping or a digit-adjacency guard for the inline rule. Add tests for a $ inside a fence and for currency prose.

#### 49. Mermaid error path writes decoded user content straight into innerHTML, bypassing DOMPurify

`src/components/MarkdownRenderer.vue`:187 - correctness

`renderMermaidBlocks` catch branch does `el.innerHTML = `<pre class="mermaid-error">${block.code}\n\nError: ${e.message}</pre>``. `block.code` is `decodeHtml(code.trim())` (line 167), i.e. the user's note text with HTML entities already decoded, and it is injected as raw markup without `sanitizeHtml` and without `escapeHtml`. Every other HTML path in this file goes through `sanitizeHtml` (line 212) or `escapeHtml` (line 49). A note containing a ```mermaid fence with `<img src=x onerror=alert(1)>` fails to parse (so the catch branch runs) and the payload executes in the renderer. Notes are user- and AI-generated content and can arrive via JSON/CSV import, so this is reachable without the author's cooperation. The success path (`el.innerHTML = svg`, line 181) also bypasses `sanitizeHtml` and relies solely on mermaid's internal sanitizer.

**Fix:** Build the error node with `document.createElement('pre')` + `textContent`, or wrap the string in `escapeHtml(block.code)` / `sanitizeHtml(...)`. Run the mermaid SVG through `sanitizeHtml` too, and add a test in htmlSanitization.test.js that feeds a malformed mermaid fence containing markup and asserts no live element is created.

#### 50. No test covers NodeContextMenu, its five sub-components, SpotlightSearch, AddNodeModal, OnboardingModal or KeyboardShortcutsModal

`src/components/NodeContextMenu.vue` - correctness

Grepping `src/__tests__/` and `e2e/` for these component names returns no component-level test at all. The only hits are `showAddNodeModal` as a mocked callback in `useGraphEvents.test.js` / `viewShortcuts.test.js` (which tests the composable, not the modal) and a single mention of onboarding in `e2e/helpers.js:38`, which only dismisses the dialog to get it out of the way. `UnlockScreen.vue` is the sole file in this group with a real test (`src/__tests__/securityUi.test.js`).

The project rule is explicit: a feature is done when it is usable from the UI and covered by tests. This is the entire menu/modal surface of the app -- the emit contracts (13 emits on NodeContextMenu, 8 on SpotlightSearch), the `visible !== false` filtering, the Escape/keydown handling, and the document-listener add/remove lifecycles are all unverified. The Escape-propagation and recents-navigation defects above would each have been caught by a mount test.

**Fix:** Add vitest component tests: NodeContextMenu emit payloads and per-type item visibility (`person` hides Add Child / Mark Complete), MenuGroup/MenuItem visibility filtering, SpotlightSearch's results vs recents vs empty branches and the `load-more` scroll threshold, AddNodeModal's Enter-creates-task path and title reset, and the two modals' document keydown listener attach/detach across `visible` transitions and unmount.

#### 51. `menuRef` is declared and bound but never read

`src/components/NodeContextMenu.vue`:24 - dead-code

`const menuRef = ref(null)` (line 24) is bound in the template (`ref="menuRef"`, line 187) but grepping the whole tree (src/, electron/, e2e/, src/**tests**/) finds only those two occurrences -- nothing ever reads `menuRef.value`.

It is dead in a way that also hides a real defect: `menuStyle` calls `calculateMenuPosition(props.x, props.y)` with no dimensions, so the util falls back to its `menuWidth = 260, menuHeight = 520` defaults. The actual menu height varies substantially with the number of linked nodes (`LinkedItemsList`) and workspaces (`WorkspaceList`), so with many linked items or workspaces the menu overflows the viewport bottom without flipping, and with a short menu it flips too eagerly. The measurement that `menuRef` was evidently added for was never wired.

**Fix:** Either delete `menuRef` and the template binding, or wire it in: measure the rendered menu with `menuRef.value.getBoundingClientRect()` after it becomes visible and pass the real width/height to `calculateMenuPosition`. Do not leave the ref sitting unused.

#### 52. AG Grid theme hardcodes a black palette while the app supports a light theme

`src/components/NodeSpreadsheet.vue`:27 - consistency

`COLORS` hardcodes `bg: '#000000'`, `bgHeader: '#080808'`, `bgOddRow: '#040404'`, `text: '#d0d0d0'`, `border: '#1a1a1a'`, and these are baked into `themeQuartz.withParams(...)` (line 55) and bound unconditionally via `:theme="darkTheme"` (line 569).

The app has a real light theme: `src/themes/light.css` defines `[data-theme='light'] { --bg-primary: #ffffff; ... }` and `useTheme.js:34` sets `document.documentElement.setAttribute('data-theme', resolved)`. `NodeSpreadsheet.css` itself uses `var(--bg-secondary)`, `var(--text-tertiary)`, `var(--accent-subtle)` in 52 places, including the `:deep()` overrides for the row-index column and selection. So in light mode the grid body and headers stay black inside an otherwise white panel, and the row-index cells (which do follow the token) turn white against it.

**Fix:** Read the theme tokens at runtime (e.g. `getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')`) and rebuild the `themeQuartz` params in a computed that reacts to the active theme, or drive the grid entirely from the CSS variables already in NodeSpreadsheet.css.

#### 53. "Skip SSL verification" toggle is inert: prop and update event are not wired through MainToolbar

`src/components/SettingsPanel.vue`:174 - correctness

AISettings renders the SSL checkbox (`AISettings.vue:284-297`) and emits `update:openaiSkipSslVerification`; SettingsPanel forwards it upward (SettingsPanel.vue:64, 164, 174). But MainToolbar — the only production parent of SettingsPanel — neither declares `openaiSkipSslVerification` in its props (MainToolbar.vue:76-107) nor in its emits (MainToolbar.vue:109-141), and does not bind or listen for it on `<SettingsPanel>` (MainToolbar.vue:242-292).

Consequence: `App.vue:882`'s `v-model:openai-skip-ssl-verification="openaiSkipSslVerification"` binds to a component that ignores it, so (a) the checkbox always shows the default `false` regardless of the persisted setting, and (b) toggling it never reaches `useSettings`, so the setting can never be changed from the UI. This is exactly the "emitted event no parent handles / prop never passed" case — a shipped, security-relevant control that does nothing.

**Fix:** Add `openaiSkipSslVerification` to MainToolbar's props and emits and forward both the binding and `@update:openai-skip-ssl-verification` to SettingsPanel; add a mount test asserting the emit reaches App's setting.

#### 54. import-complete never reaches App, so the tree is not reloaded after an import

`src/components/SettingsPanel.vue`:200 - correctness

DataSettings emits `import-complete` with the import result (DataSettings.vue:77); SettingsPanel re-emits it (SettingsPanel.vue:75, 200). MainToolbar does not declare `import-complete` in its emits and places no `@import-complete` listener on `<SettingsPanel>`, so `App.vue:904`'s `@import-complete="loadChildren()"` never fires. After a JSON/CSV import the success toast appears but the visible tree still shows the pre-import state until the user navigates or reloads — the imported nodes look lost.

**Fix:** Declare `import-complete` in MainToolbar's emits and forward it: `@import-complete="emit('import-complete', $event)"`.

#### 55. Tooltip checkbox emits a node id where every consumer expects a node object

`src/components/TableView.vue`:60 - correctness

TableView emits `toggle-complete` with two incompatible payloads. The row checkbox emits the node object (`@click.stop="emit('toggle-complete', row.node)"`, line 280), but the tooltip callback emits a bare number:

```js
onToggleComplete: nodeId => emit('toggle-complete', nodeId),
```

`useNodeTooltip.js:73` calls `onToggleComplete(parseInt(evt.target.dataset.nodeId))`, i.e. a number. ViewRenderer forwards `$event` unchanged to `App.vue:964 @toggle-complete="toggleComplete"`, which reaches `useNodeOperations.toggleComplete(node: Node)`; that function reads `node.completed`, `node.end_date` and calls `api.updateNode(node.id, updates)`. With a number, `node.completed` is `undefined` (so `newCompleted` is always `true`) and `node.id` is `undefined`, so the update targets no row. GraphView.vue:192 handles the same callback correctly by resolving the id to a node before emitting, which confirms TableView is the divergent one.

**Fix:** Resolve the id to a node before emitting, e.g. `onToggleComplete: id => { const n = findNodeById(id); if (n) emit('toggle-complete', n) }` — `findNodeById` already exists at line 127.

#### 56. Sensitive notes are rendered in plain text in the Notes column

`src/components/TableView.vue`:289 - consistency

The Notes cell renders note text unconditionally:

```html
<span class="notes-preview" :title="row.node.notes">{{ truncateNotes(row.node.notes) }}</span>
```

`notes_sensitive` is consulted only inside `shouldShowTooltip` (line 63), so it suppresses the hover preview but not the column itself or the `title` attribute. Every other surface masks the content whenever the node is flagged, independent of the `hideSensitive` toggle: `CardNotes.vue:25` shows a lock icon when `sensitive`, `useGraphElements.js:174` sets `hideSensitive: hideSensitive || node.notes_sensitive`, `useGraphEvents.js:342` bails on `nodeData.notes_sensitive`. `electron/database/index.js:365` decrypts notes for read once the sensitive session is unlocked, so real plaintext reaches this cell.

**Fix:** Mask the cell when `row.node.notes_sensitive` is set (lock glyph, and omit the `title` attribute), matching CardNotes and the graph.

#### 57. Trash "Delete" button is wired to the wrong handler and cannot permanently delete

`src/components/TrashView.vue`:32 - correctness

TrashView emits the whole item object: `<button class="small danger" @click="emit('delete', item)">Delete</button>`. ViewRenderer forwards it verbatim (`@delete="emit('delete', $event)"`, ViewRenderer.vue:295) and App.vue binds ViewRenderer's `delete` to `deleteNode` (App.vue:968). But `deleteNode` is typed and implemented as `async function deleteNode(nodeId: number)` (useNodeActionsUI.ts:196) and starts with `const node = await api.getNode(nodeId); if (!node) return`. Passing a Node object where a numeric id is expected means the lookup fails and the function returns silently — clicking Delete in the Trash view does nothing at all, with no error surfaced. Even in the best case `deleteNode` calls `api.deleteNode(id, false)` (soft delete), which is the wrong operation for an item that is already in the trash.

The correct handler exists but is not wired: `permanentlyDelete(node: Node)` in useDataLoading.ts:286 calls `api.deleteNode(node.id, true)` and reloads the trash list. It is exported from useDataLoading (line 373) and declared in the return interface (line 69), but grepping src/, e2e/ and electron/ shows the only three hits are its own declaration, definition and export — App.vue's destructure at lines 176-197 pulls `restoreFromTrash` and `emptyAllTrash` but not `permanentlyDelete`. This violates the project rule that a capability existing in a composable but not reachable from the UI is unfinished work. There is also no vitest or Playwright coverage for TrashView at all.

**Fix:** Give TrashView a distinct event for permanent deletion (e.g. `permanent-delete`), forward it through ViewRenderer, and bind it in App.vue to `permanentlyDelete` from `useDataLoading`. Do not reuse the generic `delete` channel, whose established payload across every other view is a numeric node id. Add a test that mounts TrashView, clicks Delete, and asserts `api.deleteNode(id, true)` was called.

#### 58. Color picker renders nothing unless a color is already set, so it can never set one

`src/components/detail/ColorPickerSection.vue`:18 - correctness

`<div v-if="color && color !== defaultColor" class="color-picker-section">`. Both consumers pass a node's stored color: PersonDetailForm.vue:287 (`default-color="#3498db"`) and OrganizationDetailForm.vue:216 (`default-color="#e67e22"`). For the common case of `editedNode.color == null` the component renders nothing, so `onColorUpdate` in both forms is unreachable and a person/organization can never be given a colour from the detail panel. `clearColor()` makes it a one-way door: it emits `null`, after which the picker disappears permanently. Note the detail panel is the only surface for person/org nodes — MetadataGridSection (which has a working colour field) is rendered only in the non-person/non-organization branch.

**Fix:** Always render the input, seeded with `color || defaultColor`, and show the clear button only when an explicit colour is set.

#### 59. Sensitive-note masking is absent from person/organization notes; the props that would provide it are never passed

`src/components/detail/NotesSection.vue`:13 - correctness

NotesSection declares `showSensitive` and `notesSensitive` props plus an `unlock-button` slot, and uses them at line 79. Grep across src/ and e2e/ shows the only two consumers — PersonDetailForm.vue:189 and OrganizationDetailForm.vue:133 — pass neither prop nor the slot, so `notesSensitive` is always false: a person or organization node with `notes_sensitive` set renders its notes in the clear, and when the note is encrypted the raw `SNENC1:` ciphertext is rendered as markdown and is editable (see the DetailPanel finding). Independently, the split branch (lines 87-102) ignores `notesSensitive` even if it were passed, so masking would still leak there. There is also no way to toggle `notes_sensitive` for a person/org from the detail panel at all — the `sensitive-btn` exists only in DetailPanel's non-person branch.

**Fix:** Either pass the sensitive state (and lock state) from both forms and apply it in the split branch too, or delete the dead props and slot and route person/org notes through the same guarded rendering DetailPanel uses.

#### 60. Deep watcher launches overlapping async org loads with no cancellation

`src/components/detail/PersonDetailForm.vue`:165 - correctness

`watch(() => props.linkedNodes, () => { loadLinkedOrganizations() }, { deep: true })` fires on any change to linkedNodes — including tag-only changes — and starts a run that awaits `api.getNode` once per ancestor plus one `getOrgPath` walk per leaf org. The promise is not awaited and no run token is kept, so on rapid link/unlink (or a node switch racing the id watcher at line 154) an older invocation can resolve last and write a stale `linkedOrganizations.value`. `getOrgPath` (line 45) and the ancestor walk (line 86) also loop on `parent_id` with no cycle guard, unlike `src/utils/nodeColor.js:resolveNodeColor` which explicitly keeps a `seen` set "in case parent links are malformed" — a cycle hangs the renderer here.

**Fix:** Capture a request id (or the node id) at entry and drop the result if it changed before the awaits resolve; add the same `seen` cycle guard used in nodeColor.js to both parent walks.

#### 61. Import always targets the 'work' workspace: currentWorkspace is never passed down

`src/components/settings/DataSettings.vue`:72 - correctness

DataSettings passes `props.currentWorkspace` to `api.importJSON(data, null, props.currentWorkspace)` / `api.importCSV(text, null, props.currentWorkspace)`, and `electron/database/export.js:241` really does use `workspaceId` (defaulting to 'work') to place imported nodes.

The value never arrives. `App.vue:892` passes `:current-workspace="currentWorkspace"` to MainToolbar, but MainToolbar declares no `currentWorkspace` prop (props list at MainToolbar.vue:76-107) and does not pass `:current-workspace` to `<SettingsPanel>` (MainToolbar.vue:242-292). MainToolbar has no `inheritAttrs:false` / `v-bind="$attrs"`, so the attribute lands on the toolbar root `<div>` and stops there. SettingsPanel therefore falls back to its own default `currentWorkspace: { type: String, default: 'work' }` (SettingsPanel.vue:44) and DataSettings imports into 'work' no matter which workspace the user is in. The hardcoded default is what hides the break — with `required: true` this would have been caught. No test covers the forwarding (there is no MainToolbar or DataSettings test).

**Fix:** Declare `currentWorkspace` on MainToolbar and forward it to `<SettingsPanel :current-workspace="currentWorkspace">`; drop the `'work'` default in SettingsPanel/DataSettings in favour of `required: true` so a missing value fails loudly, and add a test asserting the workspace id reaches api.importJSON.

#### 62. `testConnection`/`listModels` are unreachable from the UI while AISettings.vue uses a parallel per-provider composable

`src/composables/useAiNotes.js`:323 - design

`useAiNotes` returns `testConnection()` and `listModels()`, which delegate cleanly to the provider adapter (`activeProvider.value.testConnection()` / `.listModels()`) — the abstraction `aiProviders.js` exists to provide, and which `src/__tests__/aiProviders.test.js` has a gate test defending ("no per-provider branching left in useAiNotes"). But the only components calling `useAiNotes()` are `NotesAIToolbar.vue` (takes `isGenerating, error, presetPrompts, improveNotes, research`) and `AISettings.vue` (takes only the prompt-management functions). For connection testing and model listing, AISettings.vue instead uses `useAIProviderConnection`, which hard-branches on the provider id and duplicates the whole surface twice — `testOllamaConnection`/`testOpenaiConnection`, `fetchOllamaModels`/`fetchOpenaiModels`, `ollamaModels`/`openaiModels`, `ollamaConnectionStatus`/`openaiConnectionStatus`, and per-provider `api.ollamaTestConnection`/`api.openaiTestConnection` calls. So the adapter-based path is dead (tests only), the branching path is the live one, and the anti-branching gate test passes while the branching sits one file over. `isConfigured`, `isEnabled`, `provider`, `generatedContent`, and `defaultPrompts` are likewise returned but consumed by no component.

**Fix:** Pick one path: either drive AISettings.vue's connection test and model list through `useAiNotes().testConnection()/listModels()` (extending the adapter interface with whatever per-provider status the UI needs) and delete `useAIProviderConnection`, or delete the unreachable `testConnection`/`listModels`/`isConfigured`/`defaultPrompts` from `useAiNotes` and widen the gate test to cover `useAIProviderConnection`.

#### 63. "Clear recent" filter compares SQLite timestamps against an ISO-8601 string, so cleared items never come back

`src/composables/useDataLoading.ts`:194 - correctness

clearRecent() stores `new Date().toISOString()` ("2026-08-26T12:34:56.789Z") in localStorage, but `updated_at` comes straight out of SQLite as `CURRENT_TIMESTAMP` ("2026-08-26 12:34:56") — electron/database/schema.js:80 and _rowToNode (electron/database/index.js:369) pass it through untransformed. loadRecentItems then does a lexicographic comparison:

recentItems.value = validItems.filter((item: Node) => item && item.updated_at > clearedAt)

For the same calendar date the strings are identical through index 9, then compare ' ' (0x20) against 'T' (0x54), so the DB value is ALWAYS "less than" the cleared marker. Result: after pressing "clear" in SpotlightSearch, every node touched for the rest of that UTC day is filtered out of Recent, and only items updated on a later date reappear. Secondarily, `api.getRecent(10, wsId)` applies `LIMIT 10` in SQL and the cleared-at filter is applied afterwards in the renderer, so the list can be short or empty even when 10 newer items exist.

**Fix:** Normalize both sides before comparing — either store the marker in the DB's format (`new Date().toISOString().slice(0, 19).replace('T', ' ')`) or parse both with `Date.parse()` and compare numbers. Also fetch more than `limit` rows (or push the cleared-at cutoff into the query) so the post-filter cannot starve the list. Add a test with a realistic 'YYYY-MM-DD HH:MM:SS' updated_at; there is currently no test covering clearRecent at all.

#### 64. undoClearRecent, permanentlyDelete and the returned showLostFound ref are not reachable from any UI

`src/composables/useDataLoading.ts`:211 - dead-code

Grepped src/, electron/, e2e/ and src/**tests**/ for each name outside useDataLoading.ts: `undoClearRecent` (line 211) — zero hits, so `previousRecentClearedAt` is write-only state and the "clear recent" action is irreversible from the UI even though the undo is implemented. `permanentlyDelete` (line 286) — zero hits; the trash UI uses restoreFromTrash/emptyAllTrash only. `showLostFound` (line 95, returned at line 351) — App.vue does not destructure it and declares its own `const showLostFound = ref(false)` at App.vue:98, so the composable's copy is a second, unused source of truth for the same panel.

**Fix:** Wire undoClearRecent into the SpotlightSearch "clear" affordance (a toast with Undo) and permanentlyDelete into the trash list, or delete all three plus their UseDataLoadingReturn entries and `previousRecentClearedAt`. If showLostFound stays, App.vue should use it rather than shadow it.

#### 65. Eight element data fields built for every node are never read by anything

`src/composables/useGraphElements.js`:181 - dead-code

`buildElements()` writes `label`, `tooltip`, `bgColor`, `textColor`, `isTag`, `isCompleted`, `totalNodes`, and `isCurrentContainer` into every node's `data`. I grepped src/, electron/, e2e/ and src/**tests**/ for each: nothing reads them.

- `label` (line 169, `decodeHtmlEntities(node.title)`): the cytoscape stylesheet sets `label: ''` (useGraphInit.js:77) and the HTML-label template uses `escapeHtml(n.title)` from `nodeData`, never `d.label`.
- `tooltip` (line 172): the only consumer of `buildTooltipHTML` at render time is `useNodeTooltip.js:39`, which rebuilds it from the node. `data('tooltip')` is never read. This runs full tooltip HTML generation for every node on every graph rebuild for nothing.
- `bgColor`/`textColor` (lines 178-179): zero hits outside this file. The template uses `d.borderColor` and `d.customBgTint` only. `darkenColor()` therefore exists solely to feed dead fields (it is exported but has no importer either).
- `isTag`, `isCompleted`, `totalNodes`, `isCurrentContainer`: no reader, and no stylesheet selector uses them (the style array only matches `node[?isPerson]` and `edge[isLink]`).

The same dead `bgColor`/`textColor`/`isCompleted` block is duplicated in `fetchLinkedNodes` at lines 405-408 and 416-420.

**Fix:** Delete the eight fields from both element builders, delete `darkenColor` and the `buildTooltipHTML`/`decodeHtmlEntities` imports it made necessary, and keep only the fields the label template and stylesheet actually consume (`nodeData`, `type`, `isPerson`, `borderColor`, `customBgTint`, `hasChildren`, `childCount`, `isCollapsed`, `shouldGlow`, `showDetails`, `isSelected`, `isLinkedExternal`).

#### 66. getNodeDimensions returns zoom-scaled pixels while the grid layout treats them as model units

`src/composables/useGraphLayout.js`:39 - correctness

`getNodeDimensions()` returns `rect.width`/`rect.height` straight from `getBoundingClientRect()` — screen pixels, i.e. model size multiplied by the current cytoscape zoom. Its own fallback branches return model units (`node.boundingBox()`, `parseFloat(style.width)`), so the three return paths are in two different coordinate systems. `runTetrisGridLayout()` then feeds those values into `node.position({x, y})`, which is model coordinates.

The sibling function knows about this: `syncNodeDimensions()` (line 24-26) explicitly divides by `cy.zoom()` with the comment "Divide by zoom to get unscaled dimensions", and `reLayout()`'s grid branch works around it by forcing `cy.zoom(1)` / `cy.pan({x:0,y:0})` first (lines 398-400, "Reset zoom and spread nodes apart to ensure accurate DOM measurements").

`runGridLayout()` (line 766) has no such reset. It is called from `useGraphInit.applyInitialLayout()` line 185, on an instance that was just constructed with `layout: LAYOUTS.grid` (`{name:'preset', fit:true, padding:20}`) — `fit:true` has already changed the zoom away from 1. So the initial grid layout spaces nodes by zoom-multiplied widths.

**Fix:** Divide by `cy.zoom()` in `getNodeDimensions()` (taking the cy instance or `node.cy()`) so all three return paths are model units, and drop the `cy.zoom(1)` workaround in `reLayout()`. Add a test that runs `runGridLayout()` at zoom 0.5 and 2 and asserts identical resulting positions.

#### 67. getLayoutOptions('grid') returns a no-op preset layout, so grid mode silently fails wherever isGridMode() is not special-cased

`src/composables/useGraphLayout.js`:243 - correctness

`LAYOUTS.grid` is `{name: 'preset', ...}` — running it repositions nothing. The real grid arrangement lives in `runTetrisGridLayout`, reachable only via `reLayout()`'s `mode === 'grid'` branch or via `runGridLayout()`.

Every consumer of `getLayoutOptions()` therefore has to know to check `isGridMode()` first. `useGraphInit.applyInitialLayout` does (line 184-185). `useGraphUpdate.handleNewNodes` does not: line 191-196 runs `cy.layout(getLayoutOptions()).run()` unconditionally when `!hasPos`. In grid mode that executes `preset`, so after a graph update with no saved positions the nodes stay wherever `findSmartPosition` scattered them and no grid is ever applied.

This is a contract problem in this file, not just a caller bug: a function named `getLayoutOptions` returns options that do not implement the requested layout.

**Fix:** Either expose a single `applyCurrentLayout(cy)` entry point that dispatches grid vs cytoscape layouts internally and have all callers use it, or make `getLayoutOptions('grid')` return a real cytoscape layout object whose `run()` invokes the tetris grid. Cover it with a test that puts the composable in grid mode and asserts node positions change after the update path.

#### 68. Entire edit-modal and prompt-modal subsystem is unreachable

`src/composables/useGraphModals.js`:42 - dead-code

`showEditModal(node)` is the only writer that can set `editModal.value.visible = true`, and grepping the whole tree (`src/`, `electron/`, `e2e/`, `src/__tests__/`) finds it referenced nowhere except its own definition and the composable's return object. GraphView.vue destructures `editModal, hideEditModal, saveEditModal, goToParentFromModal, wrapWithParentFromModal` (lines 218-232) but never calls `showEditModal`, and nothing else assigns `editModal.value.visible`. Consequently `<GraphEditModal :visible="editModal.visible" …>` (GraphView.vue:803) can never render, and `hideEditModal`, `saveEditModal`, `handleEditModalKeydown`, `goToParentFromModal`, `wrapWithParentFromModal` are all unreachable. The prompt modal is dead by transitivity: `showPrompt()` is called from exactly one place — `wrapWithParentFromModal` (line 196) — which itself starts with `if (!editModal.value.node) return`, a condition that is always true. So `promptModal`, `submitPrompt`, `cancelPrompt`, `handlePromptKeydown`, `promptInputRef` and `<GraphPromptModal>` (GraphView.vue:814) are dead too. That leaves `isAnyModalVisible()` (line 207) effectively reducing to `addNodeModal.value.visible`, and the tooltip guard `!editModal.value.visible` in GraphView.vue:212 a constant. This violates the project rule that code must be connected or deleted.

**Fix:** Either wire `showEditModal` to a real GraphView interaction (e.g. the node context menu / an edit shortcut) and bind `GraphEditModal`'s exposed refs, or delete `showEditModal`, `hideEditModal`, `saveEditModal`, `handleEditModalKeydown`, `goToParentFromModal`, `wrapWithParentFromModal`, the whole prompt-modal block, and the two now-unused modal components from GraphView.vue.

#### 69. `insertBetween` link branch destroys the original link with no rollback on failure

`src/composables/useGraphOperations.js`:66 - correctness

The `isLink` branch runs four sequential awaits: `api.unlinkNodes(parentId, childId)`, then `api.createNode(...)`, then two `api.linkNodes(...)` calls. There is no transaction and no compensating action. Failure scenario: `unlinkNodes` succeeds, then `createNode` rejects (validation error, DB locked, workspace lookup failure). The user's original link between `parentId` and `childId` is now permanently gone, and the catch block only surfaces a transient toast (`handleError(e, { context: 'Inserting node' })`) — the user is told "inserting failed" while the pre-existing data has actually been destroyed. The same applies if the second `linkNodes` fails, leaving an orphan node linked on one side only.

**Fix:** Create the new node first, then link both sides, and only unlink the original edge once both links succeeded — or wrap the sequence in a service-level transaction and re-create the original link in the catch.

#### 70. Local `isTextInput` duplicates and diverges from the shared `ownsTextInput` ownership rule

`src/composables/useKeyboardShortcuts.js`:102 - consistency

The file imports `ownsTextInput` and aliases it as `isEditableElement`, then defines a second, weaker predicate:

```js
function isTextInput(target) {
  if (target.tagName === 'TEXTAREA' || target.isContentEditable) return true
  if (target.tagName === 'INPUT') { ... }
  return false
}
```

The Space and Enter branches use `isTextInput`, everything below uses `ownsTextInput`. Unlike `ownsTextInput`, `isTextInput` does not recognise `SELECT`, a `[contenteditable]` _ancestor_, or a `.cm-editor` (CodeMirror) subtree. Consequence: pressing Space with a `<select>` focused toggles the detail panel instead of opening the dropdown, and Space/Enter inside a nested contenteditable element (or in jsdom, where `isContentEditable` is unset — the exact case `inputOwnership.js` documents) is stolen by the global handler. `src/utils/inputOwnership.js` states the header contract that this decision "lives here" rather than being special-cased per surface, so the local copy directly contradicts the module it imports.

**Fix:** Delete `isTextInput` and use `isEditableElement` (i.e. `ownsTextInput`) in the Space and Enter branches; add a gate test that no composable re-implements the text-input predicate.

#### 71. loadChildren silently drops concurrent and same-container calls, losing navigations and post-mutation refreshes

`src/composables/useNavigation.ts`:204 - correctness

loadChildren has two silent-drop guards and no queue or trailing execution:

if (isLoadingChildren) return
if (debounce.enabled && timeSinceLastLoad < debounce.delay && lastLoadedContainerId === containerId) return

Two consequences, both reachable: (1) rapid navigation — two enterContainer calls whose 150 ms timers overlap a slow first load means the second `loadChildren` returns immediately, so the transition animation ends (`onTransitionEnd`) and the user is left in container A while having clicked into B, with no error. (2) useRefresh.refreshAfterChange / refreshAfterDelete call `loadChildren(currentContainerId.value, { silent: true })` immediately after a mutation; if the user just navigated, or two mutations land within the 200 ms window (rapid completion toggles, undo/redo), the refresh is discarded and the view keeps showing stale children while the sidebar has already been refreshed. `lastLoadTime` is only updated in `finally`, so a slow load extends the dead window further.

**Fix:** Track the requested container id and re-run (trailing call) when an in-flight load finishes with a different/newer request, or return the in-flight promise instead of `undefined`. At minimum exempt explicit refreshes (add a `force` option that bypasses both guards) and have useRefresh pass it.

#### 72. syncFromNavigation creates a second, one-way copy of navigation state that silently discards writes

`src/composables/useNavigationState.ts`:48 - design

useNavigationState declares its own `currentContainerId`/`currentContainer`/`breadcrumbs`/`children` refs and then mirrors useNavigation's refs into them with a single one-directional watcher. App.vue binds components to these copies while all mutations go through useNavigation, so any write to a copy is a no-op that the next watcher run overwrites — App.vue:154-160 and App.vue:427-429 both write to the copies before calling `loadChildren`, which is what actually changes the state. There is one logical piece of state with two owners and no way to tell from a call site which one you hold. The watcher is additionally `deep: true` over the whole `children` tree, so every load deep-traverses the full node graph to detect a change that a reference swap already signals.

**Fix:** Drop the shadow refs and expose useNavigation's refs directly (App.vue can destructure them), or make useNavigationState the single owner and have useNavigation write into injected refs. If the mirror stays, at minimum remove `deep: true` — loadChildren always assigns new arrays.

#### 73. handleAIImproveNotes is duplicated in DetachedView.vue and the two copies diverge

`src/composables/useNodeActionsUI.ts`:369 - consistency

`useNodeActionsUI.handleAIImproveNotes` and `DetachedView.vue:83 handleAIImproveNotes` contain the same splice computation verbatim:

```js
const currentFullNotes = fullNotes ?? ''
finalNewNotes = currentFullNotes.slice(0, selectionRange.from) + newNotes + currentFullNotes.slice(selectionRange.to)
```

They already differ in behaviour: the main-window copy pushes an `ApplyNotesEditCommand` (undoable) but never calls `broadcastNodeUpdate`; the detached copy broadcasts but pushes no undo command. So an AI notes edit made in the main window leaves any detached window showing that node with stale notes, and an edit made in a detached window is not undoable. This is a fork of shared logic across a layer boundary, which the project rules forbid.

**Fix:** Extract the splice + persist + broadcast + undo-push into one shared function and have both windows call it.

#### 74. Add-bar createNode skips the shared refresh path that its sibling createNodeAtPosition uses

`src/composables/useNodeCreation.js`:45 - consistency

`createNode` only calls `loadChildren(currentContainerId.value, { silent: true })` (plus a conditional `loadSidebarTree()`), whereas `createNodeAtPosition` in the same file calls the full `refreshAfterChange()`. When the add bar creates a node in the current container (`addChildParentId.value` is null), the sidebar tree, recent items and tag list are never refreshed at all. Two creation entry points in one composable therefore leave the app in different states.

**Fix:** Have both creation paths go through `refreshAfterChange(...)`, varying only the option flags.

#### 75. moveMultipleNodes pushes no undo command, unlike every other mutating operation here

`src/composables/useNodeOperations.ts`:360 - correctness

```ts
async function moveMultipleNodes({ nodeIds, newParentId }) {
  return withProcessing(
    async () => {
      for (const nodeId of nodeIds) {
        await api.moveNode(nodeId, newParentId)
      }
      if (onSuccess) await onSuccess({ type: 'moveMultiple', nodeIds, newParentId })
      return true
    },
    { failValue: false }
  )
}
```

No `pushCommand` call, and `src/commands/index.js` has no `MoveMultipleCommand`. Multi-node drag-and-drop (wired via `@move-multiple` in App.vue:970 and `useGraphEvents.js:638`) is silently non-undoable, while single `moveNode` pushes a `MoveCommand`. The loop also has no rollback: if `api.moveNode` throws halfway through, the earlier moves stay applied and `withProcessing` returns `false`, leaving the tree half-moved.

**Fix:** Capture each node's `parent_id` before the loop and push a composite move command (or a `MoveCommand` per node wrapped in one batch command), and roll back already-moved nodes on failure.

#### 76. moveNodeToRoot can never be undone because it omits oldParentId

`src/composables/useNodeOperations.ts`:377 - correctness

```ts
async function moveNodeToRoot(nodeId) {
  return moveNode({ nodeId, newParentId: null })
}
```

`moveNode` pushes the undo command only under `if (oldParentId !== undefined && pushCommand)` (line 346). Since `moveNodeToRoot` never supplies `oldParentId`, no `MoveCommand` is ever pushed. "Move to root" is exposed in the UI (`@move-to-root="moveNodeToRoot"`, App.vue:1023) and is therefore silently non-undoable, contradicting the sibling operations.

**Fix:** Fetch the node first and pass its current `parent_id` as `oldParentId`: `const n = await api.getNode(nodeId); return moveNode({ nodeId, oldParentId: n?.parent_id ?? null, newParentId: null })`.

#### 77. toggleComplete and toggleFavorite never call broadcastUpdate, so detached windows show stale state

`src/composables/useNodeOperations.ts`:384 - correctness

`broadcastUpdate` is invoked only in `updateNode` (line 241). `toggleComplete` (line 395: `await api.updateNode(node.id, updates)`) and `toggleFavorite` (line 413: `await api.updateNode(node.id, { favorite: !node.favorite })`) write the same DB rows through the same API but skip the broadcast. `broadcastDelete` is correctly called on every delete path. A detached window displaying that node therefore keeps the old `completed` / `favorite` value until it is reloaded — exactly the cross-window drift the delete path was written to avoid.

**Fix:** Call `broadcastUpdate({ id: node.id, ...updates })` after the successful `api.updateNode` in both toggles.

#### 78. Table create/update payload shape contradicts the typed api.ts contract

`src/composables/useNodeTable.js`:47 - typing

This composable documents and passes `{ name?, column_definitions?, row_count? }` (`createTable(nodeId, options)` -> `api.createNodeTable`, and DetailPanel's structure-change handler calls `updateTable(nodeId, { column_definitions })` / `{ row_count }`). The SQLite layer agrees - electron/database/tables.js reads `data.column_definitions` and `data.row_count`. But src/services/api.ts:143-144 declares:

    createNodeTable(nodeId: number, data?: { rows?: number; cols?: number }): Promise<NodeTable>
    updateNodeTable(nodeId: number, data: { rows?: number; cols?: number }): Promise<NodeTable>

`rows`/`cols` are read nowhere in electron/. The vue-tsc gate cannot catch the mismatch because the callers are .js, so the declared type is silently wrong for every consumer.

**Fix:** Correct the api.ts signatures to `{ name?: string; column_definitions?: ColumnDef[]; row_count?: number; settings?: ... }` so the gate actually constrains the payload.

#### 79. loading/error refs are written on every path but no UI reads them; failures are fully silent

`src/composables/useNodeTable.js`:180 - design

Every method sets `error.value = err.message`, and all of them except deleteTable pass `silent: true` to handleError, so no toast is shown either. The only consumer, DetailPanel.vue:143-153, destructures `{ table, cells, hasTable, loadTable, createTable, updateTable, deleteTable, saveCell, saveCellStyle }` - neither `loading` nor `error` is taken, and grepping DetailPanel for `error` finds only the unrelated `sensitiveUnlockError`. A failed `saveCell` therefore leaves the user looking at a value that was never persisted, with no toast, no error banner, and no console output. This is exactly the 'errors collected into a ref that no UI ever reads' failure mode the project rules call out.

**Fix:** Either surface `error`/`loading` in DetailPanel's table section (and drop `silent: true` for save failures so the toast fires), or delete the two refs from the composable's return and let handleError be the single reporting path.

#### 80. loadMoreResults can append results from a stale query, and leaves searchOffset advanced when the search fails

`src/composables/useSearch.ts`:213 - correctness

handleSearch has no request-generation guard. `loadMoreResults()` advances `searchOffset` and awaits `handleSearch(ws, true)`, which (with `getAncestors` supplied, as App.vue does at line 506) issues one extra round-trip per result before doing `searchResults.value = [...searchResults.value, ...processedResults]`. If the user types during that window, the 200 ms-debounced fresh search can resolve first and set `searchResults` for the new query, after which the in-flight page-2 response of the OLD query is appended to it. Separately, if `onSearch` throws during a loadMore, the catch at line 222 resets `isLoadingMore` but not `searchOffset`, so the next loadMore skips a page of results permanently.

**Fix:** Capture a monotonically increasing request id (or the query string) before awaiting and discard the response if it no longer matches the current one; roll `searchOffset` back by SEARCH_PAGE_SIZE in the catch when `loadMore` is true.

#### 81. hasSelection, selectionCount, updateSelectedNode, removeFromSelection and lastSelectedNode are exposed but only referenced by their own tests

`src/composables/useSelection.ts`:346 - dead-code

Grepped src/, electron/ and e2e/: outside useSelection.ts, `hasSelection`, `selectionCount`, `updateSelectedNode` and `removeFromSelection` appear only in src/**tests**/useSelection.test.js, and `lastSelectedNode` is read only inside the composable (as the range-selection anchor fallback) plus one test. Post-delete selection cleanup that removeFromSelection was presumably written for is implemented separately as `clearSelectionAfterDelete` in useNodeActionsUI/useAppLifecycle, so this is a duplicate mechanism nothing calls. A test is not a consumer under the project's "reachable from the UI" rule.

**Fix:** Delete the four unused exports (keep `lastSelectedNode` internal, since handleMultiSelect uses it) and their UseSelectionReturn entries, or wire removeFromSelection into the delete path in place of clearSelectionAfterDelete.

#### 82. Settings refs are built before the localStorage->DB migration runs, so every setting silently resets for one session on upgrade

`src/composables/useSettings.ts`:110 - correctness

main.js calls `await initSettings()` (line 38) and only afterwards `migrateSettingsToDatabase()` (line 42). `initSettings()` calls `loadSettingsFromDatabase()`, which on a pre-migration install returns `{}`, then immediately builds the singleton refs via `createSettingsRefs()`. Inside `persistedRef`, the initial-value branch is:

```ts
if (hasElectronAPI() && settingsCache) {
  initialValue = parse(settingsCache[key])
} else if (typeof localStorage !== 'undefined') {
  initialValue = parse(localStorage.getItem(key))
}
```

An empty object is truthy, so on Electron the localStorage branch is unreachable and every ref initialises to its hard-coded default even though localStorage still holds the user's real values. The migration then copies those localStorage values into the DB, but the already-created refs are never re-read, so the running session shows defaults: `workspace` falls back to `'work'`, `viewMode` to `'graph'`, `hideCompleted` to `true`, `aiEnabled` to `false`, and the configured Ollama/OpenAI endpoints and API key disappear from the UI. The values reappear only after a restart. The comment in `initSettings` about deliberately keeping an existing instance shows the ordering hazard was considered for the _early-caller_ case but not for the migration case.

**Fix:** Run `migrateSettingsToDatabase()` before `initSettings()` in main.js (or have `initSettings()` perform the migration itself before calling `createSettingsRefs()`), and add a test that seeds localStorage with an empty DB and asserts the refs come up with the migrated values.

#### 83. OpenAI API key is mirrored into plaintext localStorage on every write

`src/composables/useSettings.ts`:311 - correctness

`openaiApiKey` is a plain `persistedRef`, and `persistedRef`'s watcher unconditionally writes to localStorage after writing to the DB:

```ts
// Also save to localStorage as fallback/backup
if (typeof localStorage !== 'undefined') {
  ...
  localStorage.setItem(key, serialized)
}
```

The app ships database encryption (main.js branches on `api.securityStatus()` returning `state === 'locked'` and mounts `UnlockScreen`), so the DB copy of the key can be encrypted at rest while the localStorage copy — Chromium LevelDB files in the user-data directory — is always plaintext and readable by any process running as the user. The `migrateSettingsToDatabase()` prefix scan also picks it up and re-writes it, and nothing ever removes the localStorage copy after migration.

**Fix:** Add a per-key opt-out for the localStorage mirror (e.g. a `secret: true` option on `persistedRef`) and set it for `openaiApiKey`, so the key lives only in the DB; also delete any existing `graphcore-openaiApiKey` localStorage entry during migration.

#### 84. Sidebar section-collapse state is forked between useSidebar.ts and AppSidebar.vue

`src/composables/useSidebar.ts` - design

useSidebar.ts defines `treeCollapsed`, `favoritesCollapsed`, `recentCollapsed`, `tagsCollapsed` (lines 146-149), four `watch` blocks that persist them (152-171), and four toggle functions (230-253), all exported in `UseSidebarReturn`. Nothing consumes them: App.vue destructures only `hovered, expandedIds, visible, onEnter, onLeave, toggleExpand, expandToPath` (App.vue:133-142), and AppSidebar.vue reimplements the identical logic inline:

const treeCollapsed = ref(localStorage.getItem('sidebar-tree-collapsed') === 'true')
...
watch(treeCollapsed, val => localStorage.setItem('sidebar-tree-collapsed', String(val)))

Both read and write the _same_ localStorage keys ('sidebar-tree-collapsed', 'sidebar-favorites-collapsed', 'sidebar-tags-collapsed'), so there are two independent sources of truth for one persisted setting. The composable's copy is initialised at App setup and its watchers fire on any programmatic change, but only AppSidebar's copy is ever bound to the DOM. This is exactly the fork the project rules forbid, and the composable half is dead code (only the unit test touches it).

**Fix:** Delete the collapse refs, watchers and toggles from useSidebar.ts (and the matching entries in UseSidebarReturn and STORAGE_KEYS), or - preferably - keep them in the composable and have App.vue pass them into AppSidebar.vue as props/handlers, deleting AppSidebar.vue's inline copies. Add an anti-fork test asserting the localStorage keys are written from exactly one module.

#### 85. cutSelection deletes the cells even when the clipboard write failed

`src/composables/useSpreadsheetClipboard.js`:73 - correctness

copySelection swallows a failed `navigator.clipboard.writeText` with `console.warn('Failed to copy to clipboard:', err.message)` and resolves normally (lines 31-35). cutSelection then unconditionally runs the delete:

export async function cutSelection(options) {
await copySelection(options)
deleteSelectedCells(options)
}

Failure scenario: the document is not focused, or the Electron renderer denies clipboard-write - the user presses Cmd+X over a filled range, the write throws, the warning goes to the console only, and every selected cell is emitted as `cell-change` with `value: ''`. The data is gone from the table and never reached the clipboard, with no UI signal of any kind.

**Fix:** Have copySelection report success (`return true`/`false`, or rethrow) and make cutSelection delete only on success; surface the failure through the app's error handler/toast rather than console.warn. Add a test where `navigator.clipboard.writeText` rejects and assert no `cell-change` is emitted.

#### 86. The document-capture key handler claims keys app-wide whenever focus is on document.body

`src/composables/useSpreadsheetKeyboard.js`:92 - correctness

The guard is

if (!gridWrapper?.contains(document.activeElement) && document.activeElement !== document.body) return

so the handler proceeds whenever `document.activeElement === document.body`, which is the normal state after clicking any non-focusable area of the app. NodeSpreadsheet registers this on `document` in the capture phase (NodeSpreadsheet.vue:515) while the global shortcuts live on `window` in the bubble phase (useAppLifecycle.js:119), so document-capture runs first and `event.stopPropagation()` prevents the global handler from ever seeing the key. Nothing clears the spreadsheet selection when the user clicks outside the grid (`selection.handleMouseDown` is bound only to the grid wrapper via `@mousedown.capture`). Failure scenario: open the detail panel of a node that has a table, click a cell, click back on a card in the cards view (activeElement -> body, spreadsheet selection still set), press Delete - the selected spreadsheet cells are blanked and the app's own delete-node shortcut never fires. Same for Cmd+C/Cmd+V/Cmd+B. Note the asymmetry with `ownsAllKeys()` in src/utils/inputOwnership.js, which decides ownership from `event.target`, not from `document.activeElement`.

**Fix:** Decide ownership the same way the rest of the app does - from `event.target` inside the `[data-owns-keys]` root - or at minimum drop the `document.body` escape hatch and require focus inside the grid wrapper. Add a test asserting that with focus on document.body the handler does not call deleteSelectedCells or stopPropagation.

#### 87. Drop 'inside' has no descendant/cycle guard, and nothing downstream validates it

`src/composables/useTableDrag.js`:200 - correctness

onMouseMove only rejects the dragged node itself (`nodeId !== draggedNode.value?.id`). Dropping a node onto one of its own descendants is accepted and onMouseUp calls `onMove({ nodeId: sourceNode.id, newParentId: targetNode.id })` (or `onMoveMultiple` for a selection that contains an ancestor of the target). I grepped the whole chain: TableView.vue emits 'move' -> IPC -> `electron/database/nodes.js#moveNode`, which does no ancestry check at all:

    moveNode(id, newParentId) {
      const node = ops.getNode(id)
      if (!node) return null
      ... UPDATE nodes SET parent_id = ? ...
      updateDescendantPaths(id)

and `updateDescendantPaths` is an unbounded recursion over `parent_id` links. A parent cycle therefore recurses until the stack overflows, after the row has already been written. There is no cycle test anywhere in electron/ (grepped for 'cycle', 'isAncestor', 'descendant').

**Fix:** Reject the drop in onMouseMove when the hovered row is the dragged node's descendant (the node tree is already available via findNodeById, so walk the dragged node's subtree once at drag start and keep the id set). Add a defensive ancestry check in moveNode/reorderNode as well, since the composable is not the only caller.

#### 88. loadTasks has no in-flight guard, so concurrent loads race and a stale result wins

`src/composables/useTaskFiltering.js`:31 - correctness

TasksView.vue registers four independent triggers (`watch(() => props.workspaceId, loadTasks)`, `containerId`, `showCompleted`, `filterImportance`) plus `onMounted(loadTasks)` and an exposed `loadTasks`. loadTasks awaits `api.getTasks`, then `api.getDescendants`, then `buildTaskPaths` which fans out one `api.getAncestors` call per task - a long, variable-latency chain. Two overlapping invocations both assign `tasks.value` in whatever order they finish, so switching container A -> B can leave A's tasks displayed; and the first to reach `finally` sets `loading.value = false` while the second is still running, hiding the spinner over stale rows.

**Fix:** Capture a monotonically increasing request id (or an AbortController) at entry and discard the result - including the `loading` reset - when a newer request has started.

#### 89. Importance sort is doubly negated: the default click sorts least-important first

`src/composables/useTaskFiltering.js`:173 - correctness

The comparator already inverts: `case 'importance': cmp = (b.importance || 0) - (a.importance || 0)  // Higher importance first (descending by default)`. toggleSort then inverts again for the same column: `sortAsc.value = column === 'importance' ? false : true`, and the return is `sortAsc.value ? cmp : -cmp`. With sortAsc=false the result is `a.importance - b.importance`, i.e. importance 0/1 tasks first and the most important tasks at the bottom - the opposite of both the inline comment and the obvious purpose of the toggleSort special case. `getSortIcon` compounds it, showing the up arrow while the list is actually descending for every other column. There is no test for sortedTasks or toggleSort anywhere under src/**tests**.

**Fix:** Make the comparator natural ascending (`(a.importance || 0) - (b.importance || 0)`) and keep the `sortAsc = false` default in toggleSort, then add a test covering the first-click order for each sort column.

#### 90. endDisplayDate falls back to today, producing an end before start for future-dated items

`src/composables/useTimelineLayout.js`:97 - correctness

`const endDisplayDate = node.end_date || today` - the comment says 'Items without end_date stretch to today', which only holds for past/current items. For a task whose start_date (or due_date) is in the future and which has no end_date, endDisplayDate < displayDate. getNodeWidth then computes `days = Math.ceil((end - start)/86400000) + 1` as a negative number and clamps to MIN_BAR_WIDTH, so every future item renders as an identical 20px stub regardless of its real span. The inverted pair also flows into useTimelineDrag as `originalStart`/`originalEnd`, where the resize guards (`newStartDate <= endDate`, `newEndDate >= startDate`) are then unsatisfiable from the start.

**Fix:** Use `node.end_date || (displayDate > today ? displayDate : today)` so an item never ends before it begins.

#### 91. Undo/redo stacks are global, never cleared on workspace switch, so Cmd+Z can mutate another workspace

`src/composables/useUndoRedo.ts`:7 - correctness

The storage keys are workspace-agnostic:

```ts
const UNDO_STORAGE_KEY = 'graphcore-undoStack'
const REDO_STORAGE_KEY = 'graphcore-redoStack'
```

and `clear()` is exported but grep shows it is never called outside `src/__tests__/useUndoRedo.test.js`. Workspace switching in App.vue is a plain ref assignment (`@update:model-value="currentWorkspace = $event"`, App.vue:858) with no undo-stack reset. A user who deletes/edits nodes in workspace A, switches to workspace B, and presses Cmd+Z will silently restore/modify nodes in workspace A while looking at B — commands operate by raw node id and never check the workspace.

**Fix:** Either key the stacks by workspace (`graphcore-undoStack-${workspaceId}`) or wire `clear()` to the workspace-change watcher in App.vue. Whichever is chosen, add a test that asserts it.

#### 92. Undo/redo never broadcasts to detached windows, so they drift from the main window

`src/composables/useUndoRedo.ts`:150 - correctness

Found while tracing the command layer's write paths. Direct edits notify other windows (`useNodeOperations.ts:241` `broadcastUpdate(node)`, `:270`/`:273`/`:322` `broadcastDelete(id)`, wired to `broadcastNodeUpdate`/`broadcastNodeDelete` in App.vue:283-284). `command.undo(api)` / `command.redo` mutate the same nodes through the same api, but the only follow-up is App.vue's `onSuccess` (App.vue:265-268), which reloads the main window's children and sidebar tree. A detached window (DetachedView.vue) showing a node whose title, notes or completion is undone in the main window keeps rendering the stale value until it is reopened; undoing a delete of the node it displays leaves it showing a node the main window considers restored elsewhere in the tree.

**Fix:** Give `useUndoRedo` the same `broadcastUpdate`/`broadcastDelete` injections and have App.vue's `onSuccess` re-broadcast the affected node ids, or have each command declare the node ids it touched so the caller can broadcast them uniformly.

#### 93. Most of useViewStateController is unused; its navigation state duplicates useNavigationState

`src/composables/useViewStateController.ts` - dead-code

App.vue is the only production caller and uses exactly three of the fourteen returned members:

```js
const viewStateController = useViewStateController({ viewMode })
const { sortAlphabetically, transitioning, transitionDirection } = viewStateController
```

Grepping `src/`, `electron/` and `e2e/` shows `setViewMode`, `toggleSortAlphabetically`, `startTransition`, `endTransition`, `resetNavigationState` and the `navigation` / `loadTrashedItems` options are referenced only from `src/__tests__/useViewStateController.test.js` — no component, composable or e2e spec uses them. The `currentContainerId` / `currentContainer` / `breadcrumbs` / `children` refs and the `syncFromNavigation`-style watcher (lines 92-109) are a verbatim duplicate of `src/composables/useNavigationState.ts:39-59`, which is the version App.vue actually uses.

App.vue also hand-rolls the two behaviours this module offers: the transition setters are inlined in the `useNavigation` callbacks (App.vue:420-426) and the trash-view watcher is re-implemented at App.vue:197-199 while the `loadTrashedItems` option sits unused.

Per the project rule ("a rule that can never fire… finding such code later means deleting it, not documenting it"), tests alone do not make a capability connected.

**Fix:** Reduce this module to what is used — view mode, `sortAlphabetically`, and the transition state/setters — and have App.vue call `startTransition`/`endTransition` and pass `loadTrashedItems` instead of duplicating both inline. Delete the duplicated navigation-state block in favour of `useNavigationState.ts`, and drop the corresponding tests.

#### 94. Renderer agent loop is a fork of electron/ipc/agent.js and has already diverged

`src/services/agentService.js` - design

src/services/agentService.js re-implements, line for line, what electron/ipc/agent.js already does: the same TOOL_GROUPS map (`{ wikipedia_search: 'wikipedia', wikipedia_get_content: 'wikipedia' }`), the same `getEnabledTools`, the same tool dispatch switch, the same `parseToolArgs`, the same `processToolCalls`, and the same `runAgentLoop`. Both read the same `shared/agentConfig.json`, so the config was deliberately shared but the logic was copied instead.

The copies have already drifted. The main-process version detects models that cannot do tool calling (`isGarbageResponse(response.content) && !response.tool_calls`) and falls back to `fallbackResearch()`, and it wraps the whole loop in a try/catch that also falls back. The renderer copy has neither: on a non-tool-calling model it returns the model's garbage output verbatim, and any thrown error propagates to the caller. The same "Research" prompt therefore behaves differently in Electron and in web mode. This is the exact pattern the project rules forbid ("Never fork library code into an application - a fork silently diverges and every fix must land twice").

**Fix:** Extract the agent loop, tool registry and tool dispatch into one shared module (alongside shared/agentConfig.json) parameterised by an injected chat-request function and an injected tool executor, and have both electron/ipc/agent.js and the renderer path call it. If web mode is not actually a supported target, delete src/services/agentService.js, src/services/wikipediaService.js and the `generateWithTools` methods instead.

#### 95. formatDate(style:'iso') splits on 'T' and returns the whole SQLite timestamp

`src/utils/formatting.js`:81 - correctness

The ISO branch is `if (typeof date === 'string') return date.split('T')[0]`. SQLite's `CURRENT_TIMESTAMP` (used for `nodes.created_at` / `updated_at`) produces `"2026-08-26 12:34:56"` with a SPACE separator, not a `T`. `split('T')[0]` therefore returns the entire string unchanged. Verified by running the real function:

formatDate('2026-08-26 12:34:56', {style:'iso', empty:'-'}) -> "2026-08-26 12:34:56"
formatDate('2026-08-26 12:34:56') -> "Aug 26, 2026"

This reaches the UI: `src/components/TasksView.vue:137` renders `<td class="col-created">{{ formatDate(task.created_at) }}</td>` and `src/composables/useTaskFiltering.js:253` documents that function as "Format date as YYYY-MM-DD". The Created column shows a full timestamp instead of a date.

Second, related defect on the same line: for a real ISO instant (`'2024-06-15T10:30:00Z'`) the string branch returns the UTC calendar day while the `'locale'` branch goes through `parseDateLocal` and renders the LOCAL day. In UTC-11 the same value formats as `2024-06-15` (iso) and `Jun 14, 2024` (locale). `src/__tests__/tasks.test.js:226` locks in the UTC-day behaviour, so the two styles are tested to disagree.

**Fix:** Drop the string shortcut and route both styles through `parseDateLocal`, which already handles date-only strings without the UTC-midnight trap:

const d = parseDateLocal(date)
if (!d) return empty
if (style === 'iso') { const pad = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

Note `new Date('2026-08-26 12:34:56')` is interpreted as LOCAL by V8 while the stored value is UTC, so also normalise SQLite timestamps (replace the space with 'T' and append 'Z') before parsing, and update the tasks.test.js expectation accordingly.

#### 96. Module claims sole ownership of the text-input decision, but useKeyboardShortcuts keeps a second, contradicting one

`src/utils/inputOwnership.js`:21 - consistency

The header states: "Rather than special-case each surface in the shortcut handler, that decision lives here." It does not. `src/composables/useKeyboardShortcuts.js` aliases this module (`isEditableElement = ownsTextInput`, line 96) but ALSO defines its own `isTextInput` (lines 102-109), and the two disagree on exactly the case the local one was written for:

ownsTextInput: `target.tagName === 'INPUT'` -> true for ANY input, including checkbox/radio/button/submit/reset
isTextInput: excludes ['checkbox','radio','button','submit','reset']

Failure scenario: in the table view a user clicks a task's completion checkbox, which focuses it. Space (line 171) and Enter (line 183) use `isTextInput`, so they still work. Everything after line 194 uses `ownsTextInput` and bails, so with a checkbox focused `n` (new node), Cmd/Ctrl+A (select all), Tab/Shift+Tab, and the arrow-key row/grid navigation all silently stop working until the user clicks elsewhere. Nothing in either file documents that split.

**Fix:** Move the checkbox/radio/button exclusion into `ownsTextInput` so a single predicate governs, delete `isTextInput` from `useKeyboardShortcuts.js`, and add a case to `src/__tests__/inputOwnership.test.js` asserting `ownsTextInput(checkbox) === false`. If the split is genuinely intended, it needs two differently named exported predicates in this module (e.g. `ownsTextInput` vs `ownsPrintableKeys`) rather than a shadow copy in the consumer.

#### 97. Nine of sixteen timing constants are never referenced anywhere

`src/utils/settingsConstants.ts`:21 - dead-code

Repo-wide grep (excluding node_modules/.git) finds the definition line and nothing else for: SEARCH_DEBOUNCE_MS (21), DROPDOWN_BLUR_DELAY_MS (24), SEARCH_HIGHLIGHT_DURATION_MS (27), AI_FETCH_DEBOUNCE_MS (30), DOUBLE_CLICK_THRESHOLD_MS (33), FIT_ANIMATION_DURATION_MS (36), FIT_INTERVAL_MS (37), LOCAL_RELAX_UNLOCK_DELAY_MS (40), LAYOUT_ANIMATION_DURATION_MS (43).

The seven that are used (AUTOSAVE_DELAY_MS, MAX_UNDO_STACK_SIZE, DEBOUNCE_DELAY_MS, LAYOUT_SETTLE_DELAY_MS, LAYOUT_SAVE_DELAY_MS, LAYOUT_RELAYOUT_DELAY_MS, NODE_POSITION_SETTLE_DELAY_MS) each have a real import. The file header claims it "centralizes magic numbers" — for those nine it centralizes numbers that live nowhere else, so the corresponding literals are still hard-coded in whatever component owns that timing (e.g. search debouncing, dropdown blur, fit animation).

**Fix:** Delete the nine unused exports, or replace the literals at their intended call sites with them in the same change. A cheap gate: extend the existing docsNodeTypes-style meta-test with a check that every export of `settingsConstants.ts` has at least one importer.

## Low (108)

#### 98. Backup path built with String.replace('.db') on an unsanitized IPC-supplied suffix

`electron/database/backup.js`:23 - correctness

`ctx.dbPath.replace('.db', `-backup-${timestamp}${suffix}.db`)` has two problems. (1) `String.replace` with a string pattern replaces the _first_ occurrence, so a userData directory containing `.db` anywhere in its path produces a backup path in the wrong directory; if `dbPath` had no `.db` at all, `backupPath === dbPath` and `backup()` would overwrite the live database — which `restoreBackup` invokes as `this.backup('-pre-restore')` immediately before replacing it. (2) `suffix` arrives unvalidated from the renderer: `electron/ipc/database.js:181` is `ipcMain.handle(DB_BACKUP, (_event, suffix) => db.backup(suffix))` and preload.js:83 forwards it verbatim, so a suffix containing `../` writes the database contents to an arbitrary filesystem location.

**Fix:** Build the path from `path.dirname`/`path.basename(dbPath, '.db')` (as `listBackups` already does at lines 39-40) rather than `replace`, and reject or strip any suffix that does not match `/^[-A-Za-z0-9_]*$/` before interpolating it. `restoreBackup(backupPath)` deserves the same treatment: it accepts any renderer-supplied path and loads it as the database.

#### 99. readSlots duplicates payloadOffset's header walk but skips the format-version check

`electron/database/encryption.js`:125 - consistency

`payloadOffset` validates the version byte:

    const version = file[offset]
    if (version !== FORMAT_VERSION) throw new Error(`Unsupported encryption format version: ${version}`)

`readSlots` walks the same header and does not:

    let offset = ENCRYPTION_MAGIC.length + 1   // skips the version byte silently
    const slotCount = file[offset]

`readSlots` is the _first_ thing that touches a file at boot — `keyManager.unlockWithKeychain` and `unlockWithPassword` both start with it, and `electron/main.js:391` calls it directly. So a future v2 file opened by a v1 build would be mis-parsed into garbage slots and reported as a keychain/password failure rather than the accurate 'Unsupported encryption format version', which is exactly the case the check exists for. The two functions also duplicate the same offset arithmetic, so a format change has to land in both.

**Fix:** Extract one header parser that validates magic and version and returns `{ slots, payloadOffset }`, and have `readSlots`, `payloadOffset` and `decryptDatabase` all use it.

#### 100. Exports write decrypted sensitive notes with none of the confirmation the architecture doc specifies

`electron/database/export.js` - correctness

`docs/architecture/sensitive-notes.md:45` states: "A sensitive note exports as its ciphertext marker string when the session is locked, and as decrypted content when unlocked and the export is confirmed. The export UI states which of the two applies before writing the file."

The plaintext half is implemented - `ctx.getNode`/`ctx.getNodes` run rows through `_rowToNode`, which calls `sensitiveSession.decryptForRead`, so `exportMarkdown`, `exportJSON` and `exportCSV` all emit decrypted notes while the session is unlocked. The confirmation half does not exist anywhere: `DetailPanel.vue:512-539` calls `api.exportMarkdown` / `exportJSON` / `exportCSV` and hands the result straight to `downloadFile`, with no prompt and no statement of lock state (grepping `DetailPanel.vue` for `sensitive` shows only the note-reveal flow, nothing in the export handlers). An unlocked user exporting a subtree silently writes decrypted sensitive notes to an unencrypted file on disk.

**Fix:** Either implement the documented gate - have the export path report whether the session is unlocked and require an explicit confirmation in the export menu before writing - or amend the doc to match what actually ships. Cover the chosen behaviour with a test so the doc and code cannot drift again.

#### 101. importJSON counts failed links as created; the surrounding catch is unreachable

`electron/database/export.js`:283 - correctness

```js
try {
  ctx.linkNodes(newSourceId, newTargetId)
  linksCreated++
} catch {
  // Ignore duplicate link errors
}
```

`links.js linkNodes` has its own `try/catch` and returns `{ success: false, error }` on failure - it never throws. So the `catch` here can never run (dead code), and `linksCreated++` executes even when the insert was rejected. Verified with a payload containing a duplicated link pair:

```
importJSON {"rootId":1,"nodesImported":3,"linksCreated":2}  actual rows 1
```

`DataSettings.vue:72` surfaces this count to the user after an import, so the reported number is wrong.

**Fix:** Drop the try/catch and branch on the returned value: `const res = ctx.linkNodes(newSourceId, newTargetId); if (res.success) linksCreated++`.

#### 102. start_date backfill derives a UTC date from created_at and renders it as a local date

`electron/database/migrations.js`:143 - correctness

`UPDATE nodes SET start_date = DATE(created_at)` — `created_at` defaults to SQLite `CURRENT_TIMESTAMP`, which is UTC. `DATE()` truncates in UTC, but `start_date` is a date-only string the renderer displays as a local calendar date. For a user at UTC-8 who creates a task at 20:00 local on Jan 1, `created_at` is `2026-01-02 04:00:00` and the backfilled `start_date` becomes Jan 2 — one day after the task was actually created. The same shift applies in the opposite direction for large positive offsets.

**Fix:** Use `DATE(created_at, 'localtime')`, or store `created_at` with an explicit offset. Add a test that pins the process timezone (TZ=America/Los_Angeles) and asserts the backfilled start_date equals the local creation date.

#### 103. Ten of the eleven exports from migrations.js are imported nowhere

`electron/database/migrations.js`:388 - dead-code

`module.exports` lists `runMigrations`, `runColumnMigrations`, `seedDefaultWorkspaces`, `runDataMigrations`, `migrateShowLinksDefault`, `migrateUnassignedNodesToWork`, `migrateTasksProjectsStartDate`, `fixRootNodePaths`, `migrateOrganizationTextToLinks`, `migratePersonsOrgsToWorkWorkspace`, `migrateStringTagsToTagNodes`. Grepping src/, electron/, e2e/ and src/**tests**/ for each name outside migrations.js returns zero hits for all of them except `runMigrations` (imported by index.js:10). They are not exported for testing either — there is no migrations test file.

**Fix:** Either export only `runMigrations` and keep the rest module-private, or write the per-migration tests that would justify the exports (which the version-tracking fix needs anyway).

#### 104. deleteNode resolves the victim with getNode, which cannot see the trashed row it is purging

`electron/database/nodes.js`:273 - correctness

```js
const node = ops.getNode(id) // filters deleted_at IS NULL
const newParentId = node?.parent_id || null
```

The hard-delete path is invoked on nodes that are already in the trash - `useDataLoading.ts:289` (`permanentlyDelete`) and `:336` (`deleteOrphanedNode`) both call `api.deleteNode(node.id, true)` on trashed rows. For those, `ops.getNode(id)` returns `null`, so `newParentId` silently falls back to `null` and any live child of that node is reparented to root instead of to the purged node's real parent.

The module already has the right primitive for this and documents why: `getNodeRow` (line 65) - "Path maintenance has to see soft-deleted rows too: they are still real children in the table". `deleteNode` is the one place that ignores it.

**Fix:** Use `getNodeRow(id)` (which returns `parent_id` regardless of `deleted_at`) to compute `newParentId`, and use `?? null` rather than `|| null` so a falsy-but-valid id can never be coerced away.

#### 105. computed_value column is persisted by setCells but written by no production caller

`electron/database/schema.js`:151 - dead-code

`node_table_cells.computed_value` is declared at schema.js:151, selected in `getTableCells` (tables.js:113) and written in `setCells` (tables.js:150). Grepping the whole tree for `computed_value` outside electron/database returns exactly two hits: `src/components/TableMiniature.vue:36` (`cell?.value || cell?.computed_value || ''`) and `src/__tests__/nodeTable.test.js:155`. No production code path ever puts `computed_value` on a cell object — `useNodeTable.saveCell` sets only `value` or `formula`, and formula evaluation happens client-side in `src/utils/spreadsheetFormulas.js`. So the column is always NULL and the TableMiniature fallback can never fire.

**Fix:** Either wire formula results through so computed_value is actually persisted, or delete the column, the setCells parameter, the SELECT, and the TableMiniature fallback. Per the project rule, dead code is deleted rather than documented.

#### 106. search/searchCount person branch inverts the workspace filter, and the JSDoc states the opposite of the real semantics

`electron/database/search.js`:53 - correctness

`_applyWorkspaceFilter` (index.js) treats `undefined` as "no filter" (all workspaces) and `null` as `AND workspace_id IS NULL` (only workspace-less rows). The JSDoc on `search` says the reverse: "undefined uses context default, null searches all".

Acting on that wrong reading, both `search` (line 53) and `searchCount` (line 84) do:

```js
const effectiveWorkspaceId = type === 'person' && workspaceId === undefined ? null : workspaceId
```

which converts an unscoped person search into one restricted to `workspace_id IS NULL`. Verified against a real DB - a person in workspace 'work' is not found:

```
search person undefined ws: []
search note   undefined ws: [ 'T', 'T2' ]
```

The branch is also unreachable today: no caller passes `type === 'person'` to `search` (App.vue:480 passes `null`; `useMentions.js` and `PersonsView.vue` use `api.getNodes` instead), and no test exercises it. So it is simultaneously a wrong rule and a rule that can never fire.

**Fix:** Delete the `effectiveWorkspaceId` person special case from both methods and fix the `@param workspaceId` JSDoc on `search`/`searchCount` to state the actual contract: undefined = all workspaces, null = workspace-less rows only.

#### 107. clearSettings is unreachable: no IPC channel, no preload method, no caller

`electron/database/settings.js`:81 - dead-code

`clearSettings()` is defined at settings.js:81 and bound at index.js:205. Grepping the entire tree (src/, electron/, e2e/, docs/) for `clearSettings` or `CLEAR_SETTINGS` returns only those two lines. There is no entry in `electron/ipcChannels.js`, no handler in `electron/ipc/database.js`, no preload bridge method, and no test. It is a capability that cannot be reached from any interface.

**Fix:** Delete `clearSettings` and its binding, per the project rule that unreachable capabilities are deleted rather than documented. If a "reset all settings" action is actually wanted, add the channel, the preload method and the UI in the same change.

#### 108. getProjects, getInbox and getTree are exposed end-to-end but called by nothing

`electron/database/tree.js`:61 - dead-code

All three are bound in index.js, registered as IPC handlers (`electron/ipc/database.js:104,105,126`), bridged in `electron/preload.js:17,18,35`, and typed in `src/types/api.ts` and `src/services/api.ts` - yet grepping `src/`, `e2e/` and the vitest suites for `getProjects`, `getInbox` and `getTree` (excluding the api definition files) turns up zero call sites; the only `getTree` hits are the unrelated `getTreePrefix` helper in TableView.vue. `searchCount` (search.js:79, this module group) is in the same state: registered on `DB_SEARCH_COUNT`, bridged, typed, and called only from `src/__tests__/database.integration.test.js:385`.

That is four fully-plumbed capabilities that no UI reaches, which the project rules treat as code to delete rather than keep.

`searchCount` additionally has a contract mismatch: the DB method returns a bare `number` (`result[0]?.count || 0`), while `src/services/api.ts:792` and `src/types/api.ts:209` both declare `Promise<{ count: number }>`. The Electron bridge passes the number straight through, so any future caller reading `.count` would get `undefined`.

**Fix:** Delete `getProjects`, `getInbox`, `getTree` and `searchCount` together with their IPC channels, preload entries and api.ts declarations, or wire them to a real UI surface. If `searchCount` is kept, reconcile the return shape with the renderer type in the same change.

#### 109. is_default workspace column is never written or read by anything

`electron/database/workspaces.js`:54 - dead-code

`is_default INTEGER DEFAULT 0` is declared at schema.js:92, listed in `updateWorkspace`'s `allowedFields` (workspaces.js:54), typed in `src/types/workspace.ts:29,55` and documented in docs/architecture/database.md:52. Grepping the whole tree for `is_default` finds no caller that ever passes it to `updateWorkspace`, no query that filters or orders by it, and no UI that reads it — `createWorkspace` does not set it and `getWorkspaces` orders by `sort_order, name`. It is a column with no producer and no consumer.

**Fix:** Drop `is_default` from the schema, `allowedFields`, the TypeScript types and the docs table — or implement the default-workspace behaviour it names (which would also need logic to clear the flag on the previous default).

#### 110. SECURITY_DISABLE strands the sensitive-notes layer in a now-plaintext database

`electron/ipc/security.js`:99 - correctness

The handler clears `db.encryptionKey`/`db.encryptionSlots` and re-saves as plaintext, without consulting the sensitive-notes session at all. Afterwards:

- `sensitiveNotesWrappedKey` and every `SNENC1:` note remain in what is now a plaintext file on disk, so the wrapped key material is readable by anyone who takes the file — precisely the threat the layer was stacked on top of.
- `SENSITIVE_STATUS` returns `available: isDatabaseEncrypted()` = false, and `SensitiveNotesSettings.vue` is gated on `v-if="status.available"`, so the entire section — including the only 'Disable encryption' button — disappears from Settings. The user cannot turn sensitive notes off or reach the wrapped key from the UI any more.

The prerequisite is documented one-directionally ('The setting is unavailable until the database is encrypted') but nothing enforces the reverse transition.

**Fix:** Refuse SECURITY_DISABLE while a sensitive-notes session is enabled (`{ success: false, error: 'Turn off sensitive notes first' }`), or decrypt the sensitive notes as part of the same batch. Either way the UI needs to say so; today it silently strands the layer.

#### 111. sensitiveDisable's password parameter is threaded through four layers and then ignored

`electron/ipc/sensitiveNotes.js`:74 - consistency

The main-process handler takes no argument:

    ipcMain.handle(SENSITIVE_DISABLE, () => { ... })

but a password is declared and passed the whole way down: `src/types/api.ts:274` and `src/services/api.ts:131` declare `sensitiveDisable(password: string)`, `src/services/api.ts:884` forwards it, `electron/preload.js:98` does `ipcRenderer.invoke(C.SENSITIVE_DISABLE, password)`, and `src/composables/useSensitiveNotes.js:35` takes and forwards `password`. `SensitiveNotesSettings.vue` reaches it via `run(disable, ...)`, which always passes `password.value` — and in the unlocked branch no password input is rendered, so the value is always `''`.

So the signature advertises an authorization check that does not exist, and the argument is dead across four files. (The handler's own comment acknowledges this: 'The unlock is the authentication; no separate password.') The type declarations are the aspirational half.

**Fix:** Pick one: either make the handler actually verify the password (see the SENSITIVE_ENABLE finding — the same verification is needed there), or drop the parameter from the handler contract, preload, `api.ts`, `types/api.ts` and the composable so the signature tells the truth.

#### 112. setupQuickCapture's re-entry branch is unreachable and would ignore the enabled setting if it ran

`electron/main.js`:335 - dead-code

```js
function setupQuickCapture() {
  if (quickCapture) {
    quickCapture.register()
    return
  }
  ...
}
```

This branch can never execute. `setupQuickCapture` is called only from `finishUnlock` (main.js:326), and `finishUnlock` runs at most once: at boot when `!locked` (main.js:399), or from the SECURITY_UNLOCK handler, which short-circuits with `if (getDb()) return { success: true }` (electron/ipc/security.js:71). Grepped: no other caller of `finishUnlock` or `setupQuickCapture` exists in electron/, src/, or the tests.

Worse, if it ever did run it calls `quickCapture.register()` directly rather than `applyCaptureRegistration()`, so it would register the global hotkey even when `quickCaptureEnabled === 'false'` — the exact case the sibling function at main.js:362 exists to handle.

**Fix:** Delete the branch (per the project rule on dead code), or if it is meant as re-entry protection route it through `applyCaptureRegistration()` so the enabled setting is honoured.

#### 113. Five IPC channels are wired end to end but no renderer code ever calls them

`electron/preload.js`:17 - dead-code

Grepped the whole tree (src/, electron/, e2e/, src/**tests**/) — these preload methods and their channels have no caller outside the plumbing that defines them (ipcChannels.js, preload.js, preload.build.js, electron/ipc/database.js, src/services/api.ts, src/types/api.ts):

- `getProjects` / DB_GET_PROJECTS (preload.js:17)
- `getInbox` / DB_GET_INBOX (preload.js:18)
- `getTree` / DB_GET_TREE (preload.js:35)
- `getNodesLinkedToTag` / DB_GET_NODES_LINKED_TO_TAG (preload.js:72)
- `searchTagNodes` / DB_SEARCH_TAG_NODES (preload.js:73)

Each carries a channel constant, a main-process handler, a preload method, a browser-backend implementation and an electron-backend implementation in src/services/api.ts, plus two interface declarations — and zero components, composables, stores or e2e tests reach any of them. CODEBASE-REVIEW.md:778 already flags getInbox/getProjects; getTree and the two tag channels are additional.

**Fix:** Delete the channels, handlers, preload methods, api.ts implementations and type declarations together (the project rule is to delete unreached code, not document it), or wire them into the UI feature that was meant to consume them.

#### 114. captureSetConfig return shape does not match the declared type; the UI reads fields the contract does not carry

`electron/preload.js`:107 - typing

The main handler returns `{ success: ok || !enabled, registered: ok }` (electron/main.js:356), but the bridge is typed as `captureSetConfig(config: CaptureConfig): Promise<SecurityResult>` in both src/services/api.ts:135 and src/types/api.ts:278, where `SecurityResult = { success: boolean; error?: string }` (src/services/api.ts:50-53).

So the contract is wrong in both directions:

- `registered` is returned by main and read by the UI (`if (result.success && result.registered !== false)`, src/components/settings/QuickCaptureSettings.vue:29) but is absent from the type.
- `error` is declared and read (`result.error || 'Could not register the hotkey...'`, QuickCaptureSettings.vue:36) but main never sets it, so the error branch always falls back to the generic string.

QuickCaptureSettings.vue is plain `<script setup>` (no `lang="ts"`), which is why `vue-tsc --noEmit` does not catch the mismatch.

**Fix:** Introduce a dedicated `CaptureSetResult { success: boolean; registered: boolean; error?: string }`, use it in src/services/api.ts and src/types/api.ts, and have the main handler populate `error` on registration failure.

#### 115. Workspace deletion asks for confirmation twice and ignores the emitted payload

`src/App.vue`:169 - correctness

`WorkspaceSelector.deleteWorkspace()` (WorkspaceSelector.vue:115-121) already confirms before emitting:

```js
if (confirm(`Delete workspace "${currentWorkspace.value?.name}"? This cannot be undone.`)) {
  emit('delete', props.modelValue)
```

App.vue's handler then confirms a second time with a different message and discards the emitted id:

```js
async function deleteCurrentWorkspace() {
  const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
  if (ws && confirm(`Delete workspace "${ws.name}"?`)) await _deleteCurrentWorkspace()
}
```

The user sees two native confirm dialogs in a row for one action. The child's `delete` payload (`props.modelValue`) is never read; the handler re-derives the workspace from `currentWorkspace`, so the emit contract is decorative and would silently do the wrong thing if the selector ever emitted a workspace other than the current one.

**Fix:** Keep one confirmation. Either drop the `confirm` in App.vue (the child already asked and its message is the more accurate one), or drop it from `WorkspaceSelector` and have the handler accept the emitted id: `@delete="deleteWorkspace($event)"`.

#### 116. linkedToId branch can never fire — no production caller passes it

`src/commands/CreateCommand.js`:7 - dead-code

The constructor accepts `linkedToId = null` and both `execute()` (lines 22-25, `api.linkNodes`) and `undo()` (lines 29-32, `api.unlinkNodes`) branch on it. Grepping the whole tree (src/, electron/, e2e/) finds exactly one production construction site, `src/composables/useNodeOperations.ts:205`: `new CreateCommand({ nodeId: newNode.id, nodeData, parentId })` — no `linkedToId`. Every other occurrence is in src/**tests**/commands/CreateCommand.test.js and src/**tests**/commandFactory.test.js. The comment on line 22 ("Restore the link that undo removes") describes behaviour nothing can reach; the tests keep it green while no user action produces it.

**Fix:** Either wire it up (the person/organization creation path in PersonsView.vue creates and links in one action and currently has no undo for the link), or delete the parameter, both branches, and the tests that only exercise them.

#### 117. AiPromptModal's isLoading prop is unreachable in both of its usages

`src/components/AiPromptModal.vue`:6 - dead-code

AiPromptModal is used only by NotesAIToolbar (lines 193-208), which passes `:is-loading="isGenerating"`. But both submit handlers close the modal _before_ generation starts: `handleCustomPromptSubmit` sets `showCustomPromptModal.value = false` then awaits `generateImprovement` (NotesAIToolbar.vue:68-71), and `handleResearchSubmit` sets `showResearchModal.value = false` then awaits `research` (lines 73-79). Because both modals are rendered under `v-if`, they are unmounted the moment `isGenerating` flips to true, so `isLoading` is always `false` while the component is alive. The spinner (line 66), the disabled textarea (line 56), the disabled Cancel button (line 64) and the `!props.isLoading` guard in `handleSubmit` (line 18) can therefore never fire.

**Fix:** Either keep the modal mounted while generating (do not clear `showCustomPromptModal`/`showResearchModal` until the await resolves), which makes the existing loading UI meaningful, or delete the `isLoading` prop and every branch that depends on it. The current in-between state is unreachable code.

#### 118. 'navigate-root' emit is declared and handled by the parent but never fired

`src/components/AppSidebar.vue`:28 - dead-code

AppSidebar's `defineEmits` list includes `'navigate-root'` (line 28), and App.vue wires a handler for it: `@navigate-root="navigateToBreadcrumb(-1)"` (App.vue:847). Grepping AppSidebar.vue for `navigate-root` returns only the emits-array entry — no `emit('navigate-root')` anywhere in the template or script, and no other component emits it. The event can never fire, so both the declaration and the parent handler are dead. There is no clickable "go to root" affordance in the sidebar either (the header `<h2>Graph Core</h2>` only re-emits `mouseenter`), so this looks like a UI element that was planned and never connected.

**Fix:** Either wire the sidebar header/title to `emit('navigate-root')` so the capability is reachable, or delete the emit declaration and App.vue:847.

#### 119. CaptureView reaches for window.electronAPI directly while api.hideCapture exists and is dead

`src/components/CaptureView.vue`:19 - design

The component imports the service layer for one call (`import { api } from '../services/api'`, then `api.createNode(...)`) but bypasses it for the other: `window.electronAPI?.hideCapture?.()` (line 19). `api.hideCapture` already exists — declared in the interface at src/services/api.ts:133, given a no-op browser fallback at line 573, and implemented as `hideCapture: () => window.electronAPI!.hideCapture()` at line 886. Grepping src/ for `hideCapture` outside services/api.ts and types/api.ts returns only CaptureView.vue:19 and the test's `window.electronAPI` stub, so `api.hideCapture` and its browser fallback are dead code.

This is the 'discovered implementation' pattern the project rules prohibit: the component probes a global that may or may not exist (hence the double optional chaining) instead of depending on the injected service. It also means the non-Electron fallback path that api.ts was written to provide never runs, and the test has to stub a global rather than the service it mocks for `createNode`.

**Fix:** Call `api.hideCapture()` and delete the `window.electronAPI` access; update captureView.test.js to mock `api.hideCapture` alongside `api.createNode`. If `api.hideCapture` is genuinely not wanted, delete it from services/api.ts and types/api.ts instead — but the two must not both exist.

#### 120. No unit or e2e test covers DetailPanel or any detail/ component

`src/components/DetailPanel.vue` - correctness

`ls src/__tests__` and grep for DetailPanel/ChildrenSection/MetadataGridSection/PersonDetailForm/OrganizationDetailForm/NotesSection turn up only composable tests that mock `detailPanelRef` (useRefresh, useAppLifecycle, useNodeCreation, useDetailController). e2e/ has three specs; split-view.spec.js only asserts the `.notes-split` panes and divider exist. So ~3400 lines of the app's densest UI — the notes autosave, the sensitive-note reveal flow, the export menu, children reorder, the metadata grid — have no behavioural coverage, which is how the defects above survive. Per CLAUDE.md a feature is done only when reachable from the UI _and_ covered by tests.

**Fix:** Add vitest component tests for at least: node-switch state reset, notes autosave debounce, the locked-note guard, and the ChildrenSection reorder/toggle emit contracts.

#### 121. Detach button renders in the detached window, where no parent handles the event

`src/components/DetailPanel.vue`:673 - correctness

`isElectron` (line 48) is `!!window.electronAPI?.openDetachedWindow`. `electron/ipc/window.js:22` gives detached windows the same `preload.build.js`, so the flag is true inside a detached window too and the detach button renders — but `src/components/DetachedView.vue:254` mounts DetailPanel without an `@detach` listener, so the button does nothing. The same file passes `@toggle-fullscreen="() => {}"`, `@toggle-pin="() => {}"` and `@open-link-search="() => {}"`, leaving the fullscreen, pin and "+Link"/"Add link" controls visible and inert in that window.

**Fix:** Gate the header controls on capability props supplied by the host (e.g. `:can-detach`, `:can-link`) rather than on a probed global, and have DetachedView pass false for the ones it cannot service.

#### 122. add-child payload contract diverges between the main window and the detached window

`src/components/DetailPanel.vue`:929 - consistency

DetailPanel emits `add-child` with `{ parentId, title: '', type: 'task', prompt: true }` for the per-child "+" button. `useNodeCreation.js:addChildFromDetail` documents and honours this: "the subtask button sends `prompt: true` with no title, which must open the modal rather than create an untitled node". `DetachedView.vue:166 addChild()` ignores `prompt` entirely and does `title: payload.title || 'New Task'`, so in a detached window the same button silently creates a node literally named "New Task" instead of prompting.

**Fix:** Handle the `prompt: true` descriptor in DetachedView (or extract the shared handling), and add a test asserting both hosts treat the descriptor identically.

#### 123. Three declared emits are never emitted: toggle-complete, toggle-favorite, open-link-search

`src/components/GraphView.vue`:61 - dead-code

defineEmits lists 'toggle-complete' (61), 'toggle-favorite' (62) and 'open-link-search' (63). `emit` is handed only to useGraphEvents and useGraphModals; grepping every emit() call in both composables plus GraphView itself shows no emission of any of the three (the tooltip's onToggleComplete callback emits 'update', not 'toggle-complete'). ViewRenderer's <GraphView> binding block also has no @toggle-complete/@toggle-favorite/@open-link-search listener, so even if they were emitted nothing would receive them.

**Fix:** Delete the three entries from defineEmits, or wire the corresponding gestures through ViewRenderer to App.vue's toggleComplete / handleContextMenuToggleFavorite / handleContextMenuOpenLinkSearch.

#### 124. graph-center-node listener, handleCenterEvent, _centerOn and the centerOnNode import are unreachable

`src/components/GraphView.vue`:701 - dead-code

onMounted registers `window.addEventListener('graph-center-node', handleCenterEvent)` (720) and onUnmounted removes it (740). A repo-wide grep for 'graph-center-node' (excluding node_modules/.git/dist) returns only those two lines — nothing anywhere in src/, electron/, e2e/ or tests dispatches that CustomEvent. Consequently handleCenterEvent (702-704), `_centerOn` (701) and the `centerOnNode` import (15) are dead, and useGraphSelection's exported centerOnNode has no remaining caller.

**Fix:** Delete the listener, handleCenterEvent, _centerOn and the centerOnNode import (and centerOnNode itself in useGraphSelection.js if it stays unused), or dispatch the event from the code that is supposed to centre the graph.

#### 125. Most of the defineExpose surface is unreachable from any caller

`src/components/GraphView.vue`:707 - dead-code

defineExpose exposes relaxLayout, localRelax, fitView, saveNodePositions, updateGraph, isNodeVisible, maxDepth and visibleTypes. The only holder of a GraphView ref is ViewRenderer (`ref="graphViewRef"`), which re-exposes exactly two wrappers: `updateGraph` and `loadTasks`. App.vue passes `graphViewRef: viewRendererRef` into useRefresh, which calls only `.updateGraph()`. Grep across src/, e2e/ and src/**tests** finds no caller for relaxLayout, localRelax, fitView, saveNodePositions or isNodeVisible outside useGraphLayout's own unit tests, and no reader of the exposed maxDepth/visibleTypes. `_isVisible` (705) and the isNodeVisible import exist purely to feed this dead expose.

**Fix:** Keep updateGraph and delete the rest of the expose (plus _isVisible and the isNodeVisible import), or surface the missing operations through ViewRenderer so they are actually callable.

#### 126. Escape closes the shortcuts modal and also fires the global Escape shortcut

`src/components/KeyboardShortcutsModal.vue`:74 - correctness

The modal's document listener neither stops propagation nor is registered in the capture phase:

```js
function handleKeydown(e) {
  if (e.key === 'Escape') { emit('close') }
}
...
document.addEventListener('keydown', handleKeydown)
```

The modal contains no focusable text input, so `isEditableElement(e.target)` in `useKeyboardShortcuts.handleKeydown` is false and the window-level Escape branch (src/composables/useKeyboardShortcuts.js:232) also runs: it exits fullscreen detail or calls `clearSelection()`. Pressing Escape to dismiss the shortcuts help therefore also drops the user's node selection.

This is exactly the class of bug `OnboardingModal.vue` documents and guards against in its own handler (lines 118-127 and 133-137: `preventDefault` + `stopPropagation` + `stopImmediatePropagation`, registered with `{ capture: true }`), and its comment explicitly claims it is following "the same pattern as KeyboardShortcutsModal" -- but this file never adopted that guard. The `watch` here also lacks the `{ immediate: true }` that OnboardingModal uses.

**Fix:** Mirror OnboardingModal: register with `{ capture: true }`, call `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()` before emitting `close`, and add `{ immediate: true }` to the watch so both modals share one idiom. Cover it with a test that asserts the global Escape handler is not reached while the modal is open.

#### 127. Theme tooltip is captured once at mount and never updates when the theme is cycled

`src/components/MainToolbar.vue`:37 - correctness

`{ el: themeBtn.value, content: () => themeTooltip.value }` (line 37) relies on tippy re-evaluating the function on each show. tippy.js v6 resolves a function `content` when the instance is created (and on `setProps`), not per show, and nothing here calls `instance.setProps` or `instance.setContent`. `themeTooltip` (lines 23-26) is a reactive computed over `currentTheme`, but the tooltip text is frozen at the value present on mount, so after clicking through light -> dark -> system the tooltip still reads e.g. "Theme: System (click to change)". This is also the only function-valued tippy `content` in the codebase; ViewSwitcher.vue:22, TypeFilterDropdown.vue:66, WorkspaceSelector.vue and GraphView.vue:731 all pass static strings.

**Fix:** Keep a reference to the theme instance and `watch(themeTooltip, v => themeInstance.setContent(v))`, or drop the function and set a static label.

#### 128. replaceSelection is exposed but never called by any consumer

`src/components/NotesEditor.vue`:271 - dead-code

`function replaceSelection(newText)` (line 271) is part of `defineExpose(...)` (line 299). Grepping the whole tree (src/, electron/, e2e/, docs/) for `replaceSelection` returns only these two lines in NotesEditor.vue itself. The three consumers that hold a NotesEditor ref (DetailPanel.vue, detail/NotesSection.vue, PersonsView.vue) use only `getSelection`, `getScrollElement`, `getScrollInfo` and `setScrollTop`. Selection-scoped AI edits are applied by splicing the notes string in useNodeActionsUI.ts:378 / DetachedView.vue:93, not through the editor.

**Fix:** Delete `replaceSelection` and drop it from `defineExpose`.

#### 129. PersonsView declares an 'update' emit it never fires and a selectedId prop it never reads

`src/components/PersonsView.vue`:27 - dead-code

`defineEmits(['select', 'update', 'delete', 'context-menu'])` (line 27) declares `update`, but grepping PersonsView.vue for `emit(` returns only three call sites: `context-menu` (line 32), `delete` (line 319) and `select` (line 436). No `emit('update', ...)` exists, and ViewRenderer's `<PersonsView>` binding (ViewRenderer.vue:266-274) does not listen for `@update` either.

Similarly, `selectedId: Number` (line 22) is declared and ViewRenderer passes `:selected-id="selectedNode?.id"` (line 269), but grepping the file for `selectedId|selected-id` returns only the prop declaration — the template never highlights the selected person in either the cards or the table view, unlike TimelineView which uses `:class="{ selected: selectedId === node.id }"`. Either the selection highlight is a missing feature or the prop is dead.

**Fix:** Delete the `update` emit declaration. For `selectedId`, either use it to mark the active row/card (matching TimelineView's `selected` class convention) or remove the prop and the ViewRenderer binding.

#### 130. Organization autocomplete keyboard nav produces index -1 and calls linkOrganization(undefined)

`src/components/PersonsView.vue`:404 - correctness

In `handleOrgKeydown`:

```js
const hasCreateOption = !exactOrgMatch.value && Boolean(orgQuery.value.trim())
const max = hasCreateOption ? filteredOrganizations.value.length : filteredOrganizations.value.length - 1
selectedOrgIndex.value = Math.min(selectedOrgIndex.value + 1, max)
```

With an empty query and no organizations in the workspace, `filteredOrganizations` is `[]` and `hasCreateOption` is false, so `max === -1` and ArrowDown sets `selectedOrgIndex` to -1. The subsequent Enter branch takes `selectedOrgIndex.value < filteredOrganizations.value.length` (-1 < 0 is true) and calls `linkOrganization(filteredOrganizations.value[-1])`, i.e. `linkOrganization(undefined)`. Inside that function `org.id` throws a TypeError; because the call is not awaited and has no catch, it becomes a floating rejected promise — nothing is linked, nothing is reported. The guard `showOrgDropdown` is set to true on `@focus` regardless of whether the dropdown actually renders (its `v-if` also requires `filteredOrganizations.length > 0 || orgQuery.trim()`), so the keydown path is live even when no list is visible.

**Fix:** Clamp the lower bound as well (`Math.max(0, Math.min(selectedOrgIndex.value + 1, max))`) and guard the Enter branch on a non-null `filteredOrganizations.value[selectedOrgIndex.value]` before calling `linkOrganization`.

#### 131. Recent-items list renders a keyboard selection that keyboard input can never move or activate

`src/components/SpotlightSearch.vue`:139 - correctness

The recents branch (`v-else-if="recentItems.length > 0"`) renders `:class="{ selected: index === selectedResultIndex }"` and `@mouseenter="emit('update:selectedResultIndex', index)"`, i.e. it presents itself as a keyboard-navigable list. But the only consumer of the `keydown` emit is `handleSearchKeydown` in `src/composables/useSearch.ts`, and every branch there is gated on `searchResults.value.length > 0`:

```ts
} else if (e.key === 'ArrowDown') {
  e.preventDefault()
  if (searchResults.value.length > 0) { ... }
} else if (e.key === 'Enter' && searchResults.value.length > 0) {
  const selectedResult = searchResults.value[selectedResultIndex.value]
```

The recents list is only shown when `searchResults` is empty, so Arrow Up/Down never move the highlight (it stays pinned at index 0) and Enter does nothing at all. Mouse hover moves the highlight to a row that Enter then cannot activate. Recents are reachable only by mouse click.

**Fix:** Either make `handleSearchKeydown` operate over the visible list (results when non-empty, otherwise `recentItems.slice(0, 10)`) so Arrow/Enter select recents, or drop the `selected` class and the `mouseenter` index emit from the recents branch so it does not advertise keyboard navigation it does not have.

#### 132. Miniature falls back to computed_value, which nothing in the app ever writes; formula cells render blank

`src/components/TableMiniature.vue`:36 - consistency

```js
return cell?.value || cell?.computed_value || ''
```

Grepping `computed_value` across `src/` and `e2e/` finds only this line plus a hand-built fixture in `src/__tests__/nodeTable.test.js:155`. The write path never populates it: `useNodeTable.js:117-127 saveCell` sets either `cellData.formula` or `cellData.value` and nothing else, and `electron/database/tables.js:150` just persists whatever `cell.computed_value` was passed (always undefined from the app). No formula evaluator exists — `src/utils/spreadsheetFormulas.js` exports only `isFormula`, `getColumnName`, `parseCellReference`, `toCellReference`.

Meanwhile `NodeSpreadsheet.vue:118` reads `cell?.value || cell?.formula`. So a cell holding `=SUM(A1:A2)` shows the formula text in the spreadsheet and an empty cell in the card miniature.

**Fix:** Use the same fallback as the spreadsheet (`cell?.value || cell?.formula || ''`) and drop the `computed_value` reference until something actually computes it.

#### 133. 'toggle-favorite' declared in defineEmits but never emitted

`src/components/TableView.vue`:40 - dead-code

`'toggle-favorite'` appears in TableView's `defineEmits` array. Grepping `emit(` in the file (lines 59-300) shows it is never emitted, and `ViewRenderer.vue:133-162` — the only place TableView is mounted — registers no `@toggle-favorite` listener. The favorite state is only read for the star glyph on line 284; there is no toggle affordance in this view.

**Fix:** Remove the entry from `defineEmits`, or wire an actual toggle control if the capability is wanted in the table.

#### 134. Header declares 9 columns but every body row renders 8 cells

`src/components/TableView.vue`:204 - correctness

`<thead>` renders `col-expand, col-type, col-check, col-title, col-notes, col-due, col-children, col-fav, col-actions` (9 `<th>`, including `<th class="col-fav" :style="{ width: colWidths.fav + 'px' }"></th>`). Both body rows — the parent row (lines 211-233) and the node row (lines 260-301) — render only 8 `<td>`, with no `col-fav` cell; the favorite star was moved into `col-title` (line 284). `TableView.css` has no `.col-fav` rule at all, and `defaultColumnWidths.fav = 30` in `config/tableColumns.js:19` is still reserved for it.

Result: the `col-actions` delete button is laid out under the 30px `col-fav` header and the last (60px) header column is always empty.

**Fix:** Delete the `col-fav` `<th>` and the `fav` entry from `defaultColumnWidths`, since the star now lives in the title cell.

#### 135. TagInput emits 'link' but no parent ever listens for it

`src/components/TagInput.vue`:15 - dead-code

`defineEmits(['link', 'unlink', 'refresh'])` (line 15); `emit('link', tagNode)` fires at lines 63 and 85. TagInput has exactly two consumers: detail/TagsSection.vue:20-25 binds only `@unlink` and `@refresh`, and detail/MetadataGridSection.vue:207-213 binds only `@unlink` and `@refresh`. Grepping the whole tree for `@link=` finds only App.vue:992 and ViewRenderer.vue:232, both on unrelated components. The event is never handled anywhere; the parents rely on `@refresh` (which is emitted alongside it on both paths) to reload links.

**Fix:** Remove `'link'` from the emits list and both `emit('link', tagNode)` calls, or wire it into TagsSection/MetadataGridSection if a link-specific parent reaction is actually wanted.

#### 136. TasksView declares a 'select' emit that is never fired and never listened for

`src/components/TasksView.vue`:13 - dead-code

`const emit = defineEmits(['select', 'navigate', 'toggle-complete'])` (line 13). Grepping TasksView.vue for `emit(` yields only `emit('navigate', task)` (line 26) and `emit('toggle-complete', task)` (line 56). ViewRenderer's `<TasksView>` binding (lines 278-289) wires only `@navigate` and `@toggle-complete`. The `select` declaration is dead on both ends.

**Fix:** Remove `'select'` from the emits array.

#### 137. TimelineView passes _getColorMap into useTimelineLayout, which never uses it and documents a different name

`src/components/TimelineView.vue`:35 - dead-code

TimelineView constructs the layout composable with:

```js
const layout = useTimelineLayout({
  getNodes: () => props.nodes,
  getHideCompleted: () => props.hideCompleted,
  _getColorMap: () => props.colorMap,
  scrollableRef,
})
```

In useTimelineLayout.js the option is destructured under that underscore name (`export function useTimelineLayout({ getNodes, getHideCompleted, _getColorMap, scrollableRef })`, line 40) and grepping the file for `_getColorMap`/`getColorMap` returns only that destructure and the JSDoc line 36, which documents the parameter as `@param {Function} options.getColorMap` — a name the function does not accept. The composable instead hardcodes the placeholder colour check (`node.color !== '#0f4c75'`, lines 191 and 222). So the callback is dead, and the docstring is inaccurate/aspirational. TimelineView already passes `props.colorMap` explicitly where it is actually needed, via `getProjectBoxStyle(project, props.colorMap)` (line 69).

**Fix:** Remove the `_getColorMap` argument from the TimelineView call site, remove the parameter from the useTimelineLayout destructure, and delete the `options.getColorMap` JSDoc line.

#### 138. Unhandled IPC rejection leaves the unlock form permanently disabled with no error shown

`src/components/UnlockScreen.vue`:20 - correctness

`unlock()` awaits `api.securityUnlock(password.value)` with no try/catch:

```js
busy.value = true
error.value = ''
const result = await api.securityUnlock(password.value)
if (result.success) { window.location.reload() } else { error.value = ...; busy.value = false }
```

`api.securityUnlock` in the Electron path is `window.electronAPI!.securityUnlock(password)` -> `ipcRenderer.invoke(C.SECURITY_UNLOCK, password)` (electron/preload.js:88). If the main-process handler throws (keychain error, corrupt key slot, handler not registered), `invoke` rejects. The rejection escapes as an unhandled promise: `busy` stays `true` forever, so both the password input and the submit button remain disabled, and `error` stays empty so the UI shows nothing. This screen is the only way into a locked database (src/main.js:33 mounts it instead of the app), so the user is stuck with a dead screen and must restart. It would also swallow a `result === undefined` from a handler that returns nothing (`result.success` would throw a TypeError inside the same unhandled promise).

**Fix:** Wrap the call in try/catch/finally: set `error.value` from the caught error and always reset `busy.value = false` when not reloading. Add a test alongside the existing `src/__tests__/securityUi.test.js` cases that mocks `api.securityUnlock.mockRejectedValue(...)` and asserts the form is re-enabled and an error is displayed.

#### 139. Workspace deletion asks for confirmation twice

`src/components/WorkspaceSelector.vue`:117 - consistency

`deleteWorkspace()` confirms before emitting:

```js
if (confirm(`Delete workspace "${currentWorkspace.value?.name}"? This cannot be undone.`)) {
  emit('delete', props.modelValue)
  closeSettings()
}
```

App.vue's handler confirms again for the same action:

```js
async function deleteCurrentWorkspace() {
  const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
  if (ws && confirm(`Delete workspace "${ws.name}"?`)) await _deleteCurrentWorkspace()
}
```

The user sees two modal dialogs with different wording for one delete. Secondarily, the component emits the workspace id as the payload but the parent ignores it entirely and re-reads `currentWorkspace.value`, so the event's payload contract is fictional — a caller who emitted a different id would be silently ignored. Every other confirm in this codebase lives in one place (`permanentlyDelete`, `emptyAllTrash`, `deleteMultipleNodes` all confirm in the composable only).

**Fix:** Drop the `confirm()` from WorkspaceSelector and let App.vue own the confirmation (consistent with the trash/multi-delete paths), and either honour the emitted id in `deleteCurrentWorkspace(id)` or stop emitting a payload.

#### 140. getBadgeStyle takes no parameters and always returns {}, but is called with a node at two sites

`src/components/config/tableFormatters.js`:42 - dead-code

```js
/**
 * Get badge style for person nodes.
 * CSS variables handle all type colors including person.
 */
export function getBadgeStyle() {
  return {}
}
```

Grepping the tree, the only callers are `TableView.vue:216` (`:style="getBadgeStyle(currentContainer)"`) and `TableView.vue:270` (`:style="getBadgeStyle(row.node)"`), both passing an argument the signature ignores. The function is a no-op that binds an empty style object on every render, and its docstring claims a behaviour the body contradicts in its own second line.

**Fix:** Delete the function, its export, its import in TableView, and both `:style` bindings.

#### 141. `close` and `users` icon definitions are unreachable

`src/components/context-menu/MenuIcon.vue`:58 - dead-code

`MenuIcon` is used in exactly three places, all with a literal or config-driven name: `LinkedItemsList.vue:25` (`name="link"`), `WorkspaceList.vue:28` (`name="home"`), `WorkspaceList.vue:39` (`name="workspace"`), and `MenuItem.vue:19` (`:name="item.icon"`). The only source of `item.icon` is the four menu configs in `NodeContextMenu.vue`, which use: info, external, expand, add, circle, check-circle, star, link, move, trash.

That leaves the `close` (line 58-60) and `users` (line 65-68) entries in the `icons` map with no possible caller anywhere in src/, electron/, e2e/ or the tests. `LinkedItemsList.vue:43-45` even inlines its own hand-written close `<svg>` rather than using `MenuIcon name="close"`, confirming the entry is orphaned.

**Fix:** Delete the `close` and `users` entries. If `close` is wanted, use it in `LinkedItemsList`'s unlink button in place of the inline SVG so it has a caller.

#### 142. The person branch of the children list can never render

`src/components/detail/ChildrenSection.vue`:110 - dead-code

`<div v-if="child.type === 'person'" class="child-item person-item" ...>` renders an avatar for person children. The component's only consumer is DetailPanel.vue:917 (grep for `ChildrenSection` finds only that and the dead barrel), and DetailPanel populates `children` via `loadChildren()` at line 361: `children.value = childNodes.filter(d => d.type === 'task')`. No person can ever reach this template. The `getInitials` import (line 3), `child.organization` in the title binding, and the `.person-item`/`.person-avatar` rules exist only to serve it.

**Fix:** Delete the person branch and the getInitials import, or stop filtering to `type === 'task'` in DetailPanel if mixed children were the intent — the section header says "Tasks", so deletion is the honest fix.

#### 143. loadLinkedMembers neither loads nor can fail, but is async with an unreachable catch

`src/components/detail/OrganizationDetailForm.vue`:44 - naming

```
async function loadLinkedMembers() {
  if (!props.editedNode?.id) { linkedMembers.value = []; return }
  try { linkedMembers.value = props.linkedNodes.filter(n => n.type === 'person') }
  catch (err) { handleError(err, { context: 'Loading members', silent: true }); linkedMembers.value = [] }
}
```

The body is a synchronous array filter over a prop — nothing to await, nothing that throws, so the catch and `useErrorHandler` import (line 3) are dead. The name promises a fetch (its sibling PersonDetailForm.loadLinkedOrganizations really does hit `api.getNode`), and it is driven by two watchers plus exposed to App through DetailPanel.vue:625 and called by useRefresh.js:84 as if it were a reload.

**Fix:** Replace it with `const linkedMembers = computed(() => props.linkedNodes.filter(n => n.type === 'person'))`, drop both watchers, the try/catch and the handleError import, and drop the now-meaningless expose (updating useRefresh.js:84 and DetailPanel's defineExpose).

#### 144. onTagsUpdate is never called

`src/components/detail/OrganizationDetailForm.vue`:77 - dead-code

Identical dead copy of the function in PersonDetailForm.vue:133. `<TagsSection>` at line 227 binds only `@unlink` and `@refresh`; nothing emits `update:tags`.

**Fix:** Delete the function.

#### 145. onTagsUpdate is never called

`src/components/detail/PersonDetailForm.vue`:133 - dead-code

`function onTagsUpdate(tags) { updateField('tags', tags); saveChanges() }`. Grep for `onTagsUpdate` and `update:tags` across src/, e2e/ and electron/ finds only the two definitions (this one and OrganizationDetailForm.vue:77) — no template binding and no caller. TagsSection emits only `unlink` and `refresh`, both of which are wired separately at lines 313-314.

**Fix:** Delete the function.

#### 146. Barrel file is never imported anywhere

`src/components/detail/index.js` - dead-code

The whole file re-exports the nine detail components. Grepping src/, e2e/, electron/ and vite.config.js for `from './detail'`, `from '../detail'`, `detail/index` and `components/detail` returns zero hits — every consumer imports the .vue file directly (e.g. `import ChildrenSection from './detail/ChildrenSection.vue'`). The barrel is dead and will silently rot as components are added or renamed.

**Fix:** Delete src/components/detail/index.js.

#### 147. Legacy fallback `props.aiEnabled ?? props.ollamaEnabled` can never fire

`src/components/settings/AISettings.vue`:62 - dead-code

`const isAiEnabled = computed(() => props.aiEnabled ?? props.ollamaEnabled)`. `aiEnabled` is declared as `{ type: Boolean, default: true }` (line 36), so Vue substitutes `true` whenever the parent omits or passes `undefined` — `props.aiEnabled` is never nullish and the right-hand side is unreachable. The intended legacy migration (fall back to the old `ollamaEnabled` setting) therefore does not happen: a user upgrading from a build where only `ollamaEnabled` existed gets `aiEnabled === true` from the default, not the migrated value. The dual emit in `onAiEnabledChange` (lines 131-134) keeps the legacy key written, which reinforces the impression that this fallback works.

**Fix:** Either drop the `?? props.ollamaEnabled` branch (and the legacy prop/emit) as dead, or make the fallback real by giving `aiEnabled` no default (`default: undefined`) so the nullish check can actually trigger — and cover it with a migration test.

#### 148. toggleTouchId discards the result, so a failed Touch ID change is silently swallowed

`src/components/settings/SecuritySettings.vue`:67 - correctness

`async function toggleTouchId(event) { await api.securitySetTouchId(event.target.checked); await refresh() }` ignores the `{ success, error }` result that every other call in this file inspects (`enable` line 38-48, `disable` line 55-64). In web mode the api stub returns `{ success: false, error: 'Encryption is only available in the desktop app' }` (src/services/api.ts:552-554) and the user sees the checkbox snap back with no message; in Electron a real failure behaves the same. It also skips the `busy` guard and the `message`/`error` refs, so this control has different error semantics from its two neighbours in the same component. A rejection additionally escapes as an unhandled promise rejection (same pattern as `enable`/`disable`/`refresh`, which leave `busy` stuck at `true` on rejection).

**Fix:** Mirror `enable`/`disable`: set `busy`, inspect `result.success`, write `message`/`error`, and wrap the awaits in try/catch/finally.

#### 149. AppContext declares nodeOps, pushCommand and getWorkspaceIdForNode as required but App.vue never provides them

`src/composables/useAppContext.ts`:12 - typing

The interface marks these three as required members:

```ts
nodeOps: NodeOperations
pushCommand: (command: Command) => void
getWorkspaceIdForNode: (type: string) => WorkspaceId | null | undefined
```

App.vue's `provideAppContext({...})` call (App.vue:569-600) passes `api` plus state refs, navigation, data loading and refresh helpers — none of these three. The only production consumer, `useNodeActionsUI` (useNodeActionsUI.ts:165-183), takes `nodeOps`, `pushCommand` and `getWorkspaceIdForNode` as explicit options instead and does not read them from the context.

The mismatch is invisible to the `vue-tsc` gate because `tsconfig.json` sets `checkJs: false` and App.vue's `<script setup>` has no `lang="ts"`, so the object literal is never checked against the interface. Any future consumer writing `const { nodeOps } = useAppContext()` gets `undefined` at runtime while TypeScript promises a value — a guaranteed `Cannot read properties of undefined` on first use.

The `NodeOperations`, `CreateNodeParams`, `UpdateNodeOptions`, `DeleteResult`, `DeleteMultipleResult`, `MoveNodeParams` and `MoveMultipleParams` interfaces exist only to type those never-provided members.

**Fix:** Remove `nodeOps`, `pushCommand` and `getWorkspaceIdForNode` (and the now-unused supporting interfaces) from `AppContext` so the type matches what App.vue actually provides. Add a small type-checked assertion — e.g. a `.ts` module exporting a `buildAppContext()` factory that App.vue calls — so the shape is gated instead of relying on an unchecked object literal.

#### 150. Module-level currentContext singleton is a discovered global, never cleared, and the inject path is unused in production

`src/composables/useAppContext.ts`:168 - design

```ts
let currentContext: AppContext | null = null
export function provideAppContext(context) { currentContext = context; provide(APP_CONTEXT_KEY, context) }
export function useAppContext() { if (currentContext) return currentContext; ... inject(...) }
```

Two problems:

1. This is exactly the "resolving a global" pattern the project rules forbid — a consumer reaches out to find its collaborator instead of being given one. The module variable is never reset on unmount, so it outlives the component that created it. The evidence is in the test suite itself: `src/__tests__/useAppContext.test.js:23-29` has to call `vi.resetModules()` and re-import the module in `beforeEach` purely to clear this state.
2. The `provide`/`inject` half is dead in production. Grepping `APP_CONTEXT_KEY` across `src/`, `electron/` and `e2e/` shows it referenced only inside this file and in two test files; no component injects it. The single production consumer (`useNodeActionsUI`) runs in App.vue's own setup and always hits the module-level branch.

Because the singleton wins over `inject`, a component that legitimately injected a _different_ context could never receive it.

**Fix:** Pick one mechanism. Either keep provide/inject only (and pass the context explicitly to `useNodeActionsUI`, which already takes an options object), or, if the same-setup shortcut must stay, clear `currentContext` in an `onScopeDispose`/`onUnmounted` inside `provideAppContext`. Given only one consumer exists and it already receives half its dependencies as arguments, passing the context in as an argument is the smallest honest option.

#### 151. Cross-window node deletion never refreshes the favorites list

`src/composables/useAppLifecycle.js`:60 - correctness

In `setupDetachedMessageHandler`, the two branches are asymmetric:

```js
if (data.type === 'node-updated' && data.node) {
  await refreshAfterChange({ recent: false })
  loadFavoritesAfterSync()          // favorites refreshed
  ...
} else if (data.type === 'node-deleted' && data.nodeId) {
  ...
  await refreshAfterChange({ recent: false })   // favorites NOT refreshed
}
```

`useRefresh.refreshAfterChange` defaults `favorites = false` (useRefresh.js:34), so the delete branch never reloads favorites. Deleting a favorited node from a detached window leaves it listed in the main window's sidebar Favorites section until some unrelated action reloads favorites — clicking it then navigates to a node that no longer exists (which, per the finding above, renders an empty view).

**Fix:** Use `await refreshAfterChange({ recent: false, favorites: true })` in the delete branch. While there, the `loadFavoritesAfterSync` parameter is just `loadFavorites` passed under a second name — drop it and use the `favorites: true` option in both branches so there is one way to do this.

#### 152. Menu and quit IPC listeners are registered on mount but never removed on unmount

`src/composables/useAppLifecycle.js`:69 - correctness

`setupElectronHandlers()` registers five renderer-side IPC listeners — `onMenuUndo`, `onMenuRedo`, `onOpenSettings`, `onShowShortcuts`, `onBeforeQuit` — and `cleanupEventListeners()` (line 124-130) removes only the DOM listeners and the ResizeObserver. In `electron/preload.js:154-160` these bridge methods are `callback => ipcRenderer.on(C.X, callback)` and return `ipcRenderer`, so there is no unsubscribe to call even if the composable wanted to.

This diverges from the two channels that got it right: `onSensitiveLocked` (preload.js:99-102) and `onCaptureSaved` (preload.js:108-111) both return a `removeListener` closure, and App.vue:539-545 correctly stores and calls the `onCaptureSaved` unsubscriber in `onUnmounted`.

Failure scenario: any remount of `App` (Vite HMR during development, or a future re-mount after unlock) doubles every listener — one Cmd+Z fires `undo()` twice, and the `APP_BEFORE_QUIT` handler runs twice, calling `quitSaveDone()` twice.

**Fix:** Make `onMenuUndo`/`onMenuRedo`/`onOpenSettings`/`onShowShortcuts`/`onBeforeQuit` return `() => ipcRenderer.removeListener(...)` like the other two (and regenerate `preload.build.js`), collect the returned disposers in `setupElectronHandlers`, and call them from `cleanupEventListeners`.

#### 153. Saved-container fallback is unreachable, and the real "container no longer exists" case is unhandled

`src/composables/useAppLifecycle.js`:138 - dead-code

```js
try {
  await loadChildren(initialContainerId)
} catch {
  // If saved container no longer exists, fall back to root
  console.warn('Saved container not found, loading root')
  await loadChildren(null)
}
```

`useNavigation.loadChildren` wraps its whole body in try/catch/finally (useNavigation.ts:219-305) and never rejects, so this `catch` can never run — it is dead code with an aspirational comment.

Worse, the case it claims to cover is genuinely unhandled in the Electron path: `electron/database/nodes.js:152` `getNode(id)` returns `null` for a deleted/missing id rather than throwing, so `loadChildren(<deleted id>)` completes "successfully" with `currentContainer = null`, `children = []`, `breadcrumbs = []`, and `currentContainerId` set to a node that does not exist. On the next launch after the last-visited container was deleted, the app boots to an empty view with no breadcrumbs and no fallback to root.

**Fix:** Delete the unreachable try/catch and handle the real case explicitly: after `await loadChildren(initialContainerId)`, if `initialContainerId != null` and the navigation state reports no current container, clear `STORAGE_KEYS.CONTAINER_ID` and `await loadChildren(null)`. Cover it with a test where the saved id resolves to `null`.

#### 154. Multi-node before/after drops are silently discarded although the drop indicator promises a reorder

`src/composables/useCardDrag.js`:105 - correctness

`onDragOver` sets `dropPosition` to 'before'/'after' (and `getDropClass` exposes `drop-before`/`drop-after`) regardless of how many nodes are being dragged, but `onDrop` only acts on a reorder for a single node:

    } else {
      if (!isMultiDrag && onReorder) {
        await onReorder(sourceNode, targetNode, position)
      }
    }

Failure scenario: select three cards, drag them onto the left half of a fourth card - the before-drop indicator is drawn, the drop is accepted (`e.preventDefault()`), the drag state is cleared, and nothing happens; no reorder, no move, no message. Related: if a drop somehow arrives without a preceding `dragover` on that target, `position` is null and the same else-branch calls `onReorder(source, target, null)` with an invalid position.

**Fix:** Either suppress the before/after position hint in `onDragOver` while `draggedNodeIds.value.length > 1` (so the UI never offers an action that cannot happen), or add an `onReorderMultiple` callback and wire it. Also guard `position` against null before dispatching.

#### 155. useDataLoading reaches out for the api singleton instead of receiving it injected, unlike every sibling composable

`src/composables/useDataLoading.ts`:2 - design

`import { api as apiService } from '../services/api.js'` plus `const api = apiService as any` hard-wires the module to the discovered implementation. useNavigation (`UseNavigationOptions.api`), useWorkspace (`UseWorkspaceOptions.api`) and useSearch (callback injection) all take their collaborator as a parameter, which is why they can be unit-tested with a plain mock; useDataLoading's tests have to `vi.mock('../services/api.js')` instead. This is the "depend on injected interfaces, never on discovered implementations" rule in the project's CLAUDE.md.

**Fix:** Change the signature to `useDataLoading(currentWorkspace: Ref<WorkspaceId | null>, api: Api)` and pass `api` from App.vue, as the sibling composables already do.

#### 156. loadFavorites and loadTags swallow errors with a bare catch, unlike every sibling loader

`src/composables/useDataLoading.ts`:233 - correctness

loadSidebarTree, loadRecentItems, loadTrashedItems and loadOrphanedNodes all route failures through `handleError(e, { context: ... })`, which toasts and records the error. loadFavorites (line 233) and loadTags (line 260) use `} catch { favoriteItems.value = [] }` / `} catch { allTags.value = [] }` — the exception is discarded with no toast, no log and no error state, so a failing IPC call is indistinguishable from "the user has no tags". Both are called on every workspace change (App.vue:161).

**Fix:** Use the same `handleError(e as Error, { context: 'Loading favorites' | 'Loading tags' })` pattern as the sibling loaders before resetting the ref.

#### 157. Capability probes on the api service are always true; the legacy getAllTags fallback is unreachable

`src/composables/useDataLoading.ts`:246 - dead-code

`if (api.getTagNodes) { ... } else { const tags = await api.getAllTags(wsId); ... }` (lines 246-259) and `if (api.getFavorites)` (line 228) test for methods that both api implementations define unconditionally — src/services/api.ts:494 (webApi stub returning []) and :845 (electronApi), and :272/:728 for getFavorites. The `else` branch that maps string tags into pseudo-nodes with `id: null` can therefore never execute, and the comment "fall back to getAllTags for backwards compatibility" describes a path that does not exist.

**Fix:** Delete both probes and the legacy branch, and call `api.getTagNodes(wsId)` / `api.getFavorites(wsId)` directly. Note the webApi `getTagNodes()` (api.ts:494) takes no workspace argument while this call site passes one — worth aligning the signature at the same time.

#### 158. `parseDetachedParams` / `isDetached` / `detachedNodeId` are computed but no consumer reads them

`src/composables/useDetachedWindow.js`:18 - dead-code

`parseDetachedParams()` runs on mount and populates `isDetached` and `detachedNodeId`, both of which are returned. Grepping src/, e2e/, and electron/, the only hits for those two names outside this file are `src/main.js:52-56`, which parses `?detached` from the URL itself and passes `nodeId` as a prop to `DetachedView`. The two real consumers destructure only what they use: `App.vue:235-239` takes `openDetachedWindow`/`broadcastNodeUpdate`/`broadcastNodeDelete`/`onMessage`, and `DetachedView.vue:19` takes the three broadcast/message members. `isElectron` is likewise returned and never destructured (DetailPanel.vue and NodeContextMenu.vue each re-derive their own `isElectron` from `window.electronAPI?.openDetachedWindow` instead). So the URL parsing here is a second, unread copy of a decision main.js already made.

**Fix:** Delete `parseDetachedParams`, `isDetached`, `detachedNodeId`, and the unused `isElectron` return; reduce the `onMounted` hook to `initChannel()`.

#### 159. External linked nodes are built with a different data shape than hierarchy nodes, so they render without badge, collapse button or tint

`src/composables/useGraphElements.js`:410 - consistency

`fetchLinkedNodes` pushes elements carrying only `id, nodeData, type, isPerson, isTag, isLinkedExternal, bgColor, borderColor, textColor, isCompleted, isSelected`. The HTML-label template in `useGraphInit.js:128-154` additionally reads `d.customBgTint`, `d.childCount`, `d.hasChildren`, `d.isCollapsed`, `d.shouldGlow` and `d.showDetails`, none of which are set here.

Consequence: an external linked node with children shows no child-count badge and no collapse button, never shows its notes preview, and never picks up an inherited colour tint — while the same node rendered inside the hierarchy shows all of them. Clicking where the collapse button would be does nothing.

The colour computation is also copy-pasted from `buildElements` (lines 405-408 duplicate lines 156-179) rather than shared.

**Fix:** Extract a single `buildNodeElementData(node, opts)` used by both builders so the two element shapes cannot drift, passing `showDetails: false` / `childCount: 0` explicitly for externals if that is the intent.

#### 160. Blocking window.alert() fired from inside a cytoscape drag handler

`src/composables/useGraphEvents.js`:616 - design

`alert('Cannot move a node under its own descendant')` runs synchronously inside the `cy.on('free', 'node')` handler. It blocks the renderer's event loop while cytoscape is still unwinding its drag state, and it is the only user-facing error surface in this composable — every other failure path here is an `emit`. The project has a toast system (`src/composables/useToast.js`, `showToast`) used everywhere else; `alert` appears in exactly two places in src/ (here and `useWorkspace.ts:151`).

It also violates the injected-collaborator rule: the composable reaches for a global instead of using one of the callbacks it is already given (`emit`, `showAddNodeModal`, …).

**Fix:** Add an injected notifier to the options (or emit an event GraphView translates into `showToast`), replace the `alert`, and document the new option in the JSDoc. A test can then assert the notifier is called instead of having to stub `window.alert`.

#### 161. Global Hide Sensitive setting blanks every node's notes preview, not just sensitive ones

`src/composables/useGraphInit.js`:145 - correctness

In `setupHtmlLabels`, the notes preview is masked when `n.notes_sensitive || props.hideSensitive`. The second disjunct has no per-node condition, so switching the global Hide Sensitive toggle on blanks the notes preview of _every_ node in the graph. Every other consumer gates on the conjunction: `src/utils/tooltip.js:57` uses `explicitlySensitive || (keywordSensitive && hideSensitive)`, and GraphView.vue:205 / TableView.vue:63 / App.vue:214 all use `hideSensitive && node?.notes_sensitive`. `docs/reference/node-types.md:241` documents the flag as "content is always masked … independent of the Hide Sensitive setting", i.e. the flag is the per-node override — not a licence for the global toggle to mask everything. Separately, the mask renders `'<span style="opacity:0.5"></span>'` — an element with no text content — so the user sees a node that simply appears to have no notes, with no indication anything was hidden. Note also that `buildElements` already computes a per-node `data.hideSensitive` (useGraphElements.js:174) which this template ignores and no other code reads.

**Fix:** Match the rule used everywhere else — mask when `n.notes_sensitive || (props.hideSensitive && keywordSensitive)` — consume the existing `d.hideSensitive` element data instead of recomputing, and render a visible placeholder (e.g. "[Sensitive content hidden]", as tooltip.js does) instead of an empty span.

#### 162. cleanup() leaves timers, a rAF callback and one-shot layouts running against a destroyed cytoscape instance

`src/composables/useGraphLayout.js`:758 - correctness

`cleanup()` only calls `stopContinuousRelax()` and `stopContinuousFit()`. Everything else this composable schedules survives unmount, and `GraphView.vue:751-754` calls `layout.cleanup()` and then `cy.destroy(); cy = null`:

- `reLayout()` line 411 `requestAnimationFrame(...)` → calls `syncNodeDimensions(cy)`, `runTetrisGridLayout(cy, ...)`, `cy.fit(undefined, 50)` on the captured (now destroyed) instance.
- `runTetrisGridLayout()` line 177 `setTimeout(() => cy.fit(padding), animationDuration + 50)`.
- `localRelax()` line 559 `setTimeout(() => { cy.nodes().unlock(); cy.zoom(zoom); cy.pan(pan) }, 300)`.
- `reLayout()` line 434, `resetLayout()` line 486, `runGridLayout()` line 781: `setTimeout(savePositions, 800/1000/300)`.
- `relaxLayout()`, `applyRadialSettings()`, `autoRelaxNewNodes()` register `layoutstop` handlers on layouts that are still simulating (`maxSimulationTime: 2000`) and are never stopped.

`savePositions` is harmless (`saveNodePositions` no-ops on a null cy, and the closure reads the ref), but every `cy.*` call above holds the destroyed instance directly. Navigating away mid-layout throws from a timer with no catch.

**Fix:** Track the pending timeout/rAF ids and the in-flight one-shot layout in module-scope variables, clear/stop them in `cleanup()`, and make `cleanup()` idempotent. Add a test that calls `reLayout()` in grid mode, then `cleanup()`, then flushes timers and rAF, asserting no cy method is invoked afterwards.

#### 163. Modal template refs are declared here but bound only inside GraphEditModal.vue

`src/composables/useGraphModals.js`:17 - dead-code

`editTitleInput` (17), `editModalEl` (18), `showNotesPreview` (16) and `promptInputRef` (28) are refs this composable owns and returns, but no template ever binds them: `GraphEditModal.vue` declares its _own_ local `editTitleInput`/`editModalEl`/`showNotesPreview` (lines 14-16) and exposes them via `defineExpose`, and GraphView.vue does not destructure any of the four. As a result `showEditModal`'s focus logic (`nextTick(() => { editTitleInput.value.focus(); … })`, lines 50-55) and `showPrompt`'s `promptInputRef.value?.focus()` (line 110) operate on refs that are permanently `null`, and `showNotesPreview.value = false` (line 49) writes to a ref nobody reads. `handleEditModalKeydown` (78) and `handlePromptKeydown` (136) are likewise never referenced — GraphEditModal has its own `handleKeydown`.

**Fix:** Delete the four refs, the focus/select blocks that depend on them, and the two keydown handlers; the modal components already own this behaviour.

#### 164. Positions-storage key and parsing are duplicated instead of reusing useNodePositions helpers

`src/composables/useGraphOperations.js`:27 - consistency

`saveNodePosition` builds the key inline — `` const posKey = `graph-positions-${ws}-${targetViewId}` `` — duplicating the format that `getPositionsKey(workspace, parentId)` in `src/composables/useNodePositions.js:12` already exports and that GraphView.vue:235 uses. The two also disagree on the empty case (`viewId ?? currentContainerId.value ?? 'root'` here vs `parentId || 'root'` there), so the key format can silently diverge on any future change. Line 28 then does a bare `JSON.parse(localStorage.getItem(posKey) || '{}')`, while `loadNodePositions()` wraps the same parse in `try/catch` and validates each entry for finiteness and range. A corrupted `graph-positions-*` entry therefore throws straight out of App.vue:277's node-creation path instead of degrading to `{}` as it does everywhere else.

**Fix:** Import `getPositionsKey` and `loadNodePositions` from `./useNodePositions.js` and use them here, so there is one key format and one validating reader.

#### 165. `ALL_NODE_TYPES`, `isTypeVisible`, `toggleTypeVisibility` and `resetRadialSettings` are never reachable from the UI

`src/composables/useGraphSettings.ts`:8 - dead-code

Grepping `src/`, `electron/` and `e2e/`: `ALL_NODE_TYPES` (line 8) appears only at its own definition — no importer at all. `isTypeVisible` (line 339) appears only at its declaration, interface entry and return statement — it is called nowhere, not even in tests. `toggleTypeVisibility` (line 314) and `resetRadialSettings` (line 326) are referenced only from `src/__tests__/useGraphSettings.test.js:153/159/169`. No component calls any of them: type-filter toggling is owned by the Pinia filters store (`src/stores/filters.js`) and `TypeFilterDropdown.vue`, and GraphControls' "Reset layout" button routes to `layout.resetLayout()` (GraphView.vue:777), not `resetRadialSettings`. Under the project rule ("a capability reachable only from a library call is unfinished work"; "finding such code later means deleting it") these are dead, with tests that only prove dead code still runs.

**Fix:** Delete `ALL_NODE_TYPES`, `isTypeVisible`, `toggleTypeVisibility` and `resetRadialSettings` (plus their `UseGraphSettingsReturn` entries and the tests that only exercise them), or wire them to real controls if the intent was for GraphControls to own the type filter and a physics reset.

#### 166. `gravityRange` and `nestingFactor` are persisted and reset but never consumed

`src/composables/useGraphSettings.ts`:169 - dead-code

`radialSettings.gravityRange` and `radialSettings.nestingFactor` are read from localStorage (lines 169-170), reloaded on workspace change (188-189), watched and written back (286-301), and reset (331-332) — but nothing ever reads them. `useGraphLayout.js` consumes only `gravity`, `nodeRepulsion`, `edgeLength`, `elasticity` and `iterations`, and hardcodes its own `gravityRange: 10` at line 237; `nestingFactor` appears nowhere outside this file and `RADIAL_DEFAULTS`. `GraphControls.vue` exposes sliders for repulsion, edge length, elasticity, gravity and iterations only. So two localStorage keys are written per workspace for settings that can never affect anything.

**Fix:** Either pass `gravityRange`/`nestingFactor` through to the cose-bilkent options in `useGraphLayout.js` and add the corresponding sliders to GraphControls, or remove both fields from `RadialLayoutSettings`, the reactive object, the reload/watch/reset blocks, and `RADIAL_DEFAULTS`/`STORAGE_KEYS`.

#### 167. Edge diff keys ignore `isLink`, so a link parallel to a hierarchy edge is invisible to the diff

`src/composables/useGraphUpdate.js`:120 - correctness

`diffAndApply` identifies edges purely by endpoint pair: `existEdges.add(`${e.source().id()}-${e.target().id()}`)` (line 120) and `const k = `${e.data.source}-${e.data.target}`` (line 124). But hierarchy edges and link edges are distinct elements with distinct ids — `addLinkEdges` (useGraphElements.js:316-323) emits `id: `link-${sourceId}-${targetId}`` with `isLink: true`. Failure scenario: node B is a child of node A _and_ the user creates an explicit link A→B. Both edges collapse to the key `"A-B"`, so `hasEdge` stays false when the link is added and when it is later removed; with `hasNew`/`hasRemoved` also false, `diffAndApply` takes the data-only branch (line 163) and returns null, and the link edge never appears or disappears until some unrelated structural change forces a rebuild.

**Fix:** Include the discriminator in the key, e.g. `${e.data.isLink ? 'link' : 'tree'}:${source}-${target}` on both the existing-edge and new-edge sides (`e.data('isLink')` for the cy side).

#### 168. cleanup() and five other exports of useInlineEdit are never used by any component

`src/composables/useInlineEdit.js`:179 - dead-code

App.vue is the only consumer (App.vue:522) and destructures only `editingCardId, editingTitle, inlineNotesId, inlineNotesText, startEditing, saveEditing, cancelEditing, startInlineNotes, saveInlineNotes, cancelInlineNotes`. Grepping the tree (excluding `src/__tests__/useInlineEdit.test.js`) shows `cleanup`, `handleEditKeydown`, `isEditing`, `handleInlineNotesKeydown`, `isEditingNotes` and `inlineNotesRef` have no non-test references — `CardTitleEdit.vue` and `CardNotes.vue` implement their own keydown handling and their own `isEditing` prop.

Two consequences beyond dead code: (a) `cleanup()` is never wired to `onUnmounted`, so the 500 ms `autoSaveTimeout` set by `debouncedAutoSave` can fire after teardown; (b) because no template binds `ref="inlineNotesRef"`, the focus block in `startInlineNotes` (lines 90-95) can never do anything — `inlineNotesRef.value` is always `null`.

**Fix:** Delete the unreachable exports and the dead focus block, or wire them into the card components. If `cleanup` is kept, call it from `onUnmounted` in App.vue.

#### 169. The `n` new-node shortcut fires with Cmd/Ctrl held, hijacking Cmd+N / Ctrl+N

`src/composables/useKeyboardShortcuts.js`:249 - correctness

The handler is `if (e.key === 'n') { e.preventDefault(); ... showAddNodeModal(parentId) }` with no modifier guard. Tracing Cmd+N through `handleKeydown`, none of the earlier branches match (not `k`, not `z`/`y`, not a digit, not Enter/Space/Delete/Arrow/Escape/`?`), so Cmd+N and Ctrl+N reach this branch, call `preventDefault()`, and open the add-node modal. `src/utils/keyboardShortcuts.js:19` documents this shortcut as bare `N` only. The neighbouring digit handler explicitly guards on `(e.metaKey || e.ctrlKey)` with a comment explaining why the modifier state matters, so this omission is a divergence within the same function.

**Fix:** Guard with the existing helper: `if (e.key === 'n' && hasNoModifiers(e))`, and add a test asserting Cmd+N does not call `showAddNodeModal`.

#### 170. viewMode === 'table' branch can never be true; viewConfig defines that view as 'tree'

`src/composables/useKeyboardShortcuts.js`:327 - dead-code

`if ((viewMode.value === 'tree' || viewMode.value === 'table') && hasNoModifiers(e))`. The global view ids come from `src/utils/viewConfig.js`, which defines exactly: graph, cards, tree, tasks, timeline, persons, trash. There is no `'table'` id — `viewConfig.js:21` uses `id: 'tree'` with `label: 'Table'`.

The only other `'table'` view mode in the tree is `PersonsView.vue:40`'s component-local `ref('cards')`, which is never bound to the global `viewMode` state. So the `|| viewMode.value === 'table'` disjunct is unreachable.

Root cause is the naming mismatch in `viewConfig.js`: the id says tree, the label says Table, so consumers guess. That is the kind of dishonest naming the project rules call out.

**Fix:** Drop the `|| viewMode.value === 'table'` disjunct. Separately, consider renaming the view id from `'tree'` to `'table'` to match its label — that touches the persisted `STORAGE_KEYS.VIEW_MODE` value, so it needs a small read-time migration mapping the stored `'tree'` to the new id.

#### 171. Arrow-key branch tests for a `table` view mode that does not exist

`src/composables/useKeyboardShortcuts.js`:327 - dead-code

`if ((viewMode.value === 'tree' || viewMode.value === 'table') && hasNoModifiers(e))`. The main view ids come from `src/utils/viewConfig.js`, which defines exactly `graph`, `cards`, `tree`, `tasks`, `timeline`, `persons`, `trash` — no `table`. `ViewMode` in `src/types/settings.ts` lists the same seven and omits `table`. The only other `'table'` occurrences in the tree are PersonsView.vue's _local_ card/table toggle and `personsViewModes` in `config/personsGridColumns.js`, neither of which feeds `viewMode`. The `=== 'table'` disjunct can never be true, and the in-branch comment "Use flatChildren for table which includes expanded hierarchy" describes behaviour that never runs. The result is that `tasks`, `timeline`, `persons`, and `trash` views get no arrow-key list navigation at all.

**Fix:** Drop the `|| viewMode.value === 'table'` disjunct and fix the comment; if list navigation is wanted in the other list-shaped views, name them explicitly.

#### 172. `setup()` / `cleanup()` are never called and the trailing comment is stale

`src/composables/useKeyboardShortcuts.js`:353 - dead-code

The composable returns `setup`, `cleanup`, and `handleKeydown`, with the comment "Note: Caller is responsible for calling setup() in onMounted and cleanup() in onUnmounted if manual control is needed". Grepping the whole tree, the only production consumer is `src/App.vue:724`, which destructures `{ handleKeydown }` alone and hands it to `useAppLifecycle`; the two vitest suites (`keyboard-shortcuts.test.js:168`, `viewShortcuts.test.js:52`) also take only `handleKeydown`. Nothing anywhere calls `.setup()` or the returned `.cleanup()`, so the `window.addEventListener`/`removeEventListener` pair is unreachable code and the comment describes a contract no caller follows.

**Fix:** Delete `setup`, `cleanup`, and the trailing comment, returning only `handleKeydown`.

#### 173. `calculatePosition`, `textareaEl`, `nextTick`, and `mentionQuery` are all dead

`src/composables/useMentions.js`:58 - dead-code

Confirmed by grep across src/, electron/, e2e/, and **tests** (and by eslint, which reports all but `mentionQuery`):

- `calculatePosition(textarea, cursorPos)` (line 58, ~25 lines of geometry) is never called and never returned. `checkMention` takes a `getCoords` callback from the caller instead, so this is the superseded implementation left behind.
- `textareaEl = ref(null)` (line 27) is never assigned and never returned.
- `nextTick` (line 1) is imported and never used.
- `mentionQuery` (line 20) is written at line 107 but never read and never returned, so it is write-only state.

The project rule is that such code is deleted, not documented.

**Fix:** Delete `calculatePosition`, `textareaEl`, `mentionQuery`, and the `nextTick` import.

#### 174. enterContainer/navigateToBreadcrumb resolve before navigation happens and swallow timer errors into unhandled rejections

`src/composables/useNavigation.ts`:346 - correctness

Both functions are declared `async ... Promise<void>` but do the real work inside `setTimeout`:

await nextTick()
setTimeout(async () => { await loadChildren(nodeId ?? null); ... }, SIDEBAR_HIDE_DELAY_MS)

The returned promise settles right after `nextTick()`, ~150 ms before children/breadcrumbs/currentContainerId are updated. Callers that `await` it (src/composables/useTagActions.js:27 `await enterContainer(tagNode)`) believe navigation finished when it has not; the project's own tests must call `flushTimersAndPromises()` after `enterContainer` (src/**tests**/useNavigation.test.js:58) which confirms the contract the type signature advertises is false. Additionally, any throw inside the timer callback (e.g. `onTransitionEnd`/`onAfterNavigate`, or `breadcrumbs.value[index].id` on an out-of-range index at line 385) becomes an unhandled promise rejection with `transitioning` stuck true, because nothing can catch a rejection from a detached setTimeout callback.

**Fix:** Return a promise that actually resolves when the load completes — e.g. `await new Promise(r => setTimeout(r, SIDEBAR_HIDE_DELAY_MS))` followed by the awaited load, wrapped in try/finally so `onTransitionEnd()` always runs. Either that or drop the `Promise<void>` return type and document it as fire-and-forget.

#### 175. hasHistory, canGoUp, filterByWorkspace and the error ref are never consumed

`src/composables/useNavigation.ts`:462 - dead-code

Grepped src/, electron/, e2e/ and src/**tests**/: `hasHistory` (line 463) and `canGoUp` (line 464) appear only in useNavigation.ts itself — no component, composable or test reads them. `filterByWorkspace` (option at line 50, used at line 186-189) is never passed by any caller, so `applyWorkspaceFilter` is permanently reduced to `filter(Boolean)`. The `error` ref (line 137, written at line 297) is never read either: App.vue destructures only `loading` from the composable, useNavigationState does not sync it, and App.vue:432-435 has a comment explicitly noting the composable "only stores it in an internal ref" — the toast comes from the `onError` callback instead. `isAtRoot` is referenced only by its own unit test.

**Fix:** Delete hasHistory, canGoUp, filterByWorkspace/applyWorkspaceFilter and the write-only `error` ref (and their entries in UseNavigationReturn/UseNavigationOptions). If a workspace filter is genuinely wanted for descendants, wire it from App.vue instead of leaving the hook unused.

#### 176. resetNavigationState is destructured in App.vue but never called; its body is inlined at the one place it is needed

`src/composables/useNavigationState.ts`:64 - dead-code

App.vue:111 destructures `resetNavigationState` from useNavigationState, and grep across src/, electron/, e2e/ and tests finds no call site (the hits in useViewStateController.test.js are for a different composable's identically named function). App.vue:154-160 open-codes exactly what it does inside `onWorkspaceChange`:

currentContainerId.value = null; currentContainer.value = null; breadcrumbs.value = []

So the exported function is dead and the only consumer duplicates it.

**Fix:** Either call `resetNavigationState()` from App.vue's onWorkspaceChange (it also clears `children`, which the inline version forgets) or delete the function and its interface entry.

#### 177. deleteMultipleNodes still uses navigateBack() after the single-delete path was fixed to use loadChildren

`src/composables/useNodeActionsUI.ts`:238 - correctness

`deleteNode` (lines 208-215) carries an explicit comment explaining that navigation after deleting the current container must go through `loadChildren(node.parent_id ?? null)` rather than history navigation, otherwise the view can end up rendering a deleted node. `deleteMultipleNodes` still does:

```ts
if (needsNavigation) {
  navigateBack()
}
```

`useNavigation.navigateBack()` pops `navigationHistory` and calls `enterContainer(previousId)` — that previous id may itself be one of the just-deleted nodes (a common case when the user drilled down through a subtree and then selected and deleted several ancestors). The two delete paths diverge on the exact behaviour that was deliberately fixed for one of them.

**Fix:** Resolve the surviving parent of the deleted set and use `await loadChildren(parentId ?? null)` here too, matching `deleteNode`.

#### 178. wrapWithParent bypasses nodeOps, losing undo, the concurrency guard and the broadcast

`src/composables/useNodeActionsUI.ts`:249 - consistency

Every other handler in this file delegates to `nodeOps.*`; `wrapWithParent` calls the API directly:

```ts
const newParent = await api.createNode({ title: parentTitle, type: 'group', ... })
await api.moveNode(nodeId, newParent.id)
```

Consequences: no `CreateCommand`/`MoveCommand` is pushed (wrapping a node cannot be undone, though the sibling delete path advertises "Cmd+Z to undo"), the `isProcessing` re-entrancy guard in `withProcessing` is bypassed so a double-click can create two parent groups, and detached windows get no update broadcast. If `api.moveNode` fails after `api.createNode` succeeds, the orphan group node is left behind with no rollback.

**Fix:** Route both steps through `nodeOps.createNode` / `nodeOps.moveNode` (passing `oldParentId: node.parent_id`).

#### 179. deleteSelectedNodes clears the selection before the confirmation dialog, so cancelling loses it

`src/composables/useNodeActionsUI.ts`:482 - correctness

```ts
const idsToDelete = [...selectedIds.value]
selectedIds.value = new Set()
await deleteMultipleNodes(idsToDelete)
```

`deleteMultipleNodes` then shows `confirm('Delete N nodes? (Cmd+Z to undo)')` and returns early on cancel. The selection has already been wiped, so a user who cancels the dialog has to re-select every node. The comment above the code says the point of the delegation is to share the confirmation behaviour, which makes the pre-emptive clear a contradiction.

**Fix:** Drop the `selectedIds.value = new Set()` line — `deleteMultipleNodes` already clears the selection on the success path (line 236).

#### 180. useNodeFiltering.js has no test file while every sibling in this group has one

`src/composables/useNodeFiltering.js` - consistency

`src/__tests__/` contains `useInlineEdit.test.js`, `useNodeActionsUI.test.js`, `useNodeCreation.test.js`, `useNodeOperations.test.js` and `useUndoRedo.test.js`, but nothing referencing `useNodeFiltering`, `flattenNodes`, `filterChildrenRecursive` or `calculateProgress`. This is a 256-line module with 10 exported pure functions feeding the graph, cards and timeline views — exactly the kind of code unit tests are cheap for, and the project rule requires test coverage for shipped behaviour.

**Fix:** Add `src/__tests__/useNodeFiltering.test.js` covering depth truncation, completed/type/collapsed filtering, recursive sorting and `calculateProgress` edge cases (empty list, no task/project children).

#### 181. useNodeFiltering() wrapper is never called

`src/composables/useNodeFiltering.js`:132 - dead-code

```js
export function useNodeFiltering() {
  return {
    flattenNodes,
    filterByDepth,
    filterCompletedNodes,
    sortNodesRecursively,
    filterByType,
    filterCollapsedNodes,
    buildInheritedColorMap,
  }
}
```

Grep across `src/`, `e2e/` and `src/__tests__/` finds no call site: `useGraphElements.js` and `useColorInheritance.js` import the individual functions directly. The composable wrapper only exists to be re-exported.

**Fix:** Delete `useNodeFiltering()`; the file is already a plain function module and the callers import from it directly.

#### 182. `onOpenDetail` callback and its listener branch can never fire

`src/composables/useNodeTooltip.js`:80 - dead-code

`createTooltip` attaches a click handler via `instance.popper.querySelector('.tt-open-detail[data-node-id]')`, but the only producer of tooltip content is `buildTooltipHTML` in `src/utils/tooltip.js`, which never emits a `.tt-open-detail` element (its output is `.tt-header`, `.tt-checkbox`, `.tt-title`, `.tt-meta`, `.tt-dates`, `.tt-notes`). Grepping the whole tree for `tt-open-detail` yields only this line and two orphaned rules in `src/style.css:2358/2374`. So the branch is unreachable dead code, and the `onOpenDetail` option is never invoked — meaning the handlers passed by GraphView.vue:201 (`emit('open-fullscreen', id)`) and TableView.vue:59 (`emit('open-fullscreen', nodeId)`) are dead wiring for a UI affordance the tooltip never renders.

**Fix:** Decide which side is real: either render an "Open details" button in `buildTooltipHTML` (so the feature is reachable from the UI), or delete the `openBtn` block, the `onOpenDetail` option, the two call-site handlers, and the orphaned `.tt-open-detail` CSS.

#### 183. refreshAfterDelete duplicates refreshAfterChange with a fixed option set

`src/composables/useRefresh.js`:50 - consistency

refreshAfterDelete's body is byte-for-byte what `refreshAfterChange({ silent: true, sidebar: true, recent: true, favorites: true, tags: true })` does — same loadChildren call, same invalidate + loadSidebarTree, same three loaders. Both are exported and used (App.vue:550/597 and App.vue:485/496 respectively), so a change to the refresh sequence has to land twice.

**Fix:** Implement `const refreshAfterDelete = () => refreshAfterChange({ favorites: true })` and keep the sequence in one place.

#### 184. Unused SearchOptions type import — no gate catches it because .ts files are excluded from ESLint and noUnusedLocals is off

`src/composables/useSearch.ts`:3 - dead-code

`import type { Node, SearchOptions } from '../types'` — `SearchOptions` appears nowhere else in the file (grep: only line 3). It survives because eslint.config.js:128-130 ignores `**/*.ts` ("TypeScript files are checked by vue-tsc, not ESLint") and tsconfig.json sets neither `noUnusedLocals` nor `noUnusedParameters`, so unused imports in .ts files are checked by nothing at all. That is a rule without an enforcement mechanism.

**Fix:** Remove the import, and enable `noUnusedLocals`/`noUnusedParameters` in tsconfig.json (or add typescript-eslint to the flat config for .ts) so the class of defect has a gate.

#### 185. The legacy onSelect fallback path and isResultSelected are never used by the application

`src/composables/useSearch.ts`:39 - dead-code

App.vue:474-508 constructs useSearch with `selectedNode`, `onSearch`, `onLink`, `onMove`, `onNavigate`, `getAncestors`, `getWorkspace` — no `onSelect`. Since one of the three mode branches in goToSearchResult always matches for a configured app ('link' with sourceId, 'move' with sourceId, 'normal'), the `if (onSelect)` fallback at line 286 is unreachable outside src/**tests**/useSearch.test.js. `isResultSelected` (line 291) is likewise test-only: SpotlightSearch.vue:105/148 compares `index === selectedResultIndex` inline rather than calling it.

**Fix:** Delete the `onSelect` option and its fallback branch, and delete `isResultSelected` (or use it from SpotlightSearch instead of the inline comparison). Update the tests accordingly.

#### 186. cancelDetailOpen is an empty function wired as the navigation onBeforeNavigate hook

`src/composables/useSelection.ts`:177 - dead-code

The body is a comment: "No-op - detail panel no longer auto-opens on selection". It is exported, and App.vue:414 wires it as `onBeforeNavigate: cancelDetailOpen`, so useNavigation.enterContainer awaits a function that does nothing on every navigation. The name claims it cancels a pending detail open; nothing is pending and nothing is cancelled. The docstring itself says "kept for API compatibility" — there is no external API here, only App.vue.

**Fix:** Delete cancelDetailOpen, its UseSelectionReturn entry, and App.vue's `onBeforeNavigate` wiring.

#### 187. `aiCustomPrompts` is typed `AICustomPrompt[]`, but that interface does not match any prompt object the code creates

`src/composables/useSettings.ts`:300 - typing

`persistedRef<AICustomPrompt[]>('graphcore-aiCustomPrompts', [], { type: 'json' })` (and the legacy `ollamaCustomPrompts` on line 317) use `AICustomPrompt` from `src/types/settings.ts`, declared as `{ name: string; prompt: string }`. Nothing in the codebase writes a `name` field. `useAiNotes.savePrompt` writes `{ ...prompt, _deleted: false }` where `prompt` is `{ id, label, prompt }` (built in `AISettings.vue:handleSavePrompt`); `useAiNotes.deletePrompt` pushes `{ id, _deleted: true }`; `defaultPrompts` entries are `{ id, label, prompt, isAgent? }`. Every consumer reads `p.id`, `p.label`, and `p._deleted`, none of which the type declares, and the one field the type requires (`name`) is never present. The declared type on a public settings API is therefore wrong in both directions.

**Fix:** Redefine `AICustomPrompt` as `{ id: string; label?: string; prompt?: string; isAgent?: boolean; _deleted?: boolean }` (matching the tombstone entries `deletePrompt` writes) and keep it as the single source of truth for prompt shape.

#### 188. scheduleHide() is restarted on every mousemove, so the unpinned sidebar never auto-hides while the pointer moves

`src/composables/useSidebar.ts`:98 - correctness

`onGlobalPointerMove` calls `scheduleHide()` on each `mousemove` outside the sidebar zone, and `scheduleHide()` begins with `clearHideTimeout()` before creating a new `setTimeout(..., SIDEBAR_HIDE_DELAY_MS)`. Because `mousemove` fires many times per second, the 150 ms timer is cancelled and re-armed continuously and only ever elapses once the pointer stops moving. Failure scenario: open the unpinned sidebar by hovering, then move the mouse continuously across the canvas - the sidebar stays open indefinitely, covering the view, until the pointer comes to rest. The block comment above the function claims this mechanism "guarantees the sidebar closes once the pointer is outside the sidebar zone", which is not what the code does.

**Fix:** Only arm the timer when one is not already pending, e.g. `if (!hideTimeout) hideTimeout = setTimeout(...)` in a separate `scheduleHideOnce()` used by `onGlobalPointerMove`, keeping the reset behaviour for `onEnter`/`onLeave`. Add a fake-timer test that dispatches several mousemove events over > SIDEBAR_HIDE_DELAY_MS and asserts `hovered` becomes false.

#### 189. recentCollapsed / toggleRecentCollapse drive a sidebar section that does not exist

`src/composables/useSidebar.ts`:148 - dead-code

`recentCollapsed` (line 148), its persistence watcher (162-166), `toggleRecentCollapse` (244-246), `STORAGE_KEYS.RECENT = 'sidebar-recent-collapsed'` (52) and the two `UseSidebarReturn` entries (25, 41) implement collapse for a "Recent" section. Grepping src/, electron/ and e2e/ shows `recentCollapsed`, `toggleRecentCollapse` and `sidebar-recent-collapsed` appear only in useSidebar.ts and useSidebar.test.js. AppSidebar.vue renders Favorites, Tree, Tags and Legend - there is no Recent section anywhere, so this state can never be toggled or observed from the UI. (App.vue does call `loadRecentItems()`, but the result is not rendered by AppSidebar.vue.)

**Fix:** Delete recentCollapsed, its watcher, toggleRecentCollapse, STORAGE_KEYS.RECENT and the corresponding interface members, along with the tests that only exist to cover them.

#### 190. Half of useSnapshots' surface is unreachable from the UI, and DataSettings.vue forks its date formatter

`src/composables/useSnapshots.js`:116 - dead-code

The only production consumer is `useMaintenanceDialogs.js:42`, which destructures exactly `{ availableSnapshots, snapshotMessage, loadSnapshots, createSnapshot, restoreSnapshot, reloadDatabase }`. The remaining returns — `showSnapshotList`, `toggleSnapshotList`, `closeSnapshotList`, `formatSnapshotDate`, `cleanup` — are referenced only from `src/__tests__/useSnapshots.test.js`. Two concrete consequences:

1. `showSnapshotList` is an internal `ref(false)` that no component reads; the real panel visibility lives in the ref App.vue injects into `useMaintenanceDialogs`, which implements its own `toggleSnapshots()`. Two refs named the same thing, one of them permanently inert.
2. `formatSnapshotDate(dateString)` here uses an explicit `toLocaleString('en-US', {...})` field set, while `src/components/settings/DataSettings.vue:32` defines its own `formatSnapshotDate(timestamp)` using a bare `d.toLocaleString()` plus an `'Unknown'` guard. The component uses its fork; the composable's version is only ever exercised by tests. That is exactly the "never fork library code" case — two formatters that will drift.

Tests are not a consumer for the purposes of the "connected or deleted" rule.

**Fix:** Delete `showSnapshotList`, `toggleSnapshotList`, `closeSnapshotList`, and their tests; either wire `formatSnapshotDate` into DataSettings.vue and delete the component-local copy, or delete the composable's copy. Also call `cleanup()` from `useMaintenanceDialogs` (or register `onUnmounted` inside `useSnapshots`) rather than exposing a cleanup nobody invokes.

#### 191. _getColorMap is an unused parameter whose JSDoc names a different option

`src/composables/useTimelineLayout.js`:40 - dead-code

The JSDoc declares `@param {Function} options.getColorMap - Function returning color map`, but the destructuring is `{ getNodes, getHideCompleted, _getColorMap, scrollableRef }` and `_getColorMap` is referenced nowhere in the file (grepped). The caller mirrors the mistake - TimelineView.vue:35 passes `_getColorMap: () => props.colorMap` - so a real option is being threaded through and thrown away. The color map actually reaches the composable as an explicit argument (`getProjectBoxStyle(project, colorMap)`, called from TimelineView.vue:69).

**Fix:** Delete `_getColorMap` from the destructuring, delete the `_getColorMap` line in TimelineView.vue, and remove the `options.getColorMap` line from the JSDoc.

#### 192. switchWorkspace, onSwitch and the whole new-workspace-dialog state are unreachable from the UI

`src/composables/useWorkspace.ts`:188 - dead-code

App.vue switches workspaces by writing the ref directly — `@update:model-value="currentWorkspace = $event"` (App.vue:858) — and never destructures `switchWorkspace`; grep finds it only in src/**tests**/useWorkspace.test.js. Consequently the `onSwitch` option (line 25) is never supplied and its call at line 193-195 can never fire. `showNewWorkspaceInput`, `newWorkspaceName` and `openNewWorkspaceDialog` (lines 86-87, 105-108) are likewise test-only: WorkspaceSelector.vue owns its own creation UI and App.vue calls `createWorkspace(name)` with an explicit name, so the `nameParam || newWorkspaceName.value` fallback at line 114 is also dead. Per the project rule, a capability that exists only in a composable and is never reachable from a component is unfinished work to delete, not to document.

**Fix:** Delete switchWorkspace/onSwitch and the dialog state (showNewWorkspaceInput, newWorkspaceName, openNewWorkspaceDialog, the nameParam fallback), or route App.vue's WorkspaceSelector binding through switchWorkspace so the persistence and callback live in one place.

#### 193. `agentService` object export is never imported

`src/services/agentService.js`:206 - dead-code

`export const agentService = { research }` at the bottom of the file. Grepping the whole tree (src/, electron/, e2e/, src/**tests**/) for `agentService` returns only this definition line and `src/services/api.ts:683`, which imports the named function: `const { research } = await import('./agentService.js')`. Nothing ever imports the `agentService` object. It exists only to mirror the shape of `ollamaService`/`openaiService`/`wikipediaService`.

**Fix:** Delete the `agentService` object export and keep only `export async function research(...)`.

#### 194. OpenAIGenerateOptions omits skipSslVerification although caller and IPC handler both use it

`src/services/api.ts`:152 - typing

`openaiGenerate(options: OpenAIGenerateOptions): Promise<string>` (api.ts:152 on ElectronAPI, and src/types/api.ts:302 on Api). `OpenAIGenerateOptions` (src/types/api.ts:67-73) declares only `prompt, content, model, endpoint, apiKey`.

But `src/services/aiProviders.js:54-62` sends `skipSslVerification: openaiSkipSslVerification.value` in that payload, and `electron/ipc/openai.js:33` destructures it out of the IPC argument and forwards it to `httpClient` (`electron/ipc/httpClient.js:243`). The field is load-bearing on both ends and absent from the type. It works today only because aiProviders.js is plain JS; a TypeScript caller would be rejected by excess-property checking, and anyone reading the type would conclude the SSL-skip setting is not part of the generate call.

Relatedly, the web implementation (api.ts:665-678) drops the flag entirely — `openaiService.generate/testConnection/listModels` never accept it — so the user-facing "skip SSL verification" setting silently has no effect outside Electron.

**Fix:** Add `skipSslVerification?: boolean` to `OpenAIGenerateOptions`, and either accept-and-ignore it explicitly in openaiService with a comment that browser fetch cannot honour it, or hide the setting when not running in Electron.

#### 195. Most of the cache surface — onEvict, stats, has, delete, size, clear, getOrSet — has no production caller

`src/services/nodeCache.js` - dead-code

The only production consumer is `src/composables/useDataLoading.ts`, which constructs the cache with `{ maxSize: 100, ttlMs: 60000 }` and declares a local interface of exactly three methods: `get`, `set`, `invalidatePrefix` (useDataLoading.ts:11-16, 178). Grepping src/, electron/ and e2e/ for `onEvict`, `resetStats`, `.stats()`, `getOrSet`, `.clear()`, `.size()` on this cache returns hits only inside nodeCache.js itself and inside src/**tests**/nodeCache.test.js.

So: the `onEvict` option is never supplied by anyone (making the `triggerCallback` parameter of `removeEntry` and the whole `evictLRU` callback path unobservable outside tests), the documented "Statistics tracking for hit/miss rates" feature is written to on every `get()` but never read by any UI or log, and `has`, `delete`, `size`, `clear`, `getOrSet`, `stats`, `resetStats` are test-only API. Per the project rule this is code that was written but never connected.

**Fix:** Trim the returned object to `{ get, set, invalidatePrefix }` (plus anything a second consumer actually needs), drop the `onEvict` option, the `hits`/`misses` counters and the `triggerCallback` parameter, and delete the corresponding test blocks. If hit-rate visibility is wanted, wire `stats()` into a debug panel in the same change.

#### 196. openaiService, agentService and wikipediaService have no tests while their sibling ollamaService does

`src/services/openaiService.js` - consistency

`src/__tests__/` contains `ollamaService.test.js` (238 lines covering generate, error mapping, testConnection, listModels) but no `openaiService.test.js`, no `agentService.test.js` and no `wikipediaService.test.js`. openaiService.js is the module that handles the API key (`if (!apiKey) throw ...` in four places), parses provider error bodies (`handleResponseError`, including the non-JSON-body fallthrough), and maps 401 to "Invalid API key" — all untested. agentService.js contains the entire tool-calling loop and the max-iteration summary path, untested. The project rule is that a feature is done when it is reachable from the UI _and_ covered by tests.

**Fix:** Add openaiService/agentService/wikipediaService test files mirroring the structure of ollamaService.test.js (fetch stubbed via vi.stubGlobal), covering at minimum: missing-apiKey rejection, 401 mapping, non-JSON error body fallthrough, the tool-call iteration loop, and the max-iterations summary branch.

#### 197. `getSummary` is never called

`src/services/wikipediaService.js`:49 - dead-code

`export async function getSummary(title)` and its entry in the `wikipediaService` object. A tree-wide grep for `getSummary` returns only its definition (line 49) and its re-export (line 113). The only consumer of this module, `src/services/agentService.js:77`, calls `getExtract`. The main-process counterpart (electron/wikipedia.js) exposes only `search` and `getContent`, so there is no equivalent on that side either. It also duplicates ~90% of `getExtract` (same REST endpoint, same 404 handling), differing only in returning `{extract, description}` instead of `{content}`.

**Fix:** Delete `getSummary` and its entry in the `wikipediaService` object.

#### 198. reorderNode advertises a 'inside' position the backend does not implement

`src/types/api.ts`:217 - typing

`reorderNode(nodeId, targetId, position: 'before' | 'after' | 'inside')`. `electron/database/nodes.js:346-380` computes `const insertIndex = position === 'before' ? targetIndex : targetIndex + 1` — 'inside' is silently handled as 'after' and never reparents under the target. No caller ever passes it: both drag composables route an inside-drop to `moveNode` instead (useCardDrag.js:95-101, useTableDrag.js:200-206) and only reach `onReorder` in the else branch. The union therefore documents a capability that does not exist and that would corrupt the user's intent if anyone trusted it.

**Fix:** Narrow the parameter to `'before' | 'after'` in `Api`, `ElectronAPI` and both implementations (and in `ReorderParams` where it feeds reorder rather than move), or implement 'inside' in `reorderNode`.

#### 199. Optional method markers on Api members that both backends always implement

`src/types/api.ts`:221 - typing

`exportJSON?`, `exportCSV?`, `importJSON?`, `importCSV?`, `getTagNodes?`, `getOrCreateTagNode?`, `getNodesLinkedToTag?`, `searchTagNodes?`, `backup?`, `listBackups?`, `restoreBackup?`, `reload?`, `getDataPath?` and `agentResearch?` are declared optional, yet both `webApi` and `electronApi` (src/services/api.ts, each annotated `: Api`) define every one of them. The optionality is untrue and leaks into consumers: useDataLoading.ts:246 has to write `if (api.getTagNodes)` before calling it, while the non-TS callers (TagInput.vue:25, DetailPanel.vue:524, DataSettings.vue:72) call them unguarded — two contradictory conventions for the same contract.

**Fix:** Drop the `?` from all members that both implementations provide, and remove the now-pointless existence guard in useDataLoading.ts.

#### 200. restoreNode is typed Promise<void> but callers depend on the returned Node

`src/types/api.ts`:234 - typing

`restoreNode(id: number): Promise<void>` (mirrored at src/services/api.ts:107 and :441). The Electron implementation returns the restored node (electron/database/tree.js:124 `restoreNode` -> `ctx.getNode(id)`, passed straight through by electron/ipc/database.js:152), and both `DeleteCommand.undo` (`const restored = await api.restoreNode(...)`, then `restored.parent_id`) and `DeleteMultipleCommand.undo` read that value to decide whether to reparent. Because the declared type is `void` the compiler cannot catch the divergence, and the web implementation (`request<void>('/nodes/:id/restore')`) makes the truth backend-dependent: if that endpoint answers with an empty body, `restored` is nullish and the parent restoration silently never runs.

**Fix:** Type it `Promise<Node | null>` in both `Api` and `ElectronAPI`, and make the web path return the restored node so both backends honour the same contract.

#### 201. Nine exported settings interfaces are referenced by nothing

`src/types/settings.ts`:31 - dead-code

`GraphSettings` (31), `OllamaSettings` (43), `OpenAISettings` (55), `DetailPanelSettings` (69), `SidebarSettings` (81), `VisibilitySettings` (89), `OnboardingSettings` (99), `HintBarSettings` (107) and `AppSettings` (116) have zero references anywhere in src/, electron/, e2e/ or the tests apart from their declaration and the barrel re-export in src/types/index.ts:46-54. They are roughly half of the file. `AppSettings` is also inaccurate where it is: its docstring says "These are persisted to localStorage", whereas useSettings.ts persists each key to the DB-backed settings store with localStorage only as a fallback, and no `AppSettings`-shaped object is ever constructed.

**Fix:** Delete the nine interfaces and their re-exports; keep only `ViewMode`, `AIProvider`, `AICustomPrompt` and `UseSettingsReturn`, which are actually consumed.

#### 202. Four error classes and AppError.isCategory are never constructed/called in production

`src/utils/errorTypes.js`:58 - dead-code

`grep -rn "new <Class>("` across `src/` and `electron/` excluding `__tests__` returns exactly one hit in total: `src/composables/useErrorHandler.js:50` constructing `AppError`. `ApiError` (58), `NotFoundError` (74), `ValidationError` (90), `DatabaseError` (136) are constructed only in `src/__tests__/errorTypes.test.js`. `wrapError` never produces any of them either — its heuristics only yield NetworkError, AuthError, AIError, or a plain AppError.

Consequences inside this same file:

- `getUserMessage`'s `NotFoundError` (216), `ValidationError` (220) and `DatabaseError` (227) branches are unreachable, as are the `resourceType`/`field`/`operation` fields they read.
- `AppError.isCategory` (line 36) is referenced only at `errorTypes.test.js:61-62`.
- `ErrorCategory.API`/`.VALIDATION`/`.NOT_FOUND`/`.DATABASE` are reachable only through those classes; no production file references any `ErrorCategory.*` member at all (it is re-exported from `useErrorHandler` at line 211 and never destructured by a component).

**Fix:** Either delete `ApiError`, `NotFoundError`, `ValidationError`, `DatabaseError`, `isCategory`, the corresponding `ErrorCategory` members and the unreachable `getUserMessage` branches, or make the API/database layers actually throw them (e.g. `api.ts` raising `ApiError`/`NotFoundError`, `electron/database/*` raising `DatabaseError`) so the user-facing messages can fire.

#### 203. wrapError misclassifies any message containing the substring '401' or '403' as an auth error

`src/utils/errorTypes.js`:174 - correctness

`if (lowerMessage.includes('401') || lowerMessage.includes('403')) return new AuthError(...)`. The match is on the raw substring anywhere in the message, not on an HTTP status position.

Failure scenario: a node-level failure whose message embeds an id or count — e.g. `"Node 1403 not found"`, `"Failed to update 401 rows"`, or a file path containing `403` — is wrapped as `AuthError`. `useErrorHandler.handleError` then routes it through `getUserMessage`, which for `AuthError` unconditionally discards the real message and returns the fixed string "Authentication required. Please check your credentials." (line 214). The user sees a credentials prompt for a database error and the actual cause never reaches the toast.

**Fix:** Classify from a structured status rather than message text: have HTTP callers construct `ApiError`/`AuthError` with `options.status` and let `wrapError` check `error.status === 401 || error.status === 403`. If message sniffing must stay, anchor it (e.g. `/\b(401|403)\b/` plus a required token like `http`, `status`, or `unauthorized`/`forbidden`).

#### 204. Exported handleKeydown is imported only by its unit test

`src/utils/nodeInteractions.js`:63 - dead-code

`export function handleKeydown(e, callbacks)` is imported in exactly two places: `src/__tests__/node-interactions.test.js:6` and nowhere else. `src/composables/useNodeInteractions.js:1-6` — the only production consumer of this module — imports `handleNodeClick`, `handleNodeHover`, `handleNodeDoubleClick`, `shouldShowTooltip` and deliberately omits `handleKeydown`. No component calls it either.

This also makes the module header aspirational: the interaction model documented at lines 6-13 lists "- Enter: Toggle detail panel", but that path is never reachable through this module. (Enter is in fact handled globally in `useKeyboardShortcuts.js:183` with entirely different semantics — it navigates into the node — so the header actively misdescribes app behaviour.)

**Fix:** Delete `handleKeydown` and its test block, and remove the "Enter: Toggle detail panel" line from the module header, or wire it into `useNodeInteractions` and return it alongside the other handlers.

#### 205. parseCellReference and toCellReference are only referenced by their own test

`src/utils/spreadsheetFormulas.js`:38 - dead-code

Grepped `src/`, `electron/`, `e2e/` and `docs/`: the only non-definition hits for `parseCellReference` and `toCellReference` are in `src/__tests__/spreadsheetFormulas.test.js`. The two functions that ARE consumed (`isFormula`, `getColumnName`) are imported by `NodeSpreadsheet.vue` and `TableMiniature.vue`; the reference parsers are not, and nothing inside this module calls `parseCellReference` either.

They were clearly written for a formula evaluator that does not exist: `grep -rn "evaluateFormula|hyperformula|formulajs"` returns nothing, and `computed_value` is a column in `node_table_cells` (`electron/database/schema.js:151`) that is written from client-supplied data (`electron/database/tables.js:150`) but never computed anywhere. The file's own header calls this "formula detection and parsing utilities" while no parsing result is ever used.

**Fix:** Delete `parseCellReference` and `toCellReference` (and their describe blocks) per the project's delete-don't-document rule, or land the evaluator that consumes them in the same change. If they are kept, note that `parseCellReference` also rejects absolute references (`$A$1`), which any real evaluator would need.

## Refuted (31)

These were raised by a reviewer and thrown out by the verifier as not real:

- src/main.js:72 bootstrap() is called without a rejection handler, so a startup failure leaves a blank window
- electron/main.js:118 Production Content-Security-Policy is never applied — webRequest does not intercept file:// loads
- electron/database/migrations.js:126 Count query and UPDATE disagree on the deleted_at filter in two migrations
- electron/database/tables.js:134 setCells/clearCells return {success:false} that no caller ever reads, so cell writes fail silently
- electron/database/tags.js:58 getOrCreateTagNode reaches past the injected context to the raw sql.js driver
- electron/database/search.js:211 getTasks cannot filter for root-level tasks: parent_id = NULL never matches
- electron/database/links.js:78 getAllLinks returns links to soft-deleted nodes while getLinkedNodes filters them out
- electron/ipc/window.js:42 Window-open handler and will-navigate are allow-by-default for non-http schemes
- src/utils/keyboardShortcuts.js:18 Shortcut help data omits six shipped shortcuts, including the key that opens the help itself
- src/types/api.ts:258 Api omits the settings surface, forcing useSettings to reach around the interface
- src/composables/useGraphLayout.js:533 localRelax unlocks and restores the viewport 200ms before its layout finishes, and unlocks every node globally
- src/composables/useGraphUpdate.js:233 Structural update silently clears Cytoscape selection
- src/composables/useGraphInit.js:167 `applyInitialLayout` leaves uncancellable timers pointing at a destroyed cytoscape instance
- src/composables/useNodeCreation.js:56 createNode reloads the sidebar without invalidating its 60s cache, so the new child never appears
- src/composables/useNavigation.ts:231 Root tree is built twice by two composables with different filtering and different query strategies, and onSidebarSync bypasses the sidebar cache
- src/composables/useWorkspace.ts:202 getWorkspaceIdForNode accepts a node type it ignores, and three call sites pass one expecting it to matter
- src/composables/useRefresh.js:0 useRefresh is the only untyped composable in this group and probes its injected dependencies for existence
- src/composables/useTableDrag.js:144 Stale dropTarget survives when findNodeById misses, so mouseup can move onto the wrong node
- src/composables/useTableDrag.js:102 Document listeners and the ghost element are never cleaned up on unmount
- src/composables/useTimelineDates.js:223 calculateDueUrgency parses dates as UTC instead of using the module's own parseLocalDate
- src/composables/useTreeExpand.js:24 loadExpandedState leaves the previous workspace's expanded IDs in place when the new workspace has no stored state
- src/composables/useTreeExpand.js:57 expandAncestors mutates expandedIds without persisting, unlike every other mutator in the composable
- src/composables/useSensitiveNotes.js:48 The relock subscription is never unsubscribed and the guard breaks if the API returns nothing
- src/components/TableView.vue:250 Row indentation uses absolute DB depth instead of depth relative to the current container
- src/components/PersonsView.vue:43 PersonsView ignores the app-wide hideSensitive setting; TasksView receives it and never uses it
- src/components/settings/QuickCaptureSettings.vue:27 Unguarded awaits: a failed capture IPC call leaves the UI permanently busy and reports nothing
- src/components/settings/SecuritySettings.vue:78 'locked' status renders the false statement "The database is stored as plaintext"
- src/components/settings/SensitiveNotesSettings.vue:27 run() has no error path: a rejected action leaves every button disabled with no message
- src/components/settings/QuickCaptureSettings.vue:29 Component branches on `result.registered`, a field absent from the declared IPC result type
- src/components/MarkdownRenderer.vue:219 renderContent runs twice on mount and can produce colliding mermaid element ids
- src/components/TypeFilterDropdown.vue:28 'tag' nodes are unconditionally hidden once any type filter is active, with no way to re-enable them

## Appendix: unverified low-confidence notes (180)

These were reported at low severity and did **not** go through adversarial verification. Treat them as leads, not findings.

### `electron/database/backup.js`

- **backup() returns a bare string but the renderer contract declares {path: string}**:21 (typing) - `backup(suffix)` returns `backupPath`, a plain string, and `electron/ipc/database.js:181` forwards it unchanged. The renderer-side contract declares `backup?(suffix?: string): Promise<{ path: string } | { error: string }>` in both `src/types/api.ts:281` and `src/services/api.ts:137/892`. vue-tsc doe

### `electron/database/export.js`

- **CSV round trip silently loses sibling ordering, and escapeCSV misses lone carriage returns**:187 (correctness) - `exportCSV`'s header list omits `sort_order` (as well as `favorite` and `color`), and `importCSV` never reads them, so re-importing an exported file assigns every node the default `sort_order` of 0 and the user's manual ordering is gone. The parent/child structure is preserved via the `id`/`parent_i

### `electron/database/index.js`

- **\_query leaks the prepared statement when bind or step throws**:316 (correctness) - `const stmt = this.db.prepare(sql); stmt.bind(params); while (stmt.step()) {...}; stmt.free()` — if `bind` or `step` throws (type mismatch, constraint, a corrupted row), `stmt.free()` is never reached and the sql.js statement stays allocated in the WASM heap and registered on the connection. `_query

### `electron/database/links.js`

- **linkNodes and unlinkNodes have divergent error contracts for the same LinkResult type**:62 (consistency) - Both are documented as returning `LinkResult` with an optional `error`. `linkNodes` wraps its writes in `try/catch` and converts any failure - FK violation, unique violation, locked DB - into `{ success: false, error: e.message }`, so callers never see a thrown error (which is what makes the `catch`

### `electron/database/nodes.js`

- **reorderNode is the only mutating node operation that does not bump updated_at**:346 (consistency) - `moveNode` (line 325) and `updateNode` (line 246) both append `updated_at = CURRENT_TIMESTAMP` to their UPDATE. `reorderNode` writes `sort_order` and `parent_id` for the whole sibling set with no timestamp update: ```js ctx._run('UPDATE nodes SET sort_order = ?, parent_id = ? WHERE id = ?', [index,
- **getChildren's workspaceId parameter is never supplied by any caller**:391 (dead-code) - `getChildren(id, type = null, workspaceId = undefined)` documents workspaceId as "Optional workspace filter (defaults to parent's workspace)", but nothing ever passes a third argument: the IPC handler is `ipcMain.handle(DB_GET_CHILDREN, (_event, id, type) => db.getChildren(id, type))` (electron/ipc/

### `electron/database/search.js`

- **getAllTags compares against a double-quoted literal that SQLite only accepts as a misfeature fallback**:107 (correctness) - `js let sql = 'SELECT tags FROM nodes WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != "[]"' ` In SQL, double quotes delimit an identifier. SQLite resolves `"[]"` as a string literal only because no column of that name exists - a documented compatibility misfeature that stricter setting

### `electron/database/sensitiveSession.js`

- **lock() fires onLock even when the session is already locked**:50 (correctness) - function lock() { key = null clearTimer() if (onLock) onLock() } There is no `isUnlocked()` guard, and `onLock` in electron/main.js broadcasts `SENSITIVE_LOCKED_EVENT` to every window, which the renderer's `useSensitiveNotes` turns into a `refresh()` round trip. Two reachable spurious broadcasts: th

### `electron/database/tables.js`

- **Unguarded JSON.parse in tables.js diverges from the guarded parsing in \_rowToNode**:23 (consistency) - `getNodeTable` does `JSON.parse(row.column_definitions || '[]')` and `JSON.parse(row.settings || '{}')` (lines 23-24), and `getTableCells` does `JSON.parse(cell.style)` (line 121), all unguarded. `index.js:_rowToNode` (lines 342-364) wraps every equivalent parse of `tags`, `graph_type_filter` and `g
- **Cell style is double-JSON-encoded on the way in and single-decoded on the way out**:139 (consistency) - `useNodeTable.saveCellStyle` already stringifies: `style: JSON.stringify(style)` (src/composables/useNodeTable.js:161). `setCells` line 139 then does `cell.style ? JSON.stringify(cell.style) : null`, so the column stores a JSON string containing a JSON string. `getTableCells` line 121 parses once, r

### `electron/database/tree.js`

- **getRoots logs to the console on every call**:52 (dead-code) - ``js console.log(`getRoots(${workspaceId}): found ${results.length} root nodes`) `` No other read operation in the module group logs; the only comparable line is the `importCSV` skipped-row summary in export.js, which reports an anomaly. `getRoots` is on the hot path - `useDataLoading` calls it on
- **getInbox does not implement an inbox, and getProjects ignores workspaces unlike every sibling**:72 (naming) - `getInbox` claims "The inbox represents uncategorized top-level items" but its query is `SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, created_at` - byte-for-byte the root-node set, with no notion of uncategorised, no capture-target, and no workspace filter.

### `electron/database/workspaces.js`

- **createWorkspace derives an id with no collision, empty-string or missing-name handling**:36 (correctness) - `const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')` throws a bare TypeError if `name` is absent, produces `'-'` or `''` for an all-punctuation name, and collides with the seeded ids for any name that slugifies to `work` or `private` — surfacing as a raw SQLite PRIMARY KEY con

### `electron/ipc/agent.js`

- **executeAgentTool, fallbackResearch and runAgentLoop are exported but imported nowhere**:255 (dead-code) - module.exports = { registerAgentHandlers, executeAgentTool, fallbackResearch, runAgentLoop } Grepping the whole tree (`src/`, `electron/`, `e2e/`, `scripts/`) for each name finds references only inside `electron/ipc/agent.js` itself. The only external hit for `runAgentLoop` is the unrelated same-nam

### `electron/ipc/database.js`

- **registerDatabaseHandlers binds a db instance while its siblings take a getDb() accessor**:94 (consistency) - function registerDatabaseHandlers(ipcMain, db) { ipcMain.handle(DB_GET_NODES, (_event, params) => db.getNodes(params)) Every closure captures the instance passed at registration time. The two sibling registrars in the same directory deliberately do not: `registerSecurityHandlers(ipcMain, { getDb, ..

### `electron/ipc/llmProvider.js`

- **chatRequest treats any non-'openai' provider as Ollama and never validates apiKey**:46 (correctness) - if (provider === 'openai') { ... } else { /* ollama */ } The JSDoc says `@param {string} options.provider - 'openai' or 'ollama'`, but the else-branch swallows `undefined`, `'anthropic'`, a typo, or anything else and sends it to `${endpoint}/api/chat` with Ollama's body shape — producing a confusing

### `electron/ipc/openai.js`

- **openaiRequest omits the errorPrefix/connectionError that ollamaRequest supplies**:18 (consistency) - // ollama.js return httpRequest(`${endpoint}${path}`, { method: options.method, body: options.body, errorPrefix: 'Ollama API', connectionError: 'Ollama is not running. Start with: ollama serve', }) // openai.js — same role, neither field return httpRequest(`${endpoint}${path}`, { method: options.met

### `electron/ipc/security.js`

- **No tests cover any electron/ipc handler module** (design) - The crypto primitives are well covered (src/**tests**/database-encryption.test.js, keyManager.test.js, sensitiveNotes.test.js, sensitiveSession.test.js, sensitiveNotesDb.test.js) and so is the renderer UI (securityUi.test.js, sensitiveNotesSettings.test.js, useSensitiveNotes.test.js). But `grep -rln
- **Unused `path` import**:10 (dead-code) - `const path = require('path')` at line 10 is never used — `grep -n "path\." electron/ipc/security.js` returns nothing, and eslint confirms it: 10:7 warning 'path' is assigned a value but never used
- **readSecurityConfig fails open: a corrupt security.json silently disables the Touch ID gate**:21 (correctness) - function readSecurityConfig(configPath) { try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch { return { touchIdGate: false } } } The catch treats 'file does not exist yet' (normal first run) and 'file is corrupt or unreadable' (abnormal) identically, and the fallback disables the
- **SECURITY_UNLOCK reads the file outside the try, so a read failure rejects instead of returning an error**:72 (correctness) - ipcMain.handle(SECURITY_UNLOCK, async (_event, password) => { if (getDb()) return { success: true } const fileBuffer = fs.readFileSync(dbPath) // <- outside the try try { ... } catch (e) { return { success: false, error: e.message } } }) Every other handler in this file and in sensitiveNotes.js retu
- **SECURITY_DISABLE only verifies the password when the on-disk file happens to be encrypted**:105 (correctness) - // The password authorizes the change: it must unwrap the current file. const fileBuffer = fs.readFileSync(dbPath) if (isEncrypted(fileBuffer)) keyManager.unlockWithPassword(fileBuffer, password) db.encryptionKey = null The guard at the top is `if (!db?.encryptionKey)`, i.e. in-memory state, but the

### `electron/ipc/window.js`

- **createWindowConfig's shallow spread lets a caller silently replace the hardened webPreferences**:32 (design) - return { ...baseConfig, ...options } `baseConfig.webPreferences` carries the whole security posture (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, the preload path). A shallow spread means any caller that passes a `webPreferences` key — to set, say, `zoomFactor` or `spellcheck
- **createDetachedWindow and detachedWindows are exported but imported nowhere**:134 (dead-code) - module.exports = { registerWindowHandlers, createWindowConfig, setupExternalLinkHandling, createDetachedWindow, detachedWindows, } `createWindowConfig` and `setupExternalLinkHandling` are genuinely consumed (electron/main.js:18, electron/quickCapture.js:11). `createDetachedWindow` and `detachedWindo

### `electron/ipcChannels.js`

- **Orphaned APP section header and mis-grouped constants after an edit**:163 (docstring) - ```js // =========================================== // APP // =========================================== // Renderer -> main ack that pre-quit autosave has finished (see APP_BEFORE_QUIT) // =========================================== // SECURITY - At-rest encryption // ============================

### `electron/main.js`

- **ipcChannels is required twice in the same file**:24 (consistency) - Lines 4-11 destructure OPEN_SETTINGS, SHOW_SHORTCUTS, APP_BEFORE_QUIT, APP_QUIT_SAVE_DONE, MENU_UNDO, MENU_REDO from `require('./ipcChannels')`, and lines 24-30 require the same module again for SENSITIVE_LOCKED_EVENT and the four CAPTURE_* constants, with unrelated requires sandwiched between. Noth
- **Inline requires inside function bodies where the file otherwise imports at the top**:374 (consistency) - Three modules are required mid-function while every other dependency in this file is a top-level require: - `const fsSync = require('fs')` (line 374) — and the alias `fsSync` implies a sync/async pairing that does not exist here; nothing in this file requires `fs/promises`. - `const { readSlots } =

### `electron/preload.build.js`

- **No gate compares the committed preload bundle against a fresh build** (consistency) - preload.build.js is the file every window actually loads (electron/ipc/window.js:22), yet it is a generated artifact committed to the repo. I regenerated it with `node scripts/bundle-preload.js` and diffed — it is currently in sync with preload.js, so there is no drift today. The gap is enforcement.

### `electron/quickCapture.js`

- **createQuickCapture has no JSDoc and the module has no tests**:15 (docstring) - `createQuickCapture({ getAccelerator })` is the module's exported factory and carries no JSDoc, while the sibling factories in this codebase document their injected context in detail (`registerSecurityHandlers`, electron/ipc/security.js:33-45; `createWindowConfig`, electron/ipc/window.js:14-18). Onl
- **Capture window omits the external-link handling every other window gets**:19 (consistency) - `createWindow` (main.js:131) and `createDetachedWindow` (electron/ipc/window.js:100) both call `setupExternalLinkHandling(win)` so http/https navigations and `window.open` are routed to the system browser and denied in-app. `buildWindow()` in quickCapture.js does not, so the capture window has neith
- **createQuickCapture exports `show`, which no consumer calls**:90 (dead-code) - `return { show, hide, register, unregister }` — grepped every `.js`/`.ts`/`.vue` file outside node_modules/dist/release: the only references to the factory's result are `quickCapture.register()`, `quickCapture.unregister()` and `quickCapture.hide()` in electron/main.js:336, :344, :364, :367. `show`

### `electron/wikipedia.js`

- **Wikipedia client is forked between main process and renderer, and the two have already diverged** (design) - electron/wikipedia.js and src/services/wikipediaService.js are two implementations of the same API against the same two endpoints (both re-declare identical WIKIPEDIA_ACTION_API / WIKIPEDIA_REST_API constants). The split exists because the browser build has no main process, but the copies have alrea
- **JSDoc misattributes the httpRequest helper and the transport, and the User-Agent version is stale**:11 (docstring) - Both functions document `@param {Function} httpRequest - HTTP request function from main.js` (lines 11 and 39). `httpRequest` is not defined in main.js — it comes from electron/ipc/httpClient.js (main.js:19 imports it from there and passes it to `registerAgentHandlers`). The module header also says
- **Search snippets strip tags but leave HTML entities undecoded**:31 (correctness) - `description: item.snippet?.replace(/<[^>]+>/g, '') || ''` removes the `<span class="searchmatch">` markup the Action API wraps around matches, but Wikipedia snippets are HTML-escaped, so `&quot;`, `&amp;`, `&#39;` and `&nbsp;` survive verbatim into the tool result. That string is JSON-serialised st
- **WIKIPEDIA_ACTION_API and WIKIPEDIA_REST_API are exported but never imported**:57 (dead-code) - Both constants are exported from module.exports (lines 57-58). Grepped the whole tree: the only references are their own declarations at lines 6-7 and their two internal uses at lines 24 and 43. The only consumer of this module, electron/ipc/agent.js:7, imports it as `wikipedia` and uses `wikipedia.

### `src/App.vue`

- **resetNavigationState is destructured but unused; the workspace-change handler hand-resets and misses `children`**:111 (consistency) - `resetNavigationState` is pulled out of `useNavigationState()` on line 111 and never referenced again (it appears exactly once in the file). The workspace-change callback instead resets three of the four refs by hand: ```js onWorkspaceChange: async () => { currentContainerId.value = null currentCont
- **The shared `error` ref and ViewRenderer's error branch can never be observed**:115 (dead-code) - `js const error = ref(null) watch(error, message => { if (message == null) return handleError(message, { context: 'Reordering node' }) error.value = null }) ` The only writer is `useNodeActionsUI.ts:473` (`error.value = (e as Error).message`). The watcher runs on the default `pre` flush — before
- **createNodeAtPosition is destructured in App.vue but never used**:650 (dead-code) - `js const { createNode, createNodeAtPosition, addChildFromDetail, showAddNodeModal, handleAddChild, handleCreate } = useNodeCreation({...}) ` `createNodeAtPosition` appears once in App.vue (this line) and is not referenced in the template or script. Tree-wide grep (`src/`, `electron/`, `e2e/`) s

### `src/commands/Command.js`

- **Base-class JSDoc documents parameters the signatures do not have**:13 (docstring) - `execute(_api)` and `undo(_api)` are documented as `@param {Object} api - API service`; the documented name does not exist in either signature, and the type is `Object` where every subclass and src/types/command.ts use the `Api` interface. Minor, but this is the file that defines the command contrac

### `src/commands/EditCommand.js`

- **The single-field description branch is unreachable**:32 (dead-code) - `const fields = Object.keys(this.newValues || {}); if (fields.length === 1) return `Edit ${fields[0]}`.` The only production construction site (src/composables/useNodeOperations.ts:245) always passes `pickNodeFields(node)`, and `pickNodeFields` assigns _every_ one of the 28 NODE_UPDATE_FIELDS uncond

### `src/components/AiDiffPreview.vue`

- **Declared 'edit' emit is never emitted**:11 (dead-code) - `const emit = defineEmits(['accept', 'reject', 'edit'])` declares `edit`, but the component only ever calls `emit('accept', ...)` (line 23) and `emit('reject')` (lines 18, 44, 51, 80). Editing is handled entirely locally via `isEditing` / `editedContent` (lines 26-32). The sole consumer, NotesAITool

### `src/components/Breadcrumbs.vue`

- **Breadcrumbs hosts a global DOM-id teleport target consumed by GraphView with no gate**:38 (design) - Breadcrumbs renders `<div id="view-controls-target"></div>`, and GraphView teleports its controls into it: `<Teleport to="#view-controls-target" defer>` (GraphView.vue:763). Grepping src/ for `view-controls-target` returns exactly these two hits. The coupling is a bare global DOM id across two unrel

### `src/components/CardsView.vue`

- **Unused import of decodeHtml**:4 (dead-code) - `import { decodeHtml } from '../utils/html.js'` is the only occurrence of `decodeHtml` in the file — `grep -n "decodeHtml" src/components/CardsView.vue` returns line 4 and nothing else. The other consumers of that export (`SpotlightSearch.vue:122`, `MarkdownRenderer.vue:167`) do use it.
- **Unused import decodeHtml**:4 (dead-code) - `import { decodeHtml } from '../utils/html.js'` — `decodeHtml` appears nowhere else in CardsView.vue (the only other importers are SpotlightSearch.vue and MarkdownRenderer.vue, which do use it). The person notes preview on line 375 uses raw `node.notes.split(...)` without decoding.
- **handleCardDragOver duplicates the fallback branch already in useCardDrag.onDragOver**:70 (consistency) - `handleCardDragOver` computes the drop position locally: `js const position = x < rect.width * 0.5 ? 'before' : 'after' ` `useCardDrag.js:63-68` contains the same computation as its no-hint fallback, including the `e.altKey ? 'inside'` branch. Top-level cards go through the local copy (line 259)
- **getDueDateStatus is never called**:164 (dead-code) - `function getDueDateStatus(dueDate)` returns `{ text, type }` for overdue/today. Grepping `getDueDateStatus` across `src/`, `electron/` and `e2e/` returns only this definition. The template uses `getDueDateClass` and `formatDueDate` instead; the countdown chip uses `getDateCountdown`.
- **nestedGridStyle called with two arguments but declared with one**:426 (typing) - `function nestedGridStyle(count)` (line 195) takes a single parameter, but the template calls `:style="nestedGridStyle(node.children.length, 1)"`. The `1` is silently discarded. Either the signature lost a parameter or the call site kept a stale argument.

### `src/components/DetachedView.vue`

- **Unused destructured payload fields in handleAIImproveNotes**:84 (dead-code) - const { nodeId, oldNotes: _oldNotes, newNotes, prompt: _prompt, selectionRange, fullNotes } = payload _oldNotes and _prompt are destructured only to be discarded (the underscore prefix silences the linter). Neither is referenced in the function body.
- **document.title is maintained in three places; two of them are redundant**:222 (consistency) - The `watch(() => currentNode.value?.title, ..., { immediate: true })` at 222-230 already covers every path that changes the node. handleUpdate also sets `document.title = updatedNode.title || 'Detached Node'` (64) and the BroadcastChannel handler sets it again (212), both immediately after assigning

### `src/components/DetailPanel.vue`

- **'resize' is declared in defineEmits but never emitted**:36 (dead-code) - `const emit = defineEmits([... 'resize-start', 'resize', ...])`. Grep for `emit('resize'` / `$emit('resize'` in the file returns nothing — only `resize-start` is emitted (line 559). Neither App.vue:1009 nor DetachedView.vue:254 listens for `@resize`.
- **Component probes the window.electronAPI global instead of an injected capability**:48 (design) - `const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow`. This is the "reach out to find your collaborator" pattern CLAUDE.md forbids: the component resolves a global to decide what to render, so no parent can substitute it and no boundary test can express it. `
- **toggleFavorite wraps synchronous code in an unreachable try/catch**:435 (dead-code) - `try { editedNode.value.favorite = !editedNode.value.favorite; saveChanges() } catch (e) { console.error('toggleFavorite failed:', e) }`. A property assignment plus a synchronous `emit` cannot throw here, and the file otherwise routes failures through `handleError`. The `console.error` branch is dea
- **Exposed getNotesSelection has no consumer**:628 (dead-code) - `defineExpose({ ..., getNotesSelection: getNotesSelectionFromForm })`. Grepping `getNotesSelection` across src/ and e2e/ outside src/components/detail/ finds only DetailPanel's own definitions and the `:get-selection="getNotesSelection"` prop it passes to NotesAIToolbar at line 774 — no parent ever
- **Double-click reset of the split ratio is not persisted**:857 (correctness) - `@dblclick="splitRatio = 0.5"` on the divider. Persistence happens only in `endSplitDrag()` (line 112, `localStorage.setItem(SPLIT_RATIO_KEY, ...)`), which a double-click does not reach, so the reset reverts to the previously dragged ratio on the next mount — the one place the panel's split state vi

### `src/components/GraphEditModal.vue`

- **defineExpose({ editTitleInput, editModalEl }) has no consumer**:43 (dead-code) - GraphView renders <GraphEditModal> (GraphView.vue:803-812) without a `ref`, and no other file imports the component. Grep for editTitleInput/editModalEl outside this file finds only useGraphModals.js, which keeps its _own_ unbound refs of those names — showEditModal's `nextTick(() => { editTitleInpu
- **Date inputs do not normalise ISO datetime values the way the other date UI does**:118 (consistency) - The three `<input type="date">` fields bind the raw field: `:value="editedNode.due_date"` / `start_date` / `end_date`. The sibling editor for the same columns, detail/MetadataGridSection.vue:119/146/159, defensively binds `:value="editedNode.due_date?.split('T')[0] || ''"`. electron/database/nodes.j

### `src/components/GraphPromptModal.vue`

- **defineExpose({ inputRef }) has no consumer**:35 (dead-code) - GraphView renders <GraphPromptModal> (GraphView.vue:814-822) without a `ref`, and nothing else imports the component, so the exposed inputRef is unreachable. Focus is already handled locally by the `watch(() => props.visible)` at lines 15-22; useGraphModals' separate `promptInputRef.value?.focus()`

### `src/components/GraphView.vue`

- **Modifier-driven modes are never reset when the window loses focus**:98 (correctness) - linkModeActive/deleteModeActive/boxSelectModeActive are derived only from keydown, keyup and mousemove on document. If the user holds Option and switches away (Cmd+Tab, or focus moves to a detached window), the keyup never reaches this document: linkModeActive stays true, the watcher at 127-131 keep
- **debounce() is not a debounce factory — every debounced function shares one timer**:343 (naming) - const debounce = (fn, d) => (...a) => { if (updateDebounceTimer) clearTimeout(updateDebounceTimer); updateDebounceTimer = setTimeout(() => fn(...a), d) } The timer handle is the single component-scoped `updateDebounceTimer` (line 78) rather than a per-closure variable, so a second call to debounce()
- **Tippy tooltips are attached once on mount, so conditionally rendered control buttons keep native title tooltips**:725 (consistency) - The onMounted nextTick block walks `graphControlsRef.value.$el.querySelectorAll('button[title]')`, converts each to a tippy instance and strips the title attribute. It runs exactly once. GraphControls renders the "Show root node" button behind `v-if="hasParent"` (GraphControls.vue:130-141) and the w

### `src/components/MarkdownRenderer.vue`

- **person-mention chips carry data-person-id and cursor:pointer but nothing handles clicking them**:49 (dead-code) - The renderer emits `<span class="person-mention" data-person-id="...">` (line 49) and both `.person-mention` (line 381) and `.hashtag` (line 399) are styled `cursor: pointer`. Grepping src/ and e2e/ for `data-person-id` finds only this line, the comment at line 32, and the assertion in markdown.test

### `src/components/MentionDropdown.vue`

- **Mixes the captured emit function and the template $emit in adjacent lines**:22 (consistency) - Line 22 uses `@mousedown.prevent="emit('select', index)"` while line 23 uses `@mouseenter="$emit('hover', index)"`, in the same element. Every other component in this group consistently uses the captured `emit`binding from`defineEmits` (HintBar.vue:22, AddNodeBar.vue:18-27, MainToolbar.vue:151-291

### `src/components/NodeContextMenu.vue`

- **`menuPosition` imported without its `.js` extension while every sibling import has one**:7 (consistency) - `js import { calculateMenuPosition } from '../utils/menuPosition' import { usePlatform } from '../composables/usePlatform.js' ` The target is `src/utils/menuPosition.js` (there is no `.ts` variant). Every other non-`.vue` import in this file and in the context-menu sub-components carries the ext
- **Component probes the `window.electronAPI` global instead of receiving the capability, duplicating `useDetachedWindow`**:47 (design) - `js const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow ` This exact expression is copy-pasted in `src/components/DetailPanel.vue:48`, and a near-identical one already lives in the composable that owns this concern, `src/composables/useDetachedWindow.js:1
- **`toggleComplete` and `toggleFavorite` deliberately skip `close()`, but the parent closes the menu anyway**:68 (consistency) - Every action in the `actions` object calls `close()` except these two: `js toggleComplete: () => { emit('toggle-complete', props.node) }, toggleFavorite: () => { emit('toggle-favorite', props.node) }, ` The asymmetry reads as "keep the menu open so the user sees the label flip to Mark Incomplete

### `src/components/NodeSpreadsheet.vue`

- **refreshCells lacks the isDestroyed guard fitColumns has, and its deferred call is never cancelled**:133 (correctness) - `js function refreshCells() { if (gridApi.value) { gridApi.value.refreshCells({ force: true }) } } ` The sibling `fitColumns()` (line 341) guards with `if (!api || api.isDestroyed?.()) return`. `refreshCells` checks only that the ref is non-null — the ref still holds the destroyed API after unmo
- **Component writes composable-internal refs instead of going through the composable's API**:367 (design) - `handleContextMenu` mutates the selection composable's internal state directly: `js selection.selectionStart.value = { ...cell } selection.selectionEnd.value = { ...cell } ` and the template does the same for the column composable: `:ref="el => (columnOps.columnInput.value = el)"` (line 616), `v

### `src/components/NotesEditor.vue`

- **Editor created in a floating nextTick can outlive the component and leak**:251 (correctness) - `onMounted(() => { nextTick(setupEditor) })` (lines 251-253) schedules `setupEditor` on a promise that nobody awaits. `onUnmounted` (lines 255-260) only destroys `editor` if it is already assigned. If the component unmounts within the same tick — which happens in this codebase on rapid tab switches

### `src/components/PersonsView.vue`

- **The placeholder colour '#0f4c75' has three parallel definitions, two of which PersonsView imports at once**:9 (consistency) - src/utils/nodeColor.js declares itself the "single source of truth" and exports `DEFAULT_NODE_COLOR = '#0f4c75'` (line 17). src/components/config/personsGridColumns.js separately exports `legacyDefaultColor = '#0f4c75'` (line 71). PersonsView imports both in the same file — `DEFAULT_NODE_COLOR` on l
- **Unused \_orgIds set computed inside loadLinkedOrganizations**:218 (dead-code) - `js const _orgIds = new Set(allOrgs.map(o => o.id)) const leafOrgs = allOrgs.filter(org => { for (const other of allOrgs) { if (other.id !== org.id && other.parent_id === org.id) return false } return true }) ` `_orgIds` is built and never read — the filter iterates `allOrgs` directly. The under
- **Persons table headers are config-driven but the body cells and colspan are hardcoded**:550 (consistency) - The `<thead>` iterates `personsTableColumns` (`v-for="col in tableColumns"`, line 518), while the `<tbody>` hardcodes seven `<td>` elements (lines 537-547) in a fixed order and the empty row hardcodes `colspan="7"` (line 550). Adding or removing a column in personsGridColumns.js shifts every header

### `src/components/SettingsPanel.vue`

- **Comment on securityKey describes a remount that does not happen**:83 (docstring) - The comment reads "Bumped when database encryption changes, to remount the security section so the sensitive-notes controls reflect the new availability." Nothing is remounted: `securityKey` is not used as a `:key`; it is passed as a plain prop, `<SensitiveNotesSettings :refresh-signal="securityKey"

### `src/components/SidebarTreeItem.vue`

- **maxLevel silently truncates deep trees and is never passed by AppSidebar**:9 (correctness) - `maxLevel: { type: Number, default: 10 }` guards the recursion: `v-if="expandedIds.has(node.id) && node.children?.length && level < maxLevel"` (line 44). AppSidebar's root `<SidebarTreeItem>` (AppSidebar.vue:105-115) does not pass `:max-level`, so the default 10 always applies. A node at depth 10 th

### `src/components/SpotlightSearch.vue`

- **`searchMode` default `'navigate'` is not a value the search mode union ever produces**:8 (consistency) - `searchMode: { type: String, default: 'navigate' }`, but the `SearchMode` union in `src/composables/useSearch.ts` is `'normal' | 'link' | 'move'` -- `searchMode` is initialised to `'normal'` (line 106) and reset to `'normal'` (lines 118, 164). `'navigate'` appears nowhere else in src/ as a search mo
- **`getSearchActionLabel` takes a `_result` parameter it never uses**:56 (naming) - `js function getSearchActionLabel(_result) { if (props.searchMode === 'link') return 'Link' if (props.searchMode === 'move') return 'Move to' return 'Go to' } ` The label depends only on `props.searchMode`; the argument is dead. It is still passed at the call site (`getSearchActionLabel(result)`
- **Notes preview truncates decoded text but tests the raw string's length for the ellipsis**:122 (correctness) - `html {{ decodeHtml(result.notes).substring(0, 80) }}{{ result.notes.length > 80 ? '...' : '' }} ` The substring is taken from the decoded text while the `> 80` test uses the undecoded `result.notes`. Notes coming out of the editor carry HTML entities, so the two lengths diverge: notes of `"a &a

### `src/components/TableMiniature.vue`

- **Each miniature fetches its own table over IPC, so a cards view issues two round trips per table node on every mount**:19 (design) - `onMounted` calls `api.getNodeTable(props.nodeId)` and then `api.getTableCells(props.nodeId)` per component instance. `CardsView.vue:381` mounts one `<TableMiniature>` for every node with `has_table`, and the component has no caching and no shared loader — so switching views, toggling `hideCompleted

### `src/components/TableView.vue`

- **currentParentId prop is declared and passed but never read**:27 (dead-code) - `currentParentId: { type: Number, default: null }` is declared in `defineProps` and `ViewRenderer.vue:142` passes `:current-parent-id="currentContainerId"`. Grepping `currentParentId` across the tree finds only those two lines — the component never reads it (`currentContainer` is used for the parent
- **TableView tooltip emits toggle-complete with a numeric id while the handler expects a Node**:60 (correctness) - Found while verifying the `toggle-complete` payload contract across the views in this group. TableView wires `onToggleComplete: nodeId => emit('toggle-complete', nodeId)` (line 60), and useNodeTooltip really does pass a number: `const nodeId = parseInt(evt.target.dataset.nodeId); onToggleComplete(no
- **confirmDelete does not confirm anything**:162 (naming) - `js function confirmDelete(nodeId) { emit('delete', nodeId) } ` It emits the delete immediately. The consumer chain is `ViewRenderer @delete` → `App.vue:968 @delete="deleteNode"` → `useNodeOperations.deleteNode` (line 258), which deletes the node and all descendants with no prompt (undo is pushe

### `src/components/TagInput.vue`

- **Orphan-tag hard delete swallows its failure with console.warn instead of the file's own handleError**:118 (consistency) - `removeTag` hard-deletes a tag node that has no remaining links (`await api.deleteNode(tagId, true)`, line 115) and swallows any failure with `console.warn('Could not delete orphan tag:', deleteErr)` (line 118). Every other failure path in this file routes through the injected `handleError` from use
- **handleBlur timer is never cleared on unmount**:165 (correctness) - `handleBlur` schedules `setTimeout(() => { showSuggestions.value = false }, 150)` (lines 166-168) and keeps no handle. The component registers no `onUnmounted`, so blurring the input and immediately closing the detail panel or switching nodes leaves a pending timer writing to a ref of a destroyed in

### `src/components/TypeFilterDropdown.vue`

- **Unused local `hidden` in buttonLabel; the store getter it reads has no other consumer**:37 (dead-code) - `const hidden = filtersStore.hiddenTypesCount` is assigned and never used — the next line returns `${filtersStore.visibleTypes.length} types`. Grepping the tree for `hiddenTypesCount` finds only stores/filters.js:28 (the computed), stores/filters.js:110 (its export) and this dead read, so removing t

### `src/components/ViewRenderer.vue`

- **Exposed graphViewRef and tasksViewRef are never read by a parent**:116 (dead-code) - defineExpose publishes graphViewRef and tasksViewRef alongside the updateGraph/loadTasks wrappers. App.vue holds the ViewRenderer instance as `viewRendererRef` and only ever reaches for the wrappers: useRefresh.js:69-70/93 calls `graphViewRef.value.updateGraph()` (where graphViewRef is bound to view

### `src/components/config/personsGridColumns.js`

- **personsViewModes is exported and never imported**:61 (dead-code) - `export const personsViewModes = ['cards', 'table']`. `PersonsView.vue:11-16` imports `personsTableColumns`, `defaultPersonsSort`, `defaultPersonColor`, `legacyDefaultColor`, `createDefaultPerson` and `maskEmail` from this module but not `personsViewModes`; grepping the name across `src/` and `e2e/`
- **personsViewModes export is unused; PersonsView hardcodes its view buttons**:61 (dead-code) - `export const personsViewModes = ['cards', 'table']` with the docstring "View mode options for the Persons view." Grepping src/ and e2e/ for `personsViewModes` returns only this declaration. PersonsView instead hardcodes both buttons in the template (`@click="viewMode = 'cards'"` / `@click="viewMode

### `src/components/context-menu/LinkedItemsList.vue`

- **`linked.type[0]` throws on an empty type string**:39 (correctness) - `html <span v-else class="linked-type" :class="linked.type">{{ linked.type[0].toUpperCase() }}</span> ` The schema declares `type TEXT NOT NULL DEFAULT 'task'` (electron/database/schema.js:55), which permits `''`. On an empty string `linked.type[0]` is `undefined` and `.toUpperCase()` throws ins

### `src/components/context-menu/MenuGroup.vue`

- **The `visible !== false` filter is applied twice, in MenuGroup and again in MenuItem**:18 (consistency) - MenuGroup filters before rendering: `html <MenuItem v-for="item in items.filter(i => i.visible !== false)" :key="item.id" :item="item" /> ` and MenuItem re-checks the same condition on its root element (`MenuItem.vue:18`: `<button v-if="item.visible !== false" ...>`). One of the two is unreachab

### `src/components/detail/ChildrenSection.vue`

- **due_date rendered raw while end_date is trimmed of its time component**:153 (consistency) - Line 144 renders `child.end_date.split('T')[0]` but line 153 renders `{{ child.due_date }}` unmodified. MetadataGridSection normalises both the same way (`editedNode.due_date?.split('T')[0]`, line 147), so a due_date stored with a time part displays as a full ISO timestamp in the task row and as a d

### `src/components/detail/MetadataGridSection.vue`

- **Default node colour hardcoded instead of importing DEFAULT_NODE_COLOR**:60 (consistency) - `clearColor()` emits `'#0f4c75'` and lines 171/173 repeat the literal, as does ChildrenSection.vue:139. `src/utils/nodeColor.js:17` exports `DEFAULT_NODE_COLOR = '#0f4c75'` and documents it as the sentinel meaning "no explicit color set", with `hasExplicitColor()` as the shared predicate. Duplicatin
- **"+Location" writes a single-space sentinel to make the field appear**:199 (design) - `@click="emit('update:field', { field: 'location', value: ' ' })"` — a space is used purely so the `v-if="editedNode.location"` at line 185 becomes truthy and swaps in the input. No `save` is emitted, so the sentinel sits in `editedNode`; if any other control then saves (notes autosave fires every 5

### `src/components/detail/PersonDetailForm.vue`

- **The forms' public (exposed) API is undocumented**:177 (docstring) - `defineExpose({ loadLinkedOrganizations, getNotesSelection })` here and `defineExpose({ loadLinkedMembers, getNotesSelection })` in OrganizationDetailForm.vue:121 form the contract DetailPanel re-exports at lines 624-625 and that useRefresh.js:83-84 calls across the layer. None of these functions ca

### `src/components/settings/AISettings.vue`

- **Agent-tool state is read/written through useSettings while every other AI setting flows via props/emits**:17 (consistency) - Every AI value in this component is owned by App and passed down as a prop, with changes emitted upward (lines 35-59). `aiEnabledTools` breaks the pattern: the component calls `useSettings()` itself (line 17) and mutates `aiEnabledTools.value` directly in `toggleTool` (lines 26-33). The parent has n
- **New prompt id is a label slug that can silently overwrite an existing prompt**:114 (correctness) - `const id = editingPrompt.value || promptForm.value.label.toLowerCase().replace(/\s+/g, '-')`. `savePrompt` (src/composables/useAiNotes.js:163-173) replaces in place when the id already exists, so adding a new prompt whose label slugs to an existing id (a built-in such as `summarize`, or a previousl
- **Deleting a built-in prompt is irreversible from the UI**:411 (design) - The `Del` button calls `handleDeletePrompt` for every row, including default prompts, and `deletePrompt` marks defaults with `_deleted: true` (useAiNotes.js:178-199). `presetPrompts` then filters those ids out permanently (useAiNotes.js:125-136), and the `Reset` button that would clear the override

### `src/components/settings/DataSettings.vue`

- **setTimeout(0) used to wait for a Vue DOM update instead of nextTick**:41 (consistency) - `triggerImport` sets `importType.value` then does `setTimeout(() => importFileInput.value?.click(), 0)` with the comment "Need to wait for accept attribute to update". Waiting for a reactive attribute to reach the DOM is exactly what `nextTick` guarantees; a macrotask happens to work today but is no

### `src/components/settings/QuickCaptureSettings.vue`

- **Desktop-only section renders in web mode, unlike the sibling security sections**:46 (consistency) - The component docstring says "Desktop only", but the only render guard is `v-if="config"`, and the web api stub returns a real object (`{ enabled: false, accelerator: '' }`, src/services/api.ts:573-575). So in web mode the section renders fully; toggling it calls `captureSetConfig`, which always ans

### `src/composables/useAIProviderConnection.js`

- **Debounce timers are never cleared, so a pending model fetch fires after the settings panel unmounts**:42 (correctness) - `ollamaFetchTimeout` and `openaiFetchTimeout` are set by `debouncedFetchOllamaModels`/`debouncedFetchOpenaiModels` with a 500 ms delay and are only ever cleared by a _subsequent_ debounce call. The composable registers no `onUnmounted`, and `AISettings.vue` (its sole consumer) does not call any clea

### `src/composables/useAppLifecycle.js`

- **updateDimensions probes the DOM by class selector and is returned to no production caller**:44 (design) - `js function updateDimensions() { const el = document.querySelector('.content-body') ... } ` The composable reaches into the document to find a DOM node owned by App.vue's template rather than receiving a template ref. Renaming or restructuring the `.content-body` wrapper silently breaks the siz

### `src/composables/useCardDrag.js`

- **useCardDrag's JSDoc omits @returns, unlike every other composable in the group**:13 (docstring) - useCardGrid.js:11, useCardsLayout.js:20, useTreeExpand.js:10, useTreeFlattening.js:9, useSpreadsheetSelection.js:17 and useSpreadsheetKeyboard.js:27 all document `@returns {Object} ...`. useCardDrag's block (lines 3-12) documents only the four options, so the exported surface (`draggedNode`, `dragge
- **isDragging(), getDragCount() and getDropClass() are returned but only exercised by tests**:120 (dead-code) - `getDropClass` (111), `isDragging` (120) and `getDragCount` (124) are in the returned object. App.vue's only `useCardDrag` call destructures `dropTarget, dropPosition, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop` (App.vue:342-350) and derives the drop CSS classes itself from `dropTarget`

### `src/composables/useCardGrid.js`

- **calculateGridColumns is exposed in the return object but no caller consumes it**:91 (dead-code) - `calculateGridColumns` is used internally by the `gridColumns` computed (line 60) and is also placed in the returned object (line 91). useCardGrid's sole consumer, useCardsLayout.js:40, destructures `{ cardSizeClass, cardsGridStyle, gridColumns }` and does not re-export it; a grep across src/ and e2

### `src/composables/useCardsLayout.js`

- **flatChildren is derived from unfiltered children, so Select All in cards view selects hidden nodes**:55 (correctness) - useCardsLayout passes the raw `children` ref to `useTreeFlattening`, while the cards view renders `filteredChildren` (ViewRenderer.vue:167), which `useChildrenFiltering` builds by dropping completed/inherited-completed nodes and applying the type filter. `flatChildren` is what `useSelection.selectAl
- **filterChildrenRecursive is threaded through useCardsLayout but no consumer uses it**:66 (dead-code) - useCardsLayout destructures `filterChildrenRecursive` from useChildrenFiltering (line 33) purely to re-export it (line 66). App.vue's `useCardsLayout` call destructures `filteredChildren, sortedChildren, flatChildren, cardSizeClass, cardsGridStyle, gridColumns, inheritedColorMap` (App.vue:243-250) -

### `src/composables/useColorInheritance.js`

- **Inconsistent optional-ref guarding contradicts the JSDoc**:43 (typing) - The composable guards three of its four inputs defensively — `inheritColors?.value` (22), `breadcrumbs?.value` (27), `currentContainer?.value` (36, 46) — but dereferences the fourth unguarded: `buildInheritedColorMap(children.value, …)` (43). The JSDoc declares all four as required `Ref` params (`@p

### `src/composables/useColumnOperations.js`

- **renameColumnFromMenu discovers AG Grid header geometry through document queries and fails silently**:48 (design) - `document.querySelectorAll('.ag-header-cell')` plus a `col-id` attribute match is the composable reaching across into AG Grid's rendered internals to find a collaborator, rather than receiving the geometry it needs. If no header cell matches (column virtualised out, col-id renamed by a grid upgrade,

### `src/composables/useContextMenu.ts`

- **isVisible / getNode / getPosition / getLinkedNodes are never called by any component**:238 (dead-code) - The four "Computed helpers" (lines 238-252) plus their `UseContextMenuReturn` declarations (101-104) are exported but unused. App.vue destructures only `contextMenu, showContextMenu, closeContextMenu, handleViewDetails, handleEnter, handleAddChild, handleToggleComplete, handleToggleFavorite, handleO

### `src/composables/useDataLoading.ts`

- **api is cast to any behind a comment that misstates the current state of the codebase**:7 (typing) - `// Cast api to any to allow flexible method calls until api.js is converted to TypeScript const api = apiService as any` There is no src/services/api.js — the service is src/services/api.ts and is fully typed against the `Api` interface (it is imported as `Api` by useNavigation and useWorkspa

### `src/composables/useDemoWorkspace.js`

- **Uses the global `confirm` directly while the sibling composable injects it**:43 (consistency) - `resetDemo` calls the bare global `confirm(...)`. Its sibling in the same dependency graph, `useSnapshots`, takes it as an injectable option (`confirm: confirmFn = msg => window.confirm(msg)`) precisely so the destructive path is testable, and both are composed by the same `useMaintenanceDialogs`. `

### `src/composables/useDetailController.ts`

- **Unused `ComponentPublicInstance` type import**:1 (dead-code) - `import { ref, type Ref, type ComponentPublicInstance } from 'vue'` — `ComponentPublicInstance` appears exactly once in the file (the import) and is never referenced. It survives because eslint ignores .ts files in this repo (`npx eslint src/composables/useDetailController.ts` reports "File ignored

### `src/composables/useDetailResize.js`

- **`setWidth` is exercised only by its own test file**:47 (dead-code) - `setWidth(width)` clamps and persists the panel width, but grepping the tree its only callers are `src/__tests__/useDetailResize.test.js:186-210` and a `vi.fn()` stub in `useDetailController.test.js:11`. The production consumer is `useDetailController.ts:79`, which destructures exactly `{ detailWidt

### `src/composables/useErrorHandler.d.ts`

- **The .d.ts redeclares `AppError` as an interface, shadowing the real class, and understates `handleError`'s accepted input**:10 (typing) - `export interface AppError extends Error { category?: string; originalError?: Error; context?: string }` is a second, structural declaration of a name that already exists as a class in `src/utils/errorTypes.js` (which `useErrorHandler.js` imports and uses with `instanceof`). Consumers importing `App

### `src/composables/useErrorHandler.js`

- **Everything `useErrorHandler()` returns except `handleError` is consumed only by its own test file**:150 (dead-code) - Grepping every `useErrorHandler()` call site in src/ (22 of them, in composables and components) shows all destructure exactly `{ handleError }`. The remaining returns — `lastError`, `errorHistory`, `clearError`, `clearHistory`, `wrapAsync`, `wrapAsyncWithRetry`, `withRetry`, `isErrorCategory`, `can

### `src/composables/useGraphEvents.js`

- **Person cards match '.node-html, .node-person' in some handlers and only '.node-html' in others**:9 (consistency) - The selector for "is this an HTML node card" is written three different ways in one file: - `isClickOnHtmlLabel` (line 14): `.node-html` only. - `onMousedown` (line 369) and `startLinkDraw`'s `onMove` (line 157): `.node-html, .node-person`. - `onClick` (line 404) and `onDblclick` (line 446): `.node-
- **JSDoc documents an option that is never consumed, omits one that is, and misstates the return value**:67 (docstring) - Three separate inaccuracies in the `useGraphEvents` JSDoc block: 1. `@param {Function} options.getParent - Function returning parent node` (line 67) — `getParent` is not in the destructuring at lines 78-94 and appears nowhere else in the file. `GraphView.vue:295` dutifully passes `getParent: () => p
- **backgroundClickPending timer is the only timer teardownEvents does not clear**:251 (consistency) - `teardownEvents()` (line 654) clears `selectionUpdateTimer` and, via `removeContainerListeners`, the `htmlClickTimer` — but the 200ms `setTimeout` started in `setupBackgroundTapHandler` (line 251) is untracked. If a background tap lands within 200ms of unmount or a graph re-init, the callback still
- **'link-mode' class is removed in two places but never added anywhere**:535 (dead-code) - `dropHighlight.classList.remove('link-mode')` appears at lines 535 and 568. Grepping src/ and e2e/ for `link-mode`: the only other hits are `.link-mode-indicator` (a separate GraphView element), `.link-mode-badge` (SpotlightSearch), and the CSS rules `.drop-highlight.link-mode` / `.drop-highlight.li

### `src/composables/useGraphLayout.js`

- **Layout measurement queries the whole document instead of the container it is laying out**:19 (design) - `syncNodeDimensions` (line 19) and `getNodeDimensions` (line 42) both call `document.querySelector('[data-node-id="..."]')`. The composable is injected with `getCy` but never with the container element, so it reaches past its own boundary to a global to find its collaborator. The sibling composable
- **"Tetris" / "bin-packing" names describe an algorithm the function does not implement**:71 (naming) - `runTetrisGridLayout` fills rows left-to-right with a fixed `optimalCols` count and advances Y by the tallest item in each row (lines 128-154). There is no bin packing, no shelf fitting, no gap filling — it is a plain row-major grid with per-row height. The name and the comments oversell it in three
- **Three call sites read getRadialSettings() without the null guard the fourth applies**:501 (consistency) - `getLayoutOptions` guards defensively: `const radialSettings = getRadialSettings() || {}` (line 305), with a comment explaining that a partial settings object must not inject undefined/NaN. `relaxLayout` (line 501), `autoRelaxNewNodes` (line 578) and `startContinuousRelax` (line 627) all use `getRad
- **Double-clicking relax starts continuous cola while the single-click cola from the first click is still simulating**:675 (correctness) - `handleRelaxClick` runs `relaxLayout()` on the first click (line 691). `relaxLayout` starts a cola layout with `maxSimulationTime: 2000` that is stored nowhere. If the second click arrives inside the 350ms double-click window, `startContinuousRelax()` (line 684) starts a second, `infinite: true` col

### `src/composables/useGraphSelection.js`

- **Two near-identical label-sync loops with different ID coercion and unscoped document queries**:10 (consistency) - `updateHtmlLabelSelectionFromIds` (10) and `updateHtmlLabelsFromCySelection` (27) run the same `querySelectorAll('.node-html, .node-person')` loop with the same dataset/class mutations, differing only in how the id is compared: the first does `selectedIdSet.has(parseInt(nodeId))` (numeric set), the

### `src/composables/useGraphUpdate.js`

- **`updateGraph` JSDoc describes a getCy() fallback that does not exist**:212 (docstring) - The docstring states `@param {Object} cy - Cytoscape instance (will be used if provided, otherwise getCy())`. The implementation does no such thing: `if (!cy) { await initGraph(); return }` (lines 220-223) — a falsy `cy` triggers full initialisation and an early return, it never falls back to `getCy

### `src/composables/useGraphWheel.js`

- **Wheel handler preventDefaults before checking the instance, and a stale listener is never removed on the early-return path**:37 (correctness) - `handleWheel` calls `e.preventDefault()` (line 37) before `const currentCy = getCy(); if (!currentCy) return` (39-40). Separately, `setupWheelHandler` bails at line 26 (`if (!container || !cy) return`) _before_ the cleanup block at 29-32, so when it is re-invoked while `cy` is momentarily null the p

### `src/composables/useInlineEdit.js`

- **onSaveNotes JSDoc omits the third argument the composable actually passes**:10 (docstring) - The JSDoc says `@param {Function} options.onSaveNotes - Called to save notes: onSaveNotes(nodeId, newNotes) => Promise`, but both call sites pass an options object as a third argument: `await onSaveNotes(nodeId, inlineNotesText.value, { autoSave: true })` (line 104) and `{ autoSave: false }` (line 1
- **Local `const ref` shadows the imported Vue `ref`**:90 (naming) - `js const ref = inlineNotesRef.value if (Array.isArray(ref)) { ref[0]?.focus() } else { ref?.focus() } ` `ref` is imported from `vue` at the top of the file, so inside `startInlineNotes` the module-level API is shadowed by a DOM element handle. The name also does not say what it holds.

### `src/composables/useMaintenanceDialogs.js`

- **`toggleSnapshots` reloads the snapshot list when closing the panel and floats the promise**:63 (correctness) - `js function toggleSnapshots() { showSnapshotList.value = !showSnapshotList.value loadSnapshots() } ` `loadSnapshots()` runs unconditionally, so closing the panel still fires an IPC round-trip whose result nobody will see, and the returned promise is neither awaited nor caught here (errors are s

### `src/composables/useNavigation.ts`

- **The same child-tree builder exists three times, and navigateToBreadcrumb hardcodes a constant it imports elsewhere**:147 (consistency) - `internalBuildChildTree` (line 147) and `buildTree` (line 166) are the same recursion twice in one file, and useDataLoading.buildChildTree (line 109) is a third copy differing only in its return type name — App.vue already passes that third copy in as `buildChildTree`, so `internalBuildChildTree` ru

### `src/composables/useNodeActionsUI.ts`

- **Five unused type imports**:3 (dead-code) - `Ref` (line 3), `Api` (line 4), and `CreateNodeParams`, `DeleteResult`, `DeleteMultipleResult` (lines 7-9) each appear exactly once in the file — in their own import statement. `vue-tsc` does not flag them because `noUnusedLocals` is off, but the project rule forbids unused imports.
- **ReorderParams advertises a position value ('inside') the backend does not implement**:61 (typing) - `ts position: 'before' | 'after' | 'inside' ` is passed straight to `api.reorderNode`. The SQLite implementation (`electron/database/nodes.js:365`) computes `const insertIndex = position === 'before' ? targetIndex : targetIndex + 1`, so `'inside'` is silently handled as `'after'` — it does not n
- **expandedIds is mutated directly, bypassing useTreeExpand's persistence**:291 (design) - `moveNode` (line 291), `moveMultipleNodes` (line 303) and `addChildNode` (line 420) do `expandedIds.value.add(...)`, and `useNodeCreation.js:55` does the same. `expandedIds` is owned by `useTreeExpand`, which persists to localStorage via `saveExpandedState()` — called from `toggleExpand`, `expandAll

### `src/composables/useNodeFiltering.js`

- **buildInheritedColorMap is a pure pass-through wrapper**:123 (design) - `js export function buildInheritedColorMap(nodeList, inheritedColor = null, colorMap = {}, shouldInherit = true) { return buildColorMap(nodeList, inheritedColor, colorMap, shouldInherit) } ` It forwards all four arguments unchanged to `buildColorMap` from `../utils/nodeColor.js` and adds nothing
- **filterChildrenRecursive returned from useChildrenFiltering is never consumed**:254 (dead-code) - `useChildrenFiltering` returns `filterChildrenRecursive: filterRecursive`. Its only consumer, `useCardsLayout.js:33`, destructures it and re-exports it at line 66; App.vue (line 241) destructures only `filteredChildren, sortedChildren, flatChildren, cardSizeClass, cardsGridStyle, gridColumns, inheri

### `src/composables/useNodeInteractions.js`

- **Tooltip visibility is gated twice, in two different places, with different rules**:47 (design) - `handleHover` gates the tooltip with `shouldShowTooltip(getShowDetail())` from `../utils/nodeInteractions.js` — a check on `showDetail` alone. But both call sites already pass a strictly stronger `shouldShowTooltip` predicate into `useNodeTooltip` itself (TableView.vue:62-67 adds `hideSensitive`/`no

### `src/composables/useNodeOperations.ts`

- **withProcessing conflates "busy" with "failed", producing silent no-ops**:170 (design) - `ts if (isProcessing.value) return failValue if (precondition && !precondition()) return failValue ` A second call issued while another operation is in flight returns `false` / `{ success: false }` / `null`, indistinguishable from a genuine failure. Callers such as `useNodeActionsUI.deleteNode`

### `src/composables/useNodePositions.js`

- **`findSmartPosition` never uses its first parameter `nodeId`**:83 (naming) - `export function findSmartPosition(nodeId, parentId, savedPositions, childIds = [], cy = null)` — the body (lines 84-154) references `parentId`, `savedPositions`, `childIds` and `cy`, but never `nodeId`. The JSDoc advertises it as `@param {number} nodeId - ID of the new node`, implying the position

### `src/composables/useNodeTable.js`

- **Sibling composables import handleError two different ways**:3 (consistency) - useNodeTable.js uses `import { handleError } from './useErrorHandler.js'` (the module-level export), while useTaskFiltering.js in the same group uses `const { handleError } = useErrorHandler()`. Both resolve to the same function, so the composable call adds an indirection that buys nothing here and
- **saveCellStyle creates the local cell before the save succeeds, unlike saveCell**:155 (consistency) - saveCell calls `findOrCreateCell` only after `await api.setCells(...)` resolves, so a failed save leaves the cache untouched. saveCellStyle calls it first (`const cell = findOrCreateCell(rowIndex, colIndex)` at the top), so a rejected setCells leaves a phantom `{ row_index, col_index }` entry in `ce

### `src/composables/useSearch.ts`

- **Workspace id is typed as number|null throughout useSearch, but workspace ids are TEXT slugs (string)**:51 (typing) - `getWorkspace?: () => number | null` (line 51), `onSearch(query, mode, workspaceId: number | null, ...)` (line 35) and `handleSearch(workspaceId: number | null, ...)` (line 74/171) all declare a numeric workspace id. src/types/workspace.ts:11 defines `export type WorkspaceId = string` ("workspace id
- **Pagination state and the debounce timer are reset only by closeSearch, and handleSearch takes a workspaceId the composable can already resolve**:113 (consistency) - closeSearch (line 159) resets `searchOffset`, `hasMoreResults` and `isLoadingMore`, but openSearch/openLinkSearch/openMoveSearch (lines 113/127/143) reset only query, results, index, mode and source id — three near-identical bodies that diverge from the close path. `searchTimeout` is never cleared b

### `src/composables/useSelection.ts`

- **hasSelection and selectionCount report contradictory answers after selectAll()**:346 (correctness) - `hasSelection: computed(() => selectedNode.value !== null)` derives from the single-selection ref, while `selectionCount: computed(() => selectedIds.value.size)` derives from the multi-selection set. `selectAll()` (line 332) only assigns `selectedIds`, and `handleMultiSelect` with `add` can empty `s

### `src/composables/useSettings.ts`

- **View-mode comment lists a mode that does not exist and omits one that does**:269 (docstring) - `// View mode: tree, graph, timeline, table, persons, tasks, trash`. The authoritative list is `src/utils/viewConfig.js` (`graph`, `cards`, `tree`, `tasks`, `timeline`, `persons`, `trash`) and the `ViewMode` union in `src/types/settings.ts`, which agrees with it. The comment invents `table` and drop

### `src/composables/useSidebar.ts`

- **Sidebar hover zone uses a hardcoded 280px that the responsive stylesheet contradicts**:95 (correctness) - `onGlobalPointerMove` and `onLeave` both test `event.clientX <= SIDEBAR_WIDTH` with `SIDEBAR_WIDTH = 280` (src/utils/uiConstants.js:6). src/style.css:146-147 sets `.sidebar { width: 280px }` but the media queries override it to `220px` (line 1748) and to `width: 100%; height: auto` in the stacked la

### `src/composables/useSpreadsheetClipboard.js`

- **File is named as a composable but exports plain functions, unlike every sibling in the group** (naming) - Every other file in this group (useSpreadsheetSelection.js, useSpreadsheetKeyboard.js, useCardDrag.js, useCardGrid.js, useCardsLayout.js, useTreeExpand.js, useTreeFlattening.js, useSidebar.ts, useContextMenu.ts) exports a single `useX()` factory that owns reactive state. useSpreadsheetClipboard.js e

### `src/composables/useSpreadsheetKeyboard.js`

- **typingBuffer and shortcuts are exported from the composable but never read**:171 (dead-code) - The return object exposes `typingBuffer` and `shortcuts`. NodeSpreadsheet.vue uses only `keyboard.handleKeyDown`, `keyboard.clearTypingBuffer` and `keyboard.cleanup`. Grepping src/, electron/ and e2e/ finds no read of `typingBuffer` outside this file and no read of the `shortcuts` map outside this f

### `src/composables/useSpreadsheetSelection.js`

- **A single-cell mousedown updates the selection without repainting, leaving the previous range highlighted**:217 (correctness) - The non-drag branch of `handleMouseDown` sets `selectionStart`/`selectionEnd` to the clicked cell and calls `clearTypingBuffer()` and `gridWrapper?.focus()` but never `refreshCells()` (the comment at handleMouseUp explains highlighting is deferred to the drag case). The cell-selected classes are AG

### `src/composables/useTaskFiltering.js`

- **buildTaskPaths issues one getAncestors IPC round trip per task**:88 (design) - `Promise.all(items.map(async task => { const ancestors = await api.getAncestors(task.id) ... }))` fans out one IPC call per task, plus a second `api.getNode(parent_id)` call in the fallback path. For a workspace with a few hundred open tasks this is a few hundred synchronous SQLite round trips throu

### `src/composables/useTheme.js`

- **Theme is the only `graphcore-` setting that never reads from the database**:10 (consistency) - `STORAGE_KEY = 'graphcore-theme'` is read and written exclusively through `localStorage`. Because it carries the `graphcore-` prefix, `migrateSettingsToDatabase()` copies it into the settings table on first run — but `useTheme` never reads it back from there, so the DB row is write-only. Every other
- **`_initTheme` is exported "for testing" but no test imports it, and the matchMedia listener is never removed**:122 (dead-code) - Line 122 is `export { initTheme as _initTheme }` under the comment `// Export for testing`. Grepping src/, e2e/, and **tests**, `_initTheme` appears nowhere else — `src/__tests__/useTheme.test.js` drives the composable through `useTheme()` instead. The underscore prefix and the comment are aspiratio

### `src/composables/useTimelineDates.js`

- **Weekend shading skips a leading Sunday and can overhang the range end**:197 (correctness) - generateWeekendRanges advances to the first Saturday before emitting anything, so when the computed range starts on a Sunday that Sunday gets no shading. At the other end, each entry is emitted with `width: zoomLevel * 2` whenever the Saturday is `<= end`, so a range ending on a Saturday shades one

### `src/composables/useTimelineDrag.js`

- **Resizing the end of a due_date-only bar emits an update that changes nothing**:116 (correctness) - handleDragEnd fires when `newStart !== originalStart || newEnd !== originalEnd`. For a node with only a due_date, a 'resize-end' drag sets `newStart = originalStart` and only moves newEnd, so the guard passes on the newEnd difference - but the else branch writes `updates.due_date = newStart`, i.e. t
- **getDragBarStyle uses raw new Date() while the rest of the timeline uses parseLocalDate**:144 (consistency) - `const startDate = new Date(newStart); const endDate = new Date(newEnd)` inside getDragBarStyle. Every other date computation in this feature (useTimelineDates, useTimelineLayout.getNodeWidth, getDatePosition) goes through `parseLocalDate` to avoid the UTC/local mix. The preview width therefore uses

### `src/composables/useTimelineInteractions.js`

- **Four handlers are exported but only ever used by the composable's own setupListeners**:158 (dead-code) - handleLabelsDragMove, handleLabelsDragEnd, handlePanMove and handlePanEnd are returned in the public object, but the sole consumer TimelineView.vue references only labelsWidth, labelsDragState, panState, handleContextMenu, handleNodeClick, syncScroll, handleLabelsDragStart, handlePanStart, setupList

### `src/composables/useTimelineLayout.js`

- **groupMarkers and projectBoxes duplicate the same index-building block**:295 (consistency) - Both computeds open with an identical eight-line block building `nodeRowIndex` and `nodeData` from `timelineNodes.value`, then run near-identical recursive collectors that differ only in the type filter and the geometry they emit. Any change to the row-index semantics has to land twice.
- **Pending zoom rAF is never cancelled on unmount**:478 (correctness) - handleWheelZoom schedules `pendingScrollUpdate = requestAnimationFrame(...)` and only cancels it when another zoom arrives. The composable exposes no teardown, and TimelineView's onUnmounted only removes drag listeners and calls interactions.cleanupListeners(), so a zoom performed in the frame befor
- **ROW_HEIGHT and getNodeWidth are returned but no consumer uses them**:511 (dead-code) - Grepping src/ and e2e/ for `ROW_HEIGHT`, `.ROW_HEIGHT` and `getNodeWidth` outside this file yields nothing (only `layout.MIN_BAR_WIDTH` is consumed, at TimelineView.vue:55). getNodeWidth is used internally by getBarStyle, so only the export is dead; ROW_HEIGHT is dead in both directions - the row he

### `src/composables/useTreeExpand.js`

- **setExpandedIds is never called outside its own unit test**:74 (dead-code) - `setExpandedIds(ids)` (74-76) is exported at line 85. App.vue's only `useTreeExpand` call destructures `expandedIds, toggleExpand, expandAll, collapseAll, expandAncestors, loadExpandedState` (App.vue:288). A grep for `setExpandedIds` across src/ and e2e/ returns only useTreeExpand.js and useTreeExpa

### `src/composables/useTreeFlattening.js`

- **Docstring names three consumers that do not import this composable**:5 (docstring) - The header says "Used by selection, inline edit, and tree expand composables." The only import of useTreeFlattening in the tree is useCardsLayout.js:4. useSelection.ts and useTreeExpand.js both receive `flatChildren` as an injected option from App.vue rather than importing this module, and no inline

### `src/composables/useUndoRedo.ts`

- **canUndo, canRedo, undoCount, redoCount, clear and isProcessing are all unconsumed**:208 (dead-code) - App.vue is the only consumer and destructures only `{ undoStack, redoStack, pushCommand, undo, redo }` (App.vue:262). It then reimplements the exposed computeds inline in the template: `:can-undo="undoStack.length > 0" :can-redo="redoStack.length > 0"` Grep shows no non-test reference to `canU

### `src/composables/useWorkspace.ts`

- **WorkspaceItem is a divergent duplicate of the Workspace type and declares columns the table does not have**:7 (typing) - `WorkspaceItem` ("Workspace with flexible ID type") declares `description?: string | null` and `updated_at?: string`, neither of which exists in the workspaces table (electron/database/schema.js:86-94: id, name, color, icon, sort_order, is_default, created_at), and omits `is_default`, which does. Th

### `src/services/aiProviders.js`

- **createAiProvider throws for an unrecognised provider id inside an unguarded computed**:82 (correctness) - ``const factory = ADAPTERS[providerId] if (!factory) throw new Error(`Unknown AI provider: ${providerId}`)`` The sole caller is `src/composables/useAiNotes.js:102`: `const activeProvider = computed(() => createAiProvider(provider.value, providerSettings))`, where `provider = computed(() => aiPro

### `src/services/api.ts`

- **Web-mode stubs for desktop-only capabilities use three incompatible failure conventions** (consistency) - Within `webApi` the same situation — "this capability does not exist in web mode" — is signalled three different ways: - silently successful empty result: `getTagNodes` → `[]`, `getNodesLinkedToTag` → `[]`, `searchTagNodes` → `[]` (api.ts:494-508), `listBackups` → `[]` (589), `getDataPath` → `null`
- **The api façade is bypassed: capabilities declared on ElectronAPI here are reached through the window global instead** (design) - api.ts declares the full preload surface on `ElectronAPI` (settings store at lines 158-162, `openExternal` 165, `openDetachedWindow` 168, the menu/lifecycle subscriptions 171-177) but neither `webApi` nor `electronApi` exposes any of them on `api`. Consumers therefore reach for the global directly a
- **request() always parses a JSON body, including on void endpoints that legitimately return 204/empty**:198 (correctness) - ``const response = await fetch(url, config) if (!response.ok) throw new Error(`API error: ${response.status}`) return response.json() as Promise<T>`` Every web call funnels through this, including the ones typed `Promise<void>`: `deleteNode`, `moveNode`, `linkNodes`, `unlinkNodes`, `restoreNode`
- **String workspace ids are interpolated into web URLs without encoding, inconsistently with sibling methods**:251 (correctness) - `WorkspaceId` is `string` (src/types/workspace.ts:11), and ids are user-influenced — `electron/database/workspaces.js:36` uses `data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`, so a caller-supplied `data.id` is stored verbatim. Some web methods encode properly via URLSearchParams (`se

### `src/services/ollamaService.js`

- **handleConnectionError takes a `_model` argument it never uses**:12 (dead-code) - `function handleConnectionError(error, _model = null)` — the body only checks `error.message === 'Failed to fetch' || error.code === 'ECONNREFUSED'` and never reads `_model`; the message it produces ("Ollama is not running. Start with: ollama serve") does not mention the model. Both call sites never

### `src/services/openaiService.js`

- **Defaulted `endpoint` precedes required `apiKey`, and the JSDoc contradicts the default**:137 (docstring) - `async testConnection(endpoint = DEFAULT_ENDPOINT, apiKey)` (line 137) and `async listModels(endpoint = DEFAULT_ENDPOINT, apiKey)` (line 181). A default on the first of two positional parameters is unreachable in practice: to pass `apiKey` a caller must pass `endpoint` too (or an explicit `undefined

### `src/stores/filters.js`

- **hiddenTypesCount and hasTypeFilter assume visibleTypes is a subset of DEFAULT_VISIBLE_TYPES**:28 (correctness) - `js const hiddenTypesCount = computed(() => DEFAULT_VISIBLE_TYPES.length - visibleTypes.value.length) const hasTypeFilter = computed(() => visibleTypes.value.length < DEFAULT_VISIBLE_TYPES.length) ` Both compare lengths rather than membership, but `syncFromNode` (line 84-90) copies `node.graph_t

### `src/types/api.ts`

- **Security/capture result shapes are declared twice, in two layers**:260 (consistency) - `securityStatus()`, `securityUnlock()`, `sensitiveStatus()`, `captureGetConfig()` and friends inline their result objects here (`{ state: 'plaintext' | 'encrypted' | 'locked' | 'unavailable'; keychainAvailable: boolean; ... }`), while src/services/api.ts:42-63 declares the same four shapes as the na

### `src/types/node.ts`

- **Stale comment on Node.workspace_id explains a union that no longer exists**:62 (docstring) - The comment reads "Typed as WorkspaceId because legacy callers still compare/assign number-typed values; at runtime this is always a string or null." `WorkspaceId` is `string` (src/types/workspace.ts:11), so the stated reason is self-contradictory — a string alias accommodates nothing number-typed.
- **UpdateNodeData omits parent_id and workspace_id although callers send them**:160 (typing) - `UpdateNodeData` mirrors `NODE_UPDATE_FIELDS` (src/utils/nodeFields.js) exactly, but the underlying `updateNode` accepts every column in `NODE_FIELDS` (electron/database/schema.js:10-45), and two production paths rely on that: `DeleteCommand.undo`/`DeleteMultipleCommand.undo` call `api.updateNode(id

### `src/types/settings.ts`

- **UseSettingsReturn omits settingsReady, so every signature repeats an intersection**:174 (typing) - `useSettings.ts` returns `UseSettingsReturn & { settingsReady: ShallowRef<boolean> }` and writes that intersection three times (lines 219, 260, 388) because the interface named after the composable's return value does not describe it. The docstring "Settings refs returned by useSettings composable"

### `src/types/workspace.ts`

- **Workspace.id and CreateWorkspaceData.id use raw string instead of the WorkspaceId alias**:19 (consistency) - `WorkspaceId` is defined at line 11 of this same file and used consistently everywhere else (`Node.workspace_id`, every `Api` method taking a workspace), yet `Workspace.id` (line 19) and `CreateWorkspaceData.id` (line 39) are declared as bare `string`. Same file, same concept, two spellings.

### `src/utils/constants.js`

- **personIconSvg is labelled a legacy back-compat export while three components actively import it; most exported functions have no JSDoc**:99 (docstring) - Line 98-99: `// Legacy export for backward compatibility` / `export const personIconSvg = typeConfig.person.icon`. It is imported and rendered via v-html by `TableView.vue` (217, 271), `TimelineView.vue` (125) and `detail/MetadataGridSection.vue` (231), plus asserted in `constants.test.js:72`. Calli

### `src/utils/demoData.js`

- **`deleteDemoWorkspace` and `demoWorkspace` are exported but used only inside this module**:31 (dead-code) - Grep across `src/`, `electron/`, `e2e/` and tests: `deleteDemoWorkspace` appears only at its definition (31) and its one internal call from `resetDemoWorkspace` (52). Bare `demoWorkspace` (10) has zero references outside this file. The real consumers — `useDemoWorkspace.js:6` and `SettingsPanel.vue:

### `src/utils/formatting.js`

- **getContrastColor silently returns white for shorthand or non-hex colors**:97 (correctness) - `getContrastColor` strips '#', then `parseInt(hex.substr(0,2),16)` etc. For a 3-digit shorthand (`#fff`) it reads 'ff','f',NaN -> luminance NaN -> `NaN > 0.4` is false -> returns '#ffffff'. So white text is placed on a white background rather than black. The same silent-white result occurs for any n

### `src/utils/markdown.js`

- **marked configuration is split across two modules that both mutate the same global singleton**:6 (design) - This file calls `marked.use({ breaks, gfm, renderer.link })` at module scope. `src/components/MarkdownRenderer.vue` independently calls `marked.setOptions({ breaks: true, gfm: true })` (line 20) — a duplicate of the same two options — and registers a global inline extension `marked.use({ extensions:
- **Re-export of `marked` is never imported**:100 (dead-code) - `export { marked }` on the last line. The two components that use `marked` — `CardNotes.vue:33` and `MarkdownRenderer.vue:3` — both import it directly from the `'marked'` package, not from this module. Grep for an import of `marked` from `utils/markdown` returns nothing.

### `src/utils/nodeColor.js`

- **Module docstring claims both functions share one precedence rule, but buildColorMap has no linked-color step**:11 (docstring) - The header says the two access patterns "[b]oth implement the same precedence: a node's own explicit color wins; otherwise the nearest ancestor's explicit color; otherwise a linked color (e.g. a person's organization); otherwise null". `resolveNodeColor` implements all four steps (lines 42-59, inclu

### `src/utils/uiConstants.js`

- **STORAGE_KEYS claims to centralize localStorage keys, but several keys bypass it**:26 (consistency) - The comment reads `// localStorage keys (centralized to prevent typos)`. Every entry in the map is genuinely used (I checked all 25 by `STORAGE_KEYS.<NAME>` grep), but these keys live outside it as string literals: - `src/components/AppSidebar.vue:39-48` — 'sidebar-tree-collapsed', 'sidebar-favorite
