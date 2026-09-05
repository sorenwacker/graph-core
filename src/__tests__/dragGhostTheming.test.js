import { describe, it, expect, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { useTableDrag } from '../composables/useTableDrag.js'

/**
 * The drag ghost is built in JavaScript but must be styled in CSS. Inline
 * presentation cannot be overridden by a theme rule, which is how the
 * light-theme block for .drag-ghost came to have no effect. Only the position,
 * which changes with the cursor, belongs on the element.
 */

function startDrag(node = { id: 1, type: 'task', title: 'Dragged', color: '#123456' }) {
  const drag = useTableDrag({
    findNodeById: () => null,
    selectedIds: ref(new Set()),
    onMove: vi.fn(),
    onMoveMultiple: vi.fn(),
    onReorder: vi.fn(),
  })
  drag.onMouseDown({ target: { closest: () => null }, preventDefault: vi.fn(), clientX: 5, clientY: 5 }, node)
  return document.querySelector('.drag-ghost')
}

afterEach(() => {
  document.dispatchEvent(new MouseEvent('mouseup'))
  document.body.innerHTML = ''
})

describe('drag ghost stylesheet', () => {
  const read = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf-8')

  /**
   * The ghost is appended to document.body, so a scoped stylesheet cannot
   * reach it: Vue rewrites every selector with the component's data-v
   * attribute, which the ghost does not carry. TableView.css is loaded with
   * <style scoped>, so the ghost's rules must not live there.
   */
  it('keeps the ghost rules out of the scoped table stylesheet', () => {
    expect(read('components/TableView.vue')).toContain('<style scoped src="./TableView.css">')
    expect(read('components/TableView.css')).not.toContain('.drag-ghost')
  })

  it('styles the ghost from a global stylesheet', () => {
    const global = read('style.css')
    expect(global).toContain('.drag-ghost {')
    expect(global).toContain('.drag-ghost .ghost-type')
    expect(global).toContain('.drag-ghost .ghost-action')
  })
})

describe('drag ghost theming', () => {
  it('positions the ghost inline, because that follows the cursor', () => {
    const ghost = startDrag()

    expect(ghost.style.position).toBe('fixed')
    expect(ghost.style.left).toBe('15px')
    expect(ghost.style.top).toBe('15px')
  })

  it('leaves every themed property to the stylesheet', () => {
    const inline = startDrag().getAttribute('style')

    for (const prop of ['background', 'border', 'color', 'box-shadow', 'padding', 'font-size', 'border-radius']) {
      expect(inline).not.toContain(prop)
    }
  })

  it('still sets the type badge colour inline, which is per node', () => {
    expect(startDrag().querySelector('.ghost-type').style.background).toBeTruthy()
  })
})
