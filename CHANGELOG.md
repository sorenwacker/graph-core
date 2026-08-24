# Changelog

All notable changes to Graph Core are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semantic versioning. Releases are tag-driven: only tagged versions ship.

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
