import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { usePrompt } from '../composables/usePrompt.js'

/**
 * "Wrap with parent" asks for the new parent's title. It used `window.prompt`,
 * which Electron does not implement: it returns undefined without showing
 * anything, so the action did nothing at all in the desktop app.
 *
 * The prompt dialog that replaces it already existed but nothing could open it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf-8')

describe('no native dialogs remain', () => {
  it('DetailPanel asks through the in-app prompt', () => {
    const source = read('../components/DetailPanel.vue')
    expect(source).toMatch(/showPrompt\(/)
    // `window.prompt` and a bare `prompt(` both resolve to the native dialog.
    expect(source).not.toMatch(/window\.prompt\(/)
    expect(source).not.toMatch(/(?<![.\w])prompt\('New parent title/)
  })
})

describe('the prompt dialog is reachable', () => {
  it('is rendered once at the app root', () => {
    // A dialog no component renders is a dialog nothing can open, which is how
    // this subsystem sat unused.
    const app = read('../App.vue')
    expect(app).toMatch(/<PromptModal/)
    expect(app).toMatch(/usePrompt\(\)/)
  })

  it('is the same dialog the graph uses, not a second copy', () => {
    const graphModals = read('../composables/useGraphModals.js')
    expect(graphModals).toMatch(/usePrompt/)
    expect(graphModals).not.toMatch(/function showPrompt\b/)
  })
})

describe('the wrap-with-parent exchange', () => {
  const prompt = usePrompt()

  beforeEach(() => prompt.cancelPrompt())

  it('yields the typed title', async () => {
    const answer = prompt.showPrompt('New parent title:', 'Title')
    expect(prompt.promptState.value.visible).toBe(true)

    prompt.promptState.value.value = 'Q3 planning'
    prompt.submitPrompt()

    expect(await answer).toBe('Q3 planning')
  })

  it('yields nothing when dismissed, so no parent is created', async () => {
    const answer = prompt.showPrompt('New parent title:', 'Title')
    prompt.cancelPrompt()

    expect(await answer).toBeNull()
  })
})
