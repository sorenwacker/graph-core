/**
 * Sensitive-note content encryption (docs/architecture/sensitive-notes.md).
 *
 * A note marked sensitive is stored as a sealed box under the stored X25519
 * public key, so locking a note needs no secret. Opening it needs the private
 * key, which is stored only wrapped: under the recovery password, and, when
 * the Touch ID gate is on, under the machine keychain. Content encryption is
 * AES-256-GCM under a key derived from the ephemeral shared secret with
 * HKDF-SHA256. Password wrapping reuses the scrypt slot of the database key.
 *
 * Notes written by earlier versions (`SNENC1:`) are AES-256-GCM under one
 * symmetric key; they are read here only to be migrated.
 */

const crypto = require('crypto')
const { wrapKeyWithPassword, unwrapKeyWithPassword } = require('./encryption')

const SENSITIVE_MARKER = 'SNENC2:'
const LEGACY_SENSITIVE_MARKER = 'SNENC1:'
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const HKDF_INFO = 'graph-core sensitive note v2'

// DER prefixes that turn a raw 32-byte X25519 key into the SPKI / PKCS#8
// encodings Node's key objects take.
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

function publicKeyObject(raw) {
  return crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
}

function privateKeyObject(raw) {
  return crypto.createPrivateKey({ key: Buffer.concat([X25519_PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' })
}

/** Generate a fresh X25519 key pair as raw 32-byte buffers. */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).subarray(-KEY_BYTES),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-KEY_BYTES),
  }
}

/** Report whether a stored notes value is sensitive-encrypted content, in either format. */
function isEncryptedNote(value) {
  return typeof value === 'string' && (value.startsWith(SENSITIVE_MARKER) || value.startsWith(LEGACY_SENSITIVE_MARKER))
}

/** Report whether a stored notes value is in the format earlier versions wrote. */
function isLegacyEncryptedNote(value) {
  return typeof value === 'string' && value.startsWith(LEGACY_SENSITIVE_MARKER)
}

/** The AES key for one note, from the shared secret and both public keys. */
function noteKey(privateKey, publicKey, ephemeralPublic, recipientPublic) {
  const shared = crypto.diffieHellman({ privateKey, publicKey })
  return Buffer.from(
    crypto.hkdfSync('sha256', shared, Buffer.concat([ephemeralPublic, recipientPublic]), HKDF_INFO, KEY_BYTES)
  )
}

/**
 * Seal note text under the public key.
 *
 * @param {string} plaintext - The note content.
 * @param {Buffer} recipientPublic - The stored public key, raw.
 * @returns {string} `SNENC2:` followed by base64(ephemeral public key | nonce | tag | ciphertext).
 */
function sealNote(plaintext, recipientPublic) {
  const ephemeral = generateKeyPair()
  const key = noteKey(
    privateKeyObject(ephemeral.privateKey),
    publicKeyObject(recipientPublic),
    ephemeral.publicKey,
    recipientPublic
  )
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return (
    SENSITIVE_MARKER + Buffer.concat([ephemeral.publicKey, nonce, cipher.getAuthTag(), ciphertext]).toString('base64')
  )
}

/**
 * Open a sealed note with the private key.
 *
 * @param {string} value - A value produced by sealNote.
 * @param {Buffer} privateKey - The stored private key, raw.
 * @returns {string} The note content.
 * @throws {Error} When the key is wrong or the value is tampered.
 */
function openNote(value, privateKey) {
  if (typeof value !== 'string' || !value.startsWith(SENSITIVE_MARKER)) {
    throw new Error('Not a sealed note value')
  }
  const blob = Buffer.from(value.slice(SENSITIVE_MARKER.length), 'base64')
  const ephemeralPublic = blob.subarray(0, KEY_BYTES)
  const nonce = blob.subarray(KEY_BYTES, KEY_BYTES + NONCE_BYTES)
  const tag = blob.subarray(KEY_BYTES + NONCE_BYTES, KEY_BYTES + NONCE_BYTES + TAG_BYTES)
  const ciphertext = blob.subarray(KEY_BYTES + NONCE_BYTES + TAG_BYTES)
  const recipientPublic = crypto
    .createPublicKey(privateKeyObject(privateKey))
    .export({ type: 'spki', format: 'der' })
    .subarray(-KEY_BYTES)
  try {
    const key = noteKey(
      privateKeyObject(privateKey),
      publicKeyObject(ephemeralPublic),
      ephemeralPublic,
      recipientPublic
    )
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Wrong key or corrupted sensitive note')
  }
}

/**
 * Decrypt a note written by an earlier version, for migration.
 *
 * @param {string} value - A `SNENC1:` value.
 * @param {Buffer} key - The old symmetric sensitive-notes key.
 * @returns {string} The note content.
 * @throws {Error} When the key is wrong or the value is tampered.
 */
function decryptLegacyNote(value, key) {
  if (!isLegacyEncryptedNote(value)) {
    throw new Error('Not a legacy encrypted note value')
  }
  const blob = Buffer.from(value.slice(LEGACY_SENSITIVE_MARKER.length), 'base64')
  const nonce = blob.subarray(0, NONCE_BYTES)
  const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES)
  const ciphertext = blob.subarray(NONCE_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Wrong key or corrupted sensitive note')
  }
}

/** Wrap the private key under the recovery password. */
function wrapPrivateKey(privateKey, password) {
  return wrapKeyWithPassword(privateKey, password)
}

/** Unwrap the private key with the recovery password. */
function unwrapPrivateKey(blob, password) {
  return unwrapKeyWithPassword(blob, password)
}

module.exports = {
  SENSITIVE_MARKER,
  LEGACY_SENSITIVE_MARKER,
  generateKeyPair,
  isEncryptedNote,
  isLegacyEncryptedNote,
  sealNote,
  openNote,
  decryptLegacyNote,
  wrapPrivateKey,
  unwrapPrivateKey,
}
