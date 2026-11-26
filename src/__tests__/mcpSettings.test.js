import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/api', () => ({
  api: { mcpGetStatus: vi.fn(), mcpSetEnabled: vi.fn(), onMcpStatus: vi.fn() },
}))

import { api } from '../services/api'
import McpSettings from '../components/settings/McpSettings.vue'

const clientConfig = { command: '/app', args: ['/app/stdio.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }
const off = { enabled: false, running: false, clients: 0, clientConfig }
const on = { enabled: true, running: true, clients: 0, clientConfig }

beforeEach(() => {
  vi.clearAllMocks()
  api.onMcpStatus.mockReturnValue(() => {})
})

describe('McpSettings', () => {
  it('shows the server off, without client details', async () => {
    api.mcpGetStatus.mockResolvedValue(off)
    const wrapper = mount(McpSettings)
    await flushPromises()
    expect(wrapper.find('[data-testid="mcp-enabled"]').element.checked).toBe(false)
    expect(wrapper.find('[data-testid="mcp-copy-config"]').exists()).toBe(false)
  })

  it('turns the server on through the api', async () => {
    api.mcpGetStatus.mockResolvedValue(off)
    api.mcpSetEnabled.mockResolvedValue(on)
    const wrapper = mount(McpSettings)
    await flushPromises()
    await wrapper.find('[data-testid="mcp-enabled"]').setValue(true)
    await flushPromises()
    expect(api.mcpSetEnabled).toHaveBeenCalledWith(true)
    expect(wrapper.find('[data-testid="mcp-clients"]').text()).toBe('Connected clients: 0')
  })

  it('updates the client count when the main process reports it', async () => {
    api.mcpGetStatus.mockResolvedValue(on)
    const wrapper = mount(McpSettings)
    await flushPromises()
    api.onMcpStatus.mock.calls[0][0]({ ...on, clients: 1 })
    await flushPromises()
    expect(wrapper.find('[data-testid="mcp-clients"]').text()).toBe('Connected clients: 1')
  })

  it('copies the client configuration', async () => {
    api.mcpGetStatus.mockResolvedValue(on)
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    const wrapper = mount(McpSettings)
    await flushPromises()
    await wrapper.find('[data-testid="mcp-copy-config"]').trigger('click')
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(clientConfig)
  })
})
