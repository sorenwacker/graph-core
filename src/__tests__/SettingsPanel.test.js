import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import SettingsPanel from '../components/SettingsPanel.vue'

// Mock the api module
vi.mock('../services/api.js', () => ({
  api: {
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getDataPath: vi.fn().mockResolvedValue('/test/path'),
  },
}))

// Mock useErrorHandler
vi.mock('../composables/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn(),
  }),
}))

// Mock demoData
vi.mock('../utils/demoData.js', () => ({
  demoWorkspaceExists: vi.fn().mockResolvedValue(false),
}))

// Mock child components to simplify testing
vi.mock('../components/settings/GeneralSettings.vue', () => ({
  default: {
    name: 'GeneralSettings',
    template: '<div class="general-settings-mock">General Settings Content</div>',
    props: [
      'graphDetailThreshold',
      'graphMaxDepth',
      'graphRootMaxDepth',
      'graphNotesPreviewLength',
      'openDetailFullscreen',
      'hoverPreviewEnabled',
      'inheritColors',
      'showHintBar',
    ],
  },
}))

vi.mock('../components/settings/AISettings.vue', () => ({
  default: {
    name: 'AISettings',
    template: '<div class="ai-settings-mock">AI Settings Content</div>',
    props: [
      'aiEnabled',
      'aiProvider',
      'ollamaEndpoint',
      'ollamaModel',
      'ollamaContextSize',
      'openaiEndpoint',
      'openaiApiKey',
      'openaiModel',
      'openaiSkipSslVerification',
      'ollamaEnabled',
    ],
  },
}))

vi.mock('../components/settings/DataSettings.vue', () => ({
  default: {
    name: 'DataSettings',
    template: '<div class="data-settings-mock">Data Settings Content</div>',
    props: [
      'snapshotMessage',
      'showSnapshotList',
      'availableSnapshots',
      'showLostFound',
      'orphanedNodes',
      'dataPath',
      'currentWorkspace',
    ],
  },
}))

vi.mock('../components/settings/AboutSettings.vue', () => ({
  default: {
    name: 'AboutSettings',
    template: '<div class="about-settings-mock">About Settings Content</div>',
    props: ['appVersion', 'demoExists'],
  },
}))

describe('SettingsPanel', () => {
  const defaultProps = {
    graphDetailThreshold: 50,
    graphMaxDepth: 0,
    graphRootMaxDepth: 5,
    openDetailFullscreen: false,
    hoverPreviewEnabled: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('tab navigation', () => {
    it('should show General tab as active by default', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const tabs = wrapper.findAll('.settings-tab')
      expect(tabs).toHaveLength(4)

      const generalTab = tabs[0]
      expect(generalTab.classes()).toContain('active')
      expect(generalTab.text()).toBe('General')
    })

    it('should switch to AI tab when clicked', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const tabs = wrapper.findAll('.settings-tab')
      const aiTab = tabs[1]

      await aiTab.trigger('click')
      await nextTick()

      expect(aiTab.classes()).toContain('active')
      expect(tabs[0].classes()).not.toContain('active')
    })

    it('should switch to Data tab when clicked', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const tabs = wrapper.findAll('.settings-tab')
      const dataTab = tabs[2]

      await dataTab.trigger('click')
      await nextTick()

      expect(dataTab.classes()).toContain('active')
      expect(tabs[0].classes()).not.toContain('active')
    })

    it('should switch to About tab when clicked', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const tabs = wrapper.findAll('.settings-tab')
      const aboutTab = tabs[3]

      await aboutTab.trigger('click')
      await nextTick()

      expect(aboutTab.classes()).toContain('active')
      expect(tabs[0].classes()).not.toContain('active')
    })

    it('should show correct content for each tab', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      // General tab content should exist by default (using v-if)
      expect(wrapper.find('.general-settings-mock').exists()).toBe(true)

      // AI content should not exist (v-if removes it from DOM)
      expect(wrapper.find('.ai-settings-mock').exists()).toBe(false)

      // Switch to AI tab
      const tabs = wrapper.findAll('.settings-tab')
      await tabs[1].trigger('click')
      await nextTick()

      // Now AI content should exist, General should not
      expect(wrapper.find('.ai-settings-mock').exists()).toBe(true)
      expect(wrapper.find('.general-settings-mock').exists()).toBe(false)
    })

    it('should switch tabs in sequence', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const tabs = wrapper.findAll('.settings-tab')

      // Start on General
      expect(tabs[0].classes()).toContain('active')

      // Go to AI
      await tabs[1].trigger('click')
      await nextTick()
      expect(tabs[1].classes()).toContain('active')
      expect(tabs[0].classes()).not.toContain('active')

      // Go to Data
      await tabs[2].trigger('click')
      await nextTick()
      expect(tabs[2].classes()).toContain('active')
      expect(tabs[1].classes()).not.toContain('active')

      // Go to About
      await tabs[3].trigger('click')
      await nextTick()
      expect(tabs[3].classes()).toContain('active')
      expect(tabs[2].classes()).not.toContain('active')

      // Back to General
      await tabs[0].trigger('click')
      await nextTick()
      expect(tabs[0].classes()).toContain('active')
      expect(tabs[3].classes()).not.toContain('active')
    })
  })

  describe('close button', () => {
    it('should emit close event when close button is clicked', async () => {
      const wrapper = mount(SettingsPanel, { props: defaultProps })
      await flushPromises()

      const closeBtn = wrapper.find('.close-btn')
      await closeBtn.trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()
      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })
})
