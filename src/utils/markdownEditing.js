/**
 * Editor commands for markdown notes.
 * @module utils/markdownEditing
 */

import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'

// `nonTightLists: false` makes Enter on an empty list item end the list. The
// default instead moves the item down a line, which is how a list acquires the
// blank line that then repeats on every following Enter.
const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false })

/**
 * Continues a markdown list or blockquote on Enter without inserting a blank
 * line between items.
 *
 * CodeMirror's markup-continuing Enter preserves a loose list: when the
 * list already has a blank line between two items it inserts another blank line
 * ahead of each new marker. That makes the looseness self-perpetuating, so one
 * stray blank line turns every later Enter into two. lang-markdown's
 * `nonTightLists` option ends the list on an empty item, which stops a list
 * acquiring that first blank line, but it does not cover an already-loose list.
 * For that the transaction is captured and its leading blank line dropped
 * before it is applied. Non-list context is left to the next binding.
 *
 * @param {EditorView} view - The editor view receiving the keypress
 * @returns {boolean} True if the command handled the keypress
 */
export function insertNewlineTightList(view) {
  let captured = null
  const handled = continueMarkup({
    state: view.state,
    dispatch: tr => {
      captured = tr
    },
  })
  if (!handled || !captured) return false

  const doubled = view.state.lineBreak + view.state.lineBreak
  const changes = []
  let trimmed = 0
  captured.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const text = inserted.toString()
    if (text.startsWith(doubled)) {
      changes.push({ from: fromA, to: toA, insert: text.slice(view.state.lineBreak.length) })
      trimmed += view.state.lineBreak.length
    } else {
      changes.push({ from: fromA, to: toA, insert: text })
    }
  })

  if (trimmed === 0) {
    view.dispatch(captured)
    return true
  }

  view.dispatch(
    view.state.update({
      changes,
      selection: { anchor: captured.selection.main.head - trimmed },
      scrollIntoView: true,
      userEvent: 'input',
    })
  )
  return true
}
