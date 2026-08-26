import { describe, it, expect } from 'vitest'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { insertNewlineTightList } from '../utils/markdownEditing.js'

/**
 * Pressing Enter in a list must continue the list without inserting a blank
 * line. CodeMirror's insertNewlineContinueMarkup preserves a loose (non-tight)
 * list by inserting a blank line before each new marker, so once a list has one
 * blank line between items every later Enter adds another. lang-markdown's
 * `nonTightLists` option ends the list on an empty item, which stops a list
 * acquiring that first blank line, but does not cover an already-loose one.
 */

function key(doc, keyName, { at = null } = {}) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        markdown(),
        Prec.highest(keymap.of([{ key: 'Enter', run: insertNewlineTightList }])),
        keymap.of([...defaultKeymap, ...historyKeymap]),
      ],
    }),
  })
  view.dispatch({ selection: { anchor: at === null ? doc.length : at } })
  view.contentDOM.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: keyName, code: keyName, bubbles: true, cancelable: true })
  )
  const result = view.state.doc.toString()
  const cursor = view.state.selection.main.head
  view.destroy()
  parent.remove()
  return { doc: result, cursor }
}

function enter(doc, opts) {
  return key(doc, 'Enter', opts)
}

describe('Enter in the notes editor', () => {
  it('continues a tight list without a blank line', () => {
    expect(enter('- Anne\n- Bravo').doc).toBe('- Anne\n- Bravo\n- ')
  })

  it('continues a list that is already loose without adding another blank line', () => {
    expect(enter('- Anne\n\n- Bravo').doc).toBe('- Anne\n\n- Bravo\n- ')
  })

  it('leaves the cursor after the new marker', () => {
    const { doc, cursor } = enter('- Anne\n\n- Bravo')
    expect(cursor).toBe(doc.length)
  })

  it('inserts a single line break in plain prose', () => {
    expect(enter('Test Person Alpha').doc).toBe('Test Person Alpha\n')
  })

  it('continues an ordered list with the next number', () => {
    expect(enter('1. Anne\n2. Bravo').doc).toBe('1. Anne\n2. Bravo\n3. ')
  })

  it('does not add a blank line to a loose ordered list', () => {
    expect(enter('1. Anne\n\n2. Bravo').doc).toBe('1. Anne\n\n2. Bravo\n3. ')
  })

  it('continues a blockquote', () => {
    expect(enter('> quoted').doc).toBe('> quoted\n> ')
  })

  it('ends the list on an empty item instead of loosening it', () => {
    // The default command moves the empty item down a line, leaving
    // '- Anne\n\n- ' — a loose list whose blank line then repeats on every
    // later Enter. Ending the list drops the marker and adds no blank line.
    const { doc, cursor } = enter('- Anne\n- ')
    expect(doc).toBe('- Anne\n')
    expect(cursor).toBe(doc.length)
  })

  it('continues a nested list at its own level', () => {
    expect(enter('- Anne\n  - Bravo').doc).toBe('- Anne\n  - Bravo\n  - ')
  })

  // NotesEditor binds only Enter itself; Backspace markup deletion has to keep
  // coming from the keymap markdown() registers internally, which is why the
  // editor no longer registers markdownKeymap a second time.
  it('still deletes list markup on Backspace, from markdown() alone', () => {
    // deleteMarkupBackward drops the marker but keeps its width as indentation.
    // An unbound Backspace would delete a single character, leaving '- Anne\n-'.
    expect(key('- Anne\n- ', 'Backspace').doc).toBe('- Anne\n  ')
  })
})
