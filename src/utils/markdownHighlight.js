import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Syntax highlighting for the Markdown notes editor.
 *
 * Fixed class names instead of CodeMirror's generated ones, so the editor's
 * stylesheet can colour them with the theme variables and tests can find them.
 * Markers (the ** around bold text, #, -, >, backticks, link brackets) share
 * one class and are dimmed; the content they wrap gets its own class.
 */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.processingInstruction, class: 'md-marker' },
  { tag: tags.strong, class: 'md-strong' },
  { tag: tags.emphasis, class: 'md-emphasis' },
  { tag: tags.strikethrough, class: 'md-strikethrough' },
  { tag: tags.heading, class: 'md-heading' },
  { tag: tags.monospace, class: 'md-code' },
  { tag: tags.link, class: 'md-link' },
  { tag: tags.url, class: 'md-url' },
  { tag: tags.labelName, class: 'md-marker' },
])

export const markdownHighlighting = syntaxHighlighting(markdownHighlightStyle)
