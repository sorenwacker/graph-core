import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import SecuritySettings from '../components/settings/SecuritySettings.vue'
import SensitiveNotesSettings from '../components/settings/SensitiveNotesSettings.vue'

/**
 * Settings > Security shows both sections at once, and every password field in
 * them takes the same recovery password. They were all labelled "Recovery
 * password", so the field that disables encryption - decrypting the whole
 * database - was indistinguishable from the one that unlocks notes for the
 * session, except by position. See docs/architecture/encryption.md.
 */

const sensitiveStatus = ref({ available: true, enabled: true, unlocked: false })

vi.mock('../composables/useSensitiveNotes', () => ({
  useSensitiveNotes: () => ({
    status: sensitiveStatus,
    refresh: vi.fn(),
    enable: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    disable: vi.fn(),
  }),
}))

vi.mock('../services/api', () => ({
  api: {
    securityStatus: vi.fn(async () => ({
      state: 'encrypted',
      keychainAvailable: true,
      touchIdAvailable: true,
      touchIdEnabled: true,
    })),
  },
}))

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

/** Labels of the password fields on screen: placeholder, or aria-label. */
async function passwordLabels(component) {
  const w = mount(component)
  await flush()
  return w.findAll('input[type="password"]').map(i => i.attributes('aria-label') || i.attributes('placeholder'))
}

describe('password fields in Settings > Security', () => {
  it('never labels two simultaneously visible fields the same', async () => {
    const labels = [...(await passwordLabels(SecuritySettings)), ...(await passwordLabels(SensitiveNotesSettings))]

    expect(labels.length).toBeGreaterThan(1)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('says what the destructive field does, since it decrypts the database', async () => {
    const labels = await passwordLabels(SecuritySettings)

    expect(labels.some(l => /disable/i.test(l))).toBe(true)
  })

  it('says what the sensitive-notes field does', async () => {
    const labels = await passwordLabels(SensitiveNotesSettings)

    expect(labels.some(l => /unlock/i.test(l))).toBe(true)
  })
})
