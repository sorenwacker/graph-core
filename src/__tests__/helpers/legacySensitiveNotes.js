import crypto from 'crypto'
import { LEGACY_SENSITIVE_MARKER } from '../../../electron/database/sensitiveNotes.js'
import { wrapKeyWithPassword } from '../../../electron/database/encryption.js'

/**
 * Fixtures in the format earlier versions wrote: AES-256-GCM under one
 * symmetric key wrapped under the recovery password. The app only reads this
 * format (to migrate it), so the writer lives with the tests.
 */

export function legacyKey() {
  return crypto.randomBytes(32)
}

export function legacyEncryptNote(plaintext, key) {
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return LEGACY_SENSITIVE_MARKER + Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export function legacyWrapKey(key, password) {
  return wrapKeyWithPassword(key, password)
}
