// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'
import { typeListingId, typeOfListing, parentForCreation, makeTypeListing } from '../utils/typeListings'
import { useNavigation } from '../composables/useNavigation'
import { useTagActions } from '../composables/useTagActions.js'
import AppSidebar from '../components/AppSidebar.vue'

/**
 * Every node type doubles as a tag: the legend lists the types a workspace
 * holds nodes of, and opening one shows all of them in one place, whatever
 * their parents (docs/reference/node-types.md, "Every type is also a list").
 * Before this, a person or an organization could only be found by browsing to
 * wherever it had been filed.
 */

describe('type listing ids', () => {
  it('names a listing after its type and reads the type back', () => {
    expect(typeListingId('person')).toBe('type:person')
    expect(typeOfListing('type:person')).toBe('person')
  })

  it('does not take a node id or an unknown type for a listing', () => {
    expect(typeOfListing(42)).toBeNull()
    expect(typeOfListing(null)).toBeNull()
    expect(typeOfListing('type:spaceship')).toBeNull()
    expect(typeOfListing('42')).toBeNull()
  })

  it('sends a node created inside a listing to the top level', () => {
    expect(parentForCreation('type:person')).toBeNull()
    expect(parentForCreation(7)).toBe(7)
    expect(parentForCreation(null)).toBeNull()
  })

  it('shows a listing as a container of its type, titled with the plural', () => {
    const listing = makeTypeListing('person')
    expect(listing.id).toBe('type:person')
    expect(listing.title).toBe('People')
    expect(listing.type).toBe('person')
    expect(listing.parent_id).toBeNull()
  })
})

describe('nodes of a type in the database', () => {
  let db
  let make

  beforeEach(async () => {
    db = await createTestDatabase()
    make = createNodeFactory(db)
  })

  afterEach(() => db.close())

  it('lists every node of the type at any depth, by title', () => {
    const team = make.project({ title: 'Team' })
    const squad = make.project({ title: 'Squad', parent_id: team.id })
    make.person({ title: 'Zoe', parent_id: squad.id })
    make.person({ title: 'Adam' })
    make.person({ title: 'maya', parent_id: team.id })
    make.task({ title: 'Not a person' })

    expect(db.getNodesOfType('person', 'work').map(n => n.title)).toEqual(['Adam', 'maya', 'Zoe'])
  })

  it('keeps to the workspace and leaves deleted nodes out', () => {
    make.person({ title: 'Here' })
    make.person({ title: 'Elsewhere', workspace_id: 'home' })
    const gone = make.person({ title: 'Gone' })
    db.deleteNode(gone.id)

    expect(db.getNodesOfType('person', 'work').map(n => n.title)).toEqual(['Here'])
  })

  it('counts the nodes of each type present, without tags or deleted nodes', () => {
    make.person()
    make.person()
    make.project()
    db.getOrCreateTagNode('urgent', 'work')
    const gone = make.task()
    db.deleteNode(gone.id)

    expect(db.getNodeTypeCounts('work')).toEqual([
      { type: 'person', count: 2 },
      { type: 'project', count: 1 },
    ])
  })
})

describe('navigating into a type listing', () => {
  let api
  let nav

  beforeEach(() => {
    vi.useFakeTimers()
    api = {
      getNode: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([]),
      getDescendants: vi.fn().mockResolvedValue([]),
      getAncestors: vi.fn().mockResolvedValue([]),
      getRoots: vi.fn().mockResolvedValue([]),
      getNodesOfType: vi.fn().mockResolvedValue([
        { id: 3, title: 'Ada', type: 'person', parent_id: 1 },
        { id: 9, title: 'Grace', type: 'person', parent_id: 5 },
      ]),
    }
    nav = useNavigation({ api, workspace: ref('work') })
  })

  afterEach(() => vi.useRealTimers())

  async function settle() {
    await vi.runAllTimersAsync()
    await vi.waitFor(() => {})
  }

  it('shows every node of the type, flat, under a virtual container', async () => {
    nav.enterContainer('type:person')
    await settle()

    expect(api.getNodesOfType).toHaveBeenCalledWith('person', 'work')
    expect(api.getNode).not.toHaveBeenCalled()
    expect(nav.currentContainerId.value).toBe('type:person')
    expect(nav.currentContainer.value).toMatchObject({ id: 'type:person', title: 'People', type: 'person' })
    expect(nav.children.value.map(n => n.id)).toEqual([3, 9])
    expect(nav.children.value.every(n => n.children.length === 0)).toBe(true)
    expect(nav.breadcrumbs.value.map(b => b.title)).toEqual(['People'])
  })

  it('does not treat a listing as a leaf that opens a detail panel', async () => {
    const onOpenLeaf = vi.fn()
    nav = useNavigation({ api, workspace: ref('work'), onOpenLeaf })

    nav.enterContainer('type:person')
    await settle()

    expect(onOpenLeaf).not.toHaveBeenCalled()
    expect(nav.currentContainerId.value).toBe('type:person')
  })

  it('goes back to the top level like any other container', async () => {
    nav.enterContainer('type:person')
    await settle()
    nav.navigateBack()
    await settle()

    expect(nav.currentContainerId.value).toBeNull()
  })
})

function mountSidebar(props = {}) {
  return mount(AppSidebar, {
    props: {
      typeCounts: [
        { type: 'person', count: 4 },
        { type: 'organization', count: 2 },
      ],
      ...props,
    },
    global: { stubs: { SidebarTreeItem: true } },
  })
}

const legendRow = (wrapper, type) =>
  wrapper.findAll('.legend-item').find(w => w.find('.legend-badge').html().length && w.text().includes(type))

describe('opening a type from the legend', () => {
  it('enters the listing of that type', async () => {
    const enterContainer = vi.fn()
    const { navigateToType } = useTagActions({
      searchQuery: ref(''),
      showSearch: ref(false),
      onSearchInput: vi.fn(),
      enterContainer,
      deleteNode: vi.fn(),
    })

    await navigateToType('organization')

    expect(enterContainer).toHaveBeenCalledWith('type:organization')
  })

  it('shows the count next to a type with nodes and opens its listing on click', async () => {
    const wrapper = mountSidebar()
    const people = legendRow(wrapper, 'Person')

    expect(people.find('.legend-count').text()).toBe('4')
    expect(people.attributes('disabled')).toBeUndefined()

    await people.trigger('click')

    expect(wrapper.emitted('navigate-type')).toEqual([['person']])
  })

  it('leaves a type without nodes, and the tag entry, as plain legend rows', async () => {
    const wrapper = mountSidebar()
    const tasks = legendRow(wrapper, 'Task')
    const tags = legendRow(wrapper, 'Tag')

    expect(tasks.find('.legend-count').exists()).toBe(false)
    expect(tasks.attributes('disabled')).toBeDefined()
    expect(tags.attributes('disabled')).toBeDefined()

    await tasks.trigger('click')
    await tags.trigger('click')

    expect(wrapper.emitted('navigate-type')).toBeUndefined()
  })

  it('marks the open listing as active', () => {
    const wrapper = mountSidebar({ currentContainerId: 'type:organization' })

    expect(legendRow(wrapper, 'Organization').classes()).toContain('active')
    expect(legendRow(wrapper, 'Person').classes()).not.toContain('active')
  })
})
