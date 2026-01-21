import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useContextMenu } from '../composables/useContextMenu.js'

describe('useContextMenu composable', () => {
  let callbacks, menu

  beforeEach(() => {
    callbacks = {
      onLoadLinks: vi.fn(),
      onViewDetails: vi.fn(),
      onEnter: vi.fn(),
      onAddChild: vi.fn(),
      onToggleComplete: vi.fn(),
      onToggleFavorite: vi.fn(),
      onOpenLinkSearch: vi.fn(),
      onUnlink: vi.fn(),
      onMoveToWorkspace: vi.fn(),
      onDelete: vi.fn(),
      onRefreshSelectedNode: vi.fn()
    }
    menu = useContextMenu(callbacks)
  })

  describe('initial state', () => {
    it('should have visible as false', () => {
      expect(menu.contextMenu.value.visible).toBe(false)
    })

    it('should have null node', () => {
      expect(menu.contextMenu.value.node).toBeNull()
    })

    it('should have empty linkedNodes', () => {
      expect(menu.contextMenu.value.linkedNodes).toEqual([])
    })

    it('should have x and y at 0', () => {
      expect(menu.contextMenu.value.x).toBe(0)
      expect(menu.contextMenu.value.y).toBe(0)
    })
  })

  describe('showContextMenu', () => {
    it('should show menu at event position', async () => {
      callbacks.onLoadLinks.mockResolvedValue([])
      const node = { id: 1, title: 'Test' }
      const e = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200
      }

      await menu.showContextMenu(e, node)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(e.stopPropagation).toHaveBeenCalled()
      expect(menu.contextMenu.value.visible).toBe(true)
      expect(menu.contextMenu.value.x).toBe(100)
      expect(menu.contextMenu.value.y).toBe(200)
      expect(menu.contextMenu.value.node).toEqual(node)
    })

    it('should load linked nodes', async () => {
      const links = [{ id: 2, title: 'Link 1' }, { id: 3, title: 'Link 2' }]
      callbacks.onLoadLinks.mockResolvedValue(links)
      const node = { id: 1 }
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, clientY: 0 }

      await menu.showContextMenu(e, node)

      expect(callbacks.onLoadLinks).toHaveBeenCalledWith(1)
      expect(menu.contextMenu.value.linkedNodes).toEqual(links)
    })

    it('should handle link loading error', async () => {
      callbacks.onLoadLinks.mockRejectedValue(new Error('Network error'))
      const node = { id: 1 }
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, clientY: 0 }

      await menu.showContextMenu(e, node)

      expect(menu.contextMenu.value.linkedNodes).toEqual([])
      expect(menu.contextMenu.value.visible).toBe(true)
    })

    it('should handle null links response', async () => {
      callbacks.onLoadLinks.mockResolvedValue(null)
      const node = { id: 1 }
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, clientY: 0 }

      await menu.showContextMenu(e, node)

      expect(menu.contextMenu.value.linkedNodes).toEqual([])
    })
  })

  describe('closeContextMenu', () => {
    it('should hide menu', async () => {
      callbacks.onLoadLinks.mockResolvedValue([])
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, clientY: 0 }
      await menu.showContextMenu(e, { id: 1 })
      expect(menu.contextMenu.value.visible).toBe(true)

      menu.closeContextMenu()

      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleViewDetails', () => {
    it('should call onViewDetails and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleViewDetails(node)

      expect(callbacks.onViewDetails).toHaveBeenCalledWith(node)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleEnter', () => {
    it('should call onEnter and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleEnter(node)

      expect(callbacks.onEnter).toHaveBeenCalledWith(node)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleAddChild', () => {
    it('should close menu first then call onAddChild', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleAddChild(node)

      expect(menu.contextMenu.value.visible).toBe(false)
      expect(callbacks.onAddChild).toHaveBeenCalledWith(node)
    })
  })

  describe('handleToggleComplete', () => {
    it('should call onToggleComplete and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleToggleComplete(node)

      expect(callbacks.onToggleComplete).toHaveBeenCalledWith(node)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleToggleFavorite', () => {
    it('should call onToggleFavorite and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleToggleFavorite(node)

      expect(callbacks.onToggleFavorite).toHaveBeenCalledWith(node)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleOpenLinkSearch', () => {
    it('should call onOpenLinkSearch and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleOpenLinkSearch(node)

      expect(callbacks.onOpenLinkSearch).toHaveBeenCalledWith(node)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleUnlink', () => {
    it('should call onUnlink with node IDs', async () => {
      callbacks.onUnlink.mockResolvedValue()
      const source = { id: 1 }
      const target = { id: 2 }
      menu.contextMenu.value.linkedNodes = [{ id: 2 }, { id: 3 }]

      await menu.handleUnlink({ source, target })

      expect(callbacks.onUnlink).toHaveBeenCalledWith(1, 2)
    })

    it('should remove target from linkedNodes', async () => {
      callbacks.onUnlink.mockResolvedValue()
      menu.contextMenu.value.linkedNodes = [{ id: 2 }, { id: 3 }]

      await menu.handleUnlink({ source: { id: 1 }, target: { id: 2 } })

      expect(menu.contextMenu.value.linkedNodes).toEqual([{ id: 3 }])
    })

    it('should refresh selected node after unlink', async () => {
      callbacks.onUnlink.mockResolvedValue()
      callbacks.onRefreshSelectedNode.mockResolvedValue()

      await menu.handleUnlink({ source: { id: 1 }, target: { id: 2 } })

      expect(callbacks.onRefreshSelectedNode).toHaveBeenCalledWith(1)
    })

    it('should handle unlink error', async () => {
      callbacks.onUnlink.mockRejectedValue(new Error('Failed'))
      menu.contextMenu.value.linkedNodes = [{ id: 2 }]

      await menu.handleUnlink({ source: { id: 1 }, target: { id: 2 } })

      // linkedNodes should remain unchanged on error
      expect(menu.contextMenu.value.linkedNodes).toEqual([{ id: 2 }])
    })
  })

  describe('handleMoveToWorkspace', () => {
    it('should call onMoveToWorkspace and close menu', async () => {
      callbacks.onMoveToWorkspace.mockResolvedValue()
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      await menu.handleMoveToWorkspace({ node, workspaceId: 'work' })

      expect(callbacks.onMoveToWorkspace).toHaveBeenCalledWith(1, 'work')
      expect(menu.contextMenu.value.visible).toBe(false)
    })

    it('should close menu even on error', async () => {
      callbacks.onMoveToWorkspace.mockRejectedValue(new Error('Failed'))
      menu.contextMenu.value.visible = true

      await menu.handleMoveToWorkspace({ node: { id: 1 }, workspaceId: 'work' })

      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleDelete', () => {
    it('should call onDelete with node ID and close menu', () => {
      const node = { id: 1 }
      menu.contextMenu.value.visible = true

      menu.handleDelete(node)

      expect(callbacks.onDelete).toHaveBeenCalledWith(1)
      expect(menu.contextMenu.value.visible).toBe(false)
    })
  })

  describe('handleViewContextMenu', () => {
    it('should be an alias for showContextMenu', async () => {
      callbacks.onLoadLinks.mockResolvedValue([])
      const node = { id: 1 }
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 50, clientY: 75 }

      await menu.handleViewContextMenu({ event, node })

      expect(menu.contextMenu.value.visible).toBe(true)
      expect(menu.contextMenu.value.x).toBe(50)
      expect(menu.contextMenu.value.y).toBe(75)
    })
  })

  describe('helper methods', () => {
    beforeEach(async () => {
      callbacks.onLoadLinks.mockResolvedValue([{ id: 2 }])
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 100, clientY: 200 }
      await menu.showContextMenu(e, { id: 1, title: 'Test' })
    })

    it('isVisible should return visibility state', () => {
      expect(menu.isVisible()).toBe(true)
      menu.closeContextMenu()
      expect(menu.isVisible()).toBe(false)
    })

    it('getNode should return current node', () => {
      expect(menu.getNode()).toEqual({ id: 1, title: 'Test' })
    })

    it('getPosition should return x and y', () => {
      expect(menu.getPosition()).toEqual({ x: 100, y: 200 })
    })

    it('getLinkedNodes should return linked nodes', () => {
      expect(menu.getLinkedNodes()).toEqual([{ id: 2 }])
    })
  })

  describe('without callbacks', () => {
    it('should work with no options', async () => {
      const m = useContextMenu({})
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 0, clientY: 0 }
      const node = { id: 1 }

      await m.showContextMenu(e, node)
      m.handleViewDetails(node)
      m.handleEnter(node)
      m.handleAddChild(node)
      m.handleToggleComplete(node)
      m.handleToggleFavorite(node)
      m.handleOpenLinkSearch(node)
      await m.handleUnlink({ source: node, target: { id: 2 } })
      await m.handleMoveToWorkspace({ node, workspaceId: 'work' })
      m.handleDelete(node)

      // Should not throw
      expect(m.contextMenu.value.visible).toBe(false)
    })
  })
})
