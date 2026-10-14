# Codebase Review - graph-core

_Multi-agent review of 261015 (1.20.0-rc.3, commit 8553ef8). 220 of 226 source files in `src/`, `electron/`, `shared/` and `scripts/` were read by 20 review agents (two passes; the second covered files the first pass skipped). Every high and medium finding was given to an independent agent instructed to refute it. Low-severity notes were not adversarially verified and are in the appendix. CSS and test files were out of scope. The six type-declaration files in `src/types/` (944 lines, declarations only) were not read by a reviewer; they are covered by `vue-tsc`. This replaces the 260826 review._

> **Status: reported, not remediated.**

## Baseline gates

| Gate                      | Command                | Result                                                                                                |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Lint                      | `npm run lint`         | Pass - 0 errors, 499 warnings (warn-only by config)                                                   |
| Format                    | `npm run format:check` | Pass                                                                                                  |
| Types                     | `npm run type-check`   | Pass                                                                                                  |
| Dead code                 | `npx knip`             | Pass - 2 config hints (redundant entry patterns for `src/main.js`, `electron/main.js` in `knip.json`) |
| Tests                     | `npm run test:run`     | Pass - 2306/2306 in 162 files                                                                         |
| Docs                      | `make docs-build`      | Pass                                                                                                  |
| File size (<= 1000 lines) | -                      | **Fail** - `src/components/DetailPanel.vue` 1192, `src/App.vue` 1186, `src/services/api.ts` 1011      |

Lint warnings: 200 `max-nested-callbacks`, 190 `max-lines-per-function`, 60 `complexity`, 31 `no-unused-vars`, 11 `max-lines`, 7 `max-depth`. Unchanged since 260826: the 31 `no-unused-vars` warnings are dead code the gate lets through, and `max-lines` is configured but does not fail at the 1000-line limit.

## Summary

- Confirmed: **57** (1 high, 30 medium, 26 low). Refuted: 3. Unverified low-confidence notes: 152 (appendix).
- By category: consistency 6, correctness 40, dead-code 7, design 4, docstring 1.
- Severity shown is the verifier corrected severity where it differs from the reviewer.

### Recurring themes

1. **Race conditions on async loads.** Navigation, search pagination, sidebar tree, persons list and AI model fetches write results after the request was superseded (e.g. after a workspace switch). No shared request-generation guard exists.
2. **Mutations that bypass the command/undo layer.** `wrapWithParent` and `navigateToBreadcrumb` skip `nodeOps` / `enterContainer`, so they record no undo step and skip sequencing.
3. **Event contracts dropped between layers.** `TableView` `add-child` is not forwarded by `ViewRenderer`; `DetachedView` ignores `open-link-search` and the prompt flag; `GraphView` declares emits it never fires.
4. **Destructive data paths.** Trash "Delete" does not permanently delete; a startup migration reassigns workspace-less nodes to `work`, undoing `deleteWorkspace`; backup restore skips migrations and leaks the old handle.
5. **Electron hardening.** The window-open and will-navigate handlers allow every non-http(s) URL; `restoreBackup` accepts any renderer-supplied path; preload menu listeners return no unsubscribe.
6. **Dead and duplicated code.** `useViewStateController`, snapshot helpers, `errorTypes` classes, unreachable keyboard branches.
7. **File-size limit not enforced** (three files over 1000 lines).

Previous-review checks: the 260826 high findings on undo-stack `sessionStorage` plaintext and `MainToolbar` swallowing props were not re-reported by reviewers instructed to check them.

## High (1)

### Trash 'Delete' soft-deletes again with an object instead of permanently deleting

`src/components/TrashView.vue:32` - correctness

TrashView emits `emit('delete', item)` (the node object). ViewRenderer.vue:293 forwards it on the shared `delete` event, and App.vue:995 binds `@delete="deleteNode"`, i.e. useNodeActionsUI.deleteNode(nodeId: number), which calls api.getNode(item) with an object and then a non-permanent api.deleteNode(id, false). The intended handler useDataLoading.permanentlyDelete(node) (confirm + api.deleteNode(id, true) + loadTrashedItems) is returned but never bound anywhere (grep: only defined/returned in useDataLoading.ts). The Delete button in the trash therefore never permanently deletes and the trash list is not refreshed.

**Fix:** Give TrashView's action a distinct event (e.g. 'delete-permanent'), forward it through ViewRenderer, and bind it to permanentlyDelete in App.vue; add a component-contract test.

## Medium (31)

### restoreBackup leaks the old handle and skips schema/migrations

`electron/database/backup.js:61` - correctness

restoreBackup does `ctx.db = new ctx.SQL.Database(buffer)` without closing the previous handle. Its sibling reload() opens first, validates with a query, falls back on failure, and closes the previous handle. restoreBackup also never runs createTables/runMigrations/createIndexes. A backup taken by an older version therefore comes back with an outdated schema, for example missing notes_sensitive, and later queries fail. If the file decrypts but is not a valid sqlite database, the broken handle is adopted anyway and _save() then writes it over the real database file.

**Fix:** Follow reload(): open and validate the new handle, run ctx._initSchema(), then close the previous handle. Revert to the previous handle on any error.

### Startup migration reassigns NULL-workspace nodes to 'work', which undoes deleteWorkspace

`electron/database/migrations.js:127` - correctness

migrateUnassignedNodesToWork and migratePersonsOrgsToWorkWorkspace run on every startup and set workspace_id='work' on every node whose workspace_id IS NULL. workspaces.deleteWorkspace sets the deleted workspace's nodes to NULL, and getOrCreateTagNode(name, null) creates tags with NULL workspace. After a restart, all of these nodes move silently to 'work', even if the user has deleted the 'work' workspace (seedDefaultWorkspaces does not recreate it). The nodes then point at a workspace that does not exist.

**Fix:** Gate these one-time migrations behind a settings flag or a schema version. Also check that the target workspace exists before reassigning.

### '#tag' search queries the legacy tags column that the migration empties

`electron/database/search.js:147` - correctness

App.vue routes '#foo' searches to getNodesByTag, which matches `tags LIKE '%"foo"%'` on nodes.tags. migrateStringTagsToTagNodes (migrations.js:387) rewrites every node's tags to '[]' and replaces them with tag nodes plus node_links. After that migration, '#tag' search finds nothing for migrated tags. getAllTags (line 120) has the same problem and is still used as a fallback in useDataLoading.ts:251.

**Fix:** Resolve the tag through tag nodes and node_links, for example with getOrCreate-free lookup + getNodesLinkedToTag. Then remove the string-column path, or document that it serves only unmigrated data.

### Database encryption can be disabled while sensitive notes are enabled

`electron/ipc/security.js:100` - correctness

SECURITY_DISABLE clears db.encryptionKey without checking the sensitive-notes session. sensitiveNotes.js enables only when encryption is on, because the private key's password slot uses the recovery password. After the disable, SENSITIVE_STATUS reports `available: false` (isDatabaseEncrypted()) while `enabled` stays true and the ciphertext remains. If encryption is later re-enabled with a different password, the slot can only be opened with the old password. The precondition is enforced on enable and ignored on disable.

**Fix:** Refuse SECURITY_DISABLE while getSession()?.isEnabled(), or require the user to disable sensitive notes first. Inject a session or isSensitiveEnabled accessor through ctx, and add a test.

### setWindowOpenHandler allows every non-http(s) URL

`electron/ipc/window.js:39` - correctness

`return { action: 'allow' }` lets window.open with file:, javascript:, data: or custom-scheme URLs create a new BrowserWindow. Rendered markdown notes may hold such links. That new window runs with Electron's default webPreferences, not the preload/sandbox config from createWindowConfig.

