# Codebase Review

Date: 2026-06-14
Scope: full source tree (`src/`, `electron/`, `shared/`), non-test files — 205 source files, ~44k LOC.
Method: 21 per-module reviewer agents followed by an adversarial verification pass that attempts to
refute every high/medium finding before it is reported. Findings below are the confirmed survivors.

## Remediation status (2026-06-14)

Fixes were applied on branch `review/high-severity-fixes`, each commit with tests where the logic is
unit-testable; the full suite stayed green throughout.

Resolved:
- **XSS** — shared `escapeHtml` + `sanitizeHtml`/`renderMarkdown` (DOMPurify) applied to MarkdownRenderer,
  CardNotes, graph node labels, tooltip title/type, and the marked link renderer.
- **Web-mode crash** — `getDescendantsBatch` implemented in `webApi`; `Api` type made required; desktop-only
  export/import stubbed.
- **DB correctness** — cross-workspace `getDescendantsBatch` filter removed; `reorderNode` resequences
  (no more collisions / dead ternary).
- **Reactivity/leaks** — GraphView document listeners cleaned up; node-op errors → toast; DetachedView and
  detail-form unlink use fresh data; timeline due_date mapping; graph multi-select Array check.
- **Correctness** — toast options, `viewMode 'graph'`, Ollama `num_ctx`, KeyboardShortcutsModal Esc,
  `getDescription` guard, `getWorkspaceIdForNode` signature.
- **Dead code** — removed `useAppController`, `useDetailPanelCore`, `utils/dom`, the orphaned `stores/nodes`
  undo/redo store, and assorted unused exports/props/emits/styles.
- **Consolidation** — AddNodeModal type icon and tableFormatters default color now use shared sources.

Deferred (need a decision or runtime verification this pass could not provide):
- **Importance scale** — three conflicting scales; correct direction is a product decision (see below).
- **DB save batching** — modifies the universal `_save()` path (silent-data-loss risk) with no disk-level
  test coverage; needs a `_batch()` design + integration tests.
- **App.vue split** — 1153 LOC; extraction of deeply-wired setup logic needs runtime verification (no
  App-level test, Electron not runnable in this environment).
- **preload.js IPC constants** — large mechanical change, no behavior impact (literals already match).

## Baseline gates

The project's own definition of "passing", run before the review:

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` (eslint src electron) | Pass — 0 errors, 355 warnings (all `max-lines-per-function` / `complexity` / `max-depth`) |
| Format | `prettier --check` | Pass — all files conform |
| Types | `vue-tsc --noEmit` | Pass — clean |
| Tests | `vitest run` | Pass — 1384 tests / 67 files |
| File size (≤1000 LOC) | style rule | 1 violation: `src/App.vue` (1157 LOC) |

Notes:
- No JS dead-code gate is configured (the global vulture/mypy rules are Python-only and do not apply to
  this Vue/Electron project). Dead-code findings below come from the review, not a tool.
- The 355 lint warnings are function-length/complexity advisories the project does not currently fail on;
  they are not repeated as findings here.

## Summary

| | High | Medium | Low | Total |
|---|---|---|---|---|
| Confirmed (verified) | 5 | 28 | 15 | 48 |
| Manually verified (verifier hit session limit) | 0 | 4 | 1 | 5 |

140 candidate findings were raised; 8 were refuted by verification (3 genuinely refuted, 5 lost to a
session limit and re-checked by hand below), 84 low-confidence notes were not verified (Appendix A).

Severity reflects the verifier's corrected severity where it differs from the reviewer's original.

### Recurring themes

1. **Unsanitized HTML / XSS (`v-html` and innerHTML templates).** `dompurify` is a dependency and is
   applied in `utils/tooltip.js`, but not in `MarkdownRenderer.vue`, `CardNotes.vue`, the graph node
   HTML label (`useGraphInit.js`), the tooltip title/type fields, or the custom marked link renderer.
   Several paths also run `decodeHtmlEntities` *after* `marked.parse`, re-introducing live markup.
2. **`webApi` / `electronApi` divergence.** The web-mode API object is missing methods the renderer
   calls unconditionally (`getDescendantsBatch` — a hard crash) and stubs some desktop-only methods
   while silently omitting others (`exportJSON`/`importCSV`…). The `Api` type marks methods optional,
   so TypeScript does not catch the gaps.
3. **Two parallel undo/redo systems.** The Command pattern (`src/commands/`) and a second
   action-stack inside `stores/nodes.js` coexist; the store version has its own delete-restore bugs
   (recreates nodes instead of restoring soft-deleted rows) and appears to be the unused/older path.
4. **Dead code at module scale.** Whole composables/utilities are exported but never imported
   (`useAppController.js`, `useDetailPanelCore.js`, `utils/dom.js`, `stores/filters.js` helpers),
   plus many unused exports, props, emits, and style rules. The project's no-dead-code rule is not met.
5. **Local reimplementations of shared helpers drift.** Importance labels (three incompatible scales),
   type icons, and the legacy default-color literal are re-defined per component instead of imported,
   so the same data renders differently across views.
6. **Stale-data / reactivity handlers.** Several handlers broadcast or re-derive from the pre-update
   object (`DetachedView.moveToRoot`, the detail-form unlink paths) instead of the reloaded record,
   and `GraphView.vue` leaks three document listeners that are never removed on unmount.

## Manually verified (verifier hit the session limit)

These five findings were raised by reviewers but their adversarial verifier could not run (session
limit). They were re-checked by hand against the source and confirmed.

#### `src/composables/useGraphInit.js:194` — Initial multi-selection highlight branch is dead (Array treated as Set)

- **Category:** correctness
- **Problem:** `applyInitialLayout` does `if (props.selectedIds?.size > 0) props.selectedIds.forEach(...)`. `GraphView.vue:28` declares the prop as `selectedIds: { type: Array, default: () => [] }` — an Array, not a Set — so `.size` is always `undefined` and the branch never executes. On graph init only the single `selectedId` is ever highlighted; a restored multi-selection is not.
- **Fix:** Iterate the array directly (`props.selectedIds?.length`) or normalize the prop to a Set. Note the internal `useSelection` store uses a real `Set<number>`, so the type contract across the prop boundary is inconsistent.

#### `src/composables/useGraphInit.js:176` — Node HTML label interpolates `n.title` unsanitized (XSS)

- **Category:** correctness
- **Problem:** The `node-html-label` template returns a raw HTML string with `...>${n.title || 'Untitled'}<...` interpolated directly into innerHTML. Node titles are user-controlled, so a title containing markup is injected live. Notes in the same template go through `renderMarkdownHtml`, but the title (and the data attributes) do not. Same XSS class as the confirmed `utils/tooltip.js` finding.
- **Fix:** Escape `n.title` (and any other user-controlled interpolations) before building the label string, consistent with how the tooltip path should sanitize.

#### `src/composables/useWorkspace.ts:59` — `getWorkspaceIdForNode` ignores the `type` argument every caller passes

- **Category:** consistency
- **Problem:** The implementation is `function getWorkspaceIdForNode(): WorkspaceId` (no parameters, line 199) and the exported type is `getWorkspaceIdForNode: () => WorkspaceId` (line 59). But every consumer calls it with a node type and types it `(type: string) => number | null | undefined` — `useGraphOperations.js:71,81` (`getWorkspaceIdForNode(nodeType)`), `useNodeActionsUI.ts:257` (`getWorkspaceIdForNode('group')`), `useNodeOperations.ts:195`, and the `useAppContext.ts` interface. The argument is silently discarded, and the return type disagrees with the consumer interfaces.
- **Fix:** Reconcile the contract: either the function should branch on `type` (if workspace routing is type-dependent), or drop the argument at all call sites and align the interfaces. As written, callers pass data that has no effect.

#### `src/composables/useViewStateController.ts:99` — Navigation-state sync duplicated with `useNavigationState`

- **Category:** consistency (medium confidence — not adversarially verified)
- **Problem:** `useViewStateController` and `useNavigationState` both maintain overlapping navigation/view-state synchronization logic. App.vue wires both. Verify whether one is authoritative before consolidating.
- **Fix:** Consolidate the shared sync into one composable and have the other consume it, or document the boundary between them.

#### `src/composables/useSnapshots.js:127` — `cleanup()` is never called

- **Category:** dead-code
- **Problem:** `useSnapshots` returns a `cleanup()` that clears a message timeout, but App.vue (`src/App.vue:203`) calls `useSnapshots({...})` without ever invoking the returned `cleanup()` (only `keyboard.cleanup()`, `wheel.cleanup()`, `layout.cleanup()` are wired, in other components). Impact is benign because App is the root component and effectively never unmounts, but the cleanup contract is unused.
- **Fix:** Call `cleanup()` from App.vue's `onUnmounted`, or remove the unused return if it is not needed at the root.

## High-severity confirmed findings (5)

#### `src/App.vue:304` — error ref is set but never cleared, leaving a permanent error banner

- **Category:** correctness
- **Problem:** The local `error` ref (line 111) is written in exactly one place: the `nodeOps` onError callback `onError: e => { error.value = e.message }` (lines 304-306). It is provided into the app context (line 574) and bound to `ViewRenderer :error="error"`, which renders it as a blocking full-view banner (`<div v-else-if="error" class="error">{{ error }}</div>` in ViewRenderer.vue:130). Nothing in App.vue ever resets `error.value = null`. After any single node-operation failure (e.g. a failed create), the entire view is replaced by the persistent error banner and never recovers until a full reload, even after subsequent successful operations. Note the sibling `useAppController.js` deliberately does `error.value = null` before each load (line 104) - App.vue omits that reset path.
- **Fix:** Reset `error.value = null` at the start of each load/operation (e.g. in loadChildren success path or before invoking nodeOps), or drive node-operation failures through `handleError` (toast) like the rest of the file instead of the sticky banner ref.

#### `src/components/CardNotes.vue:24` — v-html renders marked output without DOMPurify sanitization (XSS)

- **Category:** correctness
- **Problem:** Line 24 `<div ... v-html="renderedNotes">` renders renderedNotes, computed at lines 57-60 as `marked.parse(decodeHtmlEntities(props.notes))`. No sanitizer is applied and decodeHtmlEntities un-escapes entities before parsing, so user note content can inject live HTML/script. Same XSS vector as MarkdownRenderer.vue, and the same project rule (apply dompurify to markdown/HTML rendering) is violated. dompurify is already a dependency.
- **Fix:** Wrap the result with DOMPurify.sanitize(), e.g. `return DOMPurify.sanitize(marked.parse(decodeHtmlEntities(props.notes)))`.

#### `src/components/MarkdownRenderer.vue:150` — v-html renders marked output without DOMPurify sanitization (XSS)

- **Category:** correctness
- **Problem:** renderContent() runs marked.parse() on user-controlled note content and assigns the result to renderedHtml, which is rendered via `<div ... v-html="renderedHtml">` (line 150). marked.setOptions only sets {breaks, gfm} (lines 20-23) with no sanitizer, and the project ships dompurify (used in src/utils/tooltip.js: `DOMPurify.sanitize(html)`) but it is NOT applied here. Worse, line 130 `html = decodeHtmlEntities(html)` runs AFTER marked.parse, converting marked's escaped `&lt;`/`&gt;`/`&quot;` back into live `<`, `>`, `"`, which defeats marked's built-in HTML escaping. A note containing raw or entity-encoded HTML (e.g. an onerror img / script) becomes executable markup. This is the project's stated XSS rule violation (markdown rendering must apply dompurify).
- **Fix:** Sanitize the final HTML with DOMPurify before assigning to renderedHtml (e.g. `renderedHtml.value = DOMPurify.sanitize(processedHtml)`), consistent with src/utils/tooltip.js. Re-evaluate the post-parse decodeHtmlEntities call, which re-introduces unescaped HTML.

