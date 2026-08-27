/**
 * Input ownership: which focused surface owns keyboard input.
 *
 * The global keyboard shortcuts must stand down when the user is typing or
 * working inside a surface that binds keys itself. Rather than special-case
 * each surface in the shortcut handler, that decision lives here. A surface
 * that owns every key (like the node spreadsheet) marks its root with a
 * `data-owns-keys` attribute; text inputs are recognised structurally.
 */

/**
 * Report whether the target is a text-entry surface: a form field,
 * contenteditable, or a CodeMirror editor. Plain keys typed here belong to the
 * field, not to the app. Inputs that accept no text (checkbox, radio, buttons)
 * are excluded: they hold focus without consuming typing.
 *
 * @param {EventTarget|null} target - The key event's target.
 * @returns {boolean}
 */
// Input types that hold focus but accept no text. A checkbox does not consume
// Space or Enter on the app's behalf, so shortcuts still apply there.
const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color']

export function ownsTextInput(target) {
  if (!target || typeof target.tagName !== 'string') return false
  if (target.tagName === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.includes(target.type?.toLowerCase())
  }
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.isContentEditable) return true
  // isContentEditable is unset in jsdom; also match the attribute and an
  // editable ancestor so the check holds in tests and for nested nodes.
  if (target.closest?.('[contenteditable="true"], [contenteditable=""]')) return true
  return target.closest?.('.cm-editor') != null
}

/**
 * Report whether the target sits inside a surface that owns every key, declared
 * with `data-owns-keys`. Such a surface binds even plain navigation keys, so no
 * global shortcut (not just the text-input-sensitive ones) should fire.
 *
 * @param {EventTarget|null} target - The key event's target.
 * @returns {boolean}
 */
export function ownsAllKeys(target) {
  return target?.closest?.('[data-owns-keys]') != null
}
