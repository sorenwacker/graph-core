# Codebase Review — graph-core

_Full multi-agent review of 2026-07-30 (v1.10.19, commit 9bb5c29): 279 files / ~61k LOC read file-by-file by 17 review agents; every high/medium finding adversarially verified by an independent agent (108 agents total). Findings below are the confirmed set._

> **Status: all 91 confirmed findings were remediated on 2026-07-31** (uncommitted working tree on top of 9bb5c29; 108 files, +3645/−4792). Gates after remediation: eslint 0 errors, prettier clean, vue-tsc clean, **1387/1387 tests**. The fixes were then re-reviewed by three independent read-only agents, whose findings — including two regressions the fixes themselves introduced — are recorded in [Remediation review](#remediation-review) at the end of this document. Individual findings below are left as originally written; treat them as the historical record, not the current state of the code.

## Baseline gates

| Gate                  | Result                                          |
| --------------------- | ----------------------------------------------- |
| `eslint src electron` | ✅ 0 errors (363 warn-only complexity warnings) |
| `prettier --check`    | ✅ clean                                        |
| `vue-tsc --noEmit`    | ✅ clean                                        |
| `vitest run`          | ✅ 1383/1383 tests, 71 files                    |

Only `src/App.vue` (1132 LOC) exceeds the ~1000-line size guideline. No TODO/FIXME markers.

## Summary

- **206 raw findings** → **91 confirmed** (11 high, 52 medium, 28 low), 0 refuted, 115 lower-confidence notes not adversarially verified (appendix).
- Confirmed by category: correctness 48, dead-code 16, consistency 13, typing 8, design 5, docstring 1.

### Recurring themes

1. **Tree-integrity maintenance in the DB layer** — `path`/`depth` are not updated on delete-reparent, cross-parent reorder, or reparent-to-root; `PRAGMA foreign_keys` is never enabled so declared cascades are inert.
2. **Workspace ID type confusion** — DB uses TEXT slugs, but TS types (and one context-menu entry) treat IDs as numbers; one path moves nodes to a nonexistent `'people'` workspace.
3. **Event-payload contract mismatches** — DetachedView handles three DetailPanel events with the wrong payload shape; ViewRenderer drops TimelineView events.
4. **Silent error paths** — multiple composables collect errors into refs nobody reads; failures (insert-between, navigation load, reorder) vanish without UI feedback.
5. **Unescaped HTML interpolation** — node titles flow into `innerHTML`-style templates in the graph person template and drag ghost.
6. **Timezone bugs** — date-only strings parsed as UTC make 'due today' render as overdue/yesterday west of UTC.
7. **Dead or drifted parallel implementations** — unused composables/type files that have drifted from reality (`types/components.ts`, `useModalController`, `useGraphSelection`, webApi's duplicated LLM clients).
8. **Tests that don't test production code** — several suites exercise inline replicas of old logic; a few `vi.mock` paths don't resolve, making mocks ineffective.

## High severity (11)

### `electron/database/nodes.js:226` — deleteNode leaves reparented children with stale path/depth referencing the deleted node

_Category: correctness · group: electron-database_

deleteNode reassigns children to the deleted node's parent (`UPDATE nodes SET parent_id = ? WHERE parent_id = ?`) and then calls `updateDescendantPaths(child.id)` for each child of the new parent. But updateDescendantPaths(nodeId) only rewrites the _children of nodeId_ based on nodeId's current path — it never fixes nodeId itself. So a reassigned child keeps its old path (which still contains the deleted node's id) and its old depth (one too deep), and its entire subtree stays consistent with that stale path, so recursion changes nothing. Example: GP(path '', d0) -> P(path 'GP', d1) -> C(path 'GP/P', d2). After deleteNode(P), C.parent_id = GP but C.path stays 'GP/P' and depth 2 instead of 'GP'/1. After emptyTrash() hard-deletes P, C.path references a nonexistent id; depth-based logic (getDescendants maxDepth, getAncestors ordering) is off by one per deleted ancestor, and errors compound across repeated deletes. The integration test only asserts parent_id reassignment, not path/depth.

**Fix:** After reassigning, recompute each reassigned child's own path/depth from the new parent (path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`, or ''/0 when newParentId is null), then recurse — e.g. loop over the _former children of the deleted node_ and apply the same logic moveNode uses, or extend updateDescendantPaths to fix the node itself relative to its parent_id.

### `electron/database/nodes.js:300` — reorderNode can reparent a node (sets parent_id = target.parent_id) without updating path/depth or descendants

_Category: correctness · group: electron-database_

reorderNode writes `UPDATE nodes SET sort_order = ?, parent_id = ? WHERE id = ?` using target.parent_id for every resequenced sibling including the moved node. If nodeId's original parent differs from target's parent, the node is silently reparented but its path/depth and all descendant paths are left stale (no updateDescendantPaths call, unlike moveNode). Today the UI routes cross-parent drops through moveNode (useTableDrag 'inside' branch) so this is latent, but the DB API accepts any targetId and the IPC channel db:reorderNode is directly callable with a target under a different parent. Related: updateNode also accepts parent_id via NODE_FIELDS and would likewise skip path/depth recomputation.

**Fix:** Either reject targets whose parent_id differs from the node's (return null), or perform a proper move first (recompute depth/path + updateDescendantPaths) before resequencing; consider excluding parent_id from updateNode's writable fields so moveNode is the single reparent path.

### `src/components/DetachedView.vue:71` — handleDelete treats DetailPanel's numeric delete payload as a node object

_Category: correctness · group: components-A_

DetailPanel emits `emit('delete', props.node.id)` (a number; App.vue handles it as `deleteNode(nodeId: number)`), but DetachedView's handler is `async function handleDelete(node) { await api.deleteNode(node.id); broadcastNodeDelete(node.id); window.close() }`. With a numeric payload, `node.id` is undefined, so `api.deleteNode(undefined)` is called, an undefined id is broadcast to other windows, and the window closes anyway — masking that the node was never deleted. There are no DetachedView tests, which is why the suite doesn't catch it.

**Fix:** Change the handler to `handleDelete(nodeId)` and use `api.deleteNode(nodeId)` / `broadcastNodeDelete(nodeId)`, matching the contract App.vue uses for the same event.

### `src/components/DetachedView.vue:129` — wrapWithParent handler mismatches DetailPanel's { nodeId, parentTitle } payload

_Category: correctness · group: components-A_

DetailPanel emits `emit('wrap-with-parent', { nodeId: props.node.id, parentTitle: title })`, and the canonical handler (useNodeActionsUI.wrapWithParent) destructures `{ nodeId, parentTitle }`. DetachedView's `wrapWithParent(node)` instead reads `node.parent_id`, `node.workspace_id`, and `node.id` — all undefined on that payload — so it creates a parent with undefined parent/workspace, then calls `api.moveNode(undefined, newParent.id)`, which cannot move the current node. It also ignores the user-entered `parentTitle` and hardcodes 'New Parent', so even the intended title is lost.

**Fix:** Destructure `{ nodeId, parentTitle }`, look up the current node (it is `currentNode.value`), use `parentTitle` for the new parent's title, and move `nodeId` under the new parent.

### `src/components/MarkdownRenderer.vue:74` — processPersonMentions regex no longer matches marked output; person: links then lose their href to DOMPurify

_Category: correctness · group: components-B_

The regex `/<a href="person:(\d+)">@?\[?([^\]<]+)\]?<\/a>/g` requires `">` immediately after the href. But this component imports sanitizeHtml from utils/markdown.js, whose module top-level `marked.use({renderer: {link(...)}})` registers a custom link renderer on the shared marked singleton that emits `<a href="..." class="external-link" rel="noopener">`. Mentions are stored as `@[Name](person:id)` (useMentions.js:150), so every mention renders through that renderer with the extra attributes and the regex never matches — no person-mention chips are produced. The surviving `<a href="person:123" ...>` then has its href stripped by DOMPurify (person: is not a whitelisted URI scheme), leaving a dead, unstyled link. The .person-mention CSS and data-person-id plumbing are effectively unreachable.

**Fix:** Match anchors with arbitrary attributes, e.g. `/<a href="person:(\d+)"[^>]*>...<\/a>/g`, or better, add a dedicated marked extension for person: links instead of post-processing HTML with a renderer-coupled regex.

### `src/components/context-menu/WorkspaceList.vue:35` — 'People' entry moves nodes to a nonexistent workspace id 'people'

_Category: correctness · group: commands-and-small-components_

The hardcoded People button emits `moveToWorkspace('people')`. Grep of the entire tree shows no workspace with id 'people' exists anywhere: seeded workspaces are 'work' and 'private' (electron/database/migrations.js seedDefaultWorkspaces), and no code in src/, electron/, or src/services special-cases the string 'people' (only test mocks use it). App.vue's onMoveToWorkspace handler does `api.updateNode(nodeId, { workspace_id: wsId })` verbatim, so clicking People stores the literal string 'people' in nodes.workspace_id. Every workspace-scoped query filters `workspace_id = ?` with a real workspace id, so the node silently disappears from all views (it is not parent-orphaned, so Lost & Found won't surface it either). The active-state check on the same button (`:class="{ active: currentWorkspaceId === null }"`) is also stale: since the migratePersonsOrgsToWorkWorkspace migration, persons have workspace_id='work', so `node.workspace_id === null` is never true.

**Fix:** Remove the hardcoded People button (persons now live in regular workspaces via PersonsView, which filters by props.workspaceId), or if a people destination is still wanted, map it to a real workspace id and make the active check compare against that same id.

### `src/composables/useGraphEvents.js:334` — Container DOM listeners accumulate on every graph re-init (duplicate emits, broken collapse toggle)

_Category: correctness · group: composables-A_

setupHtmlLabelHandlers registers `container.addEventListener('mousedown', ...)`, `container.addEventListener('click', ...)` and `container.addEventListener('dblclick', ...)` but nothing ever removes them. GraphView.vue calls `events.setupEvents()` from initGraph (line 635), and initGraph is re-run after `cy.destroy()` by the watchers on showExternalLinks, showRootNode and visibleTypes (GraphView.vue lines 507-531, also 663-668 and 728). `cy.destroy()` removes only cytoscape-bound handlers; the container element persists, so each re-init stacks another full set of listeners. After N re-inits a single click on a collapse button runs `onToggleCollapse(nodeId)` N times (for even N the button appears dead), a plain click emits 'select' N times, dblclick emits 'enter' N times, and in link mode `startLinkDraw` is started N times so releasing over a target emits 'link' N times (duplicate link creation). The module-level `selectionUpdateTimer` is likewise never cleared on teardown.

**Fix:** Return a teardown function from setupEvents/setupHtmlLabelHandlers that removes the container listeners (or use an AbortController signal), and have GraphView call it before every re-init; alternatively register the container listeners only once per component lifetime and resolve the current `cy` via getCy() inside the handlers instead of closing over the instance passed to setupEvents.

### `src/composables/useGraphInit.js:124` — Person node HTML template interpolates unescaped user title

_Category: correctness · group: composables-A_

In setupHtmlLabels the person branch builds `<span class="person-name">${n.title || 'Untitled'}</span>` with the raw title, while the regular node branch correctly uses `${escapeHtml(n.title) || 'Untitled'}` (line 141). Node titles are user input rendered via innerHTML by the node-html-label plugin, so a person named e.g. `Smith & Jones <QA>` renders wrongly, and markup in the title is injected as live HTML into the renderer.

**Fix:** Use `escapeHtml(n.title) || 'Untitled'` in the person template, matching the regular-node branch.

### `src/composables/useMentions.js:74` — @mention autocomplete can never trigger: handleInput/handleKeydown are never wired to any input

_Category: correctness · group: composables-B_

useMentions returns `handleInput` and `handleKeydown`, which are the ONLY code paths that set `showMentions.value = true`. Grepping all of src/, the sole production consumer is DetailPanel.vue:133, which destructures only `{ showMentions, mentionPosition, filteredPersons, selectedMentionIndex, selectMention }` and never calls handleInput/handleKeydown (notes editing goes through CodeMirror via `onCodeMirrorNotesUpdate`, not a textarea @input). Consequently `showMentions` stays false forever and the `<MentionDropdown v-if="showMentions">` at DetailPanel.vue:762 is unreachable — the entire @person mention feature (including auto-linking via `api.linkNodes`) is silently dead in the app. Only src/**tests**/useMentions.test.js exercises handleInput, which is why the 1383 tests still pass.

**Fix:** Either wire mention detection into the CodeMirror notes editor (a CodeMirror update listener calling the detection logic, plus key handling for ArrowUp/Down/Enter/Escape) or remove useMentions + MentionDropdown usage from DetailPanel if the feature was intentionally dropped.

### `src/composables/useTaskFiltering.js:316` — useTaskDisplayUtils parses date-only strings as UTC; formatRelativeDate shows 'Yesterday' for tasks due today

_Category: correctness · group: composables-D_

due_date is stored as a date-only string (electron/database/schema.js: `due_date TEXT`, compared with 'YYYY-MM-DD' strings). `new Date('YYYY-MM-DD')` parses as UTC midnight. formatRelativeDate computes `Math.floor((date - now) / 86400000)` with no hour normalization, so from shortly after midnight local time a task due _today_ yields a negative fraction, floors to -1, and renders 'Yesterday'; a task due tomorrow renders 'Today' for most of the day. isOverdue (line 283) and isDueSoon (line 295) normalize hours but still UTC-parse the due date first, so in timezones west of UTC `setHours(0,0,0,0)` lands on the _previous_ local day and tasks due today are flagged overdue. The codebase already has parseLocalDate in useTimelineDates.js written explicitly 'to avoid timezone shift issues' but these utils do not use it. formatRelativeDate is consumed by TasksView.vue, so this is user-visible.

**Fix:** Parse with parseLocalDate from ./useTimelineDates.js (or split the string manually) in isOverdue, isDueSoon, and formatRelativeDate, and compute day diffs from local-midnight-normalized dates.

### `src/types/workspace.ts:10` — Workspace.id typed number but DB primary key is TEXT slug; phantom description/updated_at fields

_Category: typing · group: app-shell-themes-types_

`id: number` — the actual schema is `CREATE TABLE workspaces (id TEXT PRIMARY KEY, ...)` (electron/database/schema.js:87) with slug ids like 'work' (migrations.js:258 `SET workspace_id = 'work'`). The interface also declares `description: string | null` and `updated_at: string`, columns that do not exist in the workspaces table (it has is_default, which the interface omits). This propagates: Node.workspace_id is `number | null` (node.ts:51) but the column is `TEXT DEFAULT NULL` (migrations.js), and every `workspaceId?: number | null` parameter in the Api interface (api.ts:138-201) actually receives the string workspace slug at runtime — settings.ts itself says `workspace: Ref<string>` (line 196) and WorkspaceSelectorProps hedges with `string | number`. The types module contradicts both the schema and itself.

**Fix:** Make workspace ids `string` throughout (Workspace.id, Node.workspace_id, all Api workspaceId params, GetNodesParams/GetTasksParams), drop description/updated_at, and add is_default.

## Medium severity (52)

### `electron/database/export.js:310` — importCSV cannot re-import CSV that exportCSV produces when any field contains a newline

_Category: correctness · group: electron-database_

exportCSV correctly quotes fields containing newlines (`str.includes('\n')` -> wrapped in double quotes). importCSV, however, starts with `csvData.trim().split('\n')`, which splits inside quoted fields, then `if (values.length < headers.length) continue` silently drops the broken fragments. Any exported node whose notes (or title) contain a line break is silently lost or truncated on round-trip import — rows disappear with no error and nodesImported undercounts without explanation.

**Fix:** Parse the CSV into records with a quote-aware scanner (the existing parseCSVLine logic extended to treat newlines inside quotes as data) instead of a naive split('\n'), and count/report skipped malformed rows instead of silently continuing.

### `electron/database/index.js` — PRAGMA foreign_keys never enabled — declared ON DELETE CASCADE/SET NULL clauses are inert, hard deletes orphan rows

_Category: correctness · group: electron-database_

No `PRAGMA foreign_keys = ON` exists anywhere in electron/ or src/ (grep-verified), and sql.js defaults FK enforcement OFF. schema.js declares node_links (source_id/target_id ON DELETE CASCADE), node_table_cells (table_id ON DELETE CASCADE), node_tables (node_id ON DELETE CASCADE) and nodes.parent_id ON DELETE SET NULL, but none of these ever fire. deleteNode(id, hard=true) and tree.js emptyTrash() run plain `DELETE FROM nodes ...` with no manual cleanup, permanently accumulating orphaned node_links rows (returned by getAllLinks(), which feeds graph rendering), plus orphaned node_tables and node_table_cells rows for hard-deleted nodes.

**Fix:** Run `db.run('PRAGMA foreign_keys = ON')` right after constructing each SQL.Database instance (in \_init, restoreBackup, and reload), or explicitly delete dependent node_links/node_tables/node_table_cells rows in deleteNode(hard) and emptyTrash.

### `electron/database/index.js:267` — has_table is only computed by some queries but \_rowToNode coerces it to false everywhere else

_Category: consistency · group: electron-database_

getNode, getChildren, getDescendants, getDescendantsBatch and tree.getRoots select `(EXISTS(SELECT 1 FROM node_tables ...)) as has_table`, but getNodes, search, getRecent, getFavorites, getTasks, getNodesByTag, getTrash, getTagNodes, getLinkedNodes, getAncestors, getProjects and getInbox do not — yet all pass rows through \_rowToNode, which does `has_table: Boolean(row.has_table)`. Nodes fetched via those paths therefore report has_table: false even when they have a table, indistinguishable from a genuine false. Any UI that renders a table indicator from search/favorites/recent/linked-node results shows wrong state.

**Fix:** Either add the EXISTS subquery to all node-returning queries (or a shared SELECT fragment), or have \_rowToNode set has_table only when the column is present (`'has_table' in row ? Boolean(row.has_table) : undefined`).

### `electron/database/migrations.js:33` — workspace_id migration's onAdd calls ctx.backup() which is undefined during migrations; failure is silently swallowed

_Category: correctness · group: electron-database_

In index.js, `_initSchema()` (createTables -> runMigrations -> createIndexes) runs before `_initOperations()`, and `this.backup` is only assigned in \_initOperations. So when runColumnMigrations adds the workspace_id column and invokes `onAdd: () => { ctx.backup('-pre-workspace-migration') ... }`, ctx.backup is undefined and the arrow function throws TypeError. That exception is swallowed by the bare `catch { /* Column already exists, ignore */ }` wrapping `ctx.db.run(ALTER...); if (onAdd) onAdd()`. Net effect: the promised pre-migration backup is never created before migrateUnassignedNodesToWork bulk-rewrites workspace assignments, and the log lines never print — all silently. The comment at line 285 (`backup() not available during migrations`) confirms the constraint that this code violates. The over-broad catch also hides genuine ALTER failures, not just 'column exists'.

**Fix:** Either bind backup ops before running migrations (create backupOps in \_init prior to \_initSchema), or call the backup logic directly (fs copy of dbPath) inside migrations; and narrow the catch so only 'duplicate column name' errors are ignored while onAdd errors surface.

### `electron/database/nodes.js:70` — updateDescendantPaths does one full database-file write per descendant; moveNode/deleteNode ignore the \_batch mechanism built for this

_Category: design · group: electron-database_

updateDescendantPaths uses ctx.\_run per child, and \_run calls \_save(), which exports and rewrites the entire SQLite file to disk. Moving or deleting a node with N descendants therefore performs N+1 full-file writes plus N recursive getNode/getChildren query rounds. index.js's \_batch docstring explicitly says it exists for 'bulk operations (imports, large subtree moves)', but only importJSON/importCSV use it — moveNode, deleteNode, reorderNode (one \_run per sibling) and reparentToRoot do not, so they are neither crash-atomic nor efficient on large subtrees.

**Fix:** Wrap moveNode, deleteNode, reorderNode and reparentToRoot bodies in ctx.\_batch(() => ...) so the transaction commits once and the file is written once.

### `electron/database/tree.js:169` — reparentToRoot clears parent_id but never resets the node's own path/depth

_Category: correctness · group: electron-database_

reparentToRoot runs `UPDATE nodes SET parent_id = NULL WHERE id = ?` and then `ctx._updateDescendantPaths(nodeId)`. Same defect class as deleteNode: \_updateDescendantPaths only rewrites descendants from the node's _current_ path, so the newly-rooted node keeps its stale path (pointing at the missing ancestors that made it an orphan) and stale depth, and all descendants are rebuilt on top of that stale prefix. The repaired 'root' therefore never appears in path-based root/subtree queries correctly (getRoots matches parent_id so it shows up, but fixRootNodePaths will later report it as a corrupt root and rewrite everything).

**Fix:** Set path = '' and depth = 0 in the same UPDATE before calling \_updateDescendantPaths(nodeId).

### `electron/ipc/agent.js:227` — AGENT_RESEARCH drops skipSslVerification for OpenAI provider

_Category: consistency · group: electron-ipc_

The handler destructures `{ prompt, provider, model, endpoint, apiKey, contextSize, enabledTools }` and never forwards `skipSslVerification`, even though the underlying chatRequest → openaiRequest chain fully supports it (electron/ipc/llmProvider.js line 26, electron/ipc/openai.js line 23). Every other OpenAI handler (OPENAI_GENERATE, OPENAI_TEST_CONNECTION, OPENAI_LIST_MODELS) honors the setting. Result: a user with a self-signed OpenAI-compatible endpoint who enabled 'Skip SSL verification' can generate/test/list models, but the Research feature fails with an SSL error. The gap continues upstream (getProviderConfig in src/composables/useOllama.js and AgentResearchOptions in src/types/api.ts also omit the field), but the ResearchOptions typedef at agent.js line 36 and the handler are where the supported option is silently discarded.

**Fix:** Destructure skipSslVerification in the AGENT_RESEARCH handler and thread it through runAgentLoop/fallbackResearch into chatRequest; add it to ResearchOptions, AgentResearchOptions, and getProviderConfig's openai branch.

### `electron/ipc/httpClient.js:71` — connectionError never triggers on the default Electron net path

_Category: correctness · group: electron-ipc_

handleRequestError matches `error.code === 'ECONNREFUSED'`, which is Node's errno convention. But the default request path is requestWithNet (Electron's net module), whose request 'error' events emit plain Errors with Chromium-style messages like 'net::ERR_CONNECTION_REFUSED' and no `.code` property. So the configured connectionError messages ('Ollama is not running. Start with: ollama serve' / 'Cannot connect to API endpoint') can never be shown for the common case — Ollama and non-SSL-bypass OpenAI requests — and users get the raw 'net::ERR_CONNECTION_REFUSED' instead. The check only works on the requestWithNode path, which is used solely when skipSslVerification is enabled.

**Fix:** In handleRequestError, also match the Chromium form: `if (error.code === 'ECONNREFUSED' || error.message?.includes('ERR_CONNECTION_REFUSED')) return new Error(connectionError)`.

### `electron/ipc/httpClient.js:109` — skipSslVerification silently only works for localhost/.local hosts, contradicting the error hint

_Category: correctness · group: electron-ipc_

request() routes to requestWithNode only when skipSslVerification is true, but requestWithNode then sets `rejectUnauthorized: !HttpClient.isLocalhost(urlObj.hostname)`, so for any non-local https endpoint the user-enabled 'Skip SSL verification' setting has no effect. Meanwhile handleRequestError (line 81) explicitly tells users hitting cert errors: 'For self-signed certificates, enable "Skip SSL verification" in settings.' — advice that does nothing for remote hosts. Worse, on the requestWithNode path includeSslHint is false, so after enabling the setting the user gets a raw SSL error with no explanation of why it still fails. If restricting the bypass to local hosts is a deliberate security decision, the hint and option semantics should say so. Also, `isLocalhost` returns true for any `*.local` hostname (mDNS LAN hosts), which are not localhost — the name overstates the check.

**Fix:** Either honor skipSslVerification for all hosts (it is an explicit user opt-in), or scope the settings hint to local endpoints and emit a clear 'SSL bypass is only supported for local endpoints' error on remote hosts; rename isLocalhost to something like isLocalHost/isLocalNetworkHost if .local stays included.

### `electron/main.js:248` — before-quit autosave is fire-and-forget; renderer save can race app teardown

_Category: correctness · group: electron-core_

app.on('before-quit') does `mainWindow.webContents.send(APP_BEFORE_QUIT)` and returns immediately without event.preventDefault() or waiting for an ack. The renderer handler (src/composables/useAppLifecycle.js:83) reacts by calling saveInlineNotes() and detailPanelRef.value?.saveChanges(), which issue async ipcRenderer.invoke('db:updateNode', ...) calls. Nothing guarantees those invokes reach the main process and the sql.js write-to-disk completes before the window is destroyed and the process exits, so unsaved note edits can be silently lost on quit. The comment 'Notify renderer to save before quitting' promises more than the code delivers.

**Fix:** Use the standard two-phase quit: on first before-quit call event.preventDefault(), send APP_BEFORE_QUIT, have the renderer reply (e.g. an 'app:saveComplete' invoke or ipcRenderer.send ack) after its saves resolve, then call app.quit() again with a guard flag (plus a short timeout fallback).

### `src/App.vue:291` — Reorder failures still use the sticky full-view error banner the comment says was removed

_Category: consistency · group: app-shell-themes-types_

The comment at lines 288-291 documents that node-operation failures were moved from the sticky `error` ref ("which replaced the whole view with a banner that never cleared") to transient toasts, and wires nodeOps' onError to handleError accordingly. But `handleReorder` in useNodeActionsUI.ts:472 still does `error.value = (e as Error).message` on the app-context error ref provided by App.vue (line 578). Since ViewRenderer renders `v-else-if="error"` before any view (ViewRenderer.vue:130), a single failed drag-reorder replaces the entire view with a banner that nothing ever clears — exactly the regression the comment claims was fixed for the other operations.

**Fix:** In useNodeActionsUI.handleReorder, replace the error.value assignment with `handleError(e, { context: 'Reordering node' })` like the other node operations.

### `src/App.vue:448` — Navigation load errors are invisible: navigation's error ref is never surfaced

_Category: correctness · group: app-shell-themes-types_

App.vue destructures `loading, loadChildren, ...` from `useNavigation` but not `error`, and passes no `onError` callback. On a non-404 load failure useNavigation calls `handleError(e, { context: 'Loading container', silent: true })` (no toast) and sets its own internal `error` ref (useNavigation.ts:297), which nothing reads — `syncFromNavigation` only syncs children/breadcrumbs/container/id. ViewRenderer's error banner is fed from App.vue's separate `error` ref (line 111 → `:error="error"` line 912), which navigation never writes. Net effect: if loading a container fails, the user sees no toast and no banner — the view silently keeps stale or empty content.

**Fix:** Either destructure and pass `navigation.error` to ViewRenderer, or provide an `onError` callback that calls handleError non-silently / sets the app error ref.

### `src/App.vue:605` — graphOps.error discarded — insert-between failures are completely silent

_Category: correctness · group: app-shell-themes-types_

`const { saveNodePosition, insertBetween } = graphOps` drops the `error` ref that useGraphOperations returns. `insertBetween`'s catch block only does `error.value = e.message` (useGraphOperations.js:90) on that now-unread ref — no toast, no rethrow. A failed @insert-between from the graph view (line 977) therefore produces no user feedback at all, unlike sibling operations which route through handleError/showToast.

**Fix:** Change useGraphOperations' catch to call handleError (consistent with the node-operation pattern documented at App.vue:288-291), then delete the vestigial error ref.

### `src/__tests__/GraphView.layout.test.js` — Tests exercise inline copies of GraphView logic, not GraphView.vue; cited line numbers and mechanism are stale

_Category: design · group: tests-A_

Every test constructs a local `ref` and re-implements the initialization/watcher/persistence logic in the test body (e.g. `const layoutMode = ref(parent?.graph_layout || _layoutMode.value)`), so they pass regardless of what GraphView.vue does. The anchoring comments are already stale: 'This mirrors line 153 of GraphView.vue' (the init is at line 146), 'watch handler from GraphView.vue lines 223-229' and 'watcher logic from lines 233-241' (the actual watcher is at lines 441-462). The persistence tests simulate `await api.updateNode(parentId, { graph_layout: newLayout })`, but GraphView.vue now persists via `saveNodeSetting(props.parent.id, 'graph_layout', ...)` (line 371), and the navigation fallback in the real watcher uses `_layoutMode.value` from useGraphSettings, not a direct `localStorage.getItem('graph-layout-mode')` read as simulated here.

**Fix:** Either mount GraphView.vue (or extract the init/watcher logic into a testable helper and import it), or delete the file; at minimum remove the stale line-number comments so they stop asserting a false mirror.

### `src/__tests__/delete-node.test.js` — Entire file tests a self-contained mock, never imports production code

_Category: design · group: tests-A_

The file defines its own `mockDb` (createNode/getNode/deleteNode/restoreNode) and all four tests assert against that mock's behavior. No production module is imported, so the suite cannot catch any regression. Worse, the mock's semantics diverge from the real implementation: `mockDb.deleteNode` comments 'Soft delete - only marks this node, NOT children' and leaves children's parent_id pointing at the deleted node, while the real `electron/database/nodes.js:214-218` (and `helpers/testDatabase.js:278-291`) reparent children to the grandparent (`UPDATE nodes SET parent_id = ? WHERE parent_id = ?`). The delete behavior is already covered for real in database.integration.test.js ('should reassign children to grandparent when deleting parent', 'should soft delete a node', 'should restore a soft-deleted node').

**Fix:** Delete this file, or rewrite it against TestDatabase/the real delete path; the integration suite already covers everything it claims to test.

### `src/__tests__/null-roots.test.js:12` — Claims to replicate App.vue loadChildren/loadSidebarTree logic that has since moved and changed

_Category: docstring · group: tests-A_

The comment says 'Replicate the filtering logic from App.vue loadChildren and loadSidebarTree' and defines local `filterRoots`/`processRoots` (person-type filter keyed on `wsFilter === null`, per-root `getDescendants` calls). The real implementation now lives in `src/composables/useDataLoading.ts` (loadSidebarTree at ~line 126) and works differently: it filters via `matchesWorkspace`, excludes `type === 'tag'`, and batch-fetches with `api.getDescendantsBatch(rootIds)` instead of per-root getDescendants. The tests therefore validate a replica of code that no longer exists and provide no protection for the actual null-root handling in useDataLoading.ts.

**Fix:** Point these tests at useDataLoading (mock api.getRoots to return arrays containing null and assert sidebarTree is built without crashing), or fold the null-entry cases into useDataLoading.test.js and delete this file.

### `src/__tests__/sidebar.test.js:19` — Stale inline replica of old App.vue sidebar logic, superseded by useSidebar.test.js

_Category: design · group: tests-A_

The file states 'Replicate the sidebar logic from App.vue' and defines local `onSidebarEnter`/`onSidebarLeave`/`toggleSidebarPin` closures, then tests those closures. The real logic now lives in `src/composables/useSidebar.ts` and differs from the replica (composable uses `event.clientX <= SIDEBAR_WIDTH`, this file hardcodes `event.clientX < 300`; the composable also has pointer-tracking watches this file knows nothing about). `useSidebar.test.js` already tests the real composable including pin, hover, hide-timeout, and bounds cases, so this file adds no protection and can silently drift further.

**Fix:** Remove sidebar.test.js; its scenarios are covered against the real composable in useSidebar.test.js.

### `src/__tests__/tasks.test.js:71` — 'Task Helper Functions' tests assert on inline copies, not production code

_Category: correctness · group: tests-B_

The whole `describe('Task Helper Functions')` block (lines 71-159) defines its own `isOverdue` (re-declared four times) and `formatDueDate` (re-declared twice) inside each test and asserts against those local copies. No production module is imported or executed, so these six tests can never fail due to an app regression. Meanwhile the real `isOverdue` lives in `src/composables/useTaskFiltering.js` (line 283) and no test file imports `useTaskFiltering` at all, so the actual implementation is untested while a hand-copied duplicate is 'covered'.

**Fix:** Import and test the real helpers (e.g. `isOverdue` from useTaskFiltering, the date formatters from src/components/config/tableFormatters.js), and delete the inline duplicate implementations. Hoist the shared helper out of the individual `it` blocks if a local fixture is kept.

### `src/components/DetachedView.vue:154` — moveToRoot handler mismatches DetailPanel's numeric payload

_Category: correctness · group: components-A_

DetailPanel emits `emit('move-to-root', props.node.id)` (a number; App.vue wires this to `moveNodeToRoot(nodeId: number)`). DetachedView's `moveToRoot(node)` does `await api.moveNode(node.id, null)` — `node.id` is undefined on a number, so the move silently does nothing meaningful, then `loadNode(node.id)` reloads with undefined. Move to Root is broken in detached windows.

**Fix:** Accept the id directly: `async function moveToRoot(nodeId) { await api.moveNode(nodeId, null); await loadNode(nodeId); ... }`.

### `src/components/GraphControls.vue:273` — Undefined CSS variable --accent used for active states and primary buttons

_Category: correctness · group: components-A_

The stylesheet uses `var(--accent)` (`.icon-btn.active`, `.relax-locked/.fit-locked`, `.apply-btn { background: var(--accent) }`), but only `--accent-color`, `--accent-hover`, and `--accent-subtle` are defined (src/style.css:33-35); grep of the whole src tree finds no `--accent:` definition. `background: var(--accent)` resolves to transparent and `color: var(--accent)` falls back to the inherited color, so the Apply button renders as white text on a transparent background and active layout buttons lose their accent tint. The same undefined variable is used in GraphEditModal.vue (lines 268, 401) and GraphPromptModal.vue (lines 109, 139).

**Fix:** Replace `var(--accent)` with `var(--accent-color)` in GraphControls.vue, GraphEditModal.vue, and GraphPromptModal.vue, matching every other component in the group.

### `src/components/MarkdownRenderer.vue:131` — decodeHtmlEntities over the full rendered HTML corrupts escaped content in code blocks

_Category: correctness · group: components-B_

`html = decodeHtmlEntities(html)` runs after marked.parse over the entire HTML string, turning intentionally escaped `&lt;`/`&gt;`/`&amp;` inside <code>/<pre> back into real markup. E.g. notes containing `` `<div>` `` render to `<code>&lt;div&gt;</code>`, are decoded to `<code><div></code>`, and DOMPurify then reparses/strips it, so the code's text content is destroyed. Mermaid blocks already use the DOM-based decodeHtml on just their own content (line 94), so the global decode is a blunt instrument that breaks any code sample containing HTML/entities.

**Fix:** Remove the global decodeHtmlEntities pass; decode only where needed (mermaid already does), or restrict decoding to non-code segments.

### `src/components/NodeContextMenu.vue:129` — Computed refs interpolated without .value render '[object Object]' in shortcut hints

_Category: correctness · group: components-B_

`shortcut: `${modifierKey}+Click`` (line 129) and `shortcut: `${optionKey}+${modifierKey}+Click``(line 177).`usePlatform()`returns`modifierKey`/`optionKey`as`computed()`refs (src/composables/usePlatform.js:41,47), and script-setup code does not auto-unwrap refs, so the template literals stringify the ref objects: the menu shows '[object Object]+Click' and '[object Object]+[object Object]+Click' in MenuItem's <kbd> (MenuItem.vue renders item.shortcut verbatim). KeyboardShortcutsModal.vue correctly uses`.value` on the same refs.

**Fix:** Use `${modifierKey.value}` / `${optionKey.value}` inside the computed() bodies.

### `src/components/NodeSpreadsheet.vue:359` — Single shared debounce timer in onCellValueChanged drops an earlier cell's pending save

_Category: correctness · group: components-B_

`if (saveTimeout) clearTimeout(saveTimeout); saveTimeout = setTimeout(...)` — the debounce timer is shared across all cells, not keyed per cell. If a second cell edit commits within 300ms of the first (Enter-navigates-vertically + fast typing, or Tab-through entry), the first cell's pending `emit('cell-change', ...)` is cancelled and that edit is silently never persisted, though it remains visible in the grid until reload.

**Fix:** Debounce per cell (map keyed by row/col), or emit immediately and debounce only the persistence layer upstream.

### `src/components/OnboardingModal.vue:5` — @keydown on non-focusable modal div: Esc/Enter do not work until focus enters the modal

_Category: correctness · group: components-B_

`<div class="modal onboarding-modal" @keydown="handleKeydown">` — the div has no tabindex and nothing is focused on open, so keydown never fires until the user tabs/clicks into the modal; Escape and Enter are dead on open. KeyboardShortcutsModal.vue in the same group explicitly documents and fixes this exact problem ("The modal div is not focusable, so a local @keydown never fires") by attaching a document-level listener while visible.

**Fix:** Mirror KeyboardShortcutsModal: watch props.visible and add/remove a document keydown listener (with onUnmounted cleanup).

### `src/components/PersonsView.vue:58` — PersonsView never reloads when workspaceId changes, unlike sibling TasksView

_Category: consistency · group: components-B_

Data is loaded only in onMounted. TasksView.vue (same ViewRenderer sibling, same :workspace-id="workspace" prop) has `watch(() => props.workspaceId, loadTasks)`, but PersonsView has no equivalent watch, and ViewRenderer/App.vue apply no :key tied to workspace (verified). Switching workspaces while the Persons view is open keeps showing the previous workspace's persons and organizations, and new persons/orgs are created into the new workspace while stale ones are listed.

**Fix:** Add `watch(() => props.workspaceId, async () => { await loadPersons(); await loadOrganizations() })`.

### `src/components/PersonsView.vue:554` — Template @blur handler calls setTimeout, which is not available in Vue template expressions

_Category: correctness · group: components-B_

`@blur="setTimeout(() => (showOrgDropdown = false), 200)"` — Vue template expressions can only reference setup bindings and the globals allowlist (verified in node_modules/@vue/shared: 'Infinity,undefined,NaN,...,console,Error,Symbol'); `setTimeout` is not in it and there are no app.config.globalProperties in this project (grepped). The compiler emits `_ctx.setTimeout(...)`, which is undefined, so every blur of the organization autocomplete input throws `TypeError: _ctx.setTimeout is not a function` and the dropdown never closes on blur (only via Escape or selecting an item). eslint/vue-tsc do not catch this.

**Fix:** Add a `handleOrgBlur()` method in script setup that does the delayed `showOrgDropdown.value = false` and bind `@blur="handleOrgBlur"`.

### `src/components/SpotlightSearch.vue:56` — Local getImportanceLabel uses wrong importance scale (4=Critical, no 5)

_Category: correctness · group: components-C_

SpotlightSearch defines its own `getImportanceLabel` with `{ 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }`, but the canonical scale in src/utils/constants.js (importanceLabels, used by TasksView via useTaskDisplayUtils and matching the TasksView filter dropdown) is `{1: Low, 2: Medium, 3: High, 4: Urgent, 5: Critical}`. In search results, importance 4 is mislabeled 'Critical' (should be 'Urgent') and importance 5 falls through `labels[importance] || importance` and renders the raw number '5'.

**Fix:** Delete the local function and import getImportanceLabel from '../utils/constants.js' (same source TasksView uses).

### `src/components/ViewRenderer.vue:250` — TimelineView 'add-child' and 'delete' events are silently dropped

_Category: correctness · group: components-C_

TimelineView emits 'add-child' (Cmd+Click) and 'delete' (Cmd+Alt+Click) via useTimelineInteractions.handleNodeClick (src/composables/useTimelineInteractions.js:49-51), and declares both in its defineEmits. But ViewRenderer's <TimelineView> usage (lines 250-262) only binds @select, @enter, @show-tooltip, @hide-tooltip, @context-menu, and @update. ViewRenderer is the only consumer of TimelineView (verified by grep), and ViewRenderer itself declares and forwards 'add-child' and 'delete' for other views, so in timeline view Cmd+Click (add child) and Cmd+Alt+Click (delete) emit events that no one receives — the documented interactions are silent no-ops.

**Fix:** Add @add-child="emit('add-child', $event)" and @delete="emit('delete', $event)" to the TimelineView binding in ViewRenderer (payload shapes match TableView's: {parentId, title, prompt} and node.id).

### `src/components/config/tableFormatters.js:32` — isOverdue marks items due today as overdue for users west of UTC

_Category: correctness · group: commands-and-small-components_

`const due = new Date(dateStr)` parses a date-only string ('2026-07-30') as UTC midnight. For a user in a UTC-negative timezone that is the previous local day, so `due < today` (local midnight) is true and an item due today renders as overdue in TableView. The near-duplicate isOverdue in src/composables/useTaskFiltering.js:283 has the same UTC-parse flaw but additionally normalizes the due date with setHours(0,0,0,0), so the two copies can also disagree for datetime-bearing strings.

**Fix:** Parse the date parts explicitly into a local date (e.g. split on '-' and use new Date(y, m-1, d)) before comparing, and share one implementation between tableFormatters.js and useTaskDisplayUtils instead of maintaining two divergent copies.

### `src/components/detail/TagsSection.vue:20` — Tag link/unlink leaves stale chips in Person/Organization forms

_Category: correctness · group: components-detail_

TagInput emits 'link', 'unlink', and 'refresh', and renders its chips from the linkedTags prop (derived from props.linkedNodes). TagsSection only declares emits ['refresh'] and drops the 'unlink' event entirely (`<TagInput ... @refresh="emit('refresh')" />`), and both PersonDetailForm and OrganizationDetailForm wire `@refresh="saveChanges"`, which just does `emit('save')`. In DetailPanel, `saveChanges()` only emits 'update' for the node and `linkedNodes` is reloaded exclusively in the node watcher when `newNode.id !== oldNode?.id` (isNewNode). Result: in the person/organization detail forms, adding a tag never shows a new chip and removing a tag leaves its chip visible until the user switches to a different node. Contrast MetadataGridSection (used for regular nodes), which correctly wires `@unlink="emit('unlink-tag', $event)"` (optimistic removal in DetailPanel.onUnlinkTag) and `@refresh="emit('reload-links')"` (DetailPanel.loadLinkedNodes).

**Fix:** Make TagsSection mirror MetadataGridSection: declare and forward 'unlink' (and ideally rename/add a 'reload-links'-style event), then in PersonDetailForm/OrganizationDetailForm wire these to new emits that DetailPanel connects to onUnlinkTag/loadLinkedNodes instead of saveChanges.

### `src/composables/useGraphElements.js:139` — Hardcodes '#0f4c75' placeholder-color checks instead of hasExplicitColor/DEFAULT_NODE_COLOR

_Category: consistency · group: composables-A_

buildElements repeats `parentNode.color !== '#0f4c75'` three times (lines 139, 142, 148) as a magic literal, and useGraphInit.js line 123 does the same for person nodes. src/utils/nodeColor.js explicitly declares itself the 'single source of truth' for this rule and exports `hasExplicitColor(node)` and `DEFAULT_NODE_COLOR`; the sibling composable useColorInheritance.js already uses it. If the placeholder color ever changes, the graph view silently diverges from the cards view. (Also: the buildElements JSDoc omits the `ancestorColor` and `inheritColors` options it destructures.)

**Fix:** Replace the literal comparisons in useGraphElements.js and useGraphInit.js with `hasExplicitColor(...)` / `DEFAULT_NODE_COLOR` from ../utils/nodeColor.js, and document the two missing options in the buildElements JSDoc.

### `src/composables/useGraphLayout.js:524` — applyRadialSettings ignores the user's iterations setting and diverges from getLayoutOptions

_Category: consistency · group: composables-B_

`applyRadialSettings()` builds an inline cose-bilkent config with `numIter: 2500` hardcoded and `gravityRange: 3.8`, while `getLayoutOptions()` for the same radial mode uses `numIter: radialSettings.iterations` and `gravityRange: 10`. GraphControls exposes an "Iterations" slider (GraphControls.vue:214-217) and the Apply button calls `layout.applyRadialSettings()` (GraphView.vue:790), so the slider's iterations value is silently ignored on Apply but honored on re-layout — two divergent radial configs for the same settings.

**Fix:** Build the Apply config from `getLayoutOptions('radial')` (spreading in randomize:false and gravityCenter) so both paths share one source of truth, and pass radialSettings.iterations through.

### `src/composables/useGraphOperations.js:90` — insertBetween failures are swallowed into an error ref nobody reads

_Category: correctness · group: composables-B_

`catch (e) { error.value = e.message }` writes to the composable-local `error` ref, but the only consumer (App.vue:597-605) destructures just `{ saveNodePosition, insertBetween }`; `graphOps.error` is never rendered or watched anywhere. If unlinkNodes/createNode/moveNode fails mid-sequence, the user gets no feedback and the graph may be left half-mutated (e.g. link removed but new node not created). App.vue explicitly migrated node-operation failures to `handleError` toasts (comment at App.vue:~289: sticky error ref "replaced the whole view with a banner"), so this path is also inconsistent with the sibling pattern.

**Fix:** Accept a handleError callback (like useGraphUpdate/useInlineEdit do) and call it in the catch, or rethrow and let the caller surface it; drop the dead `error` ref.

### `src/composables/useGraphSelection.js:85` — useGraphSelection() composable is never instantiated; GraphView re-implements its logic inline

_Category: dead-code · group: composables-B_

Grep across src/ and electron/ shows `useGraphSelection(` is never called in production or tests (useGraphEvents.test.js only vi.mocks the module). Only the standalone exports `updateHtmlLabelSelectionFromIds`, `updateHtmlLabelsFromCySelection`, `centerOnNode`, `isNodeVisible` are used (GraphView.vue, useGraphEvents.js). Meanwhile GraphView.vue:675-707 re-implements `syncSelectionToCy` and `syncSingleSelectionToCy` line-for-line inline in its `props.selectedIds`/`props.selectedId` watchers (same isSelected data sync, same set-equality check, same unselect/select loop). This is exactly the duplicated-parallel-path situation the codebase aims to avoid.

**Fix:** Have GraphView call `useGraphSelection({ getCy })` and use `syncSelectionToCy`/`syncSingleSelectionToCy` in its watchers, or delete the composable wrapper and keep only the standalone functions.

### `src/composables/useModalController.ts:97` — All useModalController methods are production-dead; toggleSnapshots/toggleLostFound duplicate useMaintenanceDialogs

_Category: dead-code · group: composables-B_

App.vue:92-93 is the only production consumer and takes only the refs: `const { addNodeModal, showShortcutsModal, showOnboarding, showSettings, showSnapshotList, showLostFound } = useModalController()`, then mutates them directly (`showShortcutsModal.value = true` at App.vue:726, `addNodeModal.visible = false` at :1025, `@close="showOnboarding = false"` at :1072). The methods `showAddNodeModal`, `closeAddNodeModal`, `openShortcutsModal`, `closeShortcutsModal`, `openOnboarding`, `closeOnboarding`, `openSettings`, `closeSettings`, `toggleSnapshots`, `toggleLostFound` and the options `loadSnapshots`/`loadOrphanedNodes` are called only from src/**tests**/useModalController.test.js. Worse, `toggleSnapshots`/`toggleLostFound` here duplicate useMaintenanceDialogs.js:63-71 (the versions actually bound in the template at App.vue:881/884) with divergent behavior: this version loads snapshots only when opening, the live version loads on every toggle. Note App.vue's actual `showAddNodeModal` comes from useNodeCreation, a third implementation.

**Fix:** Either make App.vue use the controller methods (and delete the duplicates in useMaintenanceDialogs), or strip useModalController down to the plain refs it actually provides and delete the unused methods/options plus their test-only coverage.

### `src/composables/useNodeActionsUI.ts:479` — deleteSelectedNodes duplicates deleteMultipleNodes but drops the confirm() and needs-navigation handling

_Category: consistency · group: composables-B_

`deleteSelectedNodes()` (keyboard Cmd/Ctrl+Delete path, wired in useKeyboardShortcuts) calls `nodeOps.deleteMultipleNodes` directly, bypassing the sibling `deleteMultipleNodes()` (line 226) which (a) asks `confirm(\`Delete N nodes?\`)` when more than one node is selected and (b) checks whether the current container or a breadcrumb ancestor is among the deleted ids and navigates back. So deleting 10 selected nodes via keyboard shows no confirmation, and if the current container is among the selection (possible in graph view where the container/root node is rendered and selectable via showRootNode), the view is left showing a deleted container. The two functions are otherwise near-identical duplicated logic.

**Fix:** Make deleteSelectedNodes delegate: `await deleteMultipleNodes([...selectedIds.value])` then clear selectedIds, so confirm and navigation behavior stay in one place.

### `src/composables/useNodeOperations.ts:338` — moveNode pushes undo command before the API call, so failed moves land on the undo stack

_Category: correctness · group: composables-C_

In moveNode: `if (oldParentId !== undefined && pushCommand) { pushCommand(new MoveCommand({ nodeId, oldParentId, newParentId })) } await api.moveNode(nodeId, newParentId)`. If api.moveNode throws, withProcessing catches the error and returns false, but the MoveCommand has already been pushed. Undo then targets a move that never happened, and redo would execute the previously failed move. Every other operation in this file (createNode, updateNode, deleteNode, toggleComplete, linkNodes, unlinkNodes) pushes its command only after the API call succeeds.

**Fix:** Move the pushCommand call after `await api.moveNode(...)`, matching the pattern used by all sibling operations.

### `src/composables/useOllama.js:105` — research() ignores the openaiSkipSslVerification setting that improveNotes() honors

_Category: correctness · group: composables-C_

getProviderConfig() for the OpenAI provider returns `{ provider, model, endpoint, apiKey }` and omits `skipSslVerification`, while improveNotes() explicitly passes `skipSslVerification: openaiSkipSslVerification.value` to api.openaiGenerate. So a user on a self-signed-cert OpenAI-compatible endpoint can generate/improve notes but agent research fails with an SSL error. Note electron/ipc/llmProvider.js already forwards `skipSslVerification` if present in options, but electron/ipc/agent.js also destructures options without it, so both layers must pass it through.

**Fix:** Add `skipSslVerification: openaiSkipSslVerification.value` to the OpenAI branch of getProviderConfig(), and forward it in electron/ipc/agent.js's AGENT_RESEARCH handler into the runAgentLoop/fallbackResearch options.

### `src/composables/useSpreadsheetClipboard.js:135` — pasteSelection does not handle CRLF line endings or a trailing newline

_Category: correctness · group: composables-C_

`const lines = text.split('\n')` — clipboard text copied from Excel/Windows apps uses \r\n, so every pasted cell value ends with a stray `\r` (also mis-detected as non-formula content, and stored via emit('cell-change')). Additionally, Excel always appends a trailing newline, so the last element of `lines` is an empty string that writes `''` into the row below the paste target, silently clearing an existing cell.

**Fix:** Normalize before splitting: `text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')`.

### `src/composables/useTableDrag.js:13` — Drag ghost injects unescaped node.title (and node.color) via innerHTML

_Category: correctness · group: composables-D_

createDragGhost builds the ghost with `ghost.innerHTML = `...<span class="ghost-type" style="background: ${node.color || '#0f4c75'}">...</span><span class="ghost-title">${node.title}</span>...``. node.title is user-controlled content interpolated into HTML without escaping, so a title like `<img src=x onerror=...>`executes script in the Electron renderer the moment the row is dragged. This is also inconsistent with the codebase's own convention: src/utils/html.js provides escapeHtml and useGraphInit.js:141 uses`escapeHtml(n.title)` when building node HTML. node.color in a style attribute is a secondary injection vector.

**Fix:** Build the ghost with document.createElement/textContent (as the same file already does for .ghost-action via textContent), or wrap title with escapeHtml from ../utils/html.js and set color via ghost.style rather than string interpolation.

### `src/composables/useTaskFiltering.js:53` — Container filtering discards the first fetch and re-fetches ancestors per task twice (N+1 twice)

_Category: design · group: composables-D_

When containerId is set, loadTasks fetches tasks with `params.parentId = containerId` (direct children only), then filterTasksByContainer immediately re-fetches ALL workspace tasks with identical completed/importance params (duplicated param-building code) and filters by subtree, so the first result is discarded except as an error fallback. Inside filterTasksByContainer, `descendantIds.has(task.id)` from api.getDescendants already fully determines subtree membership, yet the code then calls api.getAncestors once per preliminary task ('Also need to check full ancestry') — redundant N+1. buildTaskPaths then calls api.getAncestors _again_ for every task. Net effect: two task-list fetches plus up to 2 getAncestors IPC round-trips per task per load.

**Fix:** Skip the parentId-constrained fetch when containerId is set, drop the redundant per-task ancestry check in filterTasksByContainer (the descendant-set test is sufficient), and reuse the ancestors fetched in buildTaskPaths for both path building and membership.

### `src/composables/useWorkspace.ts:149` — deleteCurrentWorkspace calls api.getRoots outside the try/catch; a rejection escapes unhandled

_Category: correctness · group: composables-D_

`const roots = await api.getRoots(currentWorkspace.value as number)` runs before the try block, so if getRoots rejects (IPC failure, invalid workspace id) the promise rejection propagates to the caller instead of going through handleError like every other failure path in this file (loadWorkspaces, createWorkspace, renameWorkspace, and the deleteWorkspace call four lines below all wrap in try { } catch (e) { handleError(...) }). The function is typed `Promise<boolean>` and callers expect a boolean, not a throw.

**Fix:** Move the getRoots call and the roots check inside the existing try block (returning false via the catch/handleError path).

### `src/services/api.ts:38` — ElectronAPI interface omits 15 methods exposed by preload.js

_Category: consistency · group: services-stores-utils_

The `declare global` Window.electronAPI type (interface ElectronAPI) is missing methods that electron/preload.js exposes and that renderer code calls: `openExternal` (used in src/utils/markdown.js:92), `openDetachedWindow`/`closeDetachedWindow` (src/composables/useDetachedWindow.js:40), `onBeforeQuit` (src/composables/useAppLifecycle.js:83), plus `getSetting`, `getAllSettings`, `setSetting`, `setSettings`, `deleteSetting`, `getVersion`, `repairWorkspaces`, `onMenuUndo`, `onMenuRedo`, `onOpenSettings`, `onShowShortcuts`. These calls only type-check because their callers are .js files; any TS/vue-tsc consumer would fail, and the declared contract no longer reflects the actual IPC surface — exactly the layer drift the architecture is supposed to prevent.

**Fix:** Add the missing method signatures to the ElectronAPI interface (or generate the interface from preload.js) so the declared Window.electronAPI matches what preload exposes.

### `src/services/api.ts:76` — importJSON/importCSV types do not match the actual result shape or workspace id type

_Category: typing · group: commands-and-small-components_

The declarations `importJSON(data: object, targetParentId?: number | null, workspaceId?: number | null): Promise<{ imported: number }>` (and the same for importCSV) are wrong on two counts. (1) The electron handler (electron/database/export.js:292/391) actually returns `{ nodesImported, linksCreated }` / `{ nodesImported }`; the fields DataSettings.vue:61 reads (`result.nodesImported`, `result.linksCreated`) do not exist on the declared type — it only type-checks because DataSettings is a JS SFC. (2) workspaceId is typed `number | null` but workspace ids are TEXT primary keys ('work', 'private'); DataSettings passes props.currentWorkspace, a string.

**Fix:** Declare the real return type `{ nodesImported: number; linksCreated?: number }` and type workspaceId as `string | null` (or the shared WorkspaceId type from useWorkspace.ts).

### `src/services/api.ts:89` — Workspace IDs typed as number but are strings at runtime

_Category: typing · group: services-stores-utils_

The ElectronAPI interface and Api implementations type workspace IDs as `number | null` throughout (`getWorkspaces(): Promise<(Workspace|null)[]>`, `getWorkspace(id: number)`, `deleteWorkspace(id: number)`, every `workspaceId?: number | null` param). But workspace IDs are actually strings: electron/database/workspaces.js:36 generates slug IDs (`data.name.toLowerCase().replace(...)`), src/utils/demoData.json uses `"id": "demo"`, and useSettings persists `'work'` as the default workspace. Consumers already have to lie to the compiler — src/composables/useWorkspace.ts:149 does `api.getRoots(currentWorkspace.value as number)`. Root cause is `id: number` in src/types/workspace.ts:10, propagated through every signature in this file.

**Fix:** Change the workspace ID type to `string` (or a `WorkspaceId = string` alias) in src/types/workspace.ts and all workspaceId parameters in api.ts, then remove the `as number` casts in useWorkspace.ts.

### `src/services/api.ts:522` — webApi reimplements ollama/openai clients, duplicating and drifting from the service modules

_Category: consistency · group: services-stores-utils_

`webApi.ollamaGenerate`, `ollamaTestConnection`, `ollamaListModels`, `openaiGenerate`, `openaiTestConnection`, and `openaiListModels` are inline re-implementations of src/services/ollamaService.js and src/services/openaiService.js. They have already drifted: the api.ts copy sends `num_ctx` while ollamaService.generate does not; error handling differs (api.ts openaiGenerate special-cases 401, the service does not; the service's ECONNREFUSED mapping is absent in api.ts). Meanwhile webApi.agentResearch (line 643) does delegate to agentService, which itself calls those same service modules — so web mode runs two different Ollama/OpenAI client implementations depending on the code path.

**Fix:** Have the webApi methods delegate to ollamaService/openaiService (e.g. `ollamaGenerate: options => ollamaService.generate(options)`), keeping one client implementation per provider in the renderer.

### `src/services/ollamaService.js:46` — ollamaService.generate silently drops contextSize

_Category: correctness · group: services-stores-utils_

`generate({ prompt, content, model, endpoint })` does not accept or forward `contextSize`, so no `options: { num_ctx }` is sent. But agentService's `generateFinalSummary` (src/services/agentService.js:160-169) spreads `buildProviderOptions` which includes `contextSize` for ollama — it is silently discarded. So the agent loop honors the configured context window (generateWithTools sends `num_ctx: contextSize || 32768`) while the final-summary call falls back to Ollama's small default context, likely truncating the very conversation it is asked to summarize. The webApi copy in api.ts:522 does send `num_ctx`, confirming the intent.

**Fix:** Add `contextSize` to `generate`'s destructured options and pass `options: { num_ctx: contextSize || 32768 }` in the request body, matching `generateWithTools`.

### `src/types/components.ts` — Entire file unused — all 24 exported prop/emit types have zero consumers and have drifted from the real components

_Category: dead-code · group: app-shell-themes-types_

Grepped every export (DetailPanelProps ... DetailPanelExposed) across src/ and electron/: zero references outside src/types/ (only the barrel re-export). The components are plain-JS .vue files that define props inline, and the declared types have already drifted from reality — e.g. BreadcrumbsProps declares `path: Node[]` but App.vue passes `:breadcrumbs` (App.vue:899, Breadcrumbs takes a `breadcrumbs` prop); SpotlightSearchProps declares initialQuery/mode/filterType/workspaceId while the actual component receives search-mode, search-query, selected-result-index, search-results, recent-items, view-mode, has-more-results, is-loading-more (App.vue:1050-1059). These are aspirational documentation types that nothing checks, and they now misdocument the components.

**Fix:** Delete src/types/components.ts and its barrel exports (relocating RadialSettings, which is the correct type for Node.graph_physics), or actually wire the types into the components with defineProps<...>() so vue-tsc keeps them honest.

### `src/types/node.ts:59` — notes_sensitive typed as string | null but is a boolean flag

_Category: typing · group: app-shell-themes-types_

`notes_sensitive: string | null` with docstring "Sensitive notes (encrypted storage)". The field is actually a boolean visibility flag: the DB column is `INTEGER DEFAULT 0` (electron/database/migrations.js:22) and the row mapper coerces it with `notes_sensitive: Boolean(row.notes_sensitive)` (electron/database/index.js:268). Every consumer treats it as a boolean (DetailPanel.vue:373 `editedNode.value.notes_sensitive = !editedNode.value.notes_sensitive`, GraphEditModal.vue:107 `:checked="editedNode.notes_sensitive"`, App.vue:229 truthiness). Same wrong type on UpdateNodeData at line 144. Any TS consumer trusting this type would write string handling that is wrong at runtime; vue-tsc doesn't catch it only because the consumers are JS.

**Fix:** Change both occurrences to `notes_sensitive: boolean` (and `notes_sensitive?: boolean` in UpdateNodeData) and fix the docstring to "Whether notes are marked sensitive (hidden when hide-sensitive is on)".

### `src/types/node.ts:115` — graph_physics typed boolean but is a physics-settings object

_Category: typing · group: app-shell-themes-types_

`graph_physics: boolean` with docstring "Whether physics simulation is enabled". The column is `TEXT DEFAULT NULL` holding JSON (migrations.js:42), the DB mapper does `graph_physics = JSON.parse(row.graph_physics)` (electron/database/index.js:258), and GraphView spreads it as an object of radial settings: `{ ..._radialSettings, ...props.parent.graph_physics }` (GraphView.vue:179) and saves it via `JSON.stringify(v)` of a settings object (GraphView.vue:428). Same wrong type in UpdateNodeData (line 167). The correct shape already exists in this module as `RadialSettings` (components.ts:56).

**Fix:** Type it as `RadialSettings | null` (moving RadialSettings next to it if components.ts is removed) and fix the docstring.

### `src/types/settings.ts:10` — ViewMode contains phantom modes 'list' and 'table', and a second divergent ViewMode exists

_Category: consistency · group: app-shell-themes-types_

`export type ViewMode = 'graph' | 'cards' | 'list' | 'table' | 'timeline' | 'persons' | 'tasks' | 'trash' | 'tree'`. The actual modes are graph, cards, tree, tasks, timeline, persons, trash (src/utils/viewConfig.js ids; ViewRenderer.vue branches on exactly these seven). 'list' and 'table' are handled nowhere — the table UI is mode 'tree'. Additionally useViewStateController.ts:7 declares its own conflicting `ViewMode` ('graph' | 'list' | 'cards' | 'trash' | 'timeline' | 'tasks' — missing 'tree'/'persons') instead of importing this one, so the two typed definitions disagree with each other and both disagree with runtime.

**Fix:** Derive one ViewMode union matching viewConfig.js ids ('graph' | 'cards' | 'tree' | 'tasks' | 'timeline' | 'persons' | 'trash'), export it from types, and make useViewStateController import it instead of redefining it.

### `src/utils/uiConstants.js:27` — STORAGE_KEYS registry is bypassed by literals and contains a stale key value

_Category: consistency · group: services-stores-utils_

STORAGE_KEYS is documented as "centralized to prevent typos", but only useGraphSettings.ts and useSidebar.ts import it. useSettings.ts hardcodes the same strings as literals ('graphcore-viewMode', 'graphcore-workspace', 'graphcore-hideSensitive', 'graphcore-hideCompleted', 'graphcore-openDetailFullscreen', 'graphcore-hoverPreview', 'graphcore-sidebarPinned', ...), as do useWorkspace.ts:66 and App.vue:438 ('graphcore-containerId'). Worse, one registry entry is now wrong: STORAGE_KEYS.GRAPH_NOTES_PREVIEW_LENGTH = 'graph-notes-preview-length' while the actual persisted key is 'graphcore-graphNotesPreviewLength' (useSettings.ts:278) — anyone "fixing" a call site to use the constant would silently orphan users' saved setting. GRAPH_ROOT_MAX_DEPTH ('graphcore-graphRootMaxDepth') is referenced nowhere at all, neither via the constant nor as a literal.

**Fix:** Make useSettings.ts/useWorkspace.ts/App.vue import STORAGE_KEYS instead of literals, correct GRAPH_NOTES_PREVIEW_LENGTH to 'graphcore-graphNotesPreviewLength', and delete GRAPH_ROOT_MAX_DEPTH.

## Low severity (28)

### `electron/preload.js:84` — repairWorkspaces is exposed but never called from the renderer

_Category: dead-code · group: electron-core_

`repairWorkspaces: () => ipcRenderer.invoke('db:repairWorkspaces')` (preload.js:84) is handled in electron/ipc/database.js:186 and implemented in electron/database/tree.js:181, but no file in src/ (including tests, and the raw string 'db:repairWorkspaces') ever calls it. It is reachable only by manually typing window.electronAPI.repairWorkspaces() in devtools. Exposed-but-never-called IPC surface per the review rules.

**Fix:** Wire it to a maintenance action in the Settings/Data panel (it sits next to backup/restore which are used), or remove the preload exposure and channel; if devtools-only use is intentional, document that in a comment.

### `electron/preload.js:135` — getVersion is defined, handled, and exposed but never called by the renderer

_Category: dead-code · group: electron-core_

The full chain exists — APP_GET_VERSION in ipcChannels.js:168, ipcMain.handle(APP_GET_VERSION, ...) in main.js:229, and `getVersion: () => ipcRenderer.invoke('app:getVersion')` in preload.js:135 — but grep across all of src/ (including src/**tests** and the raw string 'app:getVersion') finds zero consumers. Per the project's layer-sync rule, an exposed-but-never-called channel is dead IPC surface.

**Fix:** Either use it (e.g. show the app version in the Settings/About UI) or remove the channel from preload.js, main.js, and ipcChannels.js.

### `src/App.vue:200` — deleteTag bypasses the deleteNode wrapper and skips view/sidebar refresh

_Category: consistency · group: app-shell-themes-types_

`deleteTag` calls `api.deleteNode(tag.id)` directly and afterwards only runs `loadTags()`. Every other deletion path goes through `deleteNode` from useNodeActionsUI, which pushes an undo command and triggers refreshAfterDelete (children + sidebar tree + recent/favorites). Tag nodes are ordinary nodes living in the tree, so if the deleted tag is visible in the current container or the sidebar tree, it remains on screen until some other action reloads data; the deletion is also excluded from undo history unlike all sibling delete handlers.

**Fix:** Route tag deletion through the shared `deleteNode` action (or at least call refreshAfterDelete) so tag deletes behave like every other node deletion.

### `src/__tests__/useGraphEvents.test.js:5` — vi.mock path resolves to nonexistent module, mock is ineffective

_Category: correctness · group: tests-B_

`vi.mock('./useGraphSelection.js', () => ({ updateHtmlLabelsFromCySelection: vi.fn() }))` resolves the path relative to the test file, i.e. `src/__tests__/useGraphSelection.js`, which does not exist. The unit under test imports `./useGraphSelection.js` relative to `src/composables/` (verified: `src/composables/useGraphEvents.js` line 2 is `import { updateHtmlLabelsFromCySelection } from './useGraphSelection.js'`). Because the mocked path never matches the imported module, the factory is silently never used and the real `updateHtmlLabelsFromCySelection` runs in every test. The tests happen to pass anyway, so the dead mock hides that the real dependency is being exercised.

**Fix:** Change the mock path to '../composables/useGraphSelection.js' (as the sibling useDetailController.test.js correctly does with '../composables/useDetailResize.js'), or delete the mock if exercising the real function is intended.

### `src/__tests__/useMentions.test.js:17` — vi.mock('./useErrorHandler') resolves to wrong path, mock is ineffective

_Category: correctness · group: tests-B_

`vi.mock('./useErrorHandler', () => ({ useErrorHandler: () => ({ handleError: vi.fn() }) }))` resolves relative to the test file to `src/__tests__/useErrorHandler`, which does not exist. `src/composables/useMentions.js` imports `./useErrorHandler` relative to `src/composables/`, so the real error handler (which calls the real `showToast`) is used in all tests. The mock is silently dead; only the fact that no test exercises an error path keeps this invisible.

**Fix:** Change the path to '../composables/useErrorHandler' so the mock actually applies (matching the correct pattern in useDataLoading.test.js, which mocks '../composables/useErrorHandler.js').

### `src/__tests__/useTreeExpand.test.js:226` — saveExpandedState test never calls saveExpandedState

_Category: correctness · group: tests-C_

The 'saveExpandedState' describe block destructures `const { toggleExpand, saveExpandedState } = useTreeExpand({ workspace })` but only invokes `toggleExpand(1); toggleExpand(2)` before asserting localStorage contents. The assertion passes only because toggleExpand internally calls saveExpandedState (useTreeExpand.js lines 43/19), so the named unit is never exercised directly and the test is a near-duplicate of 'should persist state to localStorage' at line 75. If saveExpandedState were broken when called standalone (e.g. after setExpandedIds), this suite would not catch it.

**Fix:** Mutate state without triggering the implicit save (or clear the mock store after toggling), then call saveExpandedState() explicitly and assert the stored payload; or delete the block as a duplicate.

### `src/commands/CreateCommand.js:15` — Redo does not restore the linkedToId link that undo removes

_Category: correctness · group: commands-and-small-components_

undo() calls `api.unlinkNodes(this.nodeId, this.linkedToId)` before deleting, but execute() (used for redo) only recreates the node via `api.createNode(...)` and never re-links to linkedToId. After undo -> redo, the link is permanently lost, yet the command still holds linkedToId, so a second undo will call unlinkNodes for a link that no longer exists. Note the feature is currently latent: grep shows the only production construction site (src/composables/useNodeOperations.ts:205) never passes linkedToId — it is exercised only by tests (src/**tests**/commands/CreateCommand.test.js, commandFactory.test.js), so linkedToId is effectively a test-only code path.

**Fix:** In execute(), after createNode, call `if (this.linkedToId) await api.linkNodes(this.nodeId, this.linkedToId)` to make execute/undo symmetric — or drop the linkedToId option entirely since no production caller uses it.

### `src/components/GraphView.vue:268` — Collapse-button document listener is never removed and breaks collapse after remount

_Category: correctness · group: components-A_

`attachCollapseHandlers()` adds an anonymous capture-phase `mousedown` listener on `document`, guarded only by the per-instance flag `globalCollapseHandlerAttached`, and `onUnmounted` never removes it. When GraphView unmounts (e.g. switching graph → cards → graph), the stale listener stays registered: it still matches `.collapse-btn`, calls `e.preventDefault()/stopPropagation()/stopImmediatePropagation()`, but its closed-over `cy` was set to null on unmount so `toggleNodeCollapse` is a no-op. Because it was registered first, `stopImmediatePropagation()` prevents the new instance's listener from ever running — collapse buttons stop working after the first remount, and one listener leaks per mount. The comment at line 105 ('Named handlers so they can be removed on unmount') shows the file's own convention that this function violates.

**Fix:** Store the handler in a named function/variable, add it in onMounted (or attachCollapseHandlers), and remove it in onUnmounted like the other document listeners; drop the misleading 'global' guard.

### `src/components/GraphView.vue:550` — Type-filter wiring to GraphControls is dead: prop and events do not exist on the child

_Category: dead-code · group: components-A_

GraphView binds `:visible-types="visibleTypes"` and `@toggle-type`, `@select-all-types`, `@select-no-types` on <GraphControls> (template lines 777, 787-789), but GraphControls.vue declares neither a `visibleTypes` prop nor any of those emits — type filtering moved to TypeFilterDropdown.vue, which talks to the filters store directly. Consequently `toggleTypeFilter`, `selectAllTypes`, and `selectNoTypes` (lines 550-558) can never be invoked, and the prop lands as an unused fallthrough attribute.

**Fix:** Delete the three handler functions and the four stale bindings on <GraphControls>.

### `src/components/PersonsView.vue:96` — Sorting by the Organization column compares the deprecated, always-empty 'organization' field

_Category: correctness · group: components-B_

personsGridColumns.js marks column id 'organization' sortable, and sortedPersons sorts via `a[sortBy.value]`. But savePerson always writes `organization: ''` ("Deprecated - now using linked organizations") and the table cell displays getOrganizationsForPerson() from links instead. So clicking the Organization header sorts on an empty string for every row — a no-op that doesn't match what's displayed.

**Fix:** Sort by the joined linked-organization titles for that column, or mark the column sortable: false.

### `src/components/PersonsView.vue:372` — Ternary with identical branches breaks ArrowDown bound when an exact org match exists

_Category: correctness · group: components-B_

`const max = exactOrgMatch.value ? filteredOrganizations.value.length : filteredOrganizations.value.length` — both branches are the same. When an exact match exists, the '+ Create' option is not rendered (v-if="!exactOrgMatch"), yet ArrowDown can still move selectedOrgIndex to `length` (the nonexistent create-option slot); pressing Enter there does nothing (index < length is false and the create branch is guarded by !exactOrgMatch), so keyboard selection dead-ends past the last visible option.

**Fix:** Use `const max = exactOrgMatch.value ? filteredOrganizations.value.length - 1 : filteredOrganizations.value.length`.

### `src/components/TypeFilterDropdown.vue:24` — CSS variable --type-org-text is never defined; organization indicator renders unstyled

_Category: correctness · group: components-C_

The organization entry uses `color: 'var(--type-org-text)'`, but no stylesheet defines `--type-org-text` (grep over src/ finds no definition); the defined variable is `--type-organization-text` (src/style.css:66), which every other type entry's naming pattern matches. The organization type-indicator swatch in the dropdown therefore gets an empty background. The same undefined variable is also referenced in src/style.css:1291 and src/components/CardsView.css:892 (outside this module group).

**Fix:** Change to var(--type-organization-text), or add a --type-org-text alias in style.css and fix the other two references.

### `src/components/config/tableFormatters.js:13` — formatDate duplicated in four places with divergent empty-value behavior

_Category: consistency · group: commands-and-small-components_

tableFormatters.js formatDate returns '' for a missing date; src/composables/useTaskFiltering.js:308 has an identical split('T')[0] copy that returns '-'; src/utils/formatting.js:22 exports another formatDate; src/utils/tooltip.js:20 has a private fourth. TableView and TasksView therefore render missing dates differently ('' vs '-'), and any future format change must be made in four places.

**Fix:** Consolidate on one exported formatDate (src/utils/formatting.js is the natural home) with an explicit emptyPlaceholder argument, and import it from tableFormatters, useTaskFiltering, and tooltip.

### `src/composables/useAutocomplete.js` — Entire composable is unused and its docstring names non-existent consumers

_Category: dead-code · group: composables-A_

`useAutocomplete` has zero references anywhere in src/, electron/, or src/**tests** (grep confirmed; only the defining file matches). The header docstring claims 'Used by PersonDetailForm (organization linking) and OrganizationDetailForm (member linking)', but neither component exists in the tree (only PersonsView.vue). The whole file is a dead, untested code path.

**Fix:** Delete src/composables/useAutocomplete.js, or if autocomplete is planned for PersonsView/DetailPanel, wire it in and add tests; at minimum fix the docstring.

### `src/composables/useContextMenu.ts:37` — MoveToWorkspaceParams.workspaceId typed number but workspace ids are strings

_Category: typing · group: commands-and-small-components_

`workspaceId: number` in MoveToWorkspaceParams (line 37) and `onMoveToWorkspace?: (nodeId: number, workspaceId: number)` (line 71) contradict the rest of the codebase: workspaces.id is TEXT in SQLite, useWorkspace.ts defines `WorkspaceId = string | number`, and WorkspaceList.vue emits ws.id strings ('work', 'private'). The mismatch is invisible to vue-tsc only because NodeContextMenu.vue forwards the value through an untyped JS emit chain.

**Fix:** Use the WorkspaceId type (string | number) from useWorkspace.ts in both the interface and the callback signature.

### `src/composables/useDetachedWindow.js:44` — closeDetachedWindow never called; window:closeDetached IPC chain is renderer-unreachable

_Category: dead-code · group: composables-A_

`closeDetachedWindow` has no callers in any component or test (App.vue destructures only openDetachedWindow/broadcastNodeUpdate/broadcastNodeDelete/onMessage; DetachedView uses broadcast + onMessage). The full IPC chain exists — WINDOW_CLOSE_DETACHED defined in electron/ipcChannels.js:144, handled in electron/ipc/window.js:123, exposed in electron/preload.js:108 — but per the project's IPC-sync rule an exposed channel that is never invoked from the renderer is a real finding: the only renderer call site is this dead wrapper.

**Fix:** Either wire a close action (e.g. closing a detached node from the main window) to closeDetachedWindow, or remove the wrapper together with the preload exposure, handler, and channel constant.

### `src/composables/useDetachedWindow.js:83` — broadcastNavigation is never called and no receiver handles 'navigate' messages

_Category: dead-code · group: composables-A_

`broadcastNavigation` is exported from useDetachedWindow but grep over src/, electron/ and src/**tests** finds no caller ('navigate' hits elsewhere are unrelated Vue component events). Additionally, neither of the two onMessage consumers (useAppLifecycle.setupDetachedMessageHandler, which handles only 'node-updated' and 'node-deleted', nor DetachedView.vue) handles a message with `type: 'navigate'`, so even if it were called the broadcast would be ignored.

**Fix:** Remove broadcastNavigation (and its return-object entry), or implement the 'navigate' message handling it was designed for.

### `src/composables/useGraphLayout.js:2` — Unused constants and unreachable LAYOUTS.relax / LAYOUTS.continuous entries

_Category: dead-code · group: composables-B_

`EDGE_LENGTH` (line 2), `NODE_COUNT_THRESHOLDS` (line 11) and `NODE_SPACING` (line 17) are module-private and referenced nowhere else in the file. `LAYOUTS.relax` (line 289, an exact duplicate of LAYOUTS.tree) and `LAYOUTS.continuous` (line 304) are unreachable: layout modes are only ever set to tree/horizontal/radial/grid/circle (GraphControls.vue:36-85), and `relaxLayout()`/`startContinuousRelax()` build their own inline cola configs instead of using LAYOUTS.continuous. `MIN_NODE_WIDTH`/`MIN_NODE_HEIGHT` are used only inside the dead `continuous` entry. Only useGraphLayout.test.js:99-107 asserts these entries exist, which keeps them alive despite having no runtime path.

**Fix:** Delete EDGE*LENGTH, NODE_COUNT_THRESHOLDS, NODE_SPACING, LAYOUTS.relax and LAYOUTS.continuous (with MIN_NODE*\* if then unused), and update the test that pins them; or make relaxLayout/startContinuousRelax actually consume the LAYOUTS entries.

### `src/composables/useNodePositions.js:165` — The useNodePositions() composable wrapper is never used anywhere

_Category: dead-code · group: composables-C_

Grep across src/, electron/, and src/**tests** shows only two consumers of this module: GraphView.vue imports the standalone functions (getPositionsKey, loadNodePositions, saveNodePositions) directly, and useGraphUpdate.js imports findSmartPosition. The wrapper `export function useNodePositions(options = {})` (lines 165-194), including its getKey/load/save/findPosition closures, is never called by any file or test.

**Fix:** Delete the useNodePositions() wrapper and keep the module as plain utility exports (or rename the file to utils/ accordingly).

### `src/composables/useNodeTable.js` — cellsAsMatrix, saveCells, clearAllCells, addRows, addColumns, getColumnName have no production callers; getColumnName is a verbatim duplicate

_Category: dead-code · group: composables-C_

The only production consumer of useNodeTable() is DetailPanel.vue, which destructures table, cells, hasTable, loadTable, createTable, updateTable, deleteTable, saveCell, saveCellStyle. Grepping src/, electron/, and src/**tests** shows cellsAsMatrix, saveCells, clearAllCells, addRows, addColumns, and getColumnName are referenced only by useNodeTable.test.js. Moreover, getColumnName (lines 277-285) is character-for-character identical to getColumnName in src/utils/spreadsheetFormulas.js (which NodeSpreadsheet.vue uses), and TableMiniature.vue carries a third inline copy — three implementations of the same A..Z/AA.. helper.

**Fix:** Remove the production-unused API surface (and its tests) or wire the spreadsheet UI to actually use it; either way, delete the duplicated getColumnName and import the one from utils/spreadsheetFormulas.js.

### `src/composables/useSettings.ts:244` — initSettings unconditionally replaces an already-created settingsInstance, orphaning early callers' refs

_Category: correctness · group: composables-C_

useSettings() has a fallback that creates settingsInstance (from localStorage, since settingsCache is still null) when called before initSettings completes. initSettings then executes `settingsInstance = createSettingsRefs()` unconditionally, replacing that instance. Any component/composable that called useSettings() early keeps refs to the orphaned instance: its watchers still persist writes, but later callers read/write a different set of refs — two disconnected sources of truth for the same settings keys in one app run.

**Fix:** In initSettings, only create the instance if one does not already exist (`if (!settingsInstance) settingsInstance = createSettingsRefs()`), or re-hydrate the existing instance's refs from the freshly loaded cache instead of replacing the object.

### `src/composables/useTaskFiltering.js:16` — getHideSensitive option is accepted, documented, and passed by the consumer but never used

_Category: dead-code · group: composables-D_

`export function useTaskFiltering({ getWorkspaceId, getContainerId, getHideSensitive })` destructures getHideSensitive and the JSDoc documents it, but the function body never references it. TasksView.vue:19 passes `getHideSensitive: () => props.hideSensitive` expecting it to have an effect, and nothing downstream in TasksView applies sensitive handling either. The API name promises behavior that does not exist (naming honesty), and any future reliance on hide-sensitive in the tasks view will silently do nothing. Verified by grep: getHideSensitive appears in this file only at the signature/doc; the only functional use in the codebase is in useNodeTooltip.js.

**Fix:** Either implement the intended behavior (e.g. skip sensitive note content in task rows) or remove the option from the signature, the JSDoc, and the TasksView.vue call site.

### `src/services/nodeCache.js:262` — getNodeCache / resetNodeCache singleton API is completely unreferenced

_Category: dead-code · group: services-stores-utils_

`getNodeCache()` and `resetNodeCache()` (lines 262-275) have zero references in src/, electron/, or src/**tests** — even nodeCache.test.js only tests `createNodeCache`. The one real consumer (src/composables/useDataLoading.ts:80) builds its own instance via `createNodeCache`, so the "default singleton for app-wide use" is dead code, and the module-level `defaultCache` state with it.

**Fix:** Remove getNodeCache, resetNodeCache, and the defaultCache variable; keep createNodeCache as the sole export.

### `src/services/openaiService.js:22` — handleResponseError leaks JSON parse errors on non-JSON error bodies

_Category: correctness · group: services-stores-utils_

In `handleResponseError`, the catch clause is `if (e.message && !e.message.includes('API error')) throw e`. When the server returns a non-JSON error body (e.g. an HTML 502 page from a proxy), `response.json()` throws a SyntaxError like "Unexpected token '<'..."; that message does not contain 'API error', so the parse error is rethrown verbatim and the user sees "Unexpected token '<'" instead of "API error: 502 Bad Gateway". The sibling ollamaService.handleResponseError guards correctly by whitelisting only its own intentional error (`if (e.message.includes('Model not available')) throw e`). Additionally, `new Error(data.error.message || data.error)` yields "[object Object]" when data.error is an object without .message.

**Fix:** Mirror the ollama pattern: mark the intentionally-thrown error (custom class or flag) and only rethrow that, letting parse failures fall through to the generic `API error: <status>` throw. Guard `data.error.message || JSON.stringify(data.error)` for object payloads.

### `src/stores/filters.js` — Seven filters-store members are never used outside the store

_Category: dead-code · group: services-stores-utils_

Grepping all of src/, electron/, and src/**tests** for `filtersStore.<member>` and destructuring shows the only consumed members are visibleTypes, maxDepth, isDirty-setters aside, hasTypeFilter, hiddenTypesCount, syncedFromId, toggleType, setVisibleTypes, setMaxDepth, showAllTypes, syncFromNode. Never referenced anywhere: getters `isTypeVisible` (line 31), `allTypes` (36), `hasDepthFilter` (49), `hasActiveFilter` (54); actions `resetToDefaults` (97, identical effect to showAllTypes plus maxDepth reset) and `filterNodes` (147); and state `isDirty` (21) is written by every action but read by nothing. `filterNodes` also duplicates the type-filter logic that actually runs in src/composables/useNodeFiltering.js:207 (applyTypeFilterRecursive), so the live and dead implementations can drift.

**Fix:** Delete isTypeVisible, allTypes, hasDepthFilter, hasActiveFilter, resetToDefaults, filterNodes, and isDirty (and the isDirty writes in each action), or wire them to real consumers if they were meant to be used.

### `src/types/events.ts` — All 25 event payload types except Position are unused

_Category: dead-code · group: app-shell-themes-types_

Grepped every export (NodeEventPayload, SelectionEventPayload, DragStartEventPayload, ... AIEventPayload) across src/ and electron/: zero usages outside src/types/. Only `Position` is consumed (3 files). The event system in the app passes ad-hoc payloads through Vue emits in JS components; none of these interfaces constrain anything, and like components.ts they can silently drift from the real emit payloads.

**Fix:** Reduce the file to `Position` (or move Position into node.ts/components) and delete the unused payload interfaces plus their barrel exports in index.ts.

### `src/types/node.ts:93` — Node.deleted declares a column that does not exist; has_table is missing

_Category: typing · group: app-shell-themes-types_

`deleted: boolean` ("Soft delete flag") — the nodes table has no `deleted` column; soft delete is implemented purely via `deleted_at TEXT` (electron/database/schema.js:81, all queries filter on `deleted_at IS NULL`). The row mapper spreads raw columns plus explicit conversions and never produces a `deleted` property, so the field is always absent at runtime. Conversely, the mapper does emit `has_table: Boolean(row.has_table)` (electron/database/index.js:267), used by CardsView.vue:382, but Node omits it (as well as address/category_id/status_id from the schema).

**Fix:** Remove `deleted`, keep `deleted_at`, and add `has_table: boolean` (plus the other real columns if the interface is meant to be complete).

### `src/types/node.ts:109` — graph_type_filter typed as GraphTypeFilter enum but is an array of node-type strings

_Category: typing · group: app-shell-themes-types_

`graph_type_filter: GraphTypeFilter | null` where GraphTypeFilter = 'all' | 'tasks' | 'notes' | 'persons' (line 31). At runtime the field is a JSON-parsed array of visible node types: the mapper does `JSON.parse(row.graph_type_filter)` (electron/database/index.js:250), and consumers check `Array.isArray(node?.graph_type_filter)` and spread it into visibleTypes (src/stores/filters.js:118-119, GraphView.vue:437-438); GraphView saves it as `JSON.stringify(v)` of the visibleTypes array (GraphView.vue:409). The GraphTypeFilter union is used nowhere outside src/types/ and describes a shape that no longer exists.

**Fix:** Change to `graph_type_filter: NodeType[] | null` (also in UpdateNodeData line 164) and delete the GraphTypeFilter type + its barrel export.

## Appendix — unverified lower-confidence notes

These 115 findings were reported by reviewers but not adversarially verified (low severity is not verified by default). Treat as leads, not confirmed defects.

- **[low/consistency]** `electron/agentConfig.js:15` — Garbage-response detection exists only in the main-process agent loop, not the renderer twin
- **[low/dead-code]** `electron/database/migrations.js:373` — migrations.js exports 10 internal migration functions that nothing imports
- **[low/consistency]** `electron/database/search.js:211` — getTasks does not handle parentId: null, unlike getNodes' parent_id handling
- **[low/dead-code]** `electron/database/settings.js:81` — clearSettings is defined and bound but never exposed over IPC, never called, never tested
- **[low/consistency]** `electron/database/tags.js:60` — getOrCreateTagNode writes JS ISO timestamps while every other write path uses SQL CURRENT_TIMESTAMP/datetime('now')
- **[low/consistency]** `electron/database/tree.js:51` — getRoots logs to console on every call, unlike all other query operations
- **[low/dead-code]** `electron/database/tree.js:71` — getInbox, getProjects and repairWorkspaces are wired through the full IPC chain but never called by any renderer code or test
- **[low/correctness]** `electron/database/workspaces.js:42` — createWorkspace turns an explicit sort_order of 0 into 99
- **[low/consistency]** `electron/ipc/agent.js` — Main-process agent diverges from its renderer twin (no garbage-response fallback in web build)
- **[low/dead-code]** `electron/ipc/agent.js:254` — Exports executeAgentTool, fallbackResearch, runAgentLoop are never imported
- **[low/dead-code]** `electron/ipc/httpClient.js:225` — HttpClient class export is unused outside the module
- **[low/docstring]** `electron/ipc/ollama.js:74` — Stale comment: ollamaRequest is consumed by llmProvider, not the agent module
- **[low/dead-code]** `electron/ipc/window.js:142` — Exports createDetachedWindow and detachedWindows are never imported
- **[low/docstring]** `electron/preload.js` — Undocumented forced duplication of every IPC channel string
- **[low/docstring]** `electron/wikipedia.js:11` — JSDoc says httpRequest comes 'from main.js' but it lives in ipc/httpClient.js
- **[low/dead-code]** `electron/wikipedia.js:57` — Exported constants WIKIPEDIA_ACTION_API and WIKIPEDIA_REST_API are never imported
- **[low/consistency]** `shared/agentConfig.json` — TOOL_GROUPS mapping is duplicated in both processes instead of living in the shared config
- **[low/dead-code]** `shared/agentConfig.json:40` — garbagePatterns entries '<|channel|>' and '<|constrain|>' are unreachable
- **[low/design]** `src/App.vue` — File exceeds the ~1000 LOC guideline (1132 lines)
- **[low/dead-code]** `src/App.vue:633` — Unused destructured bindings: createNodeAtPosition and resetNavigationState
- **[low/dead-code]** `src/__tests__/GraphView.layout.test.js:27` — cytoscape and extension mocks are dead setup
- **[low/naming]** `src/__tests__/api.test.js:5` — 'filterNulls helper' describe never tests filterNulls; first test name asserts the opposite of its expectation
- **[low/design]** `src/__tests__/commandFactory.test.js:18` — fromJSON coverage omits the registered 'ollama-improve-notes' type
- **[low/dead-code]** `src/__tests__/helpers/testDatabase.js:587` — createNodeFactory's `person` helper is never used
- **[low/design]** `src/__tests__/keyboard-shortcuts.test.js:15` — 'Delete shortcut' block tests a local reimplementation instead of the composable
- **[low/consistency]** `src/__tests__/nodeTable.test.js:248` — 'useNodeTable composable' block duplicates useNodeTable.test.js
- **[low/consistency]** `src/__tests__/ollamaService.test.js:8` — global.fetch replaced by direct assignment and never restored
- **[low/consistency]** `src/__tests__/undo-redo-workflows.test.js:435` — onError test creates a useUndoRedo instance with persistence enabled
- **[low/correctness]** `src/__tests__/useDataLoading.test.js:60` — Vacuous assertion: expect(api.getDescendants).toBeUndefined() checks the mock, not the code
- **[low/consistency]** `src/__tests__/useMentions.test.js:31` — getComputedStyle replaced globally without restore; saved original never used
- **[low/dead-code]** `src/__tests__/useNodeActionsUI.test.js:2` — Unused imports: provide and inject
- **[low/dead-code]** `src/__tests__/useNodeTooltip.test.js:2` — Unused import: ref
- **[low/dead-code]** `src/__tests__/useRefresh.test.js:2` — Unused import: nextTick
- **[low/naming]** `src/__tests__/useSearch.test.js:371` — Test name references non-existent option 'onFetchBreadcrumbs'
- **[low/design]** `src/__tests__/useSelection.test.js:365` — Pin-protected selection tests exercise a local re-implementation, not App.vue
- **[low/correctness]** `src/__tests__/useSnapshots.test.js:177` — Vacuous assertion: sync not.toThrow on an async function
- **[low/consistency]** `src/__tests__/useToast.test.js:12` — Fake timers enabled but never restored in afterEach
- **[low/dead-code]** `src/components/CardsView.vue:4` — Unused import decodeHtml
- **[low/dead-code]** `src/components/CardsView.vue:164` — getDueDateStatus is never called
- **[low/consistency]** `src/components/CardsView.vue:426` — nestedGridStyle called with a stray second argument
- **[low/consistency]** `src/components/DetailPanel.vue:382` — changeWorkspace double-saves and emits the reactive proxy
- **[low/dead-code]** `src/components/GraphEditModal.vue:43` — defineExpose({ editTitleInput, editModalEl }) is never consumed
- **[low/dead-code]** `src/components/GraphPromptModal.vue:35` — defineExpose({ inputRef }) is never consumed
- **[low/dead-code]** `src/components/GraphView.vue:6` — Unused import ALL_NODE_TYPES
- **[low/dead-code]** `src/components/GraphView.vue:61` — Declared emits 'toggle-complete', 'toggle-favorite', 'open-link-search' are never emitted
- **[low/correctness]** `src/components/MainToolbar.vue:37` — Theme tooltip content function is evaluated once by tippy, so the label goes stale after cycling
- **[low/consistency]** `src/components/MainToolbar.vue:169` — Completed-visibility button: visual active state and aria-pressed are inverted relative to each other
- **[low/dead-code]** `src/components/MarkdownRenderer.vue:147` — onMounted(renderContent) duplicates the immediate watch, rendering everything twice on mount
- **[low/dead-code]** `src/components/NotesEditor.vue:180` — Exposed replaceSelection() is never called anywhere
- **[low/dead-code]** `src/components/OllamaDiffPreview.vue:11` — 'edit' event is declared in defineEmits but never emitted
- **[low/correctness]** `src/components/OnboardingModal.vue:65` — Onboarding tip documents a non-existent shortcut (modifier+/) for the shortcuts modal
- **[low/dead-code]** `src/components/PersonsView.vue:22` — selectedId prop and 'update' emit are declared but never used
- **[low/dead-code]** `src/components/PersonsView.vue:204` — \_orgIds Set is computed and never used
- **[low/consistency]** `src/components/SettingsPanel.vue:3` — Mixed import specifiers for the api service ('../services/api.js' vs '../services/api')
- **[low/correctness]** `src/components/SidebarTreeItem.vue:44` — Expand toggle still shown for nodes at maxLevel whose children can never render
- **[low/consistency]** `src/components/SpotlightSearch.vue:8` — searchMode default 'navigate' is not a real mode value
- **[low/consistency]** `src/components/SpotlightSearch.vue:153` — Recents list shows keyboard-style selection highlight that Enter/arrows cannot act on
- **[low/dead-code]** `src/components/TableView.vue:27` — Prop currentParentId is declared but never used
- **[low/dead-code]** `src/components/TableView.vue:40` — 'toggle-favorite' declared in defineEmits but never emitted
- **[low/dead-code]** `src/components/TasksView.vue:13` — 'select' declared in defineEmits but never emitted
- **[low/consistency]** `src/components/TasksView.vue:47` — getTaskRowStyle duplicates tableFormatters.getRowStyle with a re-hardcoded magic color
- **[low/dead-code]** `src/components/TimelineView.vue:35` — \_getColorMap option passed to useTimelineLayout is never used
- **[low/dead-code]** `src/components/TypeFilterDropdown.vue:37` — Unused variable `hidden` in buttonLabel; store getter hiddenTypesCount now has no consumer
- **[low/naming]** `src/components/config/personsGridColumns.js` — Module name says grid columns but file holds misc persons-view config and helpers
- **[low/dead-code]** `src/components/config/personsGridColumns.js:61` — personsViewModes is exported but never used
- **[low/dead-code]** `src/components/config/tableFormatters.js:44` — getBadgeStyle is a vestigial no-op that always returns {}
- **[low/dead-code]** `src/components/detail/ChildrenSection.vue:110` — Person-item branch is unreachable
- **[low/correctness]** `src/components/detail/ColorPickerSection.vue:19` — Picker cannot set an initial color and vanishes when the default color is picked
- **[low/dead-code]** `src/components/detail/MetadataGridSection.vue:231` — Redundant person special-case for link icons
- **[low/consistency]** `src/components/detail/OrganizationDetailForm.vue:42` — loadLinkedMembers keeps vestigial async/try-catch around a synchronous filter
- **[low/dead-code]** `src/components/detail/OrganizationDetailForm.vue:75` — Dead onTagsUpdate function and unused currentWorkspace prop
- **[low/dead-code]** `src/components/detail/PersonDetailForm.vue:131` — Dead onTagsUpdate function and unused currentWorkspace prop
- **[low/consistency]** `src/components/detail/PersonDetailForm.vue:294` — Section order diverges between the two sibling detail forms
- **[low/dead-code]** `src/components/detail/index.js` — Barrel file is never imported
- **[low/dead-code]** `src/components/settings/AISettings.vue:62` — Fallback in `props.aiEnabled ?? props.ollamaEnabled` is unreachable
- **[low/consistency]** `src/components/settings/DataSettings.vue:40` — setTimeout(0) used where nextTick is the Vue idiom
- **[low/correctness]** `src/composables/useAIProviderConnection.js:42` — Debounce timers are never cleared on unmount
- **[low/typing]** `src/composables/useDataLoading.ts:140` — Repeated 'wsId as number' casts hide legitimate null workspace IDs
- **[low/correctness]** `src/composables/useDataLoading.ts:164` — loadSidebarTree drops root.completed when building child trees
- **[low/consistency]** `src/composables/useDataLoading.ts:233` — loadFavorites and loadTags swallow errors silently, unlike all sibling loaders
- **[low/docstring]** `src/composables/useGraphEvents.js:65` — useGraphEvents JSDoc documents unused getParent and omits used toggleTooltipLock
- **[low/dead-code]** `src/composables/useGraphSettings.ts:169` — radialSettings.gravityRange and nestingFactor are persisted but never consumed
- **[low/docstring]** `src/composables/useInlineEdit.js:10` — onSaveNotes doc omits the third { autoSave } argument; local const shadows Vue's ref import
- **[low/docstring]** `src/composables/useKeyboardShortcuts.js:142` — Cmd+Enter comment says 'cards/table view' but code checks cards/tree
- **[low/correctness]** `src/composables/useKeyboardShortcuts.js:232` — 'n' shortcut lacks a modifier guard, so Ctrl/Cmd/Alt+N also opens the add-node modal
- **[low/docstring]** `src/composables/useNavigation.ts:44` — onLeafNode doc says 'return true to prevent enter' but any non-false return prevents
- **[low/consistency]** `src/composables/useNavigation.ts:391` — navigateToBreadcrumb hardcodes 150ms where enterContainer uses SIDEBAR_HIDE_DELAY_MS
- **[low/dead-code]** `src/composables/useNodeFiltering.js:132` — useNodeFiltering() wrapper composable is never called
- **[low/correctness]** `src/composables/useNodeOperations.ts:225` — updateNode mutates its input object and mis-detects completion transitions when trackUndo is false
- **[low/dead-code]** `src/composables/useNodePositions.js:83` — findSmartPosition's nodeId parameter is never used
- **[low/docstring]** `src/composables/useNodeTooltip.js:117` — Comment claims tooltip is destroyed only 'if different node', but it is destroyed unconditionally
- **[low/naming]** `src/composables/useOllama.js:178` — Local variable named `ref` shadows Vue's imported ref in three functions
- **[low/consistency]** `src/composables/useRefresh.js:50` — refreshAfterDelete duplicates refreshAfterChange({ favorites: true }) line for line
- **[low/correctness]** `src/composables/useSearch.ts:159` — closeSearch does not cancel the pending debounce timer (and there is no unmount cleanup)
- **[low/dead-code]** `src/composables/useSettings.ts:390` — Redundant `if (!settingsInstance)` check in useSettings()
- **[low/consistency]** `src/composables/useSnapshots.js:127` — cleanup() is never invoked by production code and no onUnmounted is registered
- **[low/consistency]** `src/composables/useSpreadsheetClipboard.js` — File in composables/ named use\* but exports no composable
- **[low/dead-code]** `src/composables/useTaskFiltering.js:1` — Unused import: watch
- **[low/dead-code]** `src/composables/useTheme.js:122` — \_initTheme export claims 'for testing' but no test or source imports it
- **[low/docstring]** `src/composables/useTimelineDates.js:227` — calculateDueUrgency comment contradicts the code for 'due today'
- **[low/dead-code]** `src/composables/useTimelineLayout.js:40` — \_getColorMap parameter is never used, but is documented and actively passed by TimelineView
- **[low/design]** `src/composables/useTimelineLayout.js:353` — groupMarkers and projectBoxes duplicate identical nodeRowIndex/nodeData map construction
- **[low/consistency]** `src/composables/useTreeExpand.js:57` — expandAncestors mutates expandedIds without persisting, unlike every other mutator
- **[low/typing]** `src/services/api.ts:73` — exportMarkdown/exportCSV typed as Promise<string> but return objects
- **[low/correctness]** `src/services/api.ts:135` — request() spreads options after headers, so caller-supplied headers drop Content-Type
- **[low/dead-code]** `src/services/wikipediaService.js:49` — getSummary is never called
- **[low/dead-code]** `src/themes/light.css:877` — Duplicate [data-theme='light'] .context-menu block is fully shadowed
- **[low/dead-code]** `src/types/command.ts:10` — CommandType union is exported but never used
- **[low/typing]** `src/types/node.ts:115` — Node.graph_physics typed as boolean but holds a physics-settings object
- **[low/dead-code]** `src/types/settings.ts:30` — Nine settings interfaces are unused and AppSettings' docstring is stale
- **[low/dead-code]** `src/utils/constants.js:130` — getTypeIconHtml duplicates getTypeIcon; getTypeCssClass and getTypeLabel are test-only
- **[low/dead-code]** `src/utils/errorTypes.js` — ApiError, NotFoundError, ValidationError, DatabaseError are never instantiated
- **[low/dead-code]** `src/utils/nodeInteractions.js:63` — handleKeydown is only referenced by its test
- **[low/dead-code]** `src/utils/settingsConstants.ts` — Nine timing constants are unused
- **[low/consistency]** `src/utils/tooltip.js:13` — tooltip.js re-implements renderMarkdown and formatDate that exist in sibling utils

## Remediation review

After the 91 findings were fixed, three independent read-only agents re-reviewed the entire diff (electron/DB/services, components, composables/types/tests). They confirmed 14 further issues, all since fixed. The two most important were **regressions introduced by the fixes themselves** — neither caught by the 1355 tests that were green at the time.

### Regressions introduced by the remediation

| Where                                 | What                                                                                                                                                                                                                                                                                        | Why tests missed it                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/MarkdownRenderer.vue` | Removing the global entity-decode pass (a correct fix) left `processHashtags` running a regex over marked's serialized HTML. marked escapes `'` as `&#39;`, which the hashtag regex matched — so **every apostrophe rendered as a blue `#39` pill** in notes, code spans and mention names. | No markdown test input contained an apostrophe or any numeric entity. |
| `electron/database/tree.js`           | Enabling `PRAGMA foreign_keys` made `ON DELETE SET NULL` live, so `emptyTrash` silently NULLed the `parent_id` of **live** nodes whose parent was trashed, leaving stale `path`/`depth` and a node `getOrphanedNodes()` could not find.                                                     | No test covered `emptyTrash`; the helper had no such method.          |

`processHashtags` was replaced with a DOM text-node walk (entities are already decoded inside text nodes, so no character reference can be misread, and tags/attributes are structurally unreachable). `emptyTrash` and hard `deleteNode` now capture affected rows before the delete and recompute their subtree paths inside a batch.

### Fix that did not fix anything

The two-phase quit handshake acked **before** the save IPC was ever sent: `DetailPanel.saveChanges()` is synchronous (it only emits), and the update handler does an `api.getNode` round trip before `api.updateNode`. Only the 3 s main-process timeout was saving the data. The new test mocked `saveChanges` as a bare stub, so it passed regardless. `DetailPanel` now exposes an awaitable `saveChangesNow()`; the ack waits on the real `db:updateNode` round trip, and the rewritten test was verified to fail against the old code. The handshake also never engaged on the normal Linux/Windows window-close path (window destroyed before `before-quit`); a `close` hook now covers it.

### Other confirmed issues from the remediation review

- `updateNode` was still an unguarded reparent path (`parent_id` is an accepted field) — now recomputes subtree paths.
- SSL-verification bypass never applied to IPv6 loopback: `new URL('https://[::1]:…').hostname` keeps its brackets, while the error text advertised `::1` as supported.
- Timeline `add-child` forwarding was wired up but the payload `{ parentId, title: '', prompt: true }` fell through to a branch that passed the whole object as the parent id; the detail panel's "add subtask" button hit the same class of bug and silently created an **untitled** task.
- Onboarding modal's Enter both closed the modal and navigated into the selected node (document-bubble vs window listener ordering).
- `NodeSpreadsheet`'s new per-cell debounce map dropped every pending save on unmount instead of flushing.
- `@mention` person lists were scoped to a stale workspace, and detached windows always used `work`.
- Unescaped `customBgTint`/`borderColor` in the regular graph-node template (the person branch had been hardened, its sibling had not).
- Container filtering admitted the container into its own task list; radial layout could inject `undefined` settings; link-draw listeners were outside `teardownEvents`.

### Test-suite honesty

The remediation review found that the new DB "integration" tests asserted against a **mirror** of the production path/FK logic added to `src/__tests__/helpers/testDatabase.js` — the same replica anti-pattern this review had condemned and three deleted test files were removed for. The production modules turned out to import cleanly (nothing under `electron/database/` requires `electron`), so the helper's ~600-line mirror was deleted: `createTestDatabase()` now constructs the **real** `Database` against a temp file, and all pre-existing integration tests pass unchanged against production code.

Every regression test added in this round was validated by temporarily reverting its fix and confirming the test fails.
