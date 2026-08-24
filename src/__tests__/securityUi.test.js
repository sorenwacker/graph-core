import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/api', () => ({
  api: {
    securityStatus: vi.fn(),
    securityUnlock: vi.fn(),
    securityEnable: vi.fn(),
    securityDisable: vi.fn(),
    securitySetTouchId: vi.fn(),
  },
}))

import { api } from '../services/api'
import UnlockScreen from '../components/UnlockScreen.vue'
import SecuritySettings from '../components/settings/SecuritySettings.vue'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UnlockScreen', () => {
  it('unlocks with the password and reloads on success', async () => {
    api.securityUnlock.mockResolvedValue({ success: true })
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    const wrapper = mount(UnlockScreen)
    await wrapper.find('[data-testid="unlock-password"]').setValue('recovery-pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.securityUnlock).toHaveBeenCalledWith('recovery-pw')
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shows the error and stays put on a wrong password', async () => {
    api.securityUnlock.mockResolvedValue({ success: false, error: 'Wrong password or corrupted key slot' })

    const wrapper = mount(UnlockScreen)
    await wrapper.find('[data-testid="unlock-password"]').setValue('nope')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Wrong password')
  })
})

describe('SecuritySettings', () => {
  it('renders nothing in web mode, where encryption is unavailable', async () => {
    api.securityStatus.mockResolvedValue({ state: 'unavailable' })

    const wrapper = mount(SecuritySettings)
    await flushPromises()

    expect(wrapper.find('.security-settings').exists()).toBe(false)
  })

  it('enables encryption only when the passwords match and are long enough', async () => {
    api.securityStatus.mockResolvedValue({ state: 'plaintext', touchIdAvailable: false })
    api.securityEnable.mockResolvedValue({ success: true })

    const wrapper = mount(SecuritySettings)
    await flushPromises()

    await wrapper.find('[data-testid="enable-password"]').setValue('longenough')
    await wrapper.find('[data-testid="enable-password-confirm"]').setValue('different')
    await wrapper.find('button').trigger('click')
    expect(api.securityEnable).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('match')

    await wrapper.find('[data-testid="enable-password-confirm"]').setValue('longenough')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(api.securityEnable).toHaveBeenCalledWith('longenough')
  })

  it('requires the recovery password to disable', async () => {
    api.securityStatus.mockResolvedValue({ state: 'encrypted', touchIdAvailable: false, touchIdEnabled: false })
    api.securityDisable.mockResolvedValue({ success: true })

    const wrapper = mount(SecuritySettings)
    await flushPromises()

    const button = wrapper.findAll('button').find(b => b.text().includes('Disable'))
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="disable-password"]').setValue('recovery-pw')
    await button.trigger('click')
    await flushPromises()
    expect(api.securityDisable).toHaveBeenCalledWith('recovery-pw')
  })

  it('offers the Touch ID gate only when available', async () => {
    api.securityStatus.mockResolvedValue({ state: 'encrypted', touchIdAvailable: true, touchIdEnabled: false })
    api.securitySetTouchId.mockResolvedValue({ success: true })

    const wrapper = mount(SecuritySettings)
    await flushPromises()

    const toggle = wrapper.find('input[type="checkbox"]')
    expect(toggle.exists()).toBe(true)
    await toggle.setValue(true)
    expect(api.securitySetTouchId).toHaveBeenCalledWith(true)
  })
})
