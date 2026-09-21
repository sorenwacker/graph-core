# Sensitive notes

Sensitive notes are a second encryption layer on top of [database encryption](encryption.md). Database encryption protects the file when it is stolen. Sensitive-note encryption protects specific notes from a person at the running, unlocked app, because the whole database is plaintext in memory while the app runs.

## What it protects

A note marked sensitive is stored as ciphertext in the database, not just masked in the display. Its content is decrypted only after you enter the recovery password, and only into memory, for the length of an unlocked session.

The `notes_sensitive` flag by itself is not encryption: it keeps the note out of every list read (see [Read path](#read-path)) but leaves the text stored in plaintext and readable in the detail panel through the reveal action. Sensitive-note encryption makes the flag cryptographically real.

## Prerequisites

Sensitive-note encryption requires database encryption to be enabled, because it reuses the recovery password. The setting is unavailable until the database is encrypted.

## Keys

Enabling sensitive notes generates a random 256-bit sensitive-notes key. That key is wrapped under a key derived from the recovery password with scrypt, and the wrapped blob is stored in settings. The sensitive-notes key itself is never stored.

The recovery password is required to reveal sensitive notes even when the database opened silently through the keychain. This is deliberate: the keychain unlock defends against file theft and should not also reveal notes to a person at the unlocked machine. Silent database unlock and sensitive-note reveal are separate acts with separate keys.

## Storage format

A sensitive note's content is stored in the `notes` column with a marker:

```
SNENC1: base64(nonce | GCM auth tag | ciphertext)
```

A note without the marker is plaintext. When the flag is turned on, the note is re-encrypted on the next save; when it is turned off, the note is decrypted back to plaintext, which requires an unlocked session.

Content is encrypted with AES-256-GCM under the sensitive-notes key. GCM authenticates, so a wrong key or a tampered value fails loudly rather than returning garbage.

## Read path

The content of a sensitive note reaches the renderer through exactly one call, `db:getNodeNotes(id)`. Every other read - children, tree, search, links, tags, a single node - returns the node without it.

A note is sensitive on this path when its `notes_sensitive` flag is set or its stored value carries the `SNENC1:` marker. For such a node, `_rowToNode` returns:

| Field | Value |
| --- | --- |
| `notes` | `null` |
| `notes_withheld` | `true` |
| `has_notes` | whether the stored value is non-empty |

This holds whether the feature is enabled or not, and whether the session is locked or not. A view that lists nodes - graph, cards, table, timeline, persons, search results, the hover tooltip - never holds the text, so it cannot display it. Masking in those views is a consequence of the data being absent, not a rule each view has to remember.

`db:getNodeNotes(id)` returns `{ notes, locked }`. When the content is ciphertext the current session cannot decrypt it returns `{ notes: null, locked: true }` and no ciphertext. The detail panel, including its person and organization forms and the detached detail window, calls it when the user presses the reveal action, and drops the text again when the session relocks or the panel shows another node. The graph edit modal and the persons view editor have no reveal: for a node with `notes_withheld` they show no notes field and point to the detail panel.

Main-process code that needs the text - re-encoding a note when its flag is toggled, and export - reads it through `_readSensitiveNotes(id)`, which is not exposed to the renderer. It returns the decrypted text while the session is unlocked and the ciphertext marker while it is locked. [Export](#export) is the one other channel whose response can contain the text, by design.

### Writes

A renderer copy with `notes_withheld: true` has no note text to send. `pickNodeFields` omits `notes` for such a node, and `updateNode` ignores an incoming `notes` on a sensitive node unless the update also carries `notes_revealed: true`, which only the editor sets after a successful `db:getNodeNotes`. A title edit on a card therefore cannot overwrite a note the card never saw. This guards against accidental overwrites; it is not a security boundary, because the renderer is trusted code.

Undo of an edit to a revealed note restores the previous text: `updateNode` in the renderer reads it through `db:getNodeNotes` before the write and keeps it in the in-memory undo command.

### Display policy for non-sensitive notes

The Hide Sensitive setting masks notes that are not flagged but contain a keyword (`password`, `secret`, `api_key`, `credential`). That decision is made in one function, `notesForDisplay(node, { hideSensitive })` in `src/utils/nodeDisplay.js`, which returns the text to show or a withheld reason. Views do not read `node.notes` themselves. The same rule applies in the hover tooltip, graph nodes, cards, the table and search results.

The hover tooltip is shown for every node. For a node with `notes_withheld` it carries the title, type and dates and a placeholder in place of the note.

### Gates

- `sensitiveReadPath.test.js` asserts that every database read method returns `notes: null` for a flagged node with the feature off and with the session unlocked, that a locked session exposes neither text nor ciphertext, that `getNodeNotes` returns the text, and that an unrevealed write cannot replace it.
- `nodeDisplaySingleSource.test.js` scans `src/` and fails when a file reads `.notes` outside its allowlist - `nodeDisplay.js`, the notes editor components, and the modules that write notes - or when a view branches on `notes_sensitive`.

## Session and relock

Entering the recovery password unlocks all sensitive notes for the session. An idle timer relocks them after a period of no activity (default five minutes), clearing the sensitive-notes key from memory. Relocking also happens when the app locks or quits.

Unlocking does not put sensitive text into any list view; it makes `db:getNodeNotes` answer. While locked:

- The notes editor shows a locked placeholder with an unlock action on all three tabs, not only the preview. An editor on a locked note would display the ciphertext marker and silently lose whatever was typed, because the main process rejects the write.
- The sensitivity toggle asks for the recovery password when the feature is enabled and the session is locked, rather than acting. Marking a plaintext note sensitive encrypts it, which needs the key: acting anyway produced a raw `db:updateNode` failure. The password prompt appears in place, and the change the user asked for is applied as soon as the session unlocks, so locking a note is one uninterrupted action. While the feature is off the toggle acts immediately, because the flag is then display masking and no key is involved.
- The same flag in the graph edit modal is disabled while the session is locked. That surface has no unlock prompt of its own, so it explains what is missing instead of failing the write.
- The table's Notes column, cards, graph nodes and the hover tooltip show a lock icon for a node with `notes_withheld`, in both session states. Person and organization notes are withheld on the same terms as any other note.

## Search

Sensitive-note content is not searchable while locked. The content is ciphertext in the database, so a content search never matches it and never returns it as a snippet. Titles stay searchable, because titles are not encrypted. When the session is unlocked, search behaves the same way: it operates over the stored `notes` column, which holds ciphertext, so decrypted content does not re-enter the search path. Searching decrypted content would require holding plaintext in the search index, which would defeat the feature.

## Export

Exports (Markdown, JSON, CSV) are plaintext by design. A sensitive note exports as its ciphertext marker string when the session is locked, and as decrypted content when unlocked and the export is confirmed. The export UI states which of the two applies before writing the file.

## Turning the feature off

Disabling decrypts every note carrying the marker back to plaintext and clears its flag, then deletes the wrapped key. It requires an unlocked session, since the key is what does the decrypting.

Two properties matter, because getting either wrong destroys content permanently:

- **Every note, including trashed ones.** The sweep writes rows directly rather than going through `updateNode`, whose read path filters out soft-deleted rows. A trashed sensitive note skipped by the sweep would keep its ciphertext after the only key that could read it was gone.
- **All or nothing.** The sweep and the key deletion run in one batch. A note that fails to decrypt aborts the whole operation and leaves the feature enabled, rather than half-disabling and stripping the key from the rest.

Enabling verifies the recovery password against the database file before wrapping the key under it. The wrapped key can only ever be unwrapped with that password, so an unverified typo would produce notes that nobody can open.

## Honest limits

- Decrypted content is plaintext in memory during an unlocked session.
- Undo and redo of a note edit are lost when the window reloads. The undo stack is persisted to sessionStorage, which is disk-backed, so commands carrying note text are excluded from it; only the commands made after the most recent such edit are restored. Within a session, undo and redo of note edits work normally.
- Losing the recovery password loses the sensitive notes along with the rest of the encrypted database.
- Turning the flag off, or editing a sensitive note, requires an unlocked session; the app cannot decrypt without the password.
- A note that cannot be decrypted - written under a key that has since been replaced - reads as a locked placeholder rather than failing the query it appears in. It stays unreadable, and it blocks disabling the feature until it is deleted.
