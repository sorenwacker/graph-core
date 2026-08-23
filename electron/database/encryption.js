/**
 * At-rest encryption engine (docs/architecture/encryption.md).
 *
 * One random database key encrypts the sql.js export with AES-256-GCM. The key
 * is never stored; it is wrapped into key slots that travel in the file header,
 * so the file is self-contained: file plus recovery password is a complete
 * recovery path on any machine. The keychain slot's blob is produced by
 * Electron safeStorage at the caller; this module treats it as opaque bytes.
 */

const crypto = require('crypto')

const ENCRYPTION_MAGIC = 'GCENC1'
const FORMAT_VERSION = 1

const SLOT_TYPE_KEYCHAIN = 1
const SLOT_TYPE_PASSWORD = 2

const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const SALT_BYTES = 32
// scrypt cost parameters for the password slot; stored implicitly by format
// version, so raising them later means bumping FORMAT_VERSION.
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** Generate a fresh random database key. */
function generateDatabaseKey() {
  return crypto.randomBytes(KEY_BYTES)
}

/** Report whether a buffer is an encrypted database file. */
function isEncrypted(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= ENCRYPTION_MAGIC.length &&
    buffer.subarray(0, ENCRYPTION_MAGIC.length).toString() === ENCRYPTION_MAGIC
  )
}

/**
 * Wrap the database key under a password-derived key.
 *
 * Blob layout: salt (32) | nonce (12) | tag (16) | ciphertext.
 *
 * @param {Buffer} databaseKey - The key to wrap.
 * @param {string} password - The recovery password.
 * @returns {Buffer} The slot blob.
 */
function wrapKeyWithPassword(databaseKey, password) {
  const salt = crypto.randomBytes(SALT_BYTES)
  const wrappingKey = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT_OPTIONS)
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, nonce)
  const ciphertext = Buffer.concat([cipher.update(databaseKey), cipher.final()])
  return Buffer.concat([salt, nonce, cipher.getAuthTag(), ciphertext])
}

/**
 * Unwrap the database key from a password slot blob.
 *
 * @param {Buffer} blob - The slot blob from wrapKeyWithPassword.
 * @param {string} password - The recovery password.
 * @returns {Buffer} The database key.
 * @throws {Error} When the password is wrong or the blob is tampered.
 */
function unwrapKeyWithPassword(blob, password) {
  const salt = blob.subarray(0, SALT_BYTES)
  const nonce = blob.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES)
  const tag = blob.subarray(SALT_BYTES + NONCE_BYTES, SALT_BYTES + NONCE_BYTES + TAG_BYTES)
  const ciphertext = blob.subarray(SALT_BYTES + NONCE_BYTES + TAG_BYTES)
  const wrappingKey = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT_OPTIONS)
  const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, nonce)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('Wrong password or corrupted key slot')
  }
}

/**
 * Encrypt a database export into the self-contained file format.
 *
 * @param {Buffer} plaintext - The sql.js export bytes.
 * @param {Buffer} databaseKey - The database key.
 * @param {Array<{type: number, blob: Buffer}>} slots - Key slots to embed.
 * @returns {Buffer} The encrypted file bytes.
 */
function encryptDatabase(plaintext, databaseKey, slots = []) {
  const header = [Buffer.from(ENCRYPTION_MAGIC), Buffer.from([FORMAT_VERSION, slots.length])]
  for (const slot of slots) {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(slot.blob.length)
    header.push(Buffer.from([slot.type]), length, slot.blob)
  }
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', databaseKey, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([...header, nonce, cipher.getAuthTag(), ciphertext])
}

/** Parse the header and return the byte offset where the payload begins. */
function payloadOffset(file) {
  let offset = ENCRYPTION_MAGIC.length
  const version = file[offset]
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported encryption format version: ${version}`)
  }
  const slotCount = file[offset + 1]
  offset += 2
  for (let i = 0; i < slotCount; i++) {
    const length = file.readUInt32BE(offset + 1)
    offset += 1 + 4 + length
  }
  return offset
}

/**
 * Read the key slots embedded in an encrypted file.
 *
 * @param {Buffer} file - The encrypted file bytes.
 * @returns {Array<{type: number, blob: Buffer}>} The embedded slots.
 */
function readSlots(file) {
  if (!isEncrypted(file)) {
    throw new Error('Not an encrypted database file')
  }
  let offset = ENCRYPTION_MAGIC.length + 1
  const slotCount = file[offset]
  offset += 1
  const slots = []
  for (let i = 0; i < slotCount; i++) {
    const type = file[offset]
    const length = file.readUInt32BE(offset + 1)
    offset += 1 + 4
    slots.push({ type, blob: file.subarray(offset, offset + length) })
    offset += length
  }
  return slots
}

/**
 * Decrypt an encrypted database file back to the sql.js export bytes.
 *
 * @param {Buffer} file - The encrypted file bytes.
 * @param {Buffer} databaseKey - The database key.
 * @returns {Buffer} The plaintext export.
 * @throws {Error} When the key is wrong or the file is tampered.
 */
function decryptDatabase(file, databaseKey) {
  if (!isEncrypted(file)) {
    throw new Error('Not an encrypted database file')
  }
  const offset = payloadOffset(file)
  const nonce = file.subarray(offset, offset + NONCE_BYTES)
  const tag = file.subarray(offset + NONCE_BYTES, offset + NONCE_BYTES + TAG_BYTES)
  const ciphertext = file.subarray(offset + NONCE_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv('aes-256-gcm', databaseKey, nonce)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('Wrong key or corrupted database file')
  }
}

module.exports = {
  ENCRYPTION_MAGIC,
  SLOT_TYPE_KEYCHAIN,
  SLOT_TYPE_PASSWORD,
  generateDatabaseKey,
  isEncrypted,
  wrapKeyWithPassword,
  unwrapKeyWithPassword,
  encryptDatabase,
  decryptDatabase,
  readSlots,
}