**Fix:** Deny every URL by default. Allow only the app's own origin, or no URL at all.

### will-navigate lets the window navigate to any file: or non-http URL

`electron/ipc/window.js:57` - correctness

The handler calls preventDefault only for http(s) URLs outside appUrl. A file:///other.html or a custom-scheme URL still replaces the app page inside the privileged window that has the preload loaded.

**Fix:** Call preventDefault for every URL outside appUrl, and hand only http(s) URLs to shell.openExternal.

### remapNodeId ignores oldTargetId/newTargetId

`src/commands/ReorderCommand.js:35` - correctness

remapNodeId only rewrites nodeId: `if (this.nodeId === oldId) this.nodeId = newId`. oldTargetId and newTargetId are sibling node ids passed to api.reorderNode (useNodeActionsUI.ts:476). If the sibling was created, undone and redone (new row id), the queued reorder still names the deleted row, so undo/redo of the reorder targets a nonexistent node. Siblings MoveCommand/LinkCommand remap every id field they hold.

**Fix:** Also remap oldTargetId and newTargetId, and add a test that redoing a create remaps a queued ReorderCommand's target.

### Clicking a child card's notes starts an edit that has no editor

`src/components/CardsView.vue:492` - correctness

The child CardNotes is rendered with `@start-edit="emit('start-notes', child, $event)"` but without `:is-editing`, `:model-value`, `@save`, `@cancel` or `@update:model-value`. startInlineNotes (useInlineEdit.js:84) sets inlineNotesId to the child's id, but CardNotes never switches to its textarea because isEditing stays false. Nothing gets focus, so no blur ever fires save or cancel. The child also becomes non-draggable (`:draggable="... inlineNotesId !== child.id"`) until some other edit replaces inlineNotesId.

**Fix:** Bind is-editing/model-value/save/cancel/update on the child CardNotes the same way the top-level card does, or drop @start-edit there so child notes are display-only.

### addChild ignores the prompt flag and creates a subtask titled 'New Task'

`src/components/DetachedView.vue:184` - correctness

DetailPanel emits add-child with `{ parentId, title: '', type: 'task', prompt: true }` for subtasks. The main window (useNodeCreation.js:75) asks the user for a title when `prompt` is set. DetachedView.addChild ignores `prompt` and uses `payload.title || 'New Task'`, so in a detached window the subtask is created right away with a placeholder title.

**Fix:** Honor payload.prompt (show PromptModal) or reuse the shared creation logic from useNodeCreation.

### Locked sensitive notes unlock differently by node type

`src/components/DetailPanel.vue:1024` - consistency

For regular nodes the panel inlines a password form plus Touch ID (`<form class="sensitive-unlock-form" @submit.prevent="revealSensitive">`). Person and organization nodes go through NotesSection, which only shows 'Sensitive notes are locked. Unlock them in Settings, under Security.' and a Touch ID button (NotesSection.vue:88-96). Without Touch ID, a locked person or organization note can't be unlocked in the panel, but a locked task note can. The notes UI is duplicated instead of shared.

**Fix:** Give NotesSection the password unlock (emit a reveal-with-password event to DetailPanel.revealSensitive) and use it for every node type.

### PromptModal rendered twice against the same shared prompt state

`src/components/GraphView.vue:750` - correctness

useGraphModals re-exports the app-wide usePrompt() state, and its own comment says the dialog is 'rendered once at the root'. App.vue:1111 renders <PromptModal> bound to that same promptState, and GraphView.vue:750 renders a second <PromptModal> bound to the same state (`:visible="promptModal.visible"`). While the graph view is mounted, any showPrompt() opens two stacked dialogs with two inputs writing the same value and two submit/cancel handlers.

**Fix:** Delete the PromptModal from GraphView (and its import) and drop the prompt re-exports from useGraphModals; keep isAnyModalVisible reading usePrompt().promptState.

### relaxLocked/fitLocked/radialSettings watchers overwrite workspace defaults from inside a container

`src/components/GraphView.vue:385` - correctness

The comment at lines 332-337 says these watchers must write the workspace default only at root level, otherwise syncing a container's saved value via the parent-change watcher overwrites the workspace/home default. layoutMode, showRootNode, showExternalLinks, maxDepth and visibleTypes follow that rule. relaxLocked (`_relaxLocked.value = v`), fitLocked (`_fitLocked.value = v`) and radialSettings (`Object.assign(_radialSettings, v)`) write the workspace default unconditionally. Entering a container with graph_relax_locked=1 or custom graph_physics therefore changes the root/workspace default for those settings.

**Fix:** Use the same if (props.parent?.id) saveNodeSetting(...) else _x.value = v branch as the other setting watchers, and add a test for it.

### marked.setOptions/marked.use run on every component instance and change the shared global marked

`src/components/MarkdownRenderer.vue:52` - correctness

`marked.setOptions({breaks:true,gfm:true})` and `marked.use({ extensions: [personMentionExtension] })` are inside `<script setup>`, so they run once per MarkdownRenderer mount. Each mount adds the extension to the process-wide `marked` singleton again, and the extension list keeps growing. Because the instance is global, CardNotes.vue (`marked.parse` on the same import) and utils/markdown.js get breaks:true and the mention tokenizer only after some MarkdownRenderer has mounted. Card rendering therefore depends on whether the detail panel has been opened, which is a hidden dependency on another component's side effect.

**Fix:** Configure marked once at module level in utils/markdown.js, or use a dedicated `new Marked(...)` instance, and have CardNotes and MarkdownRenderer share it.

### Deleting a person leaves it in the persons list (stale state)

`src/components/PersonsView.vue:319` - correctness

deletePerson() emits `delete` with the id and closes the modal, but PersonsView keeps its own `persons` ref loaded via loadPersons(); nothing reloads it after the parent deletes the node (App's deleteNode refreshes the main graph data, not this component's private list). The deleted person card stays visible until a workspace switch or remount.

**Fix:** Reload persons after the deletion completes (e.g. have the parent expose a refresh, or watch a data-version prop), or remove it locally from persons.value.

### add-child emitted by TableView is not forwarded by ViewRenderer

`src/components/TableView.vue:84` - correctness

TableView emits `emit('add-child', { parentId: node.id, title: '', prompt: true })` on Cmd/Ctrl+click via useNodeInteractions, but ViewRenderer.vue's <TableView> block (lines ~129-160) has no `@add-child` listener (only CardsView's add-child is wired). The Cmd+click add-child gesture in tree/table view does nothing.

**Fix:** Add `@add-child="emit('add-child', $event)"` to the TableView usage in ViewRenderer.vue and a test asserting the forwarded payload.

### loadSidebarTree can show a stale workspace's tree after a workspace switch

`src/composables/useDataLoading.ts:126` - correctness

The function reads currentWorkspace at the start and awaits getRoots and getDescendantsBatch. Afterwards it assigns sidebarTree.value without checking that the workspace is still the same. If the user switches workspace while a load is in flight, a slower earlier load can overwrite the newer tree with the old workspace's nodes. The cache entry is keyed correctly, but the displayed tree is not.

**Fix:** After the awaits, return early when currentWorkspace.value differs from the wsId captured at the start, or use a request token.

### Recent-items cleared filter compares two timestamp formats as strings

`src/composables/useDataLoading.ts:194` - correctness

`item.updated_at > clearedAt` compares SQLite `CURRENT_TIMESTAMP` values ('YYYY-MM-DD HH:MM:SS', see electron/database/nodes.js:270) with `new Date().toISOString()` ('YYYY-MM-DDTHH:MM:SS.sssZ') as plain strings. On the same date, ' ' (0x20) sorts before 'T' (0x54). As a result, any node edited later on the day Recent was cleared stays hidden until the next UTC day.

