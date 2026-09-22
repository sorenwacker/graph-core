# Changelog

All notable changes to Graph Core are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semantic versioning. Releases are tag-driven: only tagged versions ship.

## [Unreleased]

### Changed

- Timeline labels stay in view for every kind of bar ([guide](docs/guides/views.md#timeline-view)). When a task, event or group starts left of the visible area, its label moves to the visible edge and follows the scroll, as project box labels already did; before, a long bar scrolled into the past showed no name at all.

## [1.19.0] - 2026-09-22

### Security

- The content of a note marked sensitive no longer reaches any list view ([architecture](docs/architecture/sensitive-notes.md#read-path)). Every node read sent the full note to the renderer - decrypted, once the session was unlocked - and each view decided for itself whether to hide it. Seven places made that decision with differing rules, and three made none: a person card printed the first 60 characters, the persons view printed the note once Reveal was pressed, and search results printed an 80-character snippet. Node reads now return `notes: null` with `notes_withheld` for a sensitive note, in every session state. The text is returned by one call, `db:getNodeNotes`, which the detail panel makes when Show is pressed. A database test covers every read method, and a source scan fails when a view reads note text other than through `notesForDisplay`.

### Changed

- Marking a note sensitive no longer asks for the recovery password ([architecture](docs/architecture/sensitive-notes.md#keys)). Sensitive notes are now sealed under an X25519 public key that the app holds in the open, so setting the flag works in any session state, from the detail panel, the graph edit modal and anywhere else. Reading a note back needs the private key, which is stored only wrapped: under the recovery password, and, while "Require Touch ID at startup" is on, in the machine keychain. With that slot present the app asks for Touch ID at the moment of reveal, in the detail panel and in Settings; the recovery password remains the fallback. Notes encrypted by earlier versions are re-sealed under the key pair once, on the first password unlock after the update, in one batch that is rolled back if any note cannot be decrypted. Until that unlock, setting the flag still asks for the password.

- The AI action that was called Research is now called **Wikipedia**, because Wikipedia is its only source ([guide](docs/guides/ai-notes.md#wikipedia-lookup)). Four things made its results thin, and all four are changed. The article tool fetched Wikipedia's page summary, a single paragraph; it now fetches the full article text, cut to fit the configured context size, and a search returns five hits instead of three. The model was told to write "a clear, informative summary" of the topic; it is now told to answer the question, prefer dates, figures and names, name the article behind each paragraph, list its sources with links, and say so when the articles do not answer the question. The model knew nothing about the note it was asked from; it now receives the note's title, type and parent title, and never the note text. Models without tool calling got one paragraph of the top hit; they now get the top two articles in full under the same instructions.
- The Wikipedia action's prompt can be edited in Settings > AI > AI Prompts, and Reset restores the default. The preset was already listed there with an editable text, but that text was never sent to the model. The instructions that make the tools work are added by the app and are not part of the editable text. An edited Research prompt saved earlier is dropped, since it never had an effect; a deletion or a custom position of the preset is kept.
- Accepting a Wikipedia result appends it to the note under a `## Wikipedia: <question>` heading. It used to replace the whole note with the result.

- With sensitive notes unlocked, a sensitive note is no longer shown in cards, the table or graph node details; it is read in the detail panel after pressing Show. The graph edit modal and the persons view editor show no notes field for such a node.
- The hover tooltip appears for nodes with sensitive notes as well, with a placeholder in place of the note. It was suppressed for them in the graph view always and elsewhere only while Hide Sensitive was on.
- Hide Sensitive applies one rule in every view: a note that is not flagged but mentions `password`, `secret`, `api_key` or `credential` is masked. Graph node details previously hid every note while the setting was on, and cards and search results ignored it.
- A write that carries `notes` for a sensitive node is ignored unless it comes from the editor that loaded the text, so an edit made from a view that never held the note cannot erase it.

### Removed

- The browser-only copy of the lookup's agent loop (`agentService.js`, `wikipediaService.js`) and the `generateWithTools` helpers only it called. It duplicated the main-process implementation, had no tests, and was reachable only without the Electron bridge, where no backend exists to load nodes from. The browser API now answers that the lookup is available in the desktop app only.

### Fixed

- Marking an open note sensitive hides its text in the detail panel at once. Since the read-path change it stayed readable until another node was opened.

- "Wrap with parent" works again. It asked for the new parent's title with `window.prompt`, which Electron does not implement, so the action did nothing and gave no sign of it ([guide](docs/guides/detail-panel.md#wrap-with-parent)). It now asks in an in-app dialog, shared across the app so no component needs one of its own.

## [1.18.0] - 2026-08-28

### Fixed

- The user-data path is available while an encrypted database is still locked. It was registered alongside the database handlers, which do not exist until the database opens, so anything asking for it on the unlock screen got "no handler registered".

- Quick capture no longer blanks the app when it is in macOS fullscreen ([guide](docs/guides/quick-capture.md#fullscreen)). A fullscreen window owns its own Space, and showing an ordinary window while one is active made the system switch away from that Space, leaving the fullscreen window black. The capture window now floats above the fullscreen Space instead of displacing it.

- The `?` shortcuts list now includes every shortcut the app binds. Quick capture's global hotkey, view switching with `Ctrl/Cmd` and a digit, `Ctrl/Cmd + ,` for settings, `Ctrl/Cmd + /` and `?` itself were all bound but absent from the list, so the only way to find them was to read the source. A test now reads the places shortcuts are actually bound and fails if one is missing from the list ([reference](docs/reference/keyboard-shortcuts.md#discoverability)).

### Changed

- The sidebar hover handle reaches the bottom of the window instead of stopping a quarter of the way past the middle ([reference](docs/reference/interactions.md#sidebar-reveal)). Throwing the pointer into the bottom-left corner now opens the sidebar. The top third of the edge stays inert, which is what stopped the sidebar opening on incidental passes near the title bar.

## [1.17.0] - 2026-08-27

### Changed

- Search ranks title matches above notes matches ([guide](docs/guides/search.md#ranking)), in four tiers: exact title, title prefix, title contains, then notes-only. Within a tier the most recently updated node still comes first. Searching for a person now returns that person before the meeting notes mentioning them; previously results were ordered by modification date alone, so a recently edited note outranked the node the query named.
- The rule deciding whether a focused surface owns the keyboard now lives only in `utils/inputOwnership.js`. The shortcut handler kept a second copy that had already drifted from it: the private one knew a checkbox is not a text field, the shared one knew about select elements, code editors and contenteditable ancestors, and which rule applied depended on which key was pressed. Both rules are merged, and a test keeps the decision in one place.
- Removed nine timing constants that nothing referenced. A test now fails if an unused one is added back, so the file stays a record of values that actually govern behaviour.

### Fixed

- The notes editor no longer adds a blank line between list items ([guide](docs/guides/detail-panel.md#notes-section)). Pressing Enter on an empty list item used to move that item down instead of ending the list, and once a list held a blank line the editor inserted another one ahead of every following marker. Enter now ends the list on an empty item and keeps lists tight.
- Metadata uses the full width in fullscreen and detached mode. The bottom sections were laid out as a flex column there, so the width percentages resolved against the height and Table, Tasks and Metadata each shrank to their minimum width, leaving most of the window empty.
- Turning sensitive notes off no longer destroys trashed notes ([design](docs/architecture/sensitive-notes.md#turning-the-feature-off)). The sweep decrypted notes through a path that filters out soft-deleted rows, so a sensitive note in the trash kept its ciphertext while the only key that could read it was deleted. It now decrypts every note, including trashed ones, and the sweep plus the key deletion happen in one batch, so a note that fails to decrypt leaves the feature enabled instead of half-disabling it.
- Enabling sensitive notes verifies the recovery password before wrapping the key under it. A typo previously produced notes that could only be opened with the mistyped password.
- The undo stack no longer writes note text to sessionStorage, which is disk-backed. A decrypted sensitive note ended up there and outlived the relock that was supposed to clear it. Undo and redo of note edits still work normally within a session; after a window reload only the commands made since the most recent note edit are restored.
- Sensitive notes are withheld from every surface that showed them ([design](docs/architecture/sensitive-notes.md#session-and-relock)). The notes editor masked only its preview tab, so Edit and Split showed the content and, on a locked note, let the user type over ciphertext while the main process discarded the write. Person and organization notes were never masked at all, because the props that would have done it were not passed. The table's Notes column printed sensitive text in full, hover tooltip included.
- The wrapped sensitive-notes key is no longer readable or writable from the renderer. It is stored as a setting, so the generic settings channels handed it out and would have let the renderer overwrite or delete it, which makes every sensitive note permanently unreadable.
- A sensitive note that cannot be decrypted no longer breaks every list it appears in. It now reads as a locked placeholder instead of throwing out of the row decoder.
- The detached window no longer shows controls that do nothing. Pin, fullscreen, detach and the link-search buttons acted on the main window, which a detached window does not have, so three of them were wired to empty handlers and detach was not handled at all.
- Shift-clicking a card selects it. Cards View emitted the node on its own where the handler expects an options object, so the handler read undefined and selected nothing ([reference](docs/reference/interactions.md)).
- Clicking the notes on a nested card opens them for editing. The notes swallowed the click and emitted an event nothing was listening for, so nothing happened at all.
- The tooltip completion checkbox works in Table View. It emitted a node id where every consumer of that event expects a node.
- Importing JSON or CSV writes into the workspace you are in. `MainToolbar` sits between the app and the settings panel and never declared `currentWorkspace`, so the panel fell back to its default and every import landed in `work`. The same gap made the "Skip SSL verification" toggle inert and kept the tree from reloading after an import. A test now compares the two components' declared contracts, so a settings prop or event added later cannot silently go unrelayed.
- Linking two items that are already linked is rejected whichever way round you do it. Only a repeat in the stored direction was caught, so linking B to A after A to B stored the pair twice and showed it twice. Linking an item to itself is refused.
- Restoring an item from the trash puts it somewhere you can see it ([design](docs/architecture/database.md#reachability-after-restore)). An item trashed before its parent kept pointing at that parent, so restoring it on its own left it invisible: not a root, and not a child of anything shown. It is now reattached to the nearest ancestor still present, or to the top level.
- Moving an item into its own descendant is refused instead of corrupting the tree ([design](docs/architecture/database.md#acyclicity)). The move created a cycle that the path rebuild then walked until the call stack overflowed.
- Deleting a table column no longer shifts every other column's data left. Cells are addressed by position, and only the column definitions were rewritten, so the columns after the deleted one showed their neighbour's values and the last column's cells were stranded in the database. The column and its cells are now removed together in one operation.
- Typing in a styled cell keeps its styling. Cell writes replaced the whole record, so a value written on its own blanked the style, and a style written on its own would have blanked the value. Writes now merge with what is stored, and a field is cleared only when the caller names it.
- Undo no longer reaches into the workspace you just left ([guide](docs/guides/drag-drop.md#undo-support)). The stacks survived a workspace switch, and commands record item ids that carry no workspace, so `Cmd/Ctrl + Z` could change an item you could not see. Switching now clears both stacks.
- Redoing a creation keeps the actions that followed it working. The item comes back with a new id, and the actions still queued for redo went on naming the old one, so they silently applied to nothing.
- Undoing a completion clears the completion date it set, instead of leaving an unfinished item dated as finished. A date that was already there is put back unchanged.
- Moving an item to the top level can be undone. The move recorded no undo step at all because it never noted where the item came from.
- Moving a multi-item selection is one undo step, matching every other action, instead of not being undoable.
- Deleting several items at once deletes children before parents, so the shape of the selection survives undo. Deleting a parent first reparented its children and flattened the subtree that undo was meant to restore.
- Navigating quickly no longer loses a step. A load already in progress made the next one return without doing anything, so a second click, or a refresh after an edit, was dropped. Loads now run in order and the newest one wins; a slower earlier response is discarded instead of overwriting the view with a container you have already left.
- Opening an item that no longer exists falls back to the top level instead of leaving the previous contents on screen. The recovery ran while the failed load still held the lock, so it returned immediately and did nothing.
- The task list, search results and a person's organizations all keep the newest result when an earlier request finishes late.
- A failed "load more" in search retries the same page instead of skipping it.
- Rebuilding the graph while a rebuild is already running no longer leaves the previous graph in memory with its event listeners attached.
- A table edit that fails now says so. Creating, renaming, deleting a table and saving a cell all reported failures with the toast suppressed, and stored the message where nothing displayed it, so a rejected write looked identical to a successful one. Background refreshes stay quiet, since nobody asked for them.
- Cutting spreadsheet cells when the clipboard is unavailable no longer deletes them. The copy failed to a console warning and the cut deleted anyway, destroying the only copy of the content.
- A failed quick capture keeps your text and shows the reason instead of closing the window. The capture window is the only place that text exists.
- Changing an item's workspace puts the dropdown back if the change fails, rather than showing a move that did not happen.

## [1.16.0] - 2026-08-26

### Added

- Quick capture ([guide](docs/guides/quick-capture.md)): a system-wide hotkey (default `Ctrl/Cmd + Shift + N`) opens a small window to capture a note as a new top-level item in the current workspace, from any app. Enable it and change the hotkey in Settings > General. Desktop only; the hotkey registers after the database is unlocked.

### Changed

- Keyboard input ownership is decided in one place (`utils/inputOwnership.js`) rather than scattered through the shortcut handler. A surface that owns every key marks itself with `data-owns-keys`; text fields are recognised automatically. No behaviour change.

### Fixed

- Notes split view renders both panes again. The editor is a multi-root component, so a class passed by the parent was dropped and the editor pane collapsed while the preview took the space.
- The split view has a draggable divider between the editor and preview; drag it to change the ratio, double-click it to reset. The ratio is remembered. The default is an even split.

## [1.15.0] - 2026-08-25

### Added

- Sensitive-note encryption, a second layer on top of database encryption ([design](docs/architecture/sensitive-notes.md)). A note marked sensitive is stored as ciphertext, decrypted only after you enter the recovery password, and only for an unlocked session that relocks after five idle minutes. This protects notes from a person at the running, unlocked app, which whole-file encryption cannot do because the database is plaintext in memory while the app runs. Enable it in Settings > Security once database encryption is on. Locked content stays out of search; titles remain searchable.

### Fixed

- The Settings > Security panel shows the sensitive-notes section as soon as database encryption is enabled, without reopening the panel.
- Sensitive notes re-mask when the session relocks: an open note that was decrypted is re-locked to a password prompt on idle relock or a manual lock, instead of staying visible.
- The Settings > Security tab no longer shows three password fields at once. Each section shows at most one; disabling from an unlocked sensitive session needs no separate password.
- Double-clicking the notes preview switches to the editor.

## [1.14.1] - 2026-08-24

### Fixed

- Settings > Security states plainly whether encryption is on or off, with a status badge, instead of implying it through which form is shown.
- The sidebar handle's visible bar spans its entire active zone. The bar previously marked 48 pixels of a zone up to 280 pixels tall, so hovering the unmarked rest of the zone worked while hovering near it did nothing, which read as a flaky control.

## [1.14.0] - 2026-08-24

### Added

- Database encryption at rest (docs/architecture/encryption.md). Settings > Security encrypts the database file, backups, and snapshots with AES-256-GCM. One random database key is wrapped twice: into the OS keychain for silent startup, and under a scrypt-derived recovery password whose slot travels in the file header - the file plus the password is a complete recovery path on another machine. An optional Touch ID gate (macOS) stands between the keychain and the key at startup. When the keychain cannot open the file, an unlock screen accepts the recovery password and re-wraps the key into the local keychain. A wrong key, wrong password, or tampered file fails loudly; an encrypted file is never treated as corrupt and never replaced with an empty database.
- End-to-end smoke pack (e2e/, `make e2e`): boots the built app in real Electron with an isolated profile and walks startup, node creation, view switching, delete and undo, relaunch persistence, and the full encryption enable-relaunch-unlock cycle. Runs as a release gate.

### Fixed

- Node hover tooltips no longer paint over the open settings panel: tooltips stack below the overlay, do not open while settings is open, and an already-visible tooltip hides when settings opens.

## [1.13.0] - 2026-08-23

### Changed

- The unpinned sidebar opens from a visible handle vertically centered on the left edge instead of the full window edge. In a non-fullscreen window the full-height trigger opened the sidebar on every incidental mouse pass; the handle makes opening it an intentional act.
- All major dependency updates applied and validated: Electron 43 (verified by booting and packaging the real app), AG Grid 36 (verified against the live grid), Pinia 4, cytoscape-dagre 4 (verified headless with the app's layout options), marked 18, ESLint 10 (its new rules surfaced five real errors, fixed rather than suppressed), jsdom 30, lint-staged 17, concurrently 10.
- Node 22 is now required (`engines` declared): jsdom 30 does not support Node 20, which npm installs silently; CI and the release workflow build on Node 22, matching Electron 43's runtime.
- AI providers sit behind adapters with one shared interface; `useAiNotes` selects an adapter instead of branching per provider, and a test gate keeps provider equality checks out of the composable.
- The Ollama-named AI family is renamed to what it does: `useAiNotes`, `ApplyNotesEditCommand`, `AiDiffPreview`, `AiPromptModal`. None of them were Ollama-specific since OpenAI-compatible support arrived; old serialized undo entries still deserialize via a legacy type alias.

### CI

- Dependabot patch and minor updates merge automatically once the CI test check passes; the workflow verifies the check itself, so red CI blocks the merge even without branch protection. Majors always wait for a person.

## [1.12.0] - 2026-08-22

### Added

- `Cmd/Ctrl` plus a digit switches the main view, following the order of the view switcher (1 Graph, 2 Cards, 3 Table, 4 Tasks, 5 Timeline, 6 People, 7 Trash). The mapping is indexed off the same list the switcher renders, so the two cannot drift apart. The modifier is required because a bare digit would fire while typing into surfaces the application does not treat as text inputs.

### Fixed

- Detail-panel table: a cell editor now keeps its own keystrokes. A document-level capture handler was swallowing Backspace and Delete, so characters could not be deleted and the whole selected range was blanked instead, discarding text still open in the editor.
- Detail-panel table: pressing Enter no longer navigates the application into another node. After AG Grid commits an edit it leaves focus on a cell element rather than an input, so the global Enter shortcut fired and the detail panel reloaded a different node's table, which read as the table having lost every cell. Space and `n` had the same fault.
- Detail-panel table: edits are no longer lost when a save lands while another cell is being edited. Rows now carry a stable identity so a re-render updates them in place, and selection repaints refresh cells rather than redrawing rows.
- Detail-panel table: a selected range is visible again. The accent fill alone resolves to almost exactly the grid's own row hover colour against the black background, so the range is now outlined with a solid accent border drawn around its perimeter.
- Cards: a card with no notes yet shows an "Add notes..." placeholder. The notes element previously rendered only when notes already existed, leaving an empty card with no click target, so its first note could not be started from the card at all.
- Release workflow: re-runs no longer leave duplicate draft releases behind. A draft is not bound to its tag, so `gh release create` would create a second draft for a tag that already had a release.
- Dependency audit passes again: the lockfile pinned `nanoid` at a version with a high-severity advisory even though the dependent range already allowed the patched one.

### Changed

- Documentation is built with Zensical instead of MkDocs with Material, and the README links to the published site.
- Documentation corrected against the code: a Calendar view that was removed in May and a separate Tree view that has been the Table view since February were both still documented, the `tag` node type was missing from the reference, and 8 of 10 type colour values were stale. A test now gates the node type reference against `constants.js`.
- Documentation carries screenshots of each view, taken against the Demo workspace.

## [1.11.2] - 2026-08-07

### Fixed

- CI-packaged releases shipped without the bundled preload: `preload.build.js` is a gitignored build artifact and the release workflow ran `electron-builder` without `bundle:preload`, so packaged apps started with no IPC bridge, silently fell back to the web HTTP API, and showed errors and an empty graph despite intact local data. The workflow now bundles the preload before packaging and fails the release if any packaged `app.asar` lacks it. All earlier CI-built artifacts (v1.11.1 and the rc pre-releases) are affected and have been removed.

## [1.11.1] - 2026-08-07 (pulled: broken CI artifact)

Consolidated release covering all changes since v1.10.5 (versions 1.10.6-1.10.20 and 1.11.0 were internal bumps that never shipped as final releases; 1.11.0 shipped only as v1.11.0-rc.1).

### Added

- Double-click on the empty graph canvas opens the add-node dialog at that position.
- Link mode (Option + drag) draws a visible connector from the source node to the pointer.
- Shared node color resolution service; tree, cards, and persons inherit colors from any ancestor.
- Global tag delete from the sidebar, routed through the standard node deletion (undoable, lands in Trash).
- Getting-started help on empty Graph, Cards, and Table views, including keyboard hints.
- AI research agent with Wikipedia integration.
- Table miniature preview on graph nodes.

### Fixed

- Detail-panel table (spreadsheet): multi-cell drag selection is visible again (scoped CSS never matched AG Grid's cells), columns span the panel in every mode - side panel, fullscreen, and detached window - and edits are no longer lost when several cells are committed quickly or the panel closes mid-save.
- Deleting the current container redirects to its parent instead of leaving a stale view.
- Node reparenting (delete-reparent, cross-parent reorder, update, trash restore) recomputes the node's own depth and path along with its descendants.
- Sensitive notes no longer leak into hover tooltips; tooltip rendering unified and lockable.
- Graph: max depth persists per workspace in the database; per-container settings no longer leak into the home view; root node handling for childless and tag nodes corrected.
- Persons: split notes view restored, organization autocomplete keyboard navigation corrected, contact fields maskable.
- Notes: Cmd+A selects the note text (also in the detached window); Escape saves; markdown previews keep multi-line content and code fences.
- An unreadable database file is preserved next to the store before being replaced, instead of overwritten.
- Preload script is bundled so it loads under the Electron window sandbox.
- Remediation of 91 codebase-review findings, including XSS sanitization via a shared DOMPurify pipeline, web-mode crash fixes, and SQL correctness cleanups.

### Changed

- IPC channels unified behind shared constants; dead channels (repairWorkspaces, closeDetachedWindow, getVersion) removed.
- Import results are reported in a toast, including skipped-row counts.
- App icons aligned with the nodus brand colors (pitch-black background).
- All in-range dependencies updated (Electron 41.10, electron-builder 26.15, AG Grid 35.3, Vue 3.5.41); npm audit reports zero vulnerabilities.

### Security

- "Skip SSL verification" for AI endpoints applies to local endpoints only (localhost, 127.0.0.1, ::1, *.local); certificates for remote hosts are always verified. The policy is enforced by a test gate.

## [1.10.5] - 2026-06-15

- Codebase review remediation: XSS, web-mode crash, database correctness and cleanup (#46).
- Per-container graph settings persistence and tooltip placement (#48).

Older releases are documented on the [GitHub releases page](https://github.com/sorenwacker/graph-core/releases).
