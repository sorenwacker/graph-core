import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/api', () => ({
  api: {
    sensitiveStatus: vi.fn(),
    sensitiveEnable: vi.fn(),
    sensitiveUnlock: vi.fn(),
    sensitiveLock: vi.fn(),
    sensitiveDisable: vi.fn(),
    onSensitiveLocked: vi.fn(() => () => {}),
  },
}))

import { api } from '../services/api'
import SensitiveNotesSettings from '../components/settings/SensitiveNotesSettings.vue'

beforeEach(() => vi.clearAllMocks())

describe('SensitiveNotesSettings', () => {
  it('renders nothing when database encryption is off', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: false, enabled: false, unlocked: false })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()
    expect(wrapper.find('[data-testid="sensitive-settings"]').exists()).toBe(false)
  })

  it('offers enable when available but not yet enabled', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: false, unlocked: false })
    api.sensitiveEnable.mockResolvedValue({ success: true })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()

    await wrapper.find('[data-testid="sensitive-enable-password"]').setValue('recovery-pw')
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Enable')
      .trigger('click')
    await flushPromises()
    expect(api.sensitiveEnable).toHaveBeenCalledWith('recovery-pw')
  })

  it('offers unlock when enabled and locked', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: false })
    api.sensitiveUnlock.mockResolvedValue({ success: true })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()

    await wrapper.find('[data-testid="sensitive-unlock-password"]').setValue('recovery-pw')
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Unlock')
      .trigger('click')
    await flushPromises()
    expect(api.sensitiveUnlock).toHaveBeenCalledWith('recovery-pw')
  })

  it('offers lock now when unlocked', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: true })
    api.sensitiveLock.mockResolvedValue({ success: true })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()

    expect(wrapper.find('[data-testid="sensitive-lock"]').exists()).toBe(true)
    await wrapper.find('[data-testid="sensitive-lock"]').trigger('click')
    await flushPromises()
    expect(api.sensitiveLock).toHaveBeenCalled()
  })

  it('disables from the unlocked session without a separate password', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: true })
    api.sensitiveDisable.mockResolvedValue({ success: true })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()

    expect(wrapper.find('[data-testid="sensitive-disable-password"]').exists()).toBe(false)
    await wrapper.find('[data-testid="sensitive-disable"]').trigger('click')
    await flushPromises()
    expect(api.sensitiveDisable).toHaveBeenCalled()
  })

  it('shows at most one password field, never three', async () => {
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: false })
    const wrapper = mount(SensitiveNotesSettings)
    await flushPromises()
    expect(wrapper.findAll('input[type="password"]').length).toBe(1)
  })
})
