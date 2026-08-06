# Changelog

All notable changes to Graph Core are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semantic versioning. Releases are tag-driven: only tagged versions ship.

## [1.11.0] - 2026-08-06

Consolidated release covering all changes since v1.10.5 (versions 1.10.6-1.10.20 were internal bumps that never shipped).

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
