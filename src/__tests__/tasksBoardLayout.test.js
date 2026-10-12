import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TaskBoard from '../components/TaskBoard.vue'
import TasksView from '../components/TasksView.vue'

/**
 * The Tasks board (docs/guides/views.md, "Board"): columns derived from the
 * task's fields, a drop that asks for the move, and a layout switch in the
 * Tasks view that is remembered per workspace.
 */

const tasks = [
  { id: 1, title: 'Plain', completed: 0, start_date: null },
  { id: 2, title: 'Started', completed: 0, start_date: '2020-01-01' },
  { id: 3, title: 'Finished', completed: 1, start_date: '2020-01-01' },
]

vi.mock('../services/api', () => ({
  api: {
    getTasks: vi.fn(async () => tasks),
    getAncestors: vi.fn(async () => []),
    getDescendants: vi.fn(async () => []),
  },
}))

const column = (w, id) => w.find(`[data-column="${id}"]`)

describe('TaskBoard', () => {
  it('sorts tasks into To do, In progress and Done', () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    expect(column(w, 'todo').text()).toContain('Plain')
    expect(column(w, 'in-progress').text()).toContain('Started')
    expect(column(w, 'done').text()).toContain('Finished')
    expect(column(w, 'todo').text()).not.toContain('Started')
  })

  it('keeps the Done column as a drop target while completed tasks are hidden', () => {
    const w = mount(TaskBoard, { props: { tasks: tasks.slice(0, 2), showCompleted: false } })
    expect(column(w, 'done').exists()).toBe(true)
    expect(column(w, 'done').text()).toContain('Completed tasks are hidden')
  })

  it('asks for a move when a card is dropped on another column', async () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    const card = w.find('[data-task-id="1"]')
    await card.trigger('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } })
    await column(w, 'done').trigger('dragover')
    await column(w, 'done').trigger('drop')
    expect(w.emitted('move')).toEqual([[tasks[0], 'done']])
  })

  it('opens a task on click and toggles it from its checkbox', async () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    await w.find('[data-task-id="2"]').trigger('click')
    expect(w.emitted('navigate')).toEqual([[tasks[1]]])
    await w.find('[data-task-id="2"] input[type="checkbox"]').trigger('click')
    expect(w.emitted('toggle-complete')).toEqual([[tasks[1]]])
  })
})

describe('TasksView layout', () => {
  beforeEach(() => localStorage.clear())

  async function open(workspaceId = 'work') {
    const w = mount(TasksView, { props: { workspaceId } })
    await flushPromises()
    return w
  }

  it('shows the list by default and switches to the board', async () => {
    const w = await open()
    expect(w.find('.tasks-table').exists()).toBe(true)
    expect(w.find('.task-board').exists()).toBe(false)
    await w.find('button[data-layout="board"]').trigger('click')
    expect(w.find('.task-board').exists()).toBe(true)
    expect(w.find('.tasks-table').exists()).toBe(false)
  })

  it('remembers the layout per workspace', async () => {
    const w = await open('work')
    await w.find('button[data-layout="board"]').trigger('click')
    w.unmount()
    expect((await open('work')).find('.task-board').exists()).toBe(true)
    expect((await open('home')).find('.task-board').exists()).toBe(false)
  })

  it('turns a board move into an update of the task', async () => {
    const w = await open()
    await w.find('button[data-layout="board"]').trigger('click')
    w.findComponent(TaskBoard).vm.$emit('move', tasks[0], 'done')
    expect(w.emitted('update')).toEqual([[{ id: 1, completed: true }]])
  })
})
