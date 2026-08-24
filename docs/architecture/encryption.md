# Encryption

Graph Core can encrypt the database at rest. This page describes the design; the settings surface for enabling it is documented in [Settings](../reference/settings.md).

## What it protects

Encryption at rest protects the *file*: copies picked up by cloud sync, Time Machine and other backups, exfiltration of `graph.db` from the disk, and access by other accounts on the machine.

It does not protect a running, unlocked app, and it cannot: sql.js holds the whole database in memory as plaintext. Exports (Markdown, JSON, CSV) are plaintext by design - exporting is the deliberate act of taking data out of the store.

## File format

An encrypted database file is self-contained: everything needed to unlock it with the recovery password travels with the file, so copying `graph.db` to another machine and entering the password is a complete recovery path.

```
magic "GCENC1" | format version (1 byte) | key slot count (1 byte)
per slot: type (1 byte) | length (4 bytes BE) | slot blob
payload: nonce (12 bytes) | GCM auth tag (16 bytes) | ciphertext
```

A file that does not start with the magic bytes is a legacy plaintext database; it loads as before and is rewritten encrypted on the next save after encryption is enabled.

## Keys

One random 256-bit database key encrypts the payload with AES-256-GCM. The key itself is never stored; it is wrapped into key slots (envelope encryption, the LUKS pattern):

- **Keychain slot** (type 1): the key wrapped by Electron `safeStorage`, which uses the OS keychain. This is the daily unlock - the app opens without prompting. The blob is machine-bound; it is useless on another machine. The slot is written only when `safeStorage` reports a secure backend. On Linux with no keyring service, `safeStorage` falls back to a backend that "encrypts" with a public, hardcoded key; that backend is detected through `getSelectedStorageBackend()` and treated as no keychain, so no slot is written. Without the slot the file is protected by the password slot alone, and every start asks for the recovery password.
- **Password slot** (type 2): the key wrapped with AES-256-GCM under a key derived from the recovery password by scrypt (N=2^15, r=8, p=1, 32-byte salt stored in the slot). This slot is the answer to keychain loss: a new machine, an OS reinstall, or a reset keychain. Unlocking with the password re-wraps the key into the new machine's keychain.

Both slots wrap the same database key, so either one opens the file. Enabling encryption requires setting the recovery password; there is no keychain-only mode, because keychain loss would then mean data loss.

GCM authenticates as well as encrypts: a tampered or corrupted file, and a wrong password, fail loudly at unwrap or decrypt rather than producing garbage data.

## Where encryption happens

All database bytes pass through one serialize/deserialize choke point in `electron/database/index.js`. `_save`, `backup`, and `restoreBackup` use it, so snapshots and backups are encrypted with the same key as the main file - an encrypted database with plaintext backups would be theater. The corrupt-file preservation path copies the file bytes as they are, which for an encrypted file preserves ciphertext.

## Unlock flow

At boot the main process inspects the database file before opening it:

1. A plaintext file opens as before.
2. An encrypted file is first tried against the keychain slot: `safeStorage` unwraps the machine-bound blob without any prompt. When the Touch ID gate is enabled (macOS), the fingerprint prompt stands between the keychain and the key.
3. When the keychain cannot unwrap - new machine, reset keychain, Linux without a secret service - the app shows the unlock screen. The recovery password unwraps the password slot, and the key is re-wrapped into this machine's keychain so the next boot is silent again.

The Touch ID gate setting lives in `security.json` next to the database, not inside it: settings stored in the database are unreachable while the database is locked.

Enabling encryption happens in **Settings > Security**: set the recovery password, and the file is rewritten encrypted on the next save. Disabling requires the recovery password and rewrites the file as plaintext.

## Honest limits

- Memory is plaintext while the app runs.
- Losing both the keychain and the recovery password loses the data. There is no backdoor; that is what encryption means. The UI states this when the password is set.
- Web mode is out of scope: there the data lives behind the HTTP API, not in a local file.

## Sensitive notes (second layer)

Planned as a separate layer on top: notes marked `notes_sensitive` get their own passphrase-derived encryption, revealed per session and relocked on a timer, so they are protected even from someone at the unlocked app. Not yet implemented; the flag is display masking only.
