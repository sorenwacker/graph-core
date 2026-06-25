# Codebase Review

Date: 2026-06-25
Scope: full reviewable source tree — `src/` and `electron/` non-test files: **201 source files,
~43k LOC** (excludes `__tests__`, generated JSON data, and CSS).
Method: 19 per-module-group reviewer agents read every file, followed by an adversarial verification
pass that attempts to refute every high/medium finding before it is reported. Low-severity findings are
listed as-is (not individually verified) in the appendix. This run supersedes the 2026-06-14 review;
the high-severity items fixed then are not re-listed here.

## Baseline gates

These are the project's own definition of "passing" (from `Makefile` / `package.json`). All gates were
run against the working tree on the review date.

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` (eslint) | Pass — 0 errors, 363 warnings (all `complexity` / `max-lines*`; not reported below) |
| Format | `npm run format:check` (prettier) | Pass — all files conform |
| Types | `npm run type-check` (vue-tsc) | Pass — no errors |
| Tests | `npm run test:run` (vitest) | Pass — 1383 tests / 71 files |
| File size (<1000 LOC) | project style rule | 1 violation — `src/App.vue` (1132 LOC) |

No `TODO` / `FIXME` / `HACK` markers exist anywhere in `src` or `electron`.

## Summary

The codebase is in good shape: every objective gate passes and the only static-rule breach is a single
oversized file. The review surfaced **97 candidate findings**; adversarial verification **confirmed 31**
(1 high, 16 medium, 14 corrected down to low), **refuted 2**, and left **64 lower-confidence notes**
unverified (appendix).

Recurring themes across the confirmed findings:

- **Tree-path/depth maintenance bugs in the SQLite layer.** Three node-mutation paths (`deleteNode`,
  `reparentToRoot`, and by extension the reassign-to-grandparent flow) recompute *descendant* paths but
  forget to reset the *moved/reassigned node's own* `path`/`depth`, unlike the correct `moveNode`. This
  is the highest-impact cluster — it silently corrupts the core tree invariant.
- **Unused "composable wrapper" and type surface.** Several modules expose a `useX()` wrapper or a whole
  `types/*.ts` file (`components.ts`, `events.ts`) that nothing imports — the code uses the raw named
  exports or runtime `defineProps`/`defineEmits` instead. Dead code per the project's own rule, and a
  drift hazard for the type files.
- **Single-source-of-truth gaps.** IPC channel strings are re-typed as literals in `preload.js` instead
  of importing `ipcChannels.js`; `tooltip.js` re-implements `renderMarkdown`/`formatDate` with divergent
  sanitization; API return types in `types/api.ts` / `services/api.ts` do not match the electron
  implementations.
- **Vue reactivity / lifecycle slips.** A missing `inheritColors` watcher, a non-allowed `setTimeout`
  template global, a debounce timer shared across spreadsheet cells, a keydown handler bound to a
  non-focusable modal div, and a `TagInput` consumed with a non-existent prop/event API.

## Refuted findings (verified false)

These were raised by a reviewer but the adversarial verifier could not confirm them against the code:

- `src/components/DetailPanel.vue`:385 — "changeWorkspace emits the live reactive proxy instead of a toRaw copy".
- `src/main.js`:53 — "bootstrap() promise rejection is unhandled; initSettings failure silently aborts app mount".

## Confirmed findings

Severity reflects the verifier's corrected value. Each finding cites file:line and the exact code.

### HIGH (1)

#### `electron/database/nodes.js`:214 — deleteNode leaves reassigned children with stale path and depth
*Category: correctness*

deleteNode() reassigns a deleted node's children to the grandparent with a bulk `UPDATE nodes SET parent_id = ? WHERE parent_id = ?` (line 218) that updates only parent_id, NOT depth/path. It then calls `updateDescendantPaths(child.id)` for each reassigned child (lines 229-231). But updateDescendantPaths(nodeId) (lines 62-73) only recomputes the path/depth of the node's CHILDREN based on the node, and never the node itself. So the reassigned children keep their old `path` (which still contains the now-deleted node's id, e.g. `grandparent.id/deletedNode.id`) and their old, inflated `depth`. Their grandchildren are then recomputed from that stale path, propagating the corruption down the subtree. Compare moveNode() (lines 243-267) which explicitly sets the moved node's own depth/path before calling updateDescendantPaths(id). Effect: getDescendants(grandparent) still finds the child by LIKE-prefix, but the child's `depth` is one level too deep and its `path` references a deleted node, corrupting depth-based features, getDescendants(maxDepth) caps, and getAncestors ordering.

**Fix:** Recompute each reassigned child's own depth/path relative to newParentId before recursing. Simplest correct form: call ctx.moveNode(child.id, newParentId) per reassigned child (which sets parent_id/depth/path and updates descendants), or, for a non-null newParentId, call updateDescendantPaths(newParentId) once (it recomputes its children's path/depth); handle the newParentId === null (root) case by setting path='' and depth=0 on each reassigned child.

### MEDIUM (16)

#### `electron/database/index.js`:48 — Failed database load silently replaces file with an empty DB (data-loss risk)
*Category: correctness*

In _init() (lines 41-55), if reading/parsing an existing db file throws, the catch block logs the error and assigns `this.db = new SQL.Database()` (an empty DB). Initialization then proceeds and any subsequent write calls _save() (lines 167-176), which does `fs.writeFileSync(this.dbPath, ...)` over the original file. A transiently unreadable or partially-corrupt-but-recoverable database file is thus overwritten with an empty database on the next write, destroying recoverable data with no backup.

**Fix:** On load failure, copy the existing file to a timestamped .corrupt/.bak path before creating a fresh DB (the codebase already has backup() machinery), or refuse to overwrite the original until the user confirms.

#### `electron/database/links.js`:36 — linkNodes documented as 'bidirectional' but stores a single directed row; unlink is directional
*Category: docstring*

linkNodes' JSDoc says 'Creates a bidirectional link between two nodes', but the implementation inserts exactly one row `(source_id, target_id)`. Read paths (getAllLinks, getLinkedNodes, getNodesLinkedToTag) query both directions so links behave bidirectionally on read, yet unlinkNodes deletes only `source_id = ? AND target_id = ?` (its own docstring admits this). A caller that obtained a neighbor via getLinkedNodes (which does not preserve direction) and calls unlinkNodes with the arguments reversed will silently fail to remove the row, leaving a dangling link. The 'bidirectional' wording is inaccurate and masks this asymmetry.

**Fix:** Correct the docstring to state a single directed row is stored, and make unlinkNodes delete both directions (`(source_id=? AND target_id=?) OR (source_id=? AND target_id=?)`) to match the bidirectional read semantics.

#### `electron/database/tree.js`:169 — reparentToRoot does not reset the node's own path/depth
*Category: correctness*

reparentToRoot(nodeId) runs `UPDATE nodes SET parent_id = NULL` then `ctx._updateDescendantPaths(nodeId)`. As with deleteNode, _updateDescendantPaths only fixes the node's descendants based on the node's CURRENT path/depth; it never updates the node itself. So after reparenting to root the node still has its old non-empty `path` (referencing former ancestors) and non-zero `depth`, and its descendants are recomputed from that stale path. This is a buggy partial reimplementation of moveNode(nodeId, null), which correctly sets depth=0 and path='' first (nodes.js lines 247-264). getAncestors() on the reparented node will then return stale/old ancestors, and depth-based UI is wrong.

**Fix:** Delegate to ctx.moveNode(nodeId, null) instead of manually clearing parent_id, or set path='' and depth=0 on the node before calling _updateDescendantPaths(nodeId).

#### `electron/ipc/httpClient.js`:109 — skipSslVerification silently ignored for non-localhost hosts and suppresses the SSL hint
*Category: correctness*

request() routes to requestWithNode() whenever skipSslVerification is true and the URL is https, but requestWithNode() sets `rejectUnauthorized: !HttpClient.isLocalhost(urlObj.hostname)`. For any non-localhost host the flag therefore has NO effect — verification is still enforced. The public request() JSDoc advertises `skipSslVerification - Skip SSL certificate verification` with no localhost caveat, and the AI settings UI exposes it generally, so a user with a remote self-signed endpoint (e.g. a corporate OpenAI-compatible proxy) who enables the setting will still fail to connect. Worse, requestWithNode() calls handleRequestError(error, connectionError, false) with includeSslHint=false, so after enabling the setting the user no longer even gets the 'For self-signed certificates, enable Skip SSL verification in settings' hint that the requestWithNet() path (includeSslHint=true) would have shown. Net effect: enabling the option makes the failure mode worse, not better, for remote hosts.

**Fix:** Either honor skipSslVerification for any host when explicitly set (set rejectUnauthorized=false when skipSslVerification is true regardless of hostname), or, if localhost-only bypass is intentional, document that limitation on request()'s JSDoc and keep the SSL hint enabled in the requestWithNode error path.

#### `electron/preload.js`:6 — preload.js hardcodes IPC channel strings instead of importing ipcChannels.js constants
*Category: consistency*

The entire electron main side (main.js, electron/ipc/database.js, ollama.js, openai.js, agent.js, window.js) imports channel names from ipcChannels.js (e.g. ipcMain.handle(DB_GET_NODES, ...)). preload.js is the one place that re-types every channel as a raw literal: getNodes: params => ipcRenderer.invoke('db:getNodes', params), onMenuUndo: callback => ipcRenderer.on('menu-undo', callback), etc. ipcChannels.js already exports DB_GET_NODES='db:getNodes', MENU_UNDO='menu-undo', and the rest. Because the two halves of every channel are defined independently, renaming a constant in ipcChannels.js silently breaks the renderer with no compile/lint error - the two sides just stop matching at runtime.

**Fix:** Import the constants from ./ipcChannels in preload.js and use them in every invoke/on call so the channel name has a single source of truth.

#### `src/components/GraphView.vue`:660 — props.inheritColors has no watcher, so toggling color inheritance does not rebuild the graph
*Category: correctness*

inheritColors is declared as a prop (line 41) and is consumed by the graph element builder via getProps() -> props.inheritColors in useGraphUpdate.js (line 47). App.vue binds it reactively (:inherit-colors="inheritColors", App.vue line 928). However GraphView watches ancestorColor (watch(() => props.ancestorColor, debouncedUpdateGraph), line 660) and many other display props, but there is NO watcher on props.inheritColors. Toggling the 'inherit colors' setting therefore does not trigger updateGraph/rebuild, so node colors remain stale until some other change (nodes/parent/etc.) happens to re-run the update. This is inconsistent with the sibling ancestorColor prop which IS watched.

**Fix:** Add watch(() => props.inheritColors, debouncedUpdateGraph) alongside the existing ancestorColor watch.

#### `src/components/NodeSpreadsheet.vue`:358 — Shared debounce timer can drop cell edits during rapid multi-cell editing
*Category: correctness*

`onCellValueChanged` uses a single module-scoped `saveTimeout` with a 300ms debounce: `if (saveTimeout) clearTimeout(saveTimeout); saveTimeout = setTimeout(...)`. Each new cell-value-changed event cancels the previously scheduled save. If a user commits edits to several different cells within 300ms (e.g. tabbing A→B→C), only the last cell's `cell-change` is emitted; the earlier cells' changes are silently lost. Debouncing across distinct cells is incorrect because each event carries a different (row,col,value).

**Fix:** Do not debounce across cells: either emit immediately per change, or key the pending timers by cell, or flush the pending save before scheduling a new one for a different cell.

#### `src/components/OnboardingModal.vue`:121 — Esc/Enter keydown handler on a non-focusable modal div never fires
*Category: consistency*

`handleKeydown` is bound via `@keydown="handleKeydown"` on the `.modal` div, but the modal contains no auto-focused element (unlike AddNodeModal, whose input is focused on open, making its identical pattern work). A plain div without tabindex is not focusable, so focus stays on document.body and the keydown never reaches the handler — Esc/Enter-to-close silently does nothing. KeyboardShortcutsModal explicitly documents and fixes this exact problem by attaching a document-level keydown listener while visible.

**Fix:** Mirror KeyboardShortcutsModal: register/unregister a document keydown listener on the `visible` watcher (with onUnmounted cleanup), or focus an element inside the modal on open.

#### `src/components/PersonsView.vue`:554 — Template @blur uses setTimeout, which is not an allowed Vue template global
*Category: correctness*

The organization input has `@blur="setTimeout(() => (showOrgDropdown = false), 200)"`. Vue 3 `<script setup>` compiles bare template identifiers in inline mode as `_ctx.setTimeout`. `setTimeout` is NOT in Vue's allowed-globals whitelist (which is Math, Date, JSON, etc.), and no `app.config.globalProperties.setTimeout` is registered anywhere in src/. At runtime `_ctx.setTimeout` is `undefined`, so the blur handler throws a TypeError and the intended delayed-close behavior never runs. The dropdown close-on-blur is effectively broken.

**Fix:** Move the delayed close into a script-setup method (e.g. `function closeOrgDropdownDelayed() { setTimeout(() => { showOrgDropdown.value = false }, 200) }`) and bind `@blur="closeOrgDropdownDelayed"`.

#### `src/components/PersonsView.vue`:607 — TagInput consumed with a non-existent prop/event API; tag editing is dead
*Category: correctness*

PersonsView uses `<TagInput :tags="editingPerson.tags || []" @update="editingPerson.tags = $event" />`, but TagInput.vue declares no `tags` prop and no `update` emit. Its actual API is `nodeId` (required Number), `workspaceId`, `linkedTags`, emitting `link`/`unlink`/`refresh`. Because the required `nodeId` is never passed, every TagInput action is guarded out (`if (!props.nodeId) return` in addTag/createAndAddTag/removeTag), so the person edit form's tag field is completely non-functional and Vue logs a missing-required-prop warning. The other two consumers (detail/TagsSection.vue, detail/MetadataGridSection.vue) use the correct `:node-id`/`:linked-tags`/@refresh contract.

**Fix:** Either update PersonsView to pass node-id/workspace-id/linked-tags and listen to refresh, or build a tags-array-based variant if the person form genuinely needs detached tag editing.

#### `src/components/settings/DataSettings.vue`:61 — Import feedback uses native alert() instead of the app toast system
*Category: consistency*

handleImportFile reports both success and failure via native dialogs: `alert(`Imported ${result.nodesImported} nodes...`)` and `alert(`Import failed: ${err.message}`)`. The codebase has a dedicated toast system (ToastContainer.vue / useToast) and a useErrorHandler composable used by sibling components (e.g. SettingsPanel.vue imports useErrorHandler). Using blocking native alerts here is inconsistent with the established feedback pattern and produces a jarring UX.

**Fix:** Emit a toast via useToast()/useErrorHandler for success and failure rather than calling alert().

#### `src/composables/useNodeActionsUI.ts`:479 — deleteSelectedNodes diverges from deleteMultipleNodes (no confirm, no navigation, no tasks reload)
*Category: consistency*

deleteSelectedNodes (the keyboard-shortcut path, called from useKeyboardShortcuts.js) calls nodeOps.deleteMultipleNodes then only `refreshAfterDelete()`. The sibling deleteMultipleNodes for the same operation additionally: (a) shows a confirm dialog for >1 node, (b) navigates away if the current container/breadcrumb was deleted, and (c) calls `viewRendererRef.value.loadTasks()` after refresh. refreshAfterDelete (useRefresh.js line 50) does NOT reload the Tasks view, so deleting tasks via keyboard in the Tasks view leaves the deleted rows visible until another action, and deleting the current container via keyboard skips the redirect (blank-view risk noted in project memory).

**Fix:** Have deleteSelectedNodes delegate to deleteMultipleNodes([...selectedIds.value]) so confirm, navigation, and loadTasks behavior stay identical across entry points.

#### `src/composables/useSettings.ts`:84 — 'nullable' parse returns a string for a ref typed number|null
*Category: typing*

containerId is declared `persistedRef<number | null>('graphcore-containerId', null, { type: 'nullable' })` (line 267), but the 'nullable' branch of parse() does `return (str || null) as T` (line 84). After loading from storage the ref therefore holds the raw string (e.g. "5"), not a number, despite its `Ref<number | null>` type. The sole consumer compensates by re-parsing: `useAppLifecycle.js:119` does `parseInt(savedContainerId.value, 10)`. The annotation is a lie and any strict comparison `savedContainerId.value === someNumericNodeId` would silently fail.

**Fix:** Either add a 'number-nullable' parse path that returns `Number(str)` (or null), or change the declared type to `string | null` to match runtime reality. Drop the parseInt workaround in useAppLifecycle once parse returns a number.

#### `src/services/nodeCache.js`:262 — Singleton accessors getNodeCache/resetNodeCache (and defaultCache) are never used
*Category: dead-code*

The module exports a default singleton API: `let defaultCache = null; export function getNodeCache() {...}; export function resetNodeCache() {...}`. A repo-wide grep across src, electron, tests, and all .js/.ts/.vue files shows the only consumers of this module (src/composables/useDataLoading.ts and src/__tests__/nodeCache.test.js) use `createNodeCache` exclusively. `getNodeCache`, `resetNodeCache`, and the `defaultCache` variable are never referenced. The comment 'Default singleton instance for app-wide use' is aspirational; nothing uses it.

**Fix:** Remove the defaultCache singleton and the getNodeCache/resetNodeCache exports, or wire them up where a shared cache is actually intended.

#### `src/types/api.ts`:172 — Declared return types for export/import API do not match implementations
*Category: typing*

The DatabaseAPI interface declares `exportMarkdown(nodeId): Promise<string>`, `exportCSV(...): Promise<string>`, and `importJSON/importCSV(...): Promise<{ imported: number }>`. The actual electron implementations return objects: exportMarkdown -> `{ markdown }`, exportCSV -> `{ csv, headers, rowCount }`, exportJSON -> `{ version, exportedAt, root, links? }`, importJSON -> `{ rootId, nodesImported, linksCreated }`, importCSV -> `{ nodesImported }`. Consumers confirm the object shapes: DetailPanel.vue reads `result.markdown` / `result.csv`, and DataSettings.vue reads `result.nodesImported` / `result.linksCreated`. The declared `imported` field never exists and the string return types are wrong, so the typed API contract is inaccurate.

**Fix:** Update api.ts to reflect the real return objects (e.g. `Promise<{ markdown: string }>`, `Promise<{ csv: string; headers: string[]; rowCount: number }>`, `Promise<{ rootId: number; nodesImported: number; linksCreated: number }>`, `Promise<{ nodesImported: number }>`).

#### `src/types/components.ts` — Entire components.ts module is unused
*Category: dead-code*

All exported interfaces (DetailPanelProps/Emits, RadialSettings, GraphViewProps/Emits, GraphControlsProps/Emits, CardsViewProps, TableViewProps, TimelineViewProps, TreeItemProps, BreadcrumbsProps, ViewSwitcherProps, WorkspaceSelectorProps, NodeContextMenuProps, SpotlightSearchProps, TagInputProps, NotesEditorProps, AddNodeModalProps, SettingsPanelProps, NodeListEmits, ModalEmits, GraphViewExposed, DetailPanelExposed) have zero references outside src/types. Verified by per-symbol word-boundary grep across src and electron. The components instead use runtime `defineProps({...})` / `defineProps([...])` and untyped `defineEmits([...])` (e.g. GraphView.vue lines 24/44), so these typed contracts are never imported. This is both dead code and a drift hazard: GraphViewEmits etc. can diverge from the real component without any compile error.

**Fix:** Either adopt these as the components' actual `defineProps<...>()`/`defineEmits<...>()` generic arguments so they are enforced, or remove the file and its index.ts re-exports.

### LOW (14)

#### `electron/database/export.js`:281 — importJSON link counting relies on a thrown exception that never happens
*Category: correctness*

importJSON wraps the link recreation in try/catch expecting linkNodes to throw on a duplicate:
```js
try {
  ctx.linkNodes(newSourceId, newTargetId)
  linksCreated++
} catch {
  // Ignore duplicate link errors
}
```
But ctx.linkNodes is createLinkOperations().linkNodes (links.js line 42), which catches its own SQL error internally and RETURNS `{ success: false, error }` rather than throwing. Consequences: (1) the catch block is unreachable dead code, and (2) `linksCreated` is incremented unconditionally even when the insert failed (e.g. duplicate (source_id,target_id) pair in data.links), so the reported count is wrong. The DataSettings.vue import dialog surfaces this count to the user ('and N links').

**Fix:** Check the returned object: `const res = ctx.linkNodes(newSourceId, newTargetId); if (res.success) linksCreated++` and drop the try/catch.

#### `src/commands/CreateCommand.js`:15 — CreateCommand redo does not re-create the link it tears down on undo
*Category: correctness*

undo() calls api.unlinkNodes(nodeId, linkedToId) when linkedToId is set, but execute() (the redo path) only re-creates the node and never re-links it. For a linked create, the cycle create->undo->redo leaves the node without its link, and a following undo would then call unlinkNodes on a non-existent link. The asymmetry is currently masked only because production never passes linkedToId (createNode in src/composables/useNodeOperations.ts line 205 omits it); the field is exercised only by tests. The feature is therefore half-implemented.

**Fix:** Either re-create the link in execute() when linkedToId is set (e.g. await api.linkNodes(this.nodeId, this.linkedToId)), or drop the linkedToId parameter entirely until the linked-create flow is actually implemented.

#### `src/components/GraphView.vue`:272 — Document mousedown collapse handler is never removed on unmount (listener leak)
*Category: correctness*

attachCollapseHandlers() registers a capture-phase document-level mousedown listener guarded by the per-instance flag globalCollapseHandlerAttached:

  document.addEventListener('mousedown', e => { const btn = e.target.closest('.collapse-btn'); ... toggleNodeCollapse(nodeId) }, true)

The onUnmounted hook (lines 748-763) removes the keydown/keyup/mousemove modifier listeners and the graph-center-node listener, but never removes this mousedown listener. Because globalCollapseHandlerAttached is declared with `let` inside <script setup> it is scoped per component instance, so every GraphView mount adds another permanent document listener. Each closure captures toggleNodeCollapse (which closes over the now-null cy) and emit, so navigating between views accumulates dangling listeners and a click on any stray .collapse-btn would emit on an unmounted component.

**Fix:** Store the listener in a named function, add it in onMounted (or keep the guarded attach) and remove it in onUnmounted with document.removeEventListener('mousedown', handler, true).

#### `src/components/PersonsView.vue`:372 — Dead ternary and off-by-one in org dropdown keyboard navigation max index
*Category: correctness*

`const max = exactOrgMatch.value ? filteredOrganizations.value.length : filteredOrganizations.value.length` — both branches are identical, so the ternary does nothing. The dropdown renders the synthetic "+ Create" option at index `filteredOrganizations.value.length` only when `!exactOrgMatch && orgQuery.trim()`. When an exact match exists (no create option), `max` should be `length - 1`, but the code lets ArrowDown move the highlight to `length`, an index that points at no rendered option.

**Fix:** Compute the create-option presence explicitly: `const hasCreate = !exactOrgMatch.value && orgQuery.value.trim(); const max = hasCreate ? filteredOrganizations.value.length : filteredOrganizations.value.length - 1`.

#### `src/components/TypeFilterDropdown.vue`:24 — Organization type indicator uses an undefined CSS variable
*Category: correctness*

`organization: { label: 'Organizations', color: 'var(--type-org-text)' }` references `--type-org-text`, which is never defined anywhere in the codebase (the real token is `--type-organization-text`, defined in src/style.css and src/themes/light.css). Every other component in this module group uses `--type-organization-text`. As a result the organization row's `.type-indicator` swatch resolves to an invalid background and renders with no color.

**Fix:** Change to `color: 'var(--type-organization-text)'`. (Note: src/style.css:1291 and src/components/CardsView.css:892 share the same undefined-variable typo and should be fixed too.)

#### `src/composables/useGraphElements.js`:443 — useGraphElements() composable wrapper is never invoked
*Category: dead-code*

`export function useGraphElements(options = {})` (line 443) is never imported or called anywhere in src or tests. The only consumer, useGraphUpdate.js, imports the raw named exports `buildElements`, `addLinkEdges`, `fetchLinkedNodes` directly. The composable wrapper (and its re-export of `darkenColor`) is dead surface.

**Fix:** Delete the `useGraphElements` wrapper; keep the directly-imported named exports.

#### `src/composables/useGraphSelection.js`:85 — useGraphSelection() composable wrapper is never invoked
*Category: dead-code*

The `useGraphSelection(options)` composable (line 85) and all of its inner methods - `syncSelectionToCy`, `syncSingleSelectionToCy`, `updateFromCySelection`, `center`, `checkVisible` - are dead. Grepping the whole src tree, `useGraphSelection(` matches only its own definition; GraphView.vue imports only the module-level named exports `updateHtmlLabelSelectionFromIds`, `centerOnNode`, `isNodeVisible`. Nothing constructs the composable, so none of the wrapped sync logic runs. Side note: the dead `syncSingleSelectionToCy` also has a latent bug - when `selectedId` is null it never calls `cy.nodes().unselect()`, so it would fail to clear cytoscape's internal selection on deselect - but the function is unreachable.

**Fix:** Remove the unused `useGraphSelection` composable wrapper and its inner functions, keeping only the module-level helpers that are actually imported.

#### `src/composables/useModalController.ts`:171 — All handler methods of useModalController are unused in production
*Category: dead-code*

useModalController is consumed only by App.vue (plus its own test). App.vue destructures only the state refs (`addNodeModal, showShortcutsModal, showOnboarding, showSettings, showSnapshotList, showLostFound`) and obtains the corresponding handlers elsewhere: `showAddNodeModal` comes from the node-creation composable, and `toggleSnapshots`/`toggleLostFound` come from useMaintenanceDialogs. The returned `showAddNodeModal`, `closeAddNodeModal`, `openShortcutsModal`, `closeShortcutsModal`, `openOnboarding`, `closeOnboarding`, `openSettings`, `closeSettings`, `toggleSnapshots`, `toggleLostFound` are never called in production. Moreover `useModalController()` is instantiated with no options, so its `toggleSnapshots`/`toggleLostFound` would never invoke `loadSnapshots`/`loadOrphanedNodes` — i.e. they are non-functional duplicates of the maintenance-dialog versions actually wired up.

**Fix:** Either route App.vue through these handlers (removing the duplicate logic in useMaintenanceDialogs) or trim useModalController down to the state it actually provides, eliminating the duplicated toggle logic.

#### `src/composables/useNodeOperations.ts`:231 — updateNode mutates its input argument, which can mutate caller-side reactive state
*Category: correctness*

updateNode mutates the passed-in object in place: `updatedNode.end_date = ...` (line 226) and `updatedNode.title = updatedNode.title.trim()` (line 231). The same object is then handed to broadcastUpdate/onSuccess. DetailPanel.vue line 385 emits the reactive ref object directly via `emit('update', editedNode.value)` (not a copy, unlike line 349 which spreads toRaw), and App.vue wires `@update="updateNode"`. So trimming the title (or auto-setting end_date) reaches into and mutates DetailPanel's reactive `editedNode.value`, an unintended side effect on component state from a CRUD helper.

**Fix:** Operate on a shallow copy: `const node = { ...updatedNode }` and apply trim/end_date to the copy, then pickNodeFields/broadcast from the copy. Never mutate the argument.

#### `src/composables/useNodePositions.js`:165 — useNodePositions() composable wrapper is never invoked
*Category: dead-code*

`export function useNodePositions(options = {})` (line 165), returning `getPositionsKey`/`loadNodePositions`/`saveNodePositions`/`findSmartPosition`, is never called. GraphView.vue imports the module-level functions `getPositionsKey`, `loadNodePositions`, `saveNodePositions` directly, and useGraphUpdate.js imports `findSmartPosition` directly. Grep for `useNodePositions(` excluding the definition returns nothing. Same unused-wrapper pattern as useGraphElements and useGraphSelection.

**Fix:** Remove the unused composable wrapper; keep the named helpers.

#### `src/stores/filters.js`:147 — Store action filterNodes is never called
*Category: dead-code*

filterNodes(nodes, options) is exported from the store but no caller exists anywhere in src or tests. I grepped for `.filterNodes(`, `filtersStore.filterNodes`, and store filterNodes across src/ and src/__tests__/ — zero hits. The real graph type filtering is re-implemented independently in src/composables/useNodeFiltering.js (lines 208-214) using `filtersStore.hasTypeFilter` and `filtersStore.visibleTypes.includes(node.type)`. This is dead duplicated logic. Note also the embedded comment claims 'Always exclude tag' but the tag exclusion only runs inside the `if (applyTypeFilter && hasTypeFilter.value)` branch, so when no type filter is active tags would pass through — a latent inconsistency that is moot only because the method is unused.

**Fix:** Delete the filterNodes method (and rely on useNodeFiltering), or have useNodeFiltering delegate to it to remove the duplication.

#### `src/types/events.ts` — Entire events.ts module is unused
*Category: dead-code*

Every exported type in this file (NodeEventPayload, SelectionEventPayload, MultiSelectionEventPayload, DragStart/Move/End/EventPayload, ContextMenuEventPayload, NodeUpdate/Create/Delete/Move/ReorderEventPayload, MultiDeleteEventPayload, LinkEventPayload, ToggleEventPayload, GraphViewEventPayload, Resize/PanelResizeEventPayload, KeyboardEventPayload, NavigationEventPayload, SearchEventPayload, ModalEventPayload, ToastEventPayload, AIEventPayload) has zero references anywhere in src/, electron/, or tests. I grepped each name with word boundaries across .ts/.vue/.js. The only internally-consumed type, `Position`, is imported solely by components.ts, which is itself entirely unused (see separate finding). Components emit events via untyped `defineEmits([...])` arrays rather than these payload interfaces, so these contracts are never wired in and can silently drift from real payloads. Per the project's 'remove dead code' rule, the whole file should be deleted or actually adopted.

**Fix:** Delete src/types/events.ts and its re-exports in index.ts, or wire the payload types into the actual component emit/handler signatures so they are enforced.

#### `src/utils/constants.js`:130 — getTypeIconHtml is an unused duplicate of getTypeIcon
*Category: dead-code*

getTypeIconHtml has a body byte-for-byte identical to getTypeIcon (lines 123-127 vs 130-134). I grepped the whole src tree (including .vue templates): every production caller (TableView, TimelineView, SpotlightSearch, AppSidebar, AddNodeModal, SidebarTreeItem, LinkedItemsSection, MetadataGridSection) uses getTypeIcon. getTypeIconHtml is referenced only in src/__tests__/constants.test.js, where the only assertion is `expect(getTypeIconHtml(type)).toBe(getTypeIcon(type))` — i.e. the test merely confirms it duplicates the other function. The comment 'all types now use SVG' confirms the HTML/SVG split it once represented is gone. Dead code per the project's remove-dead-code rule.

**Fix:** Delete getTypeIconHtml and its test block; have any remaining callers use getTypeIcon.

#### `src/utils/tooltip.js`:13 — tooltip.js re-implements renderMarkdown and formatDate instead of importing the shared utilities
*Category: consistency*

tooltip.js defines its own local renderMarkdown (lines 13-17) and formatDate (lines 20-24). markdown.js already exports renderMarkdown and formatting.js already exports formatDate (with the same en-US 'short month' format). The duplication is not behaviour-neutral: the shared markdown.js renderMarkdown runs sanitizeHtml with `{ ADD_ATTR: ['target'] }` and installs a custom external-link renderer, whereas tooltip.js's copy calls bare DOMPurify.sanitize(html). As a result node-notes links render differently inside tooltips than everywhere else, and any future change to the canonical renderer (e.g. allowed tags) silently won't apply to tooltips.

**Fix:** Import renderMarkdown from ./markdown.js and formatDate from ./formatting.js and delete the local copies, so tooltips share one sanitization/format path.

## Appendix — unverified lower-confidence notes (64)

These were reported by reviewers but **not** put through the adversarial verifier (low severity).
Treat as leads to confirm individually before acting; several are clear (e.g. unused imports), others
need a closer look. The duplicate `src/App.vue` >1000-LOC entries below both refer to the single
file-size violation already noted in the gates table.

### consistency (12)
- `electron/database/nodes.js`:82 — getNodes omits the has_table flag that sibling read methods include
- `electron/database/tags.js`:60 — getOrCreateTagNode bypasses ctx._run/createNode used by all siblings
- `src/components/TasksView.vue`:49 — Hardcoded default-color literal instead of DEFAULT_NODE_COLOR constant
- `src/components/ViewRenderer.vue`:34 — Inconsistent default values for the graph detail threshold across the prop chain
- `src/composables/useDataLoading.ts`:233 — loadFavorites and loadTags swallow errors silently, unlike sibling loaders
- `src/composables/useDetailController.ts`:7 — Two divergent DetailPanelRef interfaces for the same component ref
- `src/composables/useGraphOperations.js`:27 — Position localStorage key built inline instead of via shared getPositionsKey
- `src/composables/useGraphSettings.ts`:161 — maxDepth persisted to localStorage here is superseded by DB-backed graphMaxDepth
- `src/composables/useNodeActionsUI.ts`:238 — Multi-delete navigates via navigateBack() while single-delete redirects to parent_id
- `src/composables/useTimelineDates.js`:223 — calculateDueUrgency bypasses parseLocalDate and uses raw new Date()
- `src/composables/useTreeExpand.js`:57 — expandAncestors does not persist expanded state while sibling mutators do
- `src/composables/useViewStateController.ts`:7 — Local ViewMode type duplicates and drifts from canonical types/settings ViewMode

### correctness (9)
- `electron/database/search.js`:107 — getAllTags relies on SQLite's lenient double-quoted-string quirk
- `electron/main.js`:248 — before-quit fires a fire-and-forget save message without waiting for the renderer
- `src/components/CardsView.vue`:426 — nestedGridStyle called with an extra ignored argument
- `src/components/MarkdownRenderer.vue`:146 — Content is rendered twice on mount (immediate watch + onMounted)
- `src/composables/useSnapshots.js`:127 — useSnapshots.cleanup never registered/called; message timeout leaks on unmount
- `src/services/api.ts`:133 — Web request() always parses JSON, breaking void-returning endpoints that send empty/204 responses
- `src/services/openaiService.js`:22 — handleResponseError rethrows raw JSON-parse error instead of the friendly 'API error: <status>' fallback
- `src/stores/filters.js`:44 — hasTypeFilter uses length comparison instead of set membership
- `src/utils/tooltip.js`:7 — tooltip.js and markdown.js both mutate the shared global marked singleton with divergent config

### dead-code (30)
- `electron/ipc/agent.js`:254 — executeAgentTool / fallbackResearch / runAgentLoop exported but never imported externally
- `electron/ipc/httpClient.js`:225 — HttpClient class exported but only used internally
- `electron/ipc/window.js`:142 — createDetachedWindow and detachedWindows exported but never imported externally
- `electron/wikipedia.js`:57 — Exported WIKIPEDIA_ACTION_API / WIKIPEDIA_REST_API constants are never imported elsewhere
- `src/App.vue`:107 — resetNavigationState destructured from useNavigationState but never used
- `src/components/CardsView.vue`:4 — Unused import decodeHtml
- `src/components/CardsView.vue`:164 — Unused function getDueDateStatus
- `src/components/detail/OrganizationDetailForm.vue`:75 — Unused function onTagsUpdate
- `src/components/detail/PersonDetailForm.vue`:131 — Unused function onTagsUpdate
- `src/components/detail/PersonDetailForm.vue`:17 — Unused prop currentWorkspace
- `src/components/NodeContextMenu.vue`:24 — menuRef template ref is assigned but never read
- `src/components/OllamaDiffPreview.vue`:11 — Declared 'edit' emit is never emitted
- `src/components/PersonsView.vue`:204 — Unused variable _orgIds in loadLinkedOrganizations
- `src/components/settings/AboutSettings.vue`:2 — Unused `const props` assignment in several components
- `src/components/settings/AISettings.vue`:62 — Legacy ollamaEnabled fallback in isAiEnabled is unreachable
- `src/components/TypeFilterDropdown.vue`:37 — Unused local variable in buttonLabel
- `src/composables/useCardsLayout.js`:66 — filterChildrenRecursive re-exported from useCardsLayout but never consumed
- `src/composables/useDetailController.ts`:1 — Unused import ComponentPublicInstance
- `src/composables/useGraphInit.js`:5 — cytoscape-d3-force is imported and registered but no layout uses it
- `src/composables/useNodeTable.js`:212 — saveCells is exposed but never called by any consumer
- `src/composables/useSettings.ts`:390 — Redundant always-true branch in useSettings()
- `src/composables/useTimelineLayout.js`:40 — _getColorMap option is destructured but never used; JSDoc names a non-existent param
- `src/services/agentService.js`:206 — Exported agentService object is unused; only the named research export is consumed
- `src/services/ollamaService.js`:12 — Unused parameter _model in handleConnectionError
- `src/services/wikipediaService.js`:49 — wikipediaService.getSummary is never called
- `src/stores/filters.js`:31 — Unused store getters: isTypeVisible, allTypes, hasActiveFilter, hasDepthFilter
- `src/stores/filters.js`:97 — Unused action resetToDefaults
- `src/types/command.ts`:10 — CommandType union is exported but never used
- `src/types/components.ts`:5 — Unused import GraphTypeFilter
- `src/types/settings.ts` — Unused granular settings interfaces and AppSettings

### design (7)
- `electron/ipc/httpClient.js`:113 — Request body is JSON.stringify'd twice in requestWithNode
- `electron/preload.js`:126 — Menu/lifecycle subscription API exposes no way to remove listeners
- `src/App.vue` — App.vue exceeds the 1000-LOC project limit
- `src/App.vue` — App.vue exceeds the project 1000-LOC file-size limit (1132 lines)
- `src/components/config/tableFormatters.js`:44 — getBadgeStyle ignores its argument and always returns an empty object
- `src/components/detail/PersonDetailForm.vue`:152 — Two watchers both trigger loadLinkedOrganizations, causing redundant concurrent loads
- `src/composables/useViewStateController.ts`:17 — Duplicated navigation-state sync logic across useViewStateController and useNavigationState

### docstring (4)
- `electron/agentConfig.js`:12 — isGarbageResponse JSDoc lacks @param/@returns and is imprecise
- `src/composables/useGraphElements.js`:76 — buildElements JSDoc omits ancestorColor and inheritColors options
- `src/composables/useGraphEvents.js`:65 — useGraphEvents JSDoc lists a non-existent option and omits one that is used
- `src/utils/nodeColor.js`:1 — Module docstring overstates buildColorMap precedence (linked color)

### naming (1)
- `src/stores/filters.js`:106 — showAllTypes / docstring overstate behavior (excludes 'tag')

### typing (1)
- `src/composables/useAppContext.ts`:55 — AppContext.refreshGraphAfterStructureChange type omits its reloadData parameter
