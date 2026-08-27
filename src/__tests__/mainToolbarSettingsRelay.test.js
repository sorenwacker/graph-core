import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MainToolbar from '../components/MainToolbar.vue'
import SettingsPanel from '../components/SettingsPanel.vue'

/**
 * MainToolbar renders SettingsPanel, so every settings prop and event travels
 * App -> MainToolbar -> SettingsPanel and back. A prop MainToolbar forgets to
 * declare is dropped in silence: Vue puts it in the fallthrough attrs and
 * SettingsPanel falls back to its default, which is how imports ended up in the
 * 'work' workspace regardless of the workspace the user was in.
 *
 * These tests compare the two components' declared contracts, so a prop or
 * event added to SettingsPanel later cannot quietly go unrelayed.
 */

// MainToolbar's tree reaches useTheme, which reads matchMedia; jsdom has none.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

const settingsProps = Object.keys(SettingsPanel.props || {})
const settingsEmits = SettingsPanel.emits || []
const toolbarProps = Object.keys(MainToolbar.props || {})
const toolbarEmits = MainToolbar.emits || []

// Props SettingsPanel owns internally rather than receiving from the toolbar.
const NOT_RELAYED = []
// Events MainToolbar handles itself instead of passing up: closing the panel is
// the toolbar's own showSettings state, not something App needs to hear about.
const HANDLED_LOCALLY = ['close']

describe('MainToolbar relays the SettingsPanel contract', () => {
  it('declares every prop SettingsPanel expects', () => {
    const missing = settingsProps.filter(p => !NOT_RELAYED.includes(p) && !toolbarProps.includes(p))
    expect(missing).toEqual([])
  })

  it('declares every event SettingsPanel emits', () => {
    const missing = settingsEmits.filter(e => !HANDLED_LOCALLY.includes(e) && !toolbarEmits.includes(e))
    expect(missing).toEqual([])
  })
})

describe('MainToolbar forwards the values it is given', () => {
  const stubs = {
    SettingsPanel: {
      name: 'SettingsPanel',
      props: SettingsPanel.props,
      emits: SettingsPanel.emits,
      template: '<div class="settings-stub" />',
    },
    TypeFilterDropdown: true,
    ViewSwitcher: true,
  }

  function renderWith(props) {
    return mount(MainToolbar, {
      props: { viewMode: 'graph', showSettings: true, ...props },
      global: { stubs },
    })
  }

  it('passes currentWorkspace through, so imports target the active workspace', () => {
    const w = renderWith({ currentWorkspace: 'research' })
    expect(w.findComponent({ name: 'SettingsPanel' }).props('currentWorkspace')).toBe('research')
  })

  it('passes openaiSkipSslVerification through', () => {
    const w = renderWith({ openaiSkipSslVerification: true })
    expect(w.findComponent({ name: 'SettingsPanel' }).props('openaiSkipSslVerification')).toBe(true)
  })

  it('re-emits import-complete so the tree reloads after an import', async () => {
    const w = renderWith({})
    w.findComponent({ name: 'SettingsPanel' }).vm.$emit('import-complete', { count: 3 })
    await w.vm.$nextTick()
    expect(w.emitted('import-complete')).toBeTruthy()
    expect(w.emitted('import-complete')[0]).toEqual([{ count: 3 }])
  })

  it('re-emits the SSL toggle so the setting is not inert', async () => {
    const w = renderWith({})
    w.findComponent({ name: 'SettingsPanel' }).vm.$emit('update:openaiSkipSslVerification', true)
    await w.vm.$nextTick()
    expect(w.emitted('update:openaiSkipSslVerification')[0]).toEqual([true])
  })
})
