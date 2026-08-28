import { describe, it, expect, beforeEach } from 'vitest'
import { usePrompt } from '../composables/usePrompt.js'

/**
 * Electron does not implement `window.prompt`: it returns undefined without
 * showing anything, so anything built on it fails silently. This composable is
 * the in-app replacement, and it is shared state so one dialog at the app root
 * can serve every caller.
 */

const prompt = usePrompt()

beforeEach(() => {
  prompt.cancelPrompt()
})

describe('asking for a value', () => {
  it('shows the dialog with what was asked for', () => {
    prompt.showPrompt('New parent title:', 'Title')
    expect(prompt.promptState.value).toMatchObject({
      visible: true,
      title: 'New parent title:',
      placeholder: 'Title',
      value: '',
    })
  })

  it('resolves with the trimmed value on submit', async () => {
    const answer = prompt.showPrompt('Title?')
    prompt.promptState.value.value = '  Quarterly plan  '
    prompt.submitPrompt()

    expect(await answer).toBe('Quarterly plan')
    expect(prompt.promptState.value.visible).toBe(false)
  })

  it('resolves null when cancelled', async () => {
    const answer = prompt.showPrompt('Title?')
    prompt.cancelPrompt()

    expect(await answer).toBeNull()
    expect(prompt.promptState.value.visible).toBe(false)
  })

  it('treats an empty answer as no answer', async () => {
    const answer = prompt.showPrompt('Title?')
    prompt.promptState.value.value = '   '
    prompt.submitPrompt()

    expect(await answer).toBeNull()
  })

  it('never strands a caller when a second prompt opens', async () => {
    const first = prompt.showPrompt('First?')
    const second = prompt.showPrompt('Second?')

    // The first caller is awaiting a promise nothing else will settle.
    expect(await first).toBeNull()

    prompt.promptState.value.value = 'answered'
    prompt.submitPrompt()
    expect(await second).toBe('answered')
  })
})

describe('keyboard', () => {
  it('accepts on Enter', async () => {
    const answer = prompt.showPrompt('Title?')
    prompt.promptState.value.value = 'typed'
    prompt.handlePromptKeydown({ key: 'Enter', preventDefault() {} })

    expect(await answer).toBe('typed')
  })

  it('dismisses on Escape', async () => {
    const answer = prompt.showPrompt('Title?')
    prompt.handlePromptKeydown({ key: 'Escape', preventDefault() {} })

    expect(await answer).toBeNull()
  })

  it('ignores other keys', () => {
    prompt.showPrompt('Title?')
    prompt.handlePromptKeydown({ key: 'a', preventDefault() {} })

    expect(prompt.promptState.value.visible).toBe(true)
  })
})
