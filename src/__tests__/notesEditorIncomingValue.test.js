import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { minimalReplacement } from '../utils/markdownEditing.js'

/**
 * A note can change while the editor is open: another window saves it, an AI
 * improvement is applied, a locked note is decrypted. Applying that as a
 * whole-document replacement moved the caret to the end of the document, so the
 * cursor jumped away mid-sentence. The incoming text is applied as the smallest
 * change that accounts for the difference instead, which CodeMirror can map the
 * selection through.
 */

describe('the smallest change between two texts', () => {
  it('is nothing when they are equal', () => {
    expect(minimalReplacement('same', 'same')).toBeNull()
  })

  it('covers only an inserted span', () => {
    expect(minimalReplacement('ac', 'abc')).toEqual({ from: 1, to: 1, insert: 'b' })
  })

  it('covers only a removed span', () => {
    expect(minimalReplacement('abc', 'ac')).toEqual({ from: 1, to: 2, insert: '' })
  })

  it('covers only a replaced span', () => {
    expect(minimalReplacement('a-one-z', 'a-two-z')).toEqual({ from: 2, to: 5, insert: 'two' })
  })

  it('reproduces the target text when applied', () => {
    const pairs = [
      ['', 'hello'],
      ['hello', ''],
      ['line one\nline two', 'line one\nline 2\nline three'],
      ['aaa', 'aa'],
    ]
    for (const [current, next] of pairs) {
      const c = minimalReplacement(current, next)
      expect(current.slice(0, c.from) + c.insert + current.slice(c.to)).toBe(next)
    }
  })
})

/** Apply an incoming value the way NotesEditor's modelValue watcher does. */
function applyIncoming(doc, caret, incoming) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({ parent, state: EditorState.create({ doc }) })
  view.dispatch({ selection: { anchor: caret } })

  const change = minimalReplacement(view.state.doc.toString(), incoming)
  if (change) view.dispatch({ changes: change })

  const result = { doc: view.state.doc.toString(), caret: view.state.selection.main.head }
  view.destroy()
  parent.remove()
  return result
}

describe('applying an incoming note', () => {
  it('leaves the caret alone when the change lands after it', () => {
    const { doc, caret } = applyIncoming('first line\nsecond line', 5, 'first line\nsecond line\nthird line')
    expect(doc).toBe('first line\nsecond line\nthird line')
    expect(caret).toBe(5)
  })

  it('leaves the caret alone when the change lands before it', () => {
    const { caret } = applyIncoming('alpha\nomega', 8, 'ALPHA\nomega')
    expect(caret).toBe(8)
  })

  it('does not touch the document when the text is unchanged', () => {
    const { doc, caret } = applyIncoming('unchanged text', 4, 'unchanged text')
    expect(doc).toBe('unchanged text')
    expect(caret).toBe(4)
  })
})
