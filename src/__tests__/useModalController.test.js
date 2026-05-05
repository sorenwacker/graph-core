import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useModalController } from '../composables/useModalController.js'

describe('useModalController composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have addNodeModal with visible false and null parentId', () => {
      const controller = useModalController()
      expect(controller.addNodeModal.value).toEqual({
        visible: false,
        parentId: null,
      })
    })

    it('should have showShortcutsModal as false', () => {
      const controller = useModalController()
      expect(controller.showShortcutsModal.value).toBe(false)
    })

    it('should have showOnboarding as false', () => {
      const controller = useModalController()
      expect(controller.showOnboarding.value).toBe(false)
    })

    it('should have showSettings as false', () => {
      const controller = useModalController()
      expect(controller.showSettings.value).toBe(false)
    })

    it('should have showSnapshotList as false', () => {
      const controller = useModalController()
      expect(controller.showSnapshotList.value).toBe(false)
    })

    it('should have showLostFound as false', () => {
      const controller = useModalController()
      expect(controller.showLostFound.value).toBe(false)
    })
  })

  describe('showAddNodeModal', () => {
    it('should set addNodeModal visible to true', () => {
      const controller = useModalController()

      controller.showAddNodeModal()

      expect(controller.addNodeModal.value.visible).toBe(true)
    })

    it('should set parentId to null by default', () => {
      const controller = useModalController()

      controller.showAddNodeModal()

      expect(controller.addNodeModal.value.parentId).toBeNull()
    })

    it('should set parentId when provided', () => {
      const controller = useModalController()

      controller.showAddNodeModal(123)

      expect(controller.addNodeModal.value).toEqual({
        visible: true,
        parentId: 123,
      })
    })

    it('should call onBeforeShow callback when provided', () => {
      const controller = useModalController()
      const onBeforeShow = vi.fn()

      controller.showAddNodeModal(null, { onBeforeShow })

      expect(onBeforeShow).toHaveBeenCalled()
    })

    it('should call onBeforeShow before setting visible', () => {
      const controller = useModalController()
      const callOrder = []
      const onBeforeShow = vi.fn(() => {
        callOrder.push('callback')
        expect(controller.addNodeModal.value.visible).toBe(false)
      })

      controller.showAddNodeModal(null, { onBeforeShow })
      callOrder.push('afterCall')

      expect(callOrder).toEqual(['callback', 'afterCall'])
      expect(controller.addNodeModal.value.visible).toBe(true)
    })
  })

  describe('closeAddNodeModal', () => {
    it('should set addNodeModal visible to false', () => {
      const controller = useModalController()
      controller.showAddNodeModal(123)

      controller.closeAddNodeModal()

      expect(controller.addNodeModal.value.visible).toBe(false)
    })

    it('should reset parentId to null', () => {
      const controller = useModalController()
      controller.showAddNodeModal(123)

      controller.closeAddNodeModal()

      expect(controller.addNodeModal.value.parentId).toBeNull()
    })
  })

  describe('toggleSnapshots', () => {
    it('should toggle showSnapshotList from false to true', () => {
      const controller = useModalController()

      controller.toggleSnapshots()

      expect(controller.showSnapshotList.value).toBe(true)
    })

    it('should toggle showSnapshotList from true to false', () => {
      const controller = useModalController()
      controller.showSnapshotList.value = true

      controller.toggleSnapshots()

      expect(controller.showSnapshotList.value).toBe(false)
    })

    it('should call loadSnapshots when opening', () => {
      const loadSnapshots = vi.fn()
      const controller = useModalController({ loadSnapshots })

      controller.toggleSnapshots()

      expect(loadSnapshots).toHaveBeenCalled()
    })

    it('should not call loadSnapshots when closing', () => {
      const loadSnapshots = vi.fn()
      const controller = useModalController({ loadSnapshots })
      controller.showSnapshotList.value = true

      controller.toggleSnapshots()

      expect(loadSnapshots).not.toHaveBeenCalled()
    })

    it('should work without loadSnapshots callback', () => {
      const controller = useModalController()

      expect(() => controller.toggleSnapshots()).not.toThrow()
      expect(controller.showSnapshotList.value).toBe(true)
    })
  })

  describe('toggleLostFound', () => {
    it('should toggle showLostFound from false to true', () => {
      const controller = useModalController()

      controller.toggleLostFound()

      expect(controller.showLostFound.value).toBe(true)
    })

    it('should toggle showLostFound from true to false', () => {
      const controller = useModalController()
      controller.showLostFound.value = true

      controller.toggleLostFound()

      expect(controller.showLostFound.value).toBe(false)
    })

    it('should call loadOrphanedNodes when toggling', () => {
      const loadOrphanedNodes = vi.fn()
      const controller = useModalController({ loadOrphanedNodes })

      controller.toggleLostFound()

      expect(loadOrphanedNodes).toHaveBeenCalled()
    })

    it('should call loadOrphanedNodes on both open and close', () => {
      const loadOrphanedNodes = vi.fn()
      const controller = useModalController({ loadOrphanedNodes })

      controller.toggleLostFound()
      controller.toggleLostFound()

      expect(loadOrphanedNodes).toHaveBeenCalledTimes(2)
    })

    it('should work without loadOrphanedNodes callback', () => {
      const controller = useModalController()

      expect(() => controller.toggleLostFound()).not.toThrow()
      expect(controller.showLostFound.value).toBe(true)
    })
  })

  describe('shortcuts modal', () => {
    it('should open shortcuts modal', () => {
      const controller = useModalController()

      controller.openShortcutsModal()

      expect(controller.showShortcutsModal.value).toBe(true)
    })

    it('should close shortcuts modal', () => {
      const controller = useModalController()
      controller.showShortcutsModal.value = true

      controller.closeShortcutsModal()

      expect(controller.showShortcutsModal.value).toBe(false)
    })
  })

  describe('onboarding modal', () => {
    it('should open onboarding modal', () => {
      const controller = useModalController()

      controller.openOnboarding()

      expect(controller.showOnboarding.value).toBe(true)
    })

    it('should close onboarding modal', () => {
      const controller = useModalController()
      controller.showOnboarding.value = true

      controller.closeOnboarding()

      expect(controller.showOnboarding.value).toBe(false)
    })
  })

  describe('settings panel', () => {
    it('should open settings panel', () => {
      const controller = useModalController()

      controller.openSettings()

      expect(controller.showSettings.value).toBe(true)
    })

    it('should close settings panel', () => {
      const controller = useModalController()
      controller.showSettings.value = true

      controller.closeSettings()

      expect(controller.showSettings.value).toBe(false)
    })
  })

  describe('return values', () => {
    it('should return all expected state and methods', () => {
      const controller = useModalController()

      // State refs
      expect(controller.addNodeModal).toBeDefined()
      expect(controller.showShortcutsModal).toBeDefined()
      expect(controller.showOnboarding).toBeDefined()
      expect(controller.showSettings).toBeDefined()
      expect(controller.showSnapshotList).toBeDefined()
      expect(controller.showLostFound).toBeDefined()

      // Methods
      expect(typeof controller.showAddNodeModal).toBe('function')
      expect(typeof controller.closeAddNodeModal).toBe('function')
      expect(typeof controller.openShortcutsModal).toBe('function')
      expect(typeof controller.closeShortcutsModal).toBe('function')
      expect(typeof controller.openOnboarding).toBe('function')
      expect(typeof controller.closeOnboarding).toBe('function')
      expect(typeof controller.openSettings).toBe('function')
      expect(typeof controller.closeSettings).toBe('function')
      expect(typeof controller.toggleSnapshots).toBe('function')
      expect(typeof controller.toggleLostFound).toBe('function')
    })
  })
})
