# Sensitive notes

Sensitive notes are a second encryption layer on top of [database encryption](encryption.md). Database encryption protects the file when it is stolen. Sensitive-note encryption protects specific notes from a person at the running, unlocked app, because the whole database is plaintext in memory while the app runs.

## What it protects

A note marked sensitive is stored as ciphertext in the database, not just masked in the display. Its content is decrypted only after you enter the recovery password, and only into memory, for the length of an unlocked session.

The `notes_sensitive` flag by itself is display masking: it hides the note in cards and tooltips but leaves the text readable in the detail panel and stored in plaintext. Sensitive-note encryption makes the flag cryptographically real.

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

## Session and relock

Entering the recovery password unlocks all sensitive notes for the session. An idle timer relocks them after a period of no activity (default five minutes), clearing the sensitive-notes key from memory. Relocking also happens when the app locks or quits.

While unlocked, sensitive notes render normally. While locked, the detail panel shows a locked placeholder with an unlock action, and cards and tooltips keep the existing masking.

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
- Losing the recovery password loses the sensitive notes along with the rest of the encrypted database.
- Turning the flag off, or editing a sensitive note, requires an unlocked session; the app cannot decrypt without the password.
- A note that cannot be decrypted - written under a key that has since been replaced - reads as a locked placeholder rather than failing the query it appears in. It stays unreadable, and it blocks disabling the feature until it is deleted.
