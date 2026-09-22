import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTimelineLayout } from '../composables/useTimelineLayout.js'

/**
 * Timeline labels stay in view (docs/guides/views.md, "Timeline View"). A bar
 * that starts left of the visible area carries its label at the visible edge
 * instead of off-screen. Project boxes did this already; task and event bars
 * and group markers did not, so a long bar scrolled into the past showed no
 * name at all.
 */

const task = { id: 1, type: 'task', title: 'Long task', start_date: '2026-08-01', end_date: '2026-09-30' }
const event = { id: 2, type: 'event', title: 'Conference', start_date: '2026-08-10', end_date: '2026-09-25' }
const group = { id: 3, type: 'group', title: 'Grouped', children: [{ ...task, id: 4, title: 'In group' }] }
const project = { id: 5, type: 'project', title: 'Boxed', children: [{ ...task, id: 6, title: 'In project' }] }

function layoutWith(nodes) {
  return useTimelineLayout({
    getNodes: () => nodes,
    getHideCompleted: () => false,
    _getColorMap: () => ({}),
    scrollableRef: ref(null),
  })
}

describe('the floating label offset', () => {
  const layout = layoutWith([task, event, group, project])

  it('is zero while the bar start is in view', () => {
    layout.updateScrollLeft(0)
    expect(layout.getFloatingLabelOffset(100, 500)).toBe(0)
  })

  it('moves the label to the visible edge once the start scrolls out', () => {
    layout.updateScrollLeft(300)
    expect(layout.getFloatingLabelOffset(100, 500)).toBe(200)
  })

  it('stops before the bar ends, so the label never leaves its bar', () => {
    layout.updateScrollLeft(10000)
    const offset = layout.getFloatingLabelOffset(100, 500)
    expect(offset).toBeLessThanOrEqual(500 - layout.LABEL_MIN_VISIBLE)
    expect(offset).toBeGreaterThan(0)
  })

  it('applies to task and event bars alike', () => {
    const bars = layout.timelineNodes.value.filter(n => n.id === 1 || n.id === 2)
    expect(bars).toHaveLength(2)
    layout.updateScrollLeft(0)
    for (const bar of bars) expect(layout.getBarLabelOffset(bar)).toBe(0)
    layout.updateScrollLeft(layout.getDatePosition('2026-09-01'))
    for (const bar of bars) expect(layout.getBarLabelOffset(bar)).toBeGreaterThan(0)
  })

  it('applies to group labels', () => {
    const marker = layout.groupMarkers.value.find(g => g.id === 3)
    expect(marker).toBeTruthy()
    layout.updateScrollLeft(0)
    expect(layout.getGroupLabelLeft(marker)).toBe(marker.position + 6)
    layout.updateScrollLeft(marker.position + 400)
    expect(layout.getGroupLabelLeft(marker)).toBeGreaterThan(marker.position + 6)
  })

  it('keeps project labels on the same rule', () => {
    const box = layout.projectBoxes.value.find(p => p.id === 5)
    expect(box).toBeTruthy()
    layout.updateScrollLeft(box.left + 300)
    expect(layout.getProjectLabelLeft(box)).toBe(layout.getFloatingLabelOffset(box.left, box.width) + 4)
  })
})

describe('in the rendered timeline', () => {
  it('moves task, event and group labels with the scroll', async () => {
    const { mount } = await import('@vue/test-utils')
    const TimelineView = (await import('../components/TimelineView.vue')).default
    const w = mount(TimelineView, { props: { nodes: [task, event, group, project] }, attachTo: document.body })

    const labelsBefore = w.findAll('.bar-label').map(l => l.attributes('style') || '')
    const groupBefore = w.find('.group-label').attributes('style')

    const scrollable = w.find('.timeline-scrollable')
    scrollable.element.scrollLeft = 5000
    await scrollable.trigger('scroll')

    const labelsAfter = w.findAll('.bar-label').map(l => l.attributes('style') || '')
    expect(labelsAfter.length).toBeGreaterThanOrEqual(2)
    for (const style of labelsAfter) expect(style).toMatch(/margin-left: [1-9]\d*(\.\d+)?px/)
    expect(labelsAfter).not.toEqual(labelsBefore)
    expect(w.find('.group-label').attributes('style')).not.toBe(groupBefore)
    w.unmount()
  })
})