#### `src/composables/useTimelineDrag.js:116` — Incorrect field-detection logic for due_date-only nodes drops the move to start_date

- **Category:** correctness
- **Problem:** handleDragEnd decides which date fields to persist with: `if (node.start_date || !node.due_date) { updates.start_date = newStart; updates.end_date = newEnd } else { updates.due_date = newEnd }`. The else branch is only reached when the node has a due_date AND no start_date. But timelineNodes.flatten in useTimelineLayout assigns `displayDate = node.start_date || node.due_date || ...` and `endDisplayDate = node.end_date || today`. For a due_date-only node, displayDate is the due_date and endDisplayDate is today, so the bar spans due_date..today. When such a node is dragged ('move'), newEnd is the new today-side date and newStart is the new due-date-side date, yet only `due_date = newEnd` is written (the today side), discarding newStart. The due_date the user dragged is silently lost / set to the wrong value.
- **Fix:** For due_date-only nodes the meaningful dragged date is the start side (newStart, which corresponds to the due_date), not newEnd. Map `updates.due_date = newStart` (and/or handle 'move' vs 'resize-*' explicitly), or normalize the field detection to match how displayDate/endDisplayDate were derived in useTimelineLayout.

#### `src/services/api.ts:151` — webApi is missing getDescendantsBatch, breaking sidebar loading in web mode

- **Category:** correctness
- **Problem:** electronApi implements getDescendantsBatch (api.ts:674), but webApi (the object exported when not running in Electron, api.ts:151-616) has no getDescendantsBatch method at all. The caller in src/composables/useDataLoading.ts:151 invokes it unconditionally: `const descendantsByRoot: Map<number, Node[]> = await api.getDescendantsBatch(rootIds)` with no optional-chaining or guard. In web mode `api.getDescendantsBatch` is undefined, so this throws `TypeError: api.getDescendantsBatch is not a function` and the entire sidebar tree fails to load whenever a workspace has roots. The Api type marks the method optional (types/api.ts:146 `getDescendantsBatch?`), which is why TypeScript does not catch the unguarded call.
- **Fix:** Implement getDescendantsBatch in webApi (e.g. call a /descendants-batch endpoint or fall back to per-root getDescendants and assemble a Map), or guard the call site in useDataLoading.ts to fall back to api.getDescendants when the batch method is absent.


## Medium-severity confirmed findings (28)

#### `electron/database/index.js:181` — _run persists to disk on every write, and last_insert_rowid is read after a separate query without a transaction

- **Category:** correctness
- **Problem:** _run calls this._save() (full this.db.export() + fs.writeFileSync) after every single statement. Bulk operations that loop calling ctx._run (e.g. deleteNode reassigning children then recursing updateDescendantPaths, importJSON/importCSV creating many nodes via createNode->_run) rewrite the entire database file once per row. For large imports/subtree moves this is an O(n * dbsize) disk write amplification and there is no surrounding transaction, so a crash mid-import leaves a partially written tree. Migrations correctly batch with a single ctx._save() at the end, but the per-statement _save in the ops path is inconsistent with that and is a real performance/durability defect.
- **Fix:** Add a transaction/batch mode (e.g. _runMany or begin/commit) and call _save once per logical operation, as the migration code already does. At minimum wrap multi-row operations (import, deleteNode, moveNode subtree updates) in a single save.