**Fix:** Parse both values to Date (treat the SQLite value as UTC), or store clearedAt in SQLite format, and add a test for an item updated on the same day.

### Initial-layout timers are never cancelled and act on a replaced/destroyed cy

`src/composables/useGraphInit.js:176` - correctness

applyInitialLayout schedules nested setTimeouts (NODE_POSITION_SETTLE_DELAY_MS then LAYOUT_SETTLE_DELAY_MS) that call `cy.layout(layoutOptions).run()`, `cy.fit(50)`, savePositions() and onInitComplete() on the captured cy. If initGraph runs again (a settings watcher) or the component unmounts before they fire, they run against a destroyed instance and the stale onInitComplete flips GraphView's isInitializing to false while the newer init is still in progress; savePositions then saves from the new cy before it has laid out.

**Fix:** Track the timer ids and clear them on re-init/unmount, or check that getCy() === cy before acting.

### updateGraph mixes a captured cy with getCy() across an await; no re-entry guard

`src/composables/useGraphUpdate.js:217` - correctness

updateGraph(cy, isInitializing, ...) receives `cy` and `isInitializing` by value, then awaits buildElementsWithLinks (network calls to api.getAllLinks / api.getNode). During that await, GraphView watchers (showExternalLinks, showRootNode, visibleTypes, workspace) can destroy and recreate cy via initGraph. Afterwards diffAndApply/handleNewNodes use getCy() (new instance) while `cy.batch(() => { cy.elements().remove(); cy.add(elements) })` and `cy.viewport(...)` use the stale destroyed instance. Concurrent updateGraph calls (debounced props.nodes watcher plus the immediate filtersStore.maxDepth and hideCompleted watchers) also interleave with no ticket, unlike initGraph which has initTicket.

