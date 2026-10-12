import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TaskBoard from '../components/TaskBoard.vue'
import TasksView from '../components/TasksView.vue'

/**
 * The Tasks board (docs/guides/views.md, "Tasks View"): columns derived from
 * the task's state, a Done column only while completed items are shown, a
 * drop that asks for the move, and the Tasks view that hosts it.
 */

const tasks = [
  { id: 1, title: 'Plain', completed: 0, in_progress: 0, blocked: 0, start_date: '2020-01-01' },
  { id: 2, title: 'Started', completed: 0, in_progress: 1 },
  { id: 3, title: 'Stuck', completed: 0, blocked: 1 },
  { id: 4, title: 'Finished', completed: 1 },
]

vi.mock('../services/api', () => ({
  api: {
    getTasks: vi.fn(async () => tasks),
    getAncestors: vi.fn(async () => []),
    getDescendants: vi.fn(async () => []),
  },
}))

const column = (w, id) => w.find(`[data-column="${id}"]`)
const columnIds = w => w.findAll('[data-column]').map(c => c.attributes('data-column'))

describe('TaskBoard', () => {
  it('sorts tasks into To do, In progress, Blocked and Done', () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    expect(column(w, 'todo').text()).toContain('Plain')
    expect(column(w, 'in-progress').text()).toContain('Started')
    expect(column(w, 'blocked').text()).toContain('Stuck')
    expect(column(w, 'done').text()).toContain('Finished')
    expect(column(w, 'todo').text()).not.toContain('Started')
  })

  it('has no Done column while completed items are hidden', () => {
    const w = mount(TaskBoard, { props: { tasks: tasks.slice(0, 3), showCompleted: false } })
    expect(columnIds(w)).toEqual(['todo', 'in-progress', 'blocked'])
  })

  it('asks for a move when a card is dropped on another column', async () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    const card = w.find('[data-task-id="1"]')
    await card.trigger('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } })
    await column(w, 'blocked').trigger('dragover')
    await column(w, 'blocked').trigger('drop')
    expect(w.emitted('move')).toEqual([[tasks[0], 'blocked']])
  })

  it('opens a task on click and toggles it from its checkbox', async () => {
    const w = mount(TaskBoard, { props: { tasks, showCompleted: true } })
    await w.find('[data-task-id="2"]').trigger('click')
    expect(w.emitted('navigate')).toEqual([[tasks[1]]])
    await w.find('[data-task-id="2"] input[type="checkbox"]').trigger('click')
    expect(w.emitted('toggle-complete')).toEqual([[tasks[1]]])
  })
})

describe('TasksView', () => {
  async function open(props = {}) {
    const w = mount(TasksView, { props: { workspaceId: 'work', ...props } })
    await flushPromises()
    return w
  }

  it('is the board, following the toolbar toggle for completed items', async () => {
    const hidden = await open({ hideCompleted: true })
    expect(hidden.find('table').exists()).toBe(false)
    expect(hidden.text()).not.toContain('Show completed')
    expect(columnIds(hidden)).toEqual(['todo', 'in-progress', 'blocked'])
    const shown = await open({ hideCompleted: false })
    expect(columnIds(shown)).toEqual(['todo', 'in-progress', 'blocked', 'done'])
  })

  it('asks the database only for open tasks while completed items are hidden', async () => {
    const { api } = await import('../services/api')
    api.getTasks.mockClear()
    await open({ hideCompleted: true })
    expect(api.getTasks.mock.calls[0][0]).toMatchObject({ completed: false })
    api.getTasks.mockClear()
    await open({ hideCompleted: false })
    expect(api.getTasks.mock.calls[0][0].completed).toBeUndefined()
  })

  it('keeps the board on screen when no task matches', async () => {
    const { api } = await import('../services/api')
    api.getTasks.mockResolvedValueOnce([])
    const w = await open()
    expect(w.findAll('[data-column]').length).toBeGreaterThanOrEqual(3)
  })

  it('turns a board move into an update of the task', async () => {
    const w = await open({ hideCompleted: false })
    w.findComponent(TaskBoard).vm.$emit('move', tasks[0], 'done')
    expect(w.emitted('update')).toEqual([[{ id: 1, completed: true, in_progress: false, blocked: false }]])
  })
})
