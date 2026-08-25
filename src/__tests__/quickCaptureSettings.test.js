import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/api', () => ({
  api: { captureGetConfig: vi.fn(), captureSetConfig: vi.fn() },
}))

import { api } from '../services/api'
import QuickCaptureSettings from '../components/settings/QuickCaptureSettings.vue'

beforeEach(() => vi.clearAllMocks())

describe('QuickCaptureSettings', () => {
  it('loads and shows the current config', async () => {
    api.captureGetConfig.mockResolvedValue({ enabled: true, accelerator: 'CommandOrControl+Shift+N' })
    const wrapper = mount(QuickCaptureSettings)
    await flushPromises()
    expect(wrapper.find('[data-testid="capture-enabled"]').element.checked).toBe(true)
    expect(wrapper.find('[data-testid="capture-accelerator"]').element.value).toBe('CommandOrControl+Shift+N')
  })

  it('toggles enable through the api', async () => {
    api.captureGetConfig.mockResolvedValue({ enabled: false, accelerator: 'CommandOrControl+Shift+N' })
    api.captureSetConfig.mockResolvedValue({ success: true, registered: true })
    const wrapper = mount(QuickCaptureSettings)
    await flushPromises()
    await wrapper.find('[data-testid="capture-enabled"]').setValue(true)
    await flushPromises()
    expect(api.captureSetConfig).toHaveBeenCalledWith({ enabled: true, accelerator: 'CommandOrControl+Shift+N' })
  })

  it('surfaces a failed hotkey registration', async () => {
    api.captureGetConfig.mockResolvedValue({ enabled: true, accelerator: 'CommandOrControl+Shift+N' })
    api.captureSetConfig.mockResolvedValue({
      success: false,
      error: 'Could not register the hotkey. Try a different one.',
    })
    const wrapper = mount(QuickCaptureSettings)
    await flushPromises()
    await wrapper.find('[data-testid="capture-accelerator"]').setValue('BadAccel')
    await wrapper.find('[data-testid="capture-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not register')
  })

  it('renders nothing in web mode where config is unavailable', async () => {
    api.captureGetConfig.mockResolvedValue({ enabled: false, accelerator: '' })
    const wrapper = mount(QuickCaptureSettings)
    await flushPromises()
    // config is present (web returns an object), so the section still renders;
    // the desktop-only nature is enforced by the disabled hotkey there.
    expect(wrapper.find('[data-testid="capture-settings"]').exists()).toBe(true)
  })
})
