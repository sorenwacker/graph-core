/**
 * Sensitive-note content encryption (docs/architecture/sensitive-notes.md).
 *
 * A note marked sensitive is stored as ciphertext under a random 256-bit
 * sensitive-notes key. That key is wrapped under the recovery password, so a
 * silent database unlock through the keychain does not reveal sensitive notes -
 * revealing them always takes the password. Content encryption is AES-256-GCM;
 * key wrapping reuses the same scrypt-based slot as the database password slot.
 */

const crypto = require('crypto')
const { wrapKeyWithPassword, unwrapKeyWithPassword } = require('./encryption')

const SENSITIVE_MARKER = 'SNENC1:'
const KEY_BYTES = 32
const NONCE_BYTES = 12

/** Generate a fresh random sensitive-notes key. */
function generateSensitiveKey() {
  return crypto.randomBytes(KEY_BYTES)
}

/** Report whether a stored notes value is sensitive-encrypted content. */
function isEncryptedNote(value) {
  return typeof value === 'string' && value.startsWith(SENSITIVE_MARKER)
}

/**
 * Encrypt note text into the stored marker format.
 *
 * @param {string} plaintext - The note content.
 * @param {Buffer} key - The sensitive-notes key.
 * @returns {string} `SNENC1:` followed by base64(nonce | tag | ciphertext).
 */
function encryptNote(plaintext, key) {
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const blob = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext])
  return SENSITIVE_MARKER + blob.toString('base64')
}

/**
 * Decrypt a stored sensitive-note value back to text.
 *
 * @param {string} value - A value produced by encryptNote.
 * @param {Buffer} key - The sensitive-notes key.
 * @returns {string} The note content.
 * @throws {Error} When the key is wrong or the value is tampered.
 */
function decryptNote(value, key) {
  if (!isEncryptedNote(value)) {
    throw new Error('Not an encrypted note value')
  }
  const blob = Buffer.from(value.slice(SENSITIVE_MARKER.length), 'base64')
  const nonce = blob.subarray(0, NONCE_BYTES)
  const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + 16)
  const ciphertext = blob.subarray(NONCE_BYTES + 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Wrong key or corrupted sensitive note')
  }
}

/** Wrap the sensitive-notes key under the recovery password. */
function wrapSensitiveKey(key, password) {
  return wrapKeyWithPassword(key, password)
}

/** Unwrap the sensitive-notes key with the recovery password. */
function unwrapSensitiveKey(blob, password) {
  return unwrapKeyWithPassword(blob, password)
}

module.exports = {
  SENSITIVE_MARKER,
  generateSensitiveKey,
  isEncryptedNote,
  encryptNote,
  decryptNote,
  wrapSensitiveKey,
  unwrapSensitiveKey,
}