**Fix:** Resolve cy via getCy() after the await and bail if it changed (or reuse initGraph's ticket pattern for updates); read isInitializing through a getter instead of passing a snapshot.

### Cmd/Ctrl+Enter 'add child' branch is unreachable

`src/composables/useKeyboardShortcuts.js:164` - correctness

The plain Enter branch `if (e.key === 'Enter' && !isEditableElement(e.target)) { ... enterContainer(selectedNode.value) ... return }` does not check modifiers, so it consumes Cmd/Ctrl+Enter too. The later block at line 178 `if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { ... showAddNodeModal(parentId) }` can never run. docs/reference/keyboard-shortcuts.md and docs/guides/quickstart.md document Cmd/Ctrl+Enter as 'Add new child node'; the app instead navigates into the selected node.

**Fix:** Move the Cmd/Ctrl+Enter check before the plain Enter branch (or require hasNoModifiers/shift-only in the Enter branch) and add a test that Cmd+Enter calls showAddNodeModal, proven red first.

### Enter/Tab are swallowed when the mention dropdown has no matches

`src/composables/useMentions.js:140` - correctness

checkMention sets showMentions to true even when filteredPersons is empty, and MentionDropdown then shows 'No persons found'. handleKeydown calls preventDefault on Enter/Tab and returns true, then calls insertMention, which returns early (`if (!person) return`) and leaves the dropdown open. Typing an '@word' that matches no person (for example an @handle) and pressing Enter does nothing: no newline is inserted until the user presses Escape or moves the cursor.

**Fix:** In handleKeydown, return false for Enter/Tab when filteredPersons is empty (or hide the dropdown), so the editor's default key handling runs.

### Superseded loads still write error state and call onError

`src/composables/useNavigation.ts:297` - correctness

Every result write in the try block checks `isCurrent()`, but the catch block does not: a stale load that fails after a newer navigation started still sets `error.value = errorMessage` and awaits `onError(e, containerId)`, and a stale 404 still runs `onNotFound` (line 321), which App.vue uses to navigate elsewhere. A failing stale load can therefore show an error or redirect away from the container the user just opened. Line 221 (`error.value = null`) also clears the error for stale calls.

**Fix:** Return early from the catch and skip the notFound handling when `!isCurrent()`.

### navigateToBreadcrumb bypasses enterContainer sequencing and history

`src/composables/useNavigation.ts:449` - correctness

navigateToBreadcrumb (and goToParent/navigateBack fallback through it) calls loadChildren directly in a setTimeout(..., 150) without incrementing lastEnterTicket, without calling onBeforeNavigate/onAfterNavigate, and without pushing history. A pending enterContainer's reportIfLeaf can still fire onEnteredLeaf after the user has gone up via breadcrumb, because its enterTicket is still the latest. Back-navigation via breadcrumb also cannot be undone with navigateBack. It also reads breadcrumbs.value[index].id inside the timeout, after breadcrumbs may have changed (possible TypeError on undefined). Delay is a magic 150 while enterContainer uses SIDEBAR_HIDE_DELAY_MS.

**Fix:** Capture the target id synchronously and route through enterContainer(id, { direction: 'back' }) (or at least bump lastEnterTicket and use the shared delay constant).

### Multi-delete navigates back only one level when an ancestor is deleted

`src/composables/useNodeActionsUI.ts:237` - correctness

`needsNavigation` is true when any breadcrumb ancestor is among the deleted ids, but the handler then calls `navigateBack()`, which moves up one level only. If a grandparent was deleted, the view moves to a container that was also deleted. Single `deleteNode` handles this correctly with `loadChildren(node.parent_id ?? null)`, so the two delete paths behave differently.

**Fix:** Navigate to the nearest breadcrumb ancestor that is not in nodeIdSet (or to root), the same way deleteNode does.

### wrapWithParent bypasses nodeOps: no undo step, no isProcessing guard, no broadcast

`src/composables/useNodeActionsUI.ts:248` - consistency

wrapWithParent calls `api.createNode` and `api.moveNode` directly. It does not use nodeOps.createNode/moveNode, so no CreateCommand or MoveCommand is pushed and the user cannot undo the wrap. It also skips the concurrency guard and the detached-window broadcast. Every other structural action in this file goes through nodeOps.

**Fix:** Build the wrap from nodeOps.createNode and nodeOps.moveNode (or a composite command) so it can be undone and follows the same guard and broadcast rules.

### isLoadingMore stays true when a load-more request is superseded

`src/composables/useSearch.ts:226` - correctness

loadMoreResults sets isLoadingMore=true, then handleSearch(…, true) returns early on `if (!isCurrent()) return` (line 226) and also in the catch (line 258) without resetting it. A newer non-loadMore search never clears isLoadingMore either. If the user types while a page is loading, isLoadingMore remains true and `loadMoreResults` (`if (!hasMoreResults.value || isLoadingMore.value) return`) is blocked until closeSearch. The superseded call also left searchOffset advanced, so the new search's paging is fine only because it resets offset.

**Fix:** Reset isLoadingMore in a finally block for the call that set it (or reset it whenever a non-loadMore search starts).

### Staleness check precedes the breadcrumb await, so stale results can still be written

`src/composables/useSearch.ts:233` - correctness

`if (!isCurrent()) return` runs right after onSearch resolves, but then `await Promise.all(results.map(... getAncestors ...))` yields again. A newer search started during the ancestor fetches is not detected, and the stale results are then assigned/appended to searchResults, mixing two queries - exactly what the ticket comment says it prevents.

**Fix:** Re-check isCurrent() after the getAncestors Promise.all before mutating searchResults/selectedResultIndex/hasMoreResults.

### Clipboard writes save each cell twice

`src/composables/useSpreadsheetClipboard.js:66` - correctness

deleteSelectedCells, fillSelectionWithValue and pasteText emit 'cell-change' directly and then call `rowNode.setDataValue(...)`. setDataValue raises AG Grid's cellValueChanged, which NodeSpreadsheet.onCellValueChanged handles by scheduling a second debounced 'cell-change' for the same cell (it does not filter by event source). Each paste/delete/fill therefore produces two api.setCells writes per cell (and two undo entries if the parent records them).

**Fix:** Rely on one path: either only setDataValue (letting onCellValueChanged emit), or ignore cellValueChanged events whose source is the API in onCellValueChanged.

### Cmd+V with focus on body pastes into the table at A1

`src/composables/useSpreadsheetKeyboard.js:92` - correctness

handleKeyDown proceeds when `document.activeElement === document.body`, and the `v` shortcut has `needsSelection: false`; pasteSelection then defaults to `startRow: selectionBounds?.minRow ?? 0, startCol: ... ?? 0`. With the detail panel open and nothing focused, an app-level Cmd+V is captured (capture phase, preventDefault/stopPropagation) and overwrites the table starting at A1.

**Fix:** Require a selection (or focus inside sheetRoot) for paste, or do not treat body focus as table focus for paste.

### Drag on a node with due_date + end_date (no start_date) drops the end change

`src/composables/useTimelineDrag.js:116` - correctness

useTimelineLayout sets displayDate = start_date || due_date and endDisplayDate = end_date || today. For a node with due_date and end_date but no start_date, `if (node.start_date || !node.due_date)` is false, so handleDragEnd emits only `{ due_date: newStart }`. A 'resize-end' drag (the right handle is rendered because end_date is set) or a 'move' therefore never writes end_date; the bar springs back on the right edge and a move shifts only the left edge.

**Fix:** Write end_date whenever node.end_date exists (e.g. map start side to start_date or due_date, and end side to end_date when present); add a test for the due_date+end_date case.

## Low (26)

### Comment and docstring claim encrypt() requires an unlocked session; it only needs the public key

`electron/database/index.js:299` - docstring

_encodeNotesForWrite's docstring says "Encrypting, editing a sensitive note, or toggling the flag all require an unlocked session" and line 299 says "// encrypt() throws when locked, covering edits and turning the flag on." But sensitiveSession.encrypt only checks canEncrypt() (publicKey !== null) and seals with the public key, by design ('Needs the key pair, not an unlocked session'). So turning the flag on, or writing new text to a sensitive note while locked, succeeds. The only thing that blocks an overwrite while locked is _dropUnrevealedNotes, not encrypt(). The comment describes a safety guarantee that this code path does not provide.

**Fix:** Change the comment and docstring so they say sealing works while locked, and that only turning the flag off needs an unlocked session. If the locked-edit guard is meant to exist, enforce it explicitly with isUnlocked().

### getOrCreateTagNode writes ISO timestamps while every other path writes SQLite CURRENT_TIMESTAMP format

`electron/database/tags.js:54` - consistency

`const now = new Date().toISOString()` stores 'YYYY-MM-DDTHH:MM:SS.sssZ'. The rest of the code uses CURRENT_TIMESTAMP or datetime('now'), which store 'YYYY-MM-DD HH:MM:SS'. ORDER BY updated_at compares the values as strings, and 'T' > ' ', so tag nodes created on a given day sort as newer than every other node from that day. The function also bypasses ctx._run by calling ctx.db.run plus a manual last_insert_rowid and _save, which duplicates what _run already returns.

**Fix:** Use CURRENT_TIMESTAMP defaults and `const { lastInsertRowid } = ctx._run(...)`.

### Menu/lifecycle listeners return no unsubscribe

`electron/preload.js:157` - consistency

onSensitiveLocked and onCaptureSaved return a removeListener disposer, but onMenuUndo, onMenuRedo, onOpenSettings, onShowShortcuts and onBeforeQuit just call ipcRenderer.on(...) and return nothing (api.ts types them as void). A renderer HMR reload or a remount of useAppLifecycle stacks duplicate listeners, so one Cmd+Z runs undo twice and APP_BEFORE_QUIT triggers multiple autosaves.

**Fix:** Return () => ipcRenderer.removeListener(channel, callback) for all on* bridges, update api.ts, and dispose in useAppLifecycle on unmount.

### release.sh creates lightweight tags, so the RELEASE-EXCEPTION path can never be used through it

`scripts/release.sh:120` - consistency

`git tag "$TAG"` creates a lightweight tag. check-release-policy.mjs (annotatedTagMessage) reads the exception claim only from annotated tag objects. The script is the documented release entry point, but it gives no way to supply a tag message, and it never runs the monthly cadence check locally. A second full release in a month therefore passes every local check, gets pushed, and is only rejected in CI.

**Fix:** Accept an optional message, create the tag with `git tag -a "$TAG" -m ...`, and run `node scripts/check-release-policy.mjs "$TAG"` before pushing.

### App.vue exceeds the 1000-line limit and nothing enforces the limit

`src/App.vue:0` - design

src/App.vue is 1186 lines. The project rule says no file may exceed 1000 LOC, and I found no LOC gate in the repo configs, so the rule erodes without anyone noticing.

**Fix:** Move the settings wiring and the toolbar/snapshot handlers into composables, then add a test or lint gate that fails on any source file over 1000 lines.

### open-link-search emitted by DetailPanel is not handled in the detached window

`src/components/DetachedView.vue:285` - correctness

DetailPanel emits 'open-link-search' (lines 926, 950, 1160) and does not hide those controls when `detached` is true. DetachedView binds no @open-link-search handler, so clicking 'add link' in a detached window does nothing and shows no error.

**Fix:** Handle open-link-search in DetachedView, or hide the add-link controls in DetailPanel when detached is true.

### File exceeds 1000-line limit (1192 lines)

`src/components/DetailPanel.vue:0` - design

DetailPanel.vue is 1192 lines, breaking the project rule that no file exceeds 1000 LOC. Most of the excess is the inlined notes block (tabs, sensitive toggle, two unlock forms, edit/preview/split editors, lines ~960-1110).

**Fix:** Render the regular-node notes through NotesSection (extended with the split view and password unlock) so the panel drops below the limit.

### Notes editor and sensitive-unlock UI duplicate NotesSection

`src/components/DetailPanel.vue:960` - consistency

PersonDetailForm and OrganizationDetailForm render notes through detail/NotesSection.vue: tabs, the Show and Touch ID unlock buttons, and mention-inserted. DetailPanel re-implements the same markup inline (lines ~965-1110: the edit/preview/split tab buttons, the revealSensitiveWithTouchId and revealNotes buttons, MarkdownEditor with @mention-inserted). This is a fork of shared UI. Sensitive-note locking behavior can drift between the generic node panel and the person/org forms.

**Fix:** Add the split view to NotesSection if needed and render it from DetailPanel.

### GraphView declares emits it never fires; ViewRenderer forwards two of them

`src/components/GraphView.vue:44` - dead-code

defineEmits lists 'wrap-with-parent', 'open-fullscreen', 'toggle-complete', 'toggle-favorite' and 'open-link-search'. Neither GraphView nor any useGraph* composable emits them (grep of emit( calls). ViewRenderer.vue:229-230 binds @wrap-with-parent and @open-fullscreen on <GraphView>, but those handlers can never run. Tooltip completion toggling goes through emit('update', ...) instead of 'toggle-complete'.

**Fix:** Remove the unused emit declarations and the dead @wrap-with-parent/@open-fullscreen bindings on GraphView in ViewRenderer.vue.

### addColumn can reuse an existing column id after a delete

`src/components/NodeSpreadsheet.vue:543` - correctness

New id is `col${plainCols.length}`. After deleting a middle column (e.g. ids col0,col1,col2 -> col0,col2), adding a column yields `col2` again, producing duplicate ids in column_definitions.

**Fix:** Derive the id from the max existing numeric suffix + 1, or use a unique id generator.

### loadPersons has no stale-response guard on workspace switch

`src/components/PersonsView.vue:120` - correctness

The workspaceId watcher calls loadPersons()/loadOrganizations() without the sequencing token that useTaskFiltering.loadTasks uses (`loadTicket`). A slower earlier load for the previous workspace can land last and show the wrong workspace's persons. personLinks is also never reset, so entries from the previous workspace accumulate. Links are fetched sequentially (N awaits) which widens the race window.

**Fix:** Add a load ticket as in useTaskFiltering, reset personLinks per load, and fetch links with Promise.all.

### save()/refresh() have no error path; busy can stick

`src/components/settings/QuickCaptureSettings.vue:20` - correctness

`busy.value = true; const result = await api.captureSetConfig(...)` without try/finally; a rejected IPC call leaves busy true and the error unreported. refresh() on mount rejecting leaves config null so the section silently disappears.

**Fix:** Use try/catch/finally and surface the error in error.value.

### Header has a Fav column that no body row renders

`src/components/TableView.vue:212` - correctness

thead declares 9 columns including `<th class="col-fav">`, but both the parent row and the node rows render 8 cells (no col-fav td). The actions/delete cell therefore sits under the Fav header and widths from colWidths.fav/actions are applied to the wrong cells. The favorite is shown as a star inside the title cell instead.

**Fix:** Either remove the col-fav header (and the `fav` width) or render a col-fav cell in every row.

### Unlock form stays disabled for good if securityUnlock rejects

`src/components/UnlockScreen.vue:20` - correctness

`const result = await api.securityUnlock(password.value)` has no try/catch or finally block. If the IPC call throws instead of returning `{success:false}`, `busy` is never reset and no error is shown. The input and button stay disabled until the app restarts.

**Fix:** Wrap the call in try/catch/finally: set the error message in catch and reset busy in finally.

### Out-of-order model fetches can overwrite current results; timers not cleared

`src/composables/useAIProviderConnection.js:100` - correctness

fetchOllamaModels/fetchOpenaiModels/test*Connection assign `ollamaModels.value = await api...` with no request token; when the endpoint/provider changes while a prior request is in flight, a slower stale response overwrites the list and status for the new endpoint. The debounce timeouts (ollamaFetchTimeout/openaiFetchTimeout) are also never cleared on unmount, so a fetch can fire after the settings panel closes.

**Fix:** Track a per-provider request sequence number and drop stale responses; clear pending timeouts in onUnmounted.

### Module-level global context bypasses provide/inject and is never cleared

`src/composables/useAppContext.ts:168` - design

`let currentContext: AppContext | null = null` is set by provideAppContext and then checked first by useAppContext, before inject. Any consumer anywhere therefore gets the last-provided context through a module global, not through injection. This conflicts with the project rule to depend on injected interfaces rather than reaching for globals. The variable is never reset on unmount, so after App remounts (HMR, tests) it can return a stale context. The only consumer is useNodeActionsUI.ts.

**Fix:** Pass the context explicitly to useNodeActionsUI from App.vue (it is built in the same setup), and keep inject for descendants only. Remove the module-level variable.

### Saved-container fallback to root can never run

`src/composables/useAppLifecycle.js:138` - dead-code

initialize() wraps `await loadChildren(initialContainerId)` in try/catch and falls back to `loadChildren(null)` in the catch. useNavigation.loadChildren catches every error itself (handleError + onNotFound/onError) and never rethrows, so this catch block cannot be reached. The fallback that actually runs is App.vue's onNotFound callback (App.vue:432). The comment 'If saved container no longer exists, fall back to root' describes behavior this code does not provide.

**Fix:** Remove the try/catch and rely on onNotFound, or make loadChildren rethrow. Pick one recovery path.

### Circle layout 'concentric rings by depth' never takes effect

`src/composables/useGraphLayout.js:400` - correctness

getLayoutOptions('circle') adds a `concentric` callback and comments 'arrange nodes in concentric rings by depth', but LAYOUTS.circle has `name: 'circle'`; cytoscape's circle layout ignores `concentric` (only the 'concentric' layout reads it). nodeData.depth is also not set by buildElements, so the maxDepth scan always yields 1. The code and comment describe behavior that does not happen.

**Fix:** Either switch to `name: 'concentric'` and populate depth in buildElements, or remove the concentric/maxDepth block and the comment.

### calculatePosition, textareaEl and mentionQuery are unreferenced or write-only

`src/composables/useMentions.js:58` - dead-code

`function calculatePosition(textarea, cursorPos)` has no callers anywhere in src or tests (grep confirmed). It is left over from the textarea-based implementation, which the editor-agnostic checkMention/getCoords replaced. `const textareaEl = ref(null)` is never read or written. `mentionQuery` is written in checkMention, never read, and not returned.

**Fix:** Delete calculatePosition, textareaEl and mentionQuery.

### cancelDetailOpen is a no-op but is still wired in as a navigation hook

`src/composables/useSelection.ts:177` - dead-code

`function cancelDetailOpen(): void { // No-op ... }` is documented as 'kept for API compatibility'. App.vue:414 passes it as `onBeforeNavigate: cancelDetailOpen`, so useNavigation awaits a hook that does nothing on every navigation. The name says it cancels a pending detail open, but there is nothing to cancel.

**Fix:** Delete cancelDetailOpen, remove it from UseSelectionReturn, and drop the onBeforeNavigate wiring in App.vue.

### Unused snapshot-list state and helpers; duplicated in useMaintenanceDialogs

`src/composables/useSnapshots.js:116` - dead-code

The only consumer, useMaintenanceDialogs.js, destructures availableSnapshots, snapshotMessage, loadSnapshots, createSnapshot, restoreSnapshot and reloadDatabase. Nothing reads showSnapshotList, toggleSnapshotList, closeSnapshotList, formatSnapshotDate or cleanup. useMaintenanceDialogs re-implements the toggle as toggleSnapshots with its own injected showSnapshotList ref, and DataSettings.vue defines its own formatSnapshotDate. Because cleanup is never called, messageTimeout is never cleared when the owner unmounts.

**Fix:** Remove the unused state and functions, or make useMaintenanceDialogs use them instead of its copies. Either clear the timeout in onUnmounted or have the caller call cleanup.

### Navigation sync, view-mode setters and transition helpers duplicated and unused

`src/composables/useViewStateController.ts:16` - dead-code

App.vue calls useViewStateController({ viewMode }) and only destructures sortAlphabetically, transitioning, transitionDirection. The `navigation` option, the four synced navigation refs, resetNavigationState, setViewMode, toggleSortAlphabetically, startTransition/endTransition, and the loadTrashedItems watcher are reached only by tests (App.vue mutates transitioning/transitionDirection directly and has its own trash watcher at line 202). The navigation-sync block is a fork of useNavigationState.syncFromNavigation, with a second divergent NavigationComposable interface (children: Ref<Node[]> vs Ref<TreeNode[]>).

**Fix:** Reduce useViewStateController to the state App actually uses (or have App call startTransition/endTransition and the trash watcher), and delete the duplicate navigation sync in favor of useNavigationState.

### Web API drops skipSslVerification for OpenAI calls

`src/services/api.ts:688` - correctness

The Api interface (line 161) declares openaiTestConnection(endpoint, apiKey, skipSslVerification?), and aiProviders.js passes the third argument. The web implementation `async openaiTestConnection(endpoint: string, apiKey: string)` and openaiListModels ignore it, and openaiService.generate does not accept it. The 'skip SSL verification' setting therefore has no effect in web mode, and nothing tells the user.

**Fix:** Either support the flag or reject it explicitly in web mode, and make the implementation signature match the interface.

### api.ts exceeds the 1000-line limit

`src/services/api.ts:0` - design

src/services/api.ts is 1011 lines, over the project rule 'No file should exceed 1000 lines'. It holds the ElectronAPI interface, the full webApi and the full electronApi.

**Fix:** Split webApi and electronApi (and the ElectronAPI interface) into separate modules, keeping resolveApi/api in api.ts.

### ApiError, NotFoundError, ValidationError, DatabaseError and isCategory are never used

`src/utils/errorTypes.js:58` - dead-code

Grep over src/ and electron/ (excluding tests) shows no construction of ApiError, NotFoundError, ValidationError or DatabaseError and no call to AppError.isCategory. wrapError only produces NetworkError, AuthError, AIError or AppError, so the NotFoundError/ValidationError/DatabaseError branches of getUserMessage are unreachable.

**Fix:** Remove the unused classes, isCategory, and the unreachable getUserMessage branches (and the matching ErrorCategory entries if nothing else references them).

### sectionTitles lacks 'views' and 'global'

`src/utils/keyboardShortcuts.js:59` - correctness

KeyboardShortcutsModal.vue iterates every key of `shortcuts` and renders `sectionTitles[sectionKey]`; `shortcuts` has views and global sections but sectionTitles only defines navigation, actions, selection, graphView, so those two sections render with an empty heading.

**Fix:** Add `views: 'Views'` and `global: 'Global'`, and a test asserting every shortcuts key has a title.

## Appendix - unverified notes (152)

| File                                                    | Sev | Category    | Note                                                                                                           |
| ------------------------------------------------------- | --- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `electron/agentConfig.js:72`                            | low | docstring   | isGarbageResponse docstring incomplete; garbagePatterns has redundant entries                                  |
| `electron/agentConfig.js:69`                            | low | docstring   | isGarbageResponse lacks param/return docs and has an inaccurate name                                           |
| `electron/database/encryption.js:125`                   | low | consistency | readSlots does not check the format version, unlike payloadOffset                                              |
| `electron/database/index.js:281`                        | low | correctness | _encodeNotesForWrite ignores sensitivity state of trashed nodes                                                |
| `electron/database/index.js:359`                        | low | consistency | migrateLegacySensitiveNotes relies on its caller for atomicity                                                 |
| `electron/database/keyManager.js:31`                    | low | docstring   | createKeyManager @returns lists four of the six returned functions                                             |
| `electron/database/migrations.js:290`                   | low | correctness | Tag migration is skipped permanently once any tag node exists                                                  |
| `electron/database/nodes.js:297`                        | low | correctness | deleteNode loses the grandparent when the node is already trashed                                              |
| `electron/database/search.js:52`                        | low | correctness | Notes search runs LIKE over sealed ciphertext                                                                  |
| `electron/database/search.js:53`                        | low | correctness | LIKE patterns are built from user input without escaping % and _                                               |
| `electron/database/search.js:121`                       | low | correctness | Double-quoted "[]" used as a string literal in SQL                                                             |
| `electron/database/sensitiveNotes.js:150`               | low | naming      | wrapPrivateKey/unwrapPrivateKey also wrap the legacy symmetric key                                             |
| `electron/database/settings.js:81`                      | low | dead-code   | clearSettings is never called                                                                                  |
| `electron/database/tables.js:139`                       | low | consistency | deleteTableColumn does not bump updated_at, unlike updateNodeTable                                             |
| `electron/database/workspaces.js:36`                    | low | correctness | createWorkspace turns sort_order 0 into 99 and accepts a slug that can collide or be empty                     |
| `electron/ipc/agent.js:265`                             | low | dead-code   | Exports that no module or test imports                                                                         |
| `electron/ipc/agent.js:256`                             | low | correctness | An error in the fallback lookup escapes the catch                                                              |
| `electron/ipc/database.js:7`                            | low | dead-code   | Unused import of app                                                                                           |
| `electron/ipc/database.js:10`                           | low | docstring   | Settings-protection comment describes only the old single wrapped key                                          |
| `electron/ipc/database.js:8`                            | low | consistency | Constant defined between require statements                                                                    |
| `electron/ipc/llmProvider.js:4`                         | low | naming      | Header claims a Strategy pattern the code does not implement                                                   |
| `electron/ipc/ollama.js:74`                             | low | docstring   | Export comments name the wrong consumer                                                                        |
| `electron/ipc/security.js:10`                           | low | dead-code   | Unused import of path                                                                                          |
| `electron/ipc/sensitiveNotes.js:30`                     | low | docstring   | readKeys, writeSlots and writeKeychainSlot have no docstrings, and readKeys is exported under a different name |
| `electron/ipc/window.js:142`                            | low | dead-code   | createDetachedWindow and detachedWindows exported but not imported anywhere                                    |
| `electron/main.js:137`                                  | low | dead-code   | Commented-out code                                                                                             |
| `electron/main.js:46`                                   | low | design      | pendingQuitSaveDone duplicates pendingSaveRequest state                                                        |
| `electron/main.js:135`                                  | low | consistency | isDev computed then re-derived                                                                                 |
| `electron/main.js:24`                                   | low | consistency | ipcChannels required twice; electron modules required lazily inline                                            |
| `electron/main.js:142`                                  | low | design      | Production devtools shortcut is redundant with the View menu and Ctrl-only                                     |
| `electron/wikipedia.js:85`                              | low | dead-code   | WIKIPEDIA_ACTION_API exported but never imported                                                               |
| `scripts/release.sh:82`                                 | low | correctness | Prerelease detection greps for an unescaped version substring                                                  |
| `scripts/release.sh:118`                                | low | consistency | release.sh does not run the release cadence policy and creates lightweight tags                                |
| `scripts/sign-mac.js:0`                                 | low | docstring   | No module/function documentation; swallows signing failure                                                     |
| `src/commands/EditCommand.js:32`                        | low | design      | isPersistable is false for almost every edit, which truncates the persisted undo stack                         |
| `src/components/AiDiffPreview.vue:11`                   | low | dead-code   | Declared 'edit' event is never emitted                                                                         |
| `src/components/AiDiffPreview.vue:16`                   | low | correctness | Escape rejects the suggestion while the user is editing, discarding edits                                      |
| `src/components/AiDiffPreview.vue:9`                    | low | dead-code   | Declared 'edit' event is never emitted                                                                         |
| `src/components/AppSidebar.vue:10`                      | low | typing      | selectedNodeId typed Number while IDs are Number\|String elsewhere                                             |
| `src/components/CardsView.vue:167`                      | low | dead-code   | getDueDateStatus and the decodeHtml import are unused                                                          |
| `src/components/CardsView.vue:138`                      | low | consistency | Day-difference computation duplicated four times                                                               |
| `src/components/config/personsGridColumns.js:61`        | low | dead-code   | personsViewModes is exported but never used                                                                    |
| `src/components/config/tableColumns.js:11`              | low | design      | defaultColumnWidths exported but only used internally                                                          |
| `src/components/config/tableFormatters.js:42`           | low | dead-code   | getBadgeStyle always returns an empty object                                                                   |
| `src/components/DetachedView.vue:28`                    | low | correctness | loadNode has no guard against out-of-order responses                                                           |
| `src/components/DetailPanel.vue:1001`                   | low | consistency | Unlock form markup duplicated within DetailPanel                                                               |
| `src/components/DetailPanel.vue:42`                     | low | dead-code   | Declared 'resize' emit is never emitted or listened to                                                         |
| `src/components/GraphView.vue:593`                      | low | dead-code   | Unused local reLayout wrapper                                                                                  |
| `src/components/KeyboardShortcutsModal.vue:30`          | low | consistency | Esc listener watch lacks immediate:true unlike OnboardingModal                                                 |
| `src/components/MainToolbar.vue:110`                    | low | design      | MainToolbar passes about 20 settings props and events through to SettingsPanel                                 |
| `src/components/MarkdownRenderer.vue:277`               | low | correctness | Content renders twice on mount and concurrent async renders can race                                           |
| `src/components/MentionDropdown.vue:10`                 | low | consistency | Mixed emit and $emit in the same template                                                                      |
| `src/components/NodeContextMenu.vue:107`                | low | correctness | 'View Details' item advertises Enter, which actually enters the node                                           |
| `src/components/NodeContextMenu.vue:24`                 | low | dead-code   | menuRef template ref never read                                                                                |
| `src/components/NodeSpreadsheet.vue:117`                | low | correctness | Unsaved edits and pending saves keyed by column index survive a column delete                                  |
| `src/components/NotesAIToolbar.vue:100`                 | low | correctness | Selection range is captured before the async AI call and applied against later notes                           |
| `src/components/PersonsView.vue:219`                    | low | dead-code   | Unused local _orgIds                                                                                           |
| `src/components/PersonsView.vue:28`                     | low | dead-code   | Declared 'update' emit is never emitted nor listened to                                                        |
| `src/components/PersonsView.vue:29`                     | low | dead-code   | 'update' emit declared but never emitted                                                                       |
| `src/components/PersonsView.vue:44`                     | low | consistency | PersonsView ignores the global Hide Sensitive setting                                                          |
| `src/components/settings/AISettings.vue:62`             | low | dead-code   | isAiEnabled fallback to ollamaEnabled is unreachable; legacy ollamaEnabled plumbing is dead weight             |
| `src/components/settings/AISettings.vue:58`             | low | dead-code   | `?? props.ollamaEnabled` fallback can never apply; default diverges from store                                 |
| `src/components/settings/AISettings.vue:105`            | low | correctness | New prompt id derived from label can silently overwrite an existing prompt                                     |
| `src/components/settings/SensitiveNotesSettings.vue:23` | low | correctness | run() does not reset busy if the action throws; lock() bypasses run                                            |
| `src/components/SettingsPanel.vue:30`                   | low | consistency | aiEnabled prop default true contradicts the settings default false                                             |
| `src/components/SettingsPanel.vue:17`                   | low | dead-code   | Unused `props` binding                                                                                         |
| `src/components/SpotlightSearch.vue:64`                 | low | design      | getSearchActionLabel takes an unused parameter                                                                 |
| `src/components/TableMiniature.vue:36`                  | low | consistency | Miniature cell value logic diverges from NodeSpreadsheet                                                       |
| `src/components/TableView.vue:41`                       | low | dead-code   | Declared emits and prop never used                                                                             |
| `src/components/TagInput.vue:62`                        | low | dead-code   | 'link' event is emitted but no parent listens for it                                                           |
| `src/components/TasksView.vue:9`                        | low | dead-code   | hideSensitive prop declared and passed but never used                                                          |
| `src/components/TimelineView.vue:58`                    | low | design      | handleWheel wrapper has no effect beyond delegating                                                            |
| `src/components/TimelineView.vue:60`                    | low | dead-code   | handleWheel has an empty no-op branch                                                                          |
| `src/components/TypeFilterDropdown.vue:37`              | low | dead-code   | Unused local `hidden` in buttonLabel                                                                           |
| `src/components/ViewRenderer.vue:193`                   | low | correctness | ViewRenderer drops the second argument of CardsView start-edit/start-notes events                              |
| `src/components/ViewRenderer.vue:192`                   | low | correctness | start-edit / start-notes forwarding drops the event argument                                                   |
| `src/components/ViewRenderer.vue:101`                   | low | dead-code   | Empty 'TasksView events' comment in emits list                                                                 |
| `src/composables/useAiNotes.js:114`                     | low | dead-code   | Legacy ollama* fallbacks can never be taken; generatedContent and calculateGridColumns are never consumed      |
| `src/composables/useAIProviderConnection.js:247`        | low | dead-code   | debouncedFetchOllamaModels, debouncedFetchOpenaiModels, fetchCurrentProviderModels exported but unused         |
| `src/composables/useCardDrag.js:111`                    | low | dead-code   | getDropClass, isDragging and getDragCount are only reached from tests                                          |
| `src/composables/useCardGrid.js:3`                      | low | docstring   | useCardGrid JSDoc attached to MIN_CARD_WIDTH instead of the function                                           |
| `src/composables/useContextMenu.ts:237`                 | low | dead-code   | Helper getters isVisible/getNode/getPosition/getLinkedNodes are used only by tests                             |
| `src/composables/useDataLoading.ts:95`                  | low | dead-code   | showLostFound ref is shadowed by App.vue's own ref                                                             |
| `src/composables/useDataLoading.ts:233`                 | low | consistency | loadFavorites/loadTags swallow errors silently unlike sibling loaders                                          |
| `src/composables/useDataLoading.ts:176`                 | low | docstring   | invalidateSidebarCache comment says current workspace but clears all                                           |
| `src/composables/useDataLoading.ts:211`                 | low | dead-code   | undoClearRecent is never called                                                                                |
| `src/composables/useDetachedWindow.js:75`               | low | correctness | onMessage silently no-ops if called before mount                                                               |
| `src/composables/useDetailController.ts:93`             | low | dead-code   | openDetail, toggleFullscreen, togglePin, loadLinkedNodes, loadChildren unused in app                           |
| `src/composables/useErrorHandler.d.ts:10`               | low | typing      | .d.ts redeclares AppError as an interface instead of the real class                                            |
| `src/composables/useErrorHandler.js:157`                | low | dead-code   | Composable-only helpers unused outside tests                                                                   |
| `src/composables/useErrorHandler.js:50`                 | low | consistency | Hard-coded 'unknown' category instead of ErrorCategory.UNKNOWN                                                 |
| `src/composables/useGraphEvents.js:77`                  | low | docstring   | getParent option documented and passed but never used; toggleTooltipLock undocumented                          |
| `src/composables/useGraphEvents.js:253`                 | low | correctness | Background-tap deselect timer is not cleared by teardownEvents                                                 |
| `src/composables/useGraphModals.js:1`                   | low | dead-code   | Unused nextTick import, unused forceHideTooltip option, stale comment                                          |
| `src/composables/useGraphModals.js:4`                   | low | docstring   | Stale 'edit modal' docstring and orphan comment; unused re-exports                                             |
| `src/composables/useGraphOperations.js:25`              | low | consistency | saveNodePosition duplicates the position-key format instead of using getPositionsKey                           |
| `src/composables/useGraphSelection.js:10`               | low | consistency | Two near-identical label-selection functions with different ID typing                                          |
| `src/composables/useGraphSettings.ts:56`                | low | typing      | workspace option typed as number but GraphView passes a string ref                                             |
| `src/composables/useGraphSettings.ts:314`               | low | dead-code   | toggleTypeVisibility, resetRadialSettings, isTypeVisible returned but unused                                   |
| `src/composables/useGraphSettings.ts:339`               | low | dead-code   | isTypeVisible, toggleTypeVisibility, resetRadialSettings have no production callers                            |
| `src/composables/useGraphUpdate.js:235`                 | low | correctness | Graph rebuilds re-grabify nodes while link mode is held                                                        |
| `src/composables/useInlineEdit.js:92`                   | low | dead-code   | inlineNotesRef is never bound to a template element, so the focus branch in startInlineNotes is unreachable    |
| `src/composables/useInlineEdit.js:181`                  | low | correctness | cleanup() discards a pending notes auto-save                                                                   |
| `src/composables/useKeyboardShortcuts.js:344`           | low | dead-code   | setup()/cleanup() returned but never called                                                                    |
| `src/composables/useKeyboardShortcuts.js:240`           | low | correctness | 'n' shortcut fires with Ctrl/Cmd/Alt held                                                                      |
| `src/composables/useNavigation.ts:264`                  | low | correctness | currentContainer is published before children and breadcrumbs                                                  |
| `src/composables/useNavigation.ts:452`                  | low | consistency | navigateToBreadcrumb hard-codes 150ms instead of the shared delay constant                                     |
| `src/composables/useNavigation.ts:89`                   | low | dead-code   | isAtRoot, hasHistory and canGoUp are returned but never consumed                                               |
| `src/composables/useNavigationState.ts:28`              | low | design      | Mirror refs duplicate useNavigation state via deep watcher                                                     |
| `src/composables/useNodeActionsUI.ts:158`               | low | design      | Composable discovers collaborators via useAppContext instead of injection                                      |
| `src/composables/useNodeFiltering.js:132`               | low | dead-code   | useNodeFiltering() wrapper is never called                                                                     |
| `src/composables/useNodeFiltering.js:137`               | low | dead-code   | useNodeFiltering() wrapper is never called                                                                     |
| `src/composables/useNodeOperations.ts:502`              | low | dead-code   | pickNodeFields / NODE_UPDATE_FIELDS re-exported through the composable return but unused                       |
| `src/composables/useNodeOperations.ts:394`              | low | correctness | moveNodeToRoot performs api.getNode outside the withProcessing guard                                           |
| `src/composables/useNodeOperations.ts:404`              | low | consistency | toggleComplete/toggleFavorite/move skip broadcastUpdate                                                        |
| `src/composables/useNodeOperations.ts:273`              | low | consistency | deleteNode and deleteMultipleNodes use different children-first ordering rules                                 |
| `src/composables/useNodeTable.js:166`                   | low | correctness | saveCellStyle inserts a local cell before the save succeeds                                                    |
| `src/composables/usePlatform.js:34`                     | low | dead-code   | isWindows and isLinux are never consumed; isMac checks are redundant                                           |
| `src/composables/useSearch.ts:327`                      | low | dead-code   | Legacy onSelect fallback never wired                                                                           |
| `src/composables/useSearch.ts:333`                      | low | dead-code   | isResultSelected and the legacy onSelect fallback have no production use                                       |
| `src/composables/useSelection.ts:795`                   | low | dead-code   | cancelDetailOpen is a no-op wired as onBeforeNavigate                                                          |
| `src/composables/useSettings.ts:409`                    | low | dead-code   | Redundant null check in useSettings fallback                                                                   |
| `src/composables/useSettings.ts:0`                      | low | dead-code   | Redundant `if (!settingsInstance)` guard in useSettings                                                        |
| `src/composables/useSettings.ts:0`                      | low | correctness | Secret removed from localStorage before DB cache loaded when useSettings precedes initSettings                 |
| `src/composables/useSpreadsheetClipboard.js:1`          | low | naming      | useSpreadsheetClipboard is not a composable                                                                    |
| `src/composables/useSpreadsheetKeyboard.js:173`         | low | dead-code   | typingBuffer and shortcuts returned but never consumed                                                         |
| `src/composables/useTableDrag.js:66`                    | low | correctness | No unmount cleanup for an in-progress drag                                                                     |
| `src/composables/useTagActions.js:38`                   | low | correctness | Confirm message can render [object Object]                                                                     |
| `src/composables/useTagActions.js:38`                   | low | consistency | Tag delete relies on window.confirm while the app has an in-app dialog layer                                   |
| `src/composables/useTheme.js:89`                        | low | dead-code   | toggleTheme, isDark, isLight, isSystemPreference only referenced by tests                                      |
| `src/composables/useTheme.js:43`                        | low | consistency | Theme persisted only in localStorage, bypassing the settings layer                                             |
| `src/composables/useTheme.js:120`                       | low | dead-code   | `_initTheme` export 'for testing' is not used by any test                                                      |
| `src/composables/useTimelineDates.js:233`               | low | docstring   | Urgency comment contradicts code                                                                               |
| `src/composables/useTimelineLayout.js:192`              | low | consistency | Hardcoded default color '#0f4c75' instead of shared constant                                                   |
| `src/composables/useTimelineLayout.js:548`              | low | dead-code   | Returned members never used outside the composable                                                             |
| `src/composables/useTreeExpand.js:57`                   | low | consistency | expandAncestors does not persist state, unlike the other mutators                                              |
| `src/composables/useTreeExpand.js:70`                   | low | dead-code   | isExpanded and setExpandedIds only reached from tests                                                          |
| `src/composables/useUndoRedo.ts:15`                     | low | correctness | Prior finding (sensitive notes in sessionStorage) appears resolved                                             |
| `src/composables/useWorkspace.ts:188`                   | low | consistency | switchWorkspace writes localStorage redundantly; deleteCurrentWorkspace uses alert                             |
| `src/main.js:49`                                        | low | consistency | URLSearchParams parsed twice in bootstrap                                                                      |
| `src/main.js:51`                                        | low | consistency | URLSearchParams parsed twice in bootstrap                                                                      |
| `src/services/nodeCache.js:208`                         | low | dead-code   | getOrSet, has, stats, onEvict unused in production                                                             |
| `src/services/ollamaService.js:12`                      | low | dead-code   | Unused _model parameter in handleConnectionError                                                               |
| `src/services/openaiService.js:89`                      | low | consistency | Required apiKey declared after a defaulted parameter                                                           |
| `src/stores/filters.js:28`                              | low | correctness | hiddenTypesCount can go negative or miscount                                                                   |
| `src/utils/constants.js:98`                             | low | naming      | personIconSvg is labelled a legacy export but is actively used                                                 |
| `src/utils/errorTypes.js:174`                           | low | correctness | wrapError classifies any message containing '401' or '403' as AuthError                                        |
| `src/utils/inputOwnership.js:11`                        | low | docstring   | ownsTextInput docblock sits on the NON_TEXT_INPUT_TYPES constant                                               |
| `src/utils/nodeInteractions.js:63`                      | low | dead-code   | handleKeydown export not used by the app                                                                       |
| `src/utils/spreadsheetFormulas.js:38`                   | low | dead-code   | parseCellReference and toCellReference are used only by tests                                                  |
| `src/utils/tooltip.js:60`                               | low | docstring   | getFixedTooltipReference JSDoc attached to module variable                                                     |
| `src/utils/uiConstants.js:0`                            | low | consistency | Constants split across uiConstants.js and settingsConstants.ts                                                 |

## Appendix - refuted

- src/services/api.ts:0 api.ts exceeds the 1000-line file limit
- src/components/settings/SecuritySettings.vue:37 busy flag stuck and no error shown if security IPC rejects
- src/components/settings/SecuritySettings.vue:30 Rejected IPC call leaves busy stuck and error unhandled
- src/components/TagInput.vue:112 Removing a tag hard-deletes the tag node (retracted after review: deleting an orphan tag is intended; the behaviour is undocumented in docs/reference/node-types.md)