#### `electron/database/nodes.js:289` — reorderNode 'after' branch has a redundant no-op ternary

- **Category:** correctness
- **Problem:** In reorderNode, the 'after' position computes:   newOrder = targetIndex < siblings.length - 1 ? target.sort_order + 1 : target.sort_order + 1 Both ternary outcomes are identical (target.sort_order + 1), so the condition is dead and the result never depends on whether the target is the last sibling. Worse, this does not place the node between the target and the next sibling (it just sets sort_order = target.sort_order + 1, which collides with the next sibling's order). Combined with the 'before' branch (siblings[targetIndex-1].sort_order + 1) the sort_order values are not guaranteed to be distinct or correctly ordered, so reordering can fail to move a node to the intended slot.
- **Fix:** Compute a fractional/midpoint order or shift subsequent siblings. At minimum collapse the dead ternary: for 'after', use the next sibling's order to interpolate (e.g. between target.sort_order and siblings[targetIndex+1].sort_order), and resequence siblings if collisions occur.

#### `electron/database/nodes.js:384` — getDescendantsBatch applies only the first root's workspace filter to all roots

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** getDescendantsBatch builds path conditions for every requested root, but the workspace filter is taken solely from nodes[0]:   if (nodes[0].workspace_id) {     sql += ' AND workspace_id = ?'     values.push(nodes[0].workspace_id)   } If the requested roots live in different workspaces, descendants of roots in other workspaces are excluded (because the global AND workspace_id = nodes[0].workspace_id is applied to the whole result set). If nodes[0].workspace_id is null/undefined but other roots have a workspace, no filter is applied at all. This diverges from getDescendants, which filters per node via ctx._applyWorkspaceFilter on each node's own workspace_id.
- **Fix:** Drop the global workspace filter and rely on the path conditions alone (paths are unique across the tree), or fold each root's workspace into its own path condition group. Match the single-root getDescendants semantics.

#### `electron/ipc/llmProvider.js:72` — extractContent is exported but never used anywhere

- **Category:** dead-code
- **Problem:** extractContent is defined and exported (`module.exports = { chatRequest, extractContent }`). A tree-wide grep for `extractContent` across src, electron, and src/__tests__ shows the only matches are its definition and export in this file. No caller exists in the renderer, main process, or tests. Callers everywhere read `response.content` directly (e.g. agent.js lines 189, 203, 217 use `response.content`).
- **Fix:** Remove the extractContent function and drop it from module.exports, per the project's no-dead-code rule.

#### `src/App.vue:304` — Divergent error-handling strategy within the same file

- **Category:** consistency
- **Problem:** App.vue handles errors two incompatible ways. Selection errors use `onError: handleError` (line 349) and the move handler uses `handleError(e, { context: 'Moving node' })` (line 500), both producing transient toasts. But node operations route through `onError: e => { error.value = e.message }` (lines 304-306), which produces a persistent full-view error banner via ViewRenderer. The same class of failure (a node CRUD operation) is surfaced two different ways depending on which code path triggered it, and only one of them (the banner) is non-dismissable.
- **Fix:** Pick one mechanism. Route nodeOps.onError through `handleError` for consistency with the other operation handlers, or document/justify why creation errors specifically use the blocking banner.

#### `src/commands/OllamaImproveNotesCommand.js:37` — getDescription() throws when prompt is undefined

- **Category:** correctness
- **Problem:** getDescription() reads `this.prompt.length` and `this.prompt.substring(...)` with no null guard. If a command is reconstructed via commandFactory.fromJSON from serialized data missing `prompt` (or constructed without it), this throws `Cannot read properties of undefined`. Sibling commands defend against missing data: CreateCommand uses `this.nodeData?.title`, EditCommand uses `Object.keys(this.newValues || {})`, DeleteCommand uses `this.nodeData?.title`. This command is inconsistent with that pattern.
- **Fix:** Guard with a default, e.g. `const prompt = this.prompt || ''` before measuring length/substring, or short-circuit to a generic 'AI notes' description when prompt is empty.

#### `src/components/AddNodeModal.vue:65` — Local getTypeIcon reimplements a shared util with divergent (text) output

- **Category:** consistency
- **Problem:** AddNodeModal defines a local typeIcons map and getTypeIcon() that return short text abbreviations (e.g. 'T', 'P', 'Tp', 'Pe'):      const typeIcons = { task: 'T', project: 'P', ... }     function getTypeIcon(type) { return typeIcons[type] || type[0].toUpperCase() }  Every sibling that shows type icons (SpotlightSearch.vue, AppSidebar.vue) imports getTypeIcon from ../utils/constants.js, which returns SVG markup rendered via v-html. This component instead renders text via {{ getTypeIcon(t) }}, so the same node types are shown with different visuals than the rest of the app. The local function also shadows the well-known util name while behaving differently (aspirational/misleading naming).
- **Fix:** Import getTypeIcon from utils/constants.js and render it consistently (v-html) so the type icons match the rest of the UI, and remove the local typeIcons map and function.

#### `src/components/CardsView.vue:111` — CardsView importance labels conflict with the rest of the app (three incompatible scales)

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** CardsView defines its own local getImportanceLabel: `const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }`. This contradicts the two other importance scales in the codebase. useTaskFiltering.js (used by TasksView) defines `{ 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent', 5: 'Critical' }`, and the exported constants.js importanceLabels is the inverse `{ 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low', 5: 'Trivial' }`. As a result importance value 4 renders as 'Critical' on a card but 'Urgent' in the tasks table, and the card scale has no value 5. The same node shows different priority labels depending on the view.
- **Fix:** Remove the local getImportanceLabel and import the canonical mapping (decide whether constants.js importanceLabels or the useTaskFiltering scale is authoritative, then converge all three on it).

#### `src/components/config/personsGridColumns.js:111` — maskPhone is exported but never used

- **Category:** dead-code
- **Problem:** `export function maskPhone(...)` has no references anywhere in src or tests (grep for `maskPhone` returns only the definition). Its sibling `maskEmail` is used in PersonsView.vue, but phone masking was never wired up. Violates the project rule to remove dead code.
- **Fix:** Remove maskPhone, or apply it in PersonsView.vue where person.phone is displayed if phone masking is intended.

#### `src/components/config/tableColumns.js:27` — Exported columnDefinitions is never imported and duplicates hardcoded template columns

- **Category:** dead-code
- **Problem:** `columnDefinitions` is exported but grep across src (excluding the defining file) finds zero imports. The only consumer of this module, src/composables/useColumnResize.js, imports only loadColumnWidths/saveColumnWidths/MIN_COLUMN_WIDTH. TableView.vue hardcodes every column (col-expand, col-type, col-title, col-notes, col-due ...) directly in its template rather than iterating over columnDefinitions, so this array is dead code that also duplicates (and can drift from) the real column metadata.
- **Fix:** Either remove columnDefinitions, or refactor TableView.vue to render its header/cells by iterating over columnDefinitions so the single source of truth is honoured.

#### `src/components/config/tableFormatters.js:93` — getRowStyle hardcodes the legacy default color literal instead of the shared constant

- **Category:** consistency
- **Problem:** getRowStyle compares `color !== '#0f4c75'`. That exact value is already exported as a named constant `legacyDefaultColor = '#0f4c75'` in the sibling config file personsGridColumns.js and is used throughout PersonsView.vue for the same 'is this the inherited default color?' check. Duplicating the magic literal here means the two will silently diverge if the default ever changes.
- **Fix:** Import legacyDefaultColor from ./personsGridColumns.js and compare against it in getRowStyle.

#### `src/components/DetachedView.vue:157` — moveToRoot broadcasts the stale pre-move node object

- **Category:** correctness
- **Problem:** moveToRoot does `await api.moveNode(node.id, null); await loadNode(node.id); broadcastNodeUpdate(node)`. It broadcasts the original `node` argument, which still carries the old parent_id, instead of the freshly reloaded `currentNode.value`. Other windows therefore receive stale data (still parented). Compare with the onMessage/handleUpdate paths which use currentNode.value. wrapWithParent has a similar pattern (broadcasts only `newParent`, never the moved child's updated record).
- **Fix:** Broadcast the reloaded node: after `await loadNode(node.id)` call `broadcastNodeUpdate(currentNode.value)`.

#### `src/components/detail/PersonDetailForm.vue:111` — Unlinking re-derives from stale props, so the removed item is not reflected

- **Category:** correctness
- **Problem:** `unlinkOrganization` (lines 111-119) calls `await api.unlinkNodes(...)` then `await loadLinkedOrganizations()`. But `loadLinkedOrganizations` derives its result from `props.linkedNodes` (line 74), which is owned by the parent and has NOT been refreshed after the unlink call. There is no emit to ask the parent to reload links (the emits list has no reload event). So the just-unlinked organization can still appear until the parent independently refreshes linkedNodes. OrganizationDetailForm.unlinkMember (lines 56-64) has the identical problem with `loadLinkedMembers`.
- **Fix:** Emit an event (e.g. 'reload-links') to the parent after unlinking so the source-of-truth linkedNodes prop is refreshed, instead of re-filtering stale props locally.

#### `src/components/GraphView.vue:89` — Document keydown/keyup/mousemove listeners leak (never removed)

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** At setup time the component registers three document listeners with anonymous handlers:  ```js document.addEventListener('keydown', e => { ... linkModeActive.value = true ... }) document.addEventListener('keyup', e => { ... }) document.addEventListener('mousemove', e => { ... }) ```  These are added on every mount but onUnmounted (lines 694-706) only removes the `window` 'graph-center-node' and 'keydown' listeners. The anonymous handlers cannot be removed and are never cleaned up, so each mount/unmount cycle (navigation away/back, HMR, or any future multi-instance use) leaks three document listeners. The leaked handlers also keep mutating the destroyed instance's `linkModeActive`/`boxSelectModeActive` refs.
- **Fix:** Hoist the three handlers into named functions, register them in onMounted, and call document.removeEventListener for each in onUnmounted (matching the pattern already used for the window listeners).

#### `src/components/KeyboardShortcutsModal.vue:5` — Escape @keydown handler cannot fire (no focusable element receives focus)

- **Category:** correctness
- **Problem:** The modal root <div class="modal shortcuts-modal" @keydown="handleKeydown"> relies on keydown to close on Escape, but the div has no tabindex and the modal auto-focuses nothing, so it never holds keyboard focus and the keydown listener does not fire. The same pattern exists in OnboardingModal.vue (line 5, @keydown="handleKeydown" handling Escape/Enter with no auto-focused element). AddNodeModal works only incidentally because it auto-focuses its input. Escape closing for these two modals effectively depends on the global keydown handler in useKeyboardShortcuts.js, making the local handlers unreliable/dead.
- **Fix:** Add tabindex="-1" to the modal root and focus it on open, or attach the Escape handler at window level (as the rest of the app does), and remove the non-functional local @keydown handlers if the global handler already covers it.

#### `src/components/PersonsView.vue:377` — Dead/identical ternary causes off-by-one in organization dropdown keyboard navigation

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** In handleOrgKeydown: `const max = exactOrgMatch.value ? filteredOrganizations.value.length : filteredOrganizations.value.length` — both branches are identical, so the ternary is meaningless. The intent was that the highlightable max index is `length` when a 'Create' option is shown (selectedOrgIndex === filteredOrganizations.length, see template line 581/582) and `length - 1` when there is no create row. The create row only renders when `!exactOrgMatch` (template line 579). Because max is always `length`, ArrowDown can move the highlight to a non-existent create row when an exact org match exists, and pressing Enter then hits the `selectedOrgIndex.value < filteredOrganizations.value.length` branch as false but the create branch is guarded by `!exactOrgMatch`, leaving Enter doing nothing.
- **Fix:** Compute `const max = exactOrgMatch.value ? filteredOrganizations.value.length - 1 : filteredOrganizations.value.length` (clamp to >= 0).

#### `src/components/ViewRenderer.vue:196` — start-edit / start-notes event argument dropped in CardsView relay

- **Category:** correctness
- **Problem:** CardsView emits these with two args: `emit('start-edit', node, $event)` and `emit('start-notes', node, $event)`. ViewRenderer relays them with `@start-edit="emit('start-edit', $event)"` and `@start-notes="emit('start-notes', $event)"`, where `$event` is only the FIRST emitted argument (the node). The DOM event is silently dropped before reaching App.vue's startEditing(node, e)/startInlineNotes(node, e), which call `e?.stopPropagation()`. The `?.` guard prevents a crash, but stopPropagation never runs, so the click can bubble (e.g. trigger card selection/deselection) when starting an inline edit. Other multi-arg relays in this file correctly use arrow functions (e.g. drag-over).
- **Fix:** Relay with explicit arrow functions: `@start-edit="(node, e) => emit('start-edit', node, e)"` and likewise for start-notes.

#### `src/components/WorkspaceSelector.vue:117` — Workspace deletion asks the user to confirm twice

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** WorkspaceSelector.deleteWorkspace() shows a native confirm dialog before emitting 'delete':      if (confirm(`Delete workspace "${currentWorkspace.value?.name}"? This cannot be undone.`)) {       emit('delete', props.modelValue)       closeSettings()     }  The parent (src/App.vue:155-157) wires @delete to deleteCurrentWorkspace, which shows ANOTHER confirm:      async function deleteCurrentWorkspace() {       const ws = workspaces.value.find(w => w.id === currentWorkspace.value)       if (ws && confirm(`Delete workspace "${ws.name}"?`)) await _deleteCurrentWorkspace()     }  So the user is prompted to confirm the same deletion twice. The two prompts are also worded differently.
- **Fix:** Confirm in exactly one place. Either remove the confirm() from WorkspaceSelector and let the emitted 'delete' be handled by App.vue's confirm, or remove the App.vue confirm and treat the emitted event as already-confirmed intent.

#### `src/composables/useDemoWorkspace.js:33` — showToast called with a string instead of an options object, dropping toast type

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** showToast's signature is showToast(message, { duration = 3000, type = 'info' } = {}). Every call in useDemoWorkspace passes a plain string as the second argument, e.g. showToast('Demo workspace created', 'success') and showToast(result.error || 'Failed to create demo workspace', 'error'). Destructuring { type } from the string 'success'/'error' yields undefined, so type silently falls back to the default 'info'. Success and error toasts are therefore rendered as info toasts (wrong styling/semantics). This is the only place in the codebase that calls showToast with a string; every other caller (useErrorHandler.js, tests) passes an options object. Affects lines 24, 33, 35, 52, 54.
- **Fix:** Pass an options object: showToast('Demo workspace created', { type: 'success' }), showToast(msg, { type: 'error' }), etc.

#### `src/composables/useDetailPanelCore.js:0` — Entire useDetailPanelCore composable is unused by production code

- **Category:** dead-code  ·  **Severity adjusted:** high → medium
- **Problem:** This 498-line composable is never imported by any Vue component. DetailPanel.vue re-implements the same logic inline (it imports useMentions, useNodeTable, useErrorHandler directly and re-declares editedNode/children/notes autosave/export/drag handlers itself), and the detail/ forms (PersonDetailForm.vue, OrganizationDetailForm.vue) do not import it either. Verified via grep: the only references to useDetailPanelCore across src/ are the file itself and src/__tests__/useDetailPanelCore.test.js. The module duplicates a large amount of logic that actually lives in DetailPanel.vue, so it is dead code that also drifts from the real implementation (e.g. it hardcodes a 500ms notes autosave delay while DetailPanel.vue uses the shared AUTOSAVE_DELAY_MS constant).
- **Fix:** Delete useDetailPanelCore.js (and its test), or refactor DetailPanel.vue / the detail forms to actually consume it so the duplicated logic has a single source of truth.

#### `src/composables/useKeyboardShortcuts.js:198` — Tab navigation checks viewMode 'nodes' which is not a valid ViewMode, so graph view never uses flatChildren

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** Line 198: const nodes = viewMode.value === 'nodes' ? flatChildren?.value || [] : filteredChildren?.value || []. The valid ViewMode union (src/types/settings.ts) is 'graph' | 'cards' | 'list' | 'table' | 'timeline' | 'persons' | 'tasks' | 'trash' | 'tree' — there is no 'nodes'. The default view mode is 'graph'. The adjacent comment says 'Use flatChildren for graph view (all nodes in subgraph)', and git history shows the commit 'Fix Tab to visit all nodes in graph view subgraph' intended this branch to fire in graph view. Because viewMode.value can never equal 'nodes', the condition is always false and Tab in graph view falls back to filteredChildren (only top-level nodes) instead of the full flattened subgraph — the intended fix is dead.
- **Fix:** Change the comparison to viewMode.value === 'graph' to match the actual ViewMode literal.

#### `src/services/api.ts:380` — webApi omits exportJSON/exportCSV/importJSON/importCSV while stubbing other desktop-only methods

- **Category:** consistency
- **Problem:** webApi implements stubs for desktop-only features that throw or return inert values (e.g. backup at api.ts:427, restoreBackup at 435, getOrCreateTagNode at 385 throws a clear message). However exportJSON, exportCSV, importJSON, and importCSV are simply absent from webApi (only exportMarkdown is present, api.ts:323). These methods are called via `api.` in non-Electron-guarded UI code: src/composables/useDetailPanelCore.js:315/325 (api.exportJSON/api.exportCSV) and src/components/settings/DataSettings.vue:55/57 (api.importJSON/api.importCSV). In web mode these are undefined and throw `is not a function` rather than the controlled 'only available in desktop app' error used elsewhere. Inconsistent with the established stub pattern.
- **Fix:** Add webApi stubs for exportJSON/exportCSV/importJSON/importCSV that throw or return the same 'only available in desktop app' style result used by backup/restore, so web-mode failures are controlled and consistent.

#### `src/services/ollamaService.js:80` — Ollama generateWithTools ignores contextSize, dropping the configured num_ctx

- **Category:** correctness
- **Problem:** agentService.buildProviderOptions (agentService.js:52-58) forwards contextSize for the ollama provider, and runAgentLoop spreads it into service.generateWithTools (agentService.js:133-137). But ollamaService.generateWithTools (line 80) destructures only `{ messages, tools, model, endpoint }` and never sets `options.num_ctx` on the /api/chat request body. By contrast api.ts ollamaGenerate (line 500) does set `num_ctx: contextSize || 32768`. As a result the research agent's tool-calling requests silently run with Ollama's default context window regardless of the user's configured contextSize, which can truncate long agent conversations.
- **Fix:** Accept contextSize in generateWithTools and include `options: { num_ctx: contextSize || 32768 }` in the request body, matching ollamaGenerate in api.ts.

#### `src/stores/nodes.js:240` — redo() of a delete action reads non-existent action.nodeId

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** deleteNode() pushes a delete action shaped as `{ type: 'delete', nodeData: node, parentId: node.parent_id }` (line 140) — there is no `nodeId` field. But redo()'s delete case does `await api.deleteNode(action.nodeId, true)` (line 240), so `action.nodeId` is always undefined, and the redo deletes nothing (or errors). The undo path correctly uses `action.nodeData` but redo does not. The two halves of the same action use inconsistent field names.
- **Fix:** Use `action.nodeData.id` in the redo delete case (and consider hard vs soft delete to match deleteNode's soft delete with `false`).

#### `src/stores/nodes.js:0` — Orphaned store duplicating the Command-based undo/redo system

- **Category:** design
- **Problem:** useNodesStore is only imported by its own test (src/__tests__/stores-nodes.test.js); it is not used by App.vue, any component, or any composable (verified via grep). The actual app performs node CRUD and undo/redo through src/commands/* via useNodeOperations.ts / useUndoRedo.ts / useNodeActionsUI.ts. This store re-implements a parallel, plain-object action format with an inline switch (lines 199-257) that diverges from the Command class hierarchy and contains the delete bugs above. Maintaining two undo systems is a consistency/maintenance hazard and the buggy one is unreachable from production.
- **Fix:** Either remove useNodesStore (and its test) if superseded by the composable+Command path, or wire it in and make it delegate to the Command classes so there is a single source of truth for undo/redo semantics.

#### `src/types/node.ts:109` — graph_type_filter typed as single-string union but used as an array of type strings

- **Category:** correctness  ·  **Severity adjusted:** high → medium
- **Problem:** Node.graph_type_filter is declared `graph_type_filter: GraphTypeFilter | null` where `GraphTypeFilter = 'all' | 'tasks' | 'notes' | 'persons'` (a single string value). However, the actual runtime code treats this field as a JSON-serialized array of visible node-type strings. In src/stores/filters.js:118-119 it does `if (Array.isArray(node?.graph_type_filter)) { visibleTypes.value = [...node.graph_type_filter] }` and at line 144 writes `graph_type_filter: [...visibleTypes.value]`. In src/components/GraphView.vue:363 it is serialized with `JSON.stringify(v)` and at 388-389 read via `Array.isArray(props.parent?.graph_type_filter) ? props.parent.graph_type_filter : ...`. The type therefore does not match reality (an array of arbitrary type-name strings, not one of four enum values). UpdateNodeData.graph_type_filter (node.ts:164) has the same wrong type. This is a genuine type/implementation mismatch that will mislead any TypeScript consumer.
- **Fix:** Either retype the field to `string[] | null` (matching the array-of-type-names actually stored), or if the stored form is a JSON string, type it as `string | null`. Update both Node and UpdateNodeData. Reconcile or remove the now-unused GraphTypeFilter union.

#### `src/utils/markdown.js:8` — Custom link renderer interpolates href/title unescaped, removing marked's built-in href sanitization

- **Category:** correctness
- **Problem:** The link renderer override builds anchors by raw interpolation: `<a href="${href}"${titleAttr} class="external-link" rel="noopener">${text}</a>` with `titleAttr = title ? \` title="${title}"\` : ''`. marked's default link renderer escapes the href and title; overriding it removes that protection, so a markdown link href like `javascript:...` or a title containing a double-quote can break out of the attribute. This global `marked.use(...)` affects every consumer of the singleton marked, including MarkdownRenderer.vue which renders with v-html and no DOMPurify.
- **Fix:** Escape href and title (and validate the href scheme to http/https/mailto) before interpolating, or keep marked's default link handling and only add the class/rel attributes via post-processing.

#### `src/utils/tooltip.js:54` — Tooltip HTML injects node.title/type unsanitized (XSS) while only notes are sanitized

- **Category:** correctness
- **Problem:** buildTooltipHTML interpolates user-controlled fields raw into the returned HTML string: `tooltip += \`<div class="tt-title">${node.title}</div>\`` (line 54) and `<span class="tt-type ${node.type}">${node.type}</span>` (line 58). Only node.notes is passed through DOMPurify.sanitize (renderMarkdown, line 75). The returned string is rendered by tippy with `allowHTML: true` (tooltipOptions, line 134-135) via useNodeTooltip.js and useGraphElements.js, so a node title such as `<img src=x onerror=...>` executes. The notes path already demonstrates the project's DOMPurify pattern; the rest of the tooltip bypasses it.
- **Fix:** Sanitize the entire assembled tooltip string with DOMPurify before returning, or HTML-escape node.title/node.type (and the date strings) before interpolation, consistent with the notes path.


## Low-severity confirmed findings (15)

#### `electron/preload.js:6` — preload.js hardcodes IPC channel strings instead of importing ipcChannels constants

- **Category:** consistency  ·  **Severity adjusted:** medium → low
- **Problem:** The whole point of ipcChannels.js is to centralize channel names so both sides of the IPC boundary stay in sync. Every handler module (electron/ipc/database.js, ollama.js, openai.js, agent.js, window.js) and main.js import constants from ipcChannels.js. preload.js instead inlines all ~80 channel strings as literals, e.g. `getNodes: params => ipcRenderer.invoke('db:getNodes', params)`, `onMenuUndo: callback => ipcRenderer.on('menu-undo', callback)`, `getVersion: () => ipcRenderer.invoke('app:getVersion')`. I verified that all current literals happen to match the constant values, so there is no live bug, but this is the one file that diverges from the centralized pattern and is the most error-prone place for a future typo (a mismatched string fails silently with no handler error).
- **Fix:** Import the channel constants from ./ipcChannels and use them in preload.js the same way the handler modules do, so renaming a channel in one place keeps both sides consistent.

#### `src/components/detail/ChildrenSection.vue:31` — Grandchildren state and template block are never populated (dead feature)

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** `expandedChildren = ref(new Set())` (line 31) and `grandchildren = ref({})` (line 32) are declared but no function or template handler ever writes to them (verified by grep across the component and its consumers DetailPanel.vue / DetachedView.vue — there is no toggle-expand / load-grandchildren wiring). Consequently the entire grandchildren `<template v-if="expandedChildren.has(child.id) && grandchildren[child.id]?.length">` block (lines 169-188) is permanently unreachable. The `getTypeIcon`/`personIconSvg` imports (line 4) are referenced ONLY inside that dead block, so they are effectively dead too.
- **Fix:** Either implement the expand/collapse interaction that populates `expandedChildren` and lazily loads `grandchildren`, or remove lines 31-32, the dead template block (169-188), and the now-unused imports on line 4.

#### `src/components/detail/LinkedItemsSection.vue:14` — Tag nodes are not excluded from the links list, causing duplicate display in the forms

- **Category:** correctness  ·  **Severity adjusted:** medium → low
- **Problem:** `filteredLinks` (lines 14-17) only filters out the single `excludeType`. In PersonDetailForm.vue (LinkedItemsSection with exclude-type="organization") and OrganizationDetailForm.vue (exclude-type="person"), tag nodes (type 'tag') are NOT excluded, so any linked tag is rendered both as a link chip here AND in TagsSection (which filters linkedNodes to type==='tag'). MetaInfoSection/MetadataGridSection avoid this by splitting into linkedTags vs linkedNonTags; the form path does not, so tags appear twice.
- **Fix:** Filter out 'tag' nodes from the links list in the forms (e.g. exclude tags in `filteredLinks` or pass an exclude set), matching the linkedNonTags treatment used by MetadataGridSection.

#### `src/components/detail/MetadataGridSection.vue:21` — Declared emit 'update:tags' is never emitted; parent listener never fires

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** `'update:tags'` is declared in defineEmits (line 21) but the template never calls `emit('update:tags', ...)`. Tag editing in this section is delegated to `TagInput`, which emits `@unlink` (→ 'unlink-tag') and `@refresh` (→ 'reload-links'). DetailPanel.vue wires `@update:tags="updateTags"` (line 799), so `updateTags` will never be invoked from this component. This is a stale event contract that hides the fact tag updates flow through unlink-tag/reload-links instead.
- **Fix:** Remove `'update:tags'` from the emits list (and reconsider the `@update:tags` listener on the parent), since tag mutations are actually communicated via 'unlink-tag' and 'reload-links'.

#### `src/components/HintBar.vue:36` — Unused 'currentWorkspace' prop

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** HintBar declares prop currentWorkspace ({ type: String, default: '' }) and App.vue passes :current-workspace="currentWorkspace" (App.vue:1098), but the prop is never referenced anywhere in HintBar's template or script. It is dead.
- **Fix:** Remove the currentWorkspace prop from HintBar and drop the :current-workspace binding in App.vue, or use it if a per-workspace hint was intended.

#### `src/composables/useAppController.js:19` — useAppController is never imported or used anywhere

- **Category:** dead-code  ·  **Severity adjusted:** high → low
- **Problem:** useAppController is exported as the 'Main orchestration composable for App.vue' but a tree-wide grep for `useAppController`/`AppController` across src/, electron/, and __tests__ returns only its own definition. App.vue does not use it; instead App.vue wires up useDetailController, useModalController, useViewStateController, useNavigationState, and defines its own helpers (e.g. its own `addChildFromDetail` at App.vue:649) directly. The entire file (including handleNodeDeselection, handleDetailOpen, addChildFromDetail, showAddNodeModal wrapper, handleShowOnboarding/CreateDemo/ResetDemo, setError/clearError) is dead code. CLAUDE.md mandates removing dead code.
- **Fix:** Delete src/composables/useAppController.js, or actually adopt it in App.vue to replace the manual controller wiring it was meant to consolidate.

#### `src/composables/useDetailPanelCore.js:8` — Docstring claims consumers that do not exist (aspirational/inaccurate)

- **Category:** docstring  ·  **Severity adjusted:** medium → low
- **Problem:** The header comment states: "Core composable for DetailPanel shared functionality / Used by DetailPanel, PersonDetailForm, and OrganizationDetailForm". None of those three components import or use this composable (confirmed by grep). The docstring describes an intended-but-unrealized design, violating the project rule that names/docs must honestly reflect what the code does.
- **Fix:** Either wire the named components to use the composable, or remove the file. If kept temporarily, correct the docstring to not assert false usage.

#### `src/composables/useGraphInit.js:109` — Cytoscape style rule for node[?isParent] never matches

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** The style array contains { selector: 'node[?isParent]', style: { width: 200, height: 100 } }, but buildElements (useGraphElements.js) never sets an isParent data field on any node; it uses isCurrentContainer, hasChildren, shouldGlow, etc. Grep across src confirms isParent is only ever set on plain org objects in PersonsView/PersonDetailForm, never on cytoscape node data. The rule is dead and the intended container sizing never applies.
- **Fix:** Either set an isParent/isCurrentContainer data flag in buildElements and target that selector, or remove the dead style rule.

#### `src/composables/useGraphLayout.js:575` — relaxLayout docstring names cose-bilkent but uses cola

- **Category:** docstring  ·  **Severity adjusted:** medium → low
- **Problem:** JSDoc says 'Run single relaxation pass with cose-bilkent.' but the layoutOptions built at line 588 use name: 'cola'. Inaccurate docstring; misleads maintainers about which layout engine runs.
- **Fix:** Update the docstring to say cola (or change the layout) so it honestly reflects the implementation.

#### `src/composables/useGraphLayout.js:367` — autoRelaxTimer is cleared but never assigned

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** let autoRelaxTimer = null is cleared in autoRelaxNewNodes (lines 657-660) and cleanup (lines 848-851) but is never assigned a setTimeout handle anywhere, so it is always null. The clearTimeout guards are dead code, a remnant of removed debounce logic.
- **Fix:** Remove autoRelaxTimer and its clearTimeout blocks, or implement the intended debounce by assigning the timer when scheduling autoRelaxNewNodes.

#### `src/composables/useNodeTable.js:116` — Inconsistent silent flag in handleError across sibling actions in the same file

- **Category:** consistency  ·  **Severity adjusted:** medium → low
- **Problem:** Most actions call handleError with `{ ..., silent: true }` (loadTable, createTable, updateTable, saveCell, saveCellStyle, saveCells), but deleteTable (line 116, `{ context: 'Deleting table' }`) and clearAllCells (line 230, `{ context: 'Clearing cells' }`) omit `silent: true`. This means delete/clear failures surface a user-facing error toast while all other failures are swallowed silently, an inconsistent error-handling policy within one composable with no apparent rationale.
- **Fix:** Pick one policy. Either add `silent: true` to deleteTable/clearAllCells for consistency, or remove it from the others if user-visible errors are intended.

#### `src/stores/filters.js:188` — filterTree() is never used

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** filterTree is exported in the store's public API (line 236) but is not referenced anywhere in the source tree or tests (verified via grep across src excluding the store definition). It duplicates the type-filter logic already in filterNodes.
- **Fix:** Remove filterTree, or if recursive tree filtering is needed, consolidate the duplicated 'tag' exclusion + visibleTypes check shared with filterNodes.

#### `src/stores/filters.js:142` — getSettingsForNode() is never used

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** getSettingsForNode is exported (line 234) but unreferenced anywhere (verified via grep). Filter persistence is instead done directly in GraphView.vue via saveNodeSetting('graph_max_depth', ...) and saveNodeSetting('graph_type_filter', ...). This method is dead code that also represents a divergent persistence path that the app does not actually use.
- **Fix:** Remove getSettingsForNode, or route GraphView's save logic through it to centralize the settings shape.

#### `src/stores/nodes.js:210` — undo()/redo() of delete re-creates the node instead of restoring the soft-deleted one

- **Category:** correctness  ·  **Severity adjusted:** high → low
- **Problem:** deleteNode() performs a soft delete via `api.deleteNode(nodeId, false)`. The correct inverse is `api.restoreNode(id)` (which exists in api.ts and is what the Command-based DeleteCommand uses). Instead, undo()'s delete case calls `api.createNode(action.nodeData)` (line 210), creating a brand-new node with a new id while the original soft-deleted row remains in the database. This duplicates/orphans data and loses the original id and links.
- **Fix:** Use `api.restoreNode(action.nodeData.id)` to undo a soft delete, mirroring DeleteCommand.undo().

#### `src/utils/dom.js:9` — scrollToNode is never referenced anywhere in the source tree or tests

- **Category:** dead-code  ·  **Severity adjusted:** medium → low
- **Problem:** Grep across src/ and electron/ shows the only occurrence of `scrollToNode` is its definition in src/utils/dom.js. The function (and effectively the whole dom.js module) is dead. Note it also hardcodes a 2000ms highlight timeout that duplicates settingsConstants.SEARCH_HIGHLIGHT_DURATION_MS.
- **Fix:** Remove dom.js (and scrollToNode) unless it is intended for imminent use; per CLAUDE.md dead code should be removed.


## Appendix A — Unverified lower-severity notes (84)

These low-severity notes were reported by reviewers but not put through adversarial verification. Treat as leads, not confirmed defects.

| File:line | Cat | Note |
|---|---|---|
| `electron/agentConfig.js:12` | docstring | isGarbageResponse JSDoc is incomplete compared to sibling functions |
| `electron/database/export.js:306` | correctness | importCSV splits on newlines before parsing quotes, corrupting fields containing newlines |
| `electron/database/migrations.js:47` | consistency | Migrations swallow all ALTER/INSERT errors via empty catch, masking real failures |
| `electron/database/nodes.js:226` | correctness | deleteNode recomputes descendant paths from already-reassigned parent but skips the moved nodes' own path update |
| `electron/database/nodes.js:62` | naming | updateDescendantPaths exposed as _updateDescendantPaths but recomputes only descendants, never the node argument |
| `electron/database/search.js:53` | design | person/workspace special-case duplicated between search and searchCount |
| `electron/database/tags.js:0` | consistency | Tag operations assigned without .bind() unlike every sibling module |
| `electron/database/tags.js:61` | consistency | getOrCreateTagNode reimplements _run instead of using it |
| `electron/database/tree.js:51` | consistency | Unconditional debug console.log in hot query path |
| `electron/database/workspaces.js:75` | design | deleteWorkspace can delete the default workspace and orphans nodes without reassignment |
| `electron/ipc/agent.js:254` | dead-code | executeAgentTool, fallbackResearch, runAgentLoop exported but only used internally |
| `electron/ipc/httpClient.js:112` | correctness | Request body is JSON.stringified twice in requestWithNode |
| `electron/ipc/httpClient.js:219` | consistency | OpenAI errors lose their provider-specific prefix; only Ollama sets errorPrefix/connectionError |
| `electron/ipc/openai.js:56` | correctness | error.data?.error?.message assumes parsed JSON but parseResponse may return a string |
| `electron/main.js:229` | consistency | APP_GET_VERSION handler registered inline in main.js instead of in an ipc/ module |
| `electron/wikipedia.js:57` | dead-code | WIKIPEDIA_ACTION_API and WIKIPEDIA_REST_API are exported but never imported anywhere |
| `electron/wikipedia.js:0` | design | wikipedia.js duplicates search/getContent logic already present in src/services/wikipediaService.js |
| `src/components/CardsView.vue:4` | dead-code | Unused import decodeHtml |
| `src/components/CardsView.vue:430` | dead-code | nestedGridStyle called with an extra ignored argument |
| `src/components/config/personsGridColumns.js:61` | dead-code | personsViewModes is exported but never used |
| `src/components/config/tableFormatters.js:43` | docstring | getBadgeStyle docstring and signature do not match its no-op behaviour |
| `src/components/detail/OrganizationDetailForm.vue:79` | dead-code | onTagsUpdate is defined but never referenced |
| `src/components/detail/OrganizationDetailForm.vue:43` | consistency | loadLinkedMembers is async with try/catch but performs no async work |
| `src/components/detail/PersonDetailForm.vue:134` | dead-code | onTagsUpdate is defined but never referenced |
| `src/components/detail/PersonDetailForm.vue:17` | dead-code | currentWorkspace prop is declared but never used |
| `src/components/DetailPanel.vue:668` | design | Notes edit/preview/split UI duplicated instead of reusing NotesSection.vue |
| `src/components/GraphEditModal.vue:43` | dead-code | defineExpose exposes refs that no parent consumes |
| `src/components/GraphView.vue:6` | dead-code | Unused import ALL_NODE_TYPES |
| `src/components/GraphView.vue:82` | correctness | isInsideEditor predicate returns an Element instead of a boolean |
| `src/components/HotkeyHelpModal.vue:0` | design | Duplicate 'Keyboard Shortcuts' modal with divergent, hard-coded content |
| `src/components/MarkdownRenderer.vue:146` | correctness | onMounted(renderContent) duplicates the immediate watcher, causing a redundant render |
| `src/components/MentionDropdown.vue:23` | consistency | Mixed emit() and $emit() within the same template |
| `src/components/NodeContextMenu.vue:24` | dead-code | menuRef bound in template but never read programmatically |
| `src/components/NotesEditor.vue:180` | dead-code | Exposed replaceSelection() is never called |
| `src/components/OllamaDiffPreview.vue:11` | dead-code | Declared 'edit' emit is never emitted |
| `src/components/PersonsView.vue:21` | dead-code | Unused prop selectedId |
| `src/components/PersonsView.vue:26` | dead-code | Declared emit 'update' is never emitted |
| `src/components/settings/AboutSettings.vue:2` | dead-code | props captured from defineProps but never referenced in script |
| `src/components/settings/AISettings.vue:62` | correctness | isAiEnabled fallback to ollamaEnabled is unreachable due to aiEnabled default |
| `src/components/SpotlightSearch.vue:127` | correctness | Notes ellipsis test uses raw length while text is decoded then truncated |
| `src/components/SpotlightSearch.vue:153` | correctness | selectedResultIndex shared between search results and recent items |
| `src/components/TableView.vue:27` | dead-code | Unused prop currentParentId |
| `src/components/TableView.vue:38` | dead-code | Declared emit 'toggle-favorite' is never emitted |
| `src/components/TimelineView.vue:36` | dead-code | Dead option passed to useTimelineLayout (_getColorMap is never consumed) |
| `src/components/TypeFilterDropdown.vue:37` | dead-code | Unused local variable in buttonLabel computed |
| `src/composables/useAIProviderConnection.js:152` | correctness | Debounce timers never cleared on unmount (timer leak) |
| `src/composables/useAppContext.ts:32` | typing | AppContext.children/flatChildren typed as Node[] but navigation produces TreeNode[] |
| `src/composables/useCardGrid.js:91` | dead-code | calculateGridColumns exported from composable but never used by any caller |
| `src/composables/useDataLoading.ts:226` | consistency | loadFavorites and loadTags swallow errors silently while sibling loaders use handleError |
| `src/composables/useDetailController.ts:7` | consistency | DetailPanelRef interface conflicts with the one in useAppContext.ts |
| `src/composables/useDetailPanelCore.js:246` | correctness | onDragLeave never clears drop indicator due to type mismatch / missing dataset attribute |
| `src/composables/useDetailPanelCore.js:285` | correctness | generateFilename assumes editedNode.value.title is a non-null string |
| `src/composables/useGraphElements.js:76` | docstring | buildElements JSDoc omits ancestorColor and inheritColors params |
| `src/composables/useGraphEvents.js:64` | dead-code | Documented getParent option is never used |
| `src/composables/useGraphInit.js:5` | dead-code | cytoscape-d3-force registered but no d3-force layout used |
| `src/composables/useGraphSettings.ts:48` | dead-code | radialSettings.nestingFactor and gravityRange are persisted but never consumed |
| `src/composables/useInlineEdit.js:10` | docstring | onSaveNotes JSDoc omits the options argument actually passed |
| `src/composables/useMentions.js:74` | dead-code | Unused _currentNodeId parameter in handleInput |
| `src/composables/useMentions.js:184` | correctness | loadPersons() fire-and-forget at composable setup with workspaceId fixed at construction |
| `src/composables/useNavigation.ts:346` | correctness | enterContainer setTimeout is never tracked or cleared on unmount |
| `src/composables/useNavigation.ts:420` | correctness | goToSibling treats parent_id 0 as falsy and would query roots instead of children |
| `src/composables/useNodeActionsUI.ts:3` | dead-code | Unused type imports: Ref, Api, CreateNodeParams, DeleteResult, DeleteMultipleResult |
| `src/composables/useNodeOperations.ts:53` | design | Duplicate type definitions across useNodeOperations.ts and useAppContext.ts |
| `src/composables/useNodeTable.js:277` | consistency | getColumnName duplicated across modules |
| `src/composables/useSelection.ts:255` | consistency | removeFromSelection mutates the Set in place while the rest of the file reassigns a new Set |
| `src/composables/useTimelineDates.js:220` | consistency | calculateDueUrgency parses dates with new Date() instead of the module's parseLocalDate helper |
| `src/composables/useTimelineLayout.js:40` | docstring | JSDoc documents getColorMap but parameter is _getColorMap and is never used |
| `src/composables/useTreeExpand.js:57` | consistency | expandAncestors and setExpandedIds mutate expanded state without persisting, unlike sibling mutators |
| `src/main.js:37` | correctness | Unvalidated parseInt of detached query param can yield NaN nodeId |
| `src/services/nodeCache.js:262` | dead-code | getNodeCache and resetNodeCache singleton accessors are never used |
| `src/services/ollamaService.js:12` | dead-code | Unused _model parameter on handleConnectionError |
| `src/services/wikipediaService.js:49` | dead-code | getSummary is never used |
| `src/stores/filters.js:97` | dead-code | resetToDefaults() is never used and duplicates showAllTypes() |
| `src/stores/filters.js:54` | dead-code | hasActiveFilter and allTypes getters are never used |
| `src/stores/nodes.js:191` | naming | pushUndo accepts plain action objects, not Command instances |
| `src/types/command.ts:10` | dead-code | CommandType union exported but never used; Command.type is plain string |
| `src/types/components.ts:5` | dead-code | Unused import GraphTypeFilter in components.ts |
| `src/types/settings.ts:173` | consistency | UseSettingsReturn omits settingsReady that the composable always returns |
| `src/utils/constants.js:130` | dead-code | getTypeIconHtml is a duplicate of getTypeIcon, used only by a test asserting they are identical |
| `src/utils/constants.js:117` | correctness | getPersonColor treats personId 0 as missing |
| `src/utils/demoData.js:31` | dead-code | deleteDemoWorkspace is exported but only used internally |
| `src/utils/errorTypes.js:58` | dead-code | Several AppError subclasses are never instantiated outside their own tests |
| `src/utils/markdown.js:32` | dead-code | `export { marked }` is unused; only handleExternalLinkClick is imported elsewhere |
| `src/utils/tooltip.js:19` | consistency | Duplicated formatDate implementation instead of reusing utils/formatting.js |

## Appendix B — Refuted by verification

These reviewer findings were checked and rejected as not-real (or not applicable); recorded for transparency.

- `src/components/GraphView.vue:240` — "Module-level `globalCollapseHandlerAttached` binds collapse handling to the first instance and never cleans up" — refuted.
- `src/components/DetailPanel.vue:371` — "`changeWorkspace` emits raw Vue proxy, bypassing the `toRaw` IPC-safety pattern" — refuted.
- `src/composables/useSpreadsheetKeyboard.js:121` — "Multi-cell typing buffer keeps stale characters after the 1.5s timeout" — refuted.
