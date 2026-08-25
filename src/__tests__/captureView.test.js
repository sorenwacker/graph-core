import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/api', () => ({
  api: { createNode: vi.fn() },
}))

import { api } from '../services/api'
import CaptureView from '../components/CaptureView.vue'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('graphcore-workspace', 'work')
  window.electronAPI = { hideCapture: vi.fn() }
})

describe('CaptureView', () => {
  it('creates a root note in the current workspace on submit', async () => {
    api.createNode.mockResolvedValue({ id: 1 })
    const wrapper = mount(CaptureView)

    await wrapper.find('input').setValue('buy milk')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createNode).toHaveBeenCalledWith({
      type: 'note',
      title: 'buy milk',
      parent_id: null,
      workspace_id: 'work',
    })
  })

  it('hides the capture window after a successful save', async () => {
    api.createNode.mockResolvedValue({ id: 1 })
    const wrapper = mount(CaptureView)
    await wrapper.find('input').setValue('note')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(window.electronAPI.hideCapture).toHaveBeenCalled()
  })

  it('does nothing on an empty submit', async () => {
    const wrapper = mount(CaptureView)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createNode).not.toHaveBeenCalled()
    expect(window.electronAPI.hideCapture).not.toHaveBeenCalled()
  })

  it('hides on Escape without saving', async () => {
    const wrapper = mount(CaptureView)
    await wrapper.find('input').setValue('draft')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(api.createNode).not.toHaveBeenCalled()
    expect(window.electronAPI.hideCapture).toHaveBeenCalled()
  })

  it('clears the field after saving so the next capture starts empty', async () => {
    api.createNode.mockResolvedValue({ id: 1 })
    const wrapper = mount(CaptureView)
    await wrapper.find('input').setValue('first')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('input').element.value).toBe('')
  })
})
