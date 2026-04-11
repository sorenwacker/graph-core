import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useWorkspace } from '../composables/useWorkspace.js'

describe('useWorkspace composable', () => {
  let mockApi, workspace

  beforeEach(() => {
    // Clear localStorage mock
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    mockApi = {
      getWorkspaces: vi.fn().mockResolvedValue([
        { id: 'work', name: 'Work' },
        { id: 'personal', name: 'Personal' },
      ]),
      createWorkspace: vi.fn().mockResolvedValue({ id: 'new-ws', name: 'New' }),
      deleteWorkspace: vi.fn().mockResolvedValue(true),
      getRoots: vi.fn().mockResolvedValue([]),
    }
    workspace = useWorkspace({ api: mockApi })
  })

  describe('initial state', () => {
    it('should have default workspace as "work"', () => {
      expect(workspace.currentWorkspace.value).toBe('work')
    })

    it('should have empty workspaces list initially', () => {
      expect(workspace.workspaces.value).toEqual([])
    })

    it('should not show new workspace input initially', () => {
      expect(workspace.showNewWorkspaceInput.value).toBe(false)
    })

    it('should restore workspace from localStorage', () => {
      localStorage.getItem.mockReturnValue('personal')
      const ws = useWorkspace({ api: mockApi })
      expect(ws.currentWorkspace.value).toBe('personal')
    })
  })

  describe('loadWorkspaces', () => {
    it('should load workspaces from API', async () => {
      await workspace.loadWorkspaces()

      expect(mockApi.getWorkspaces).toHaveBeenCalled()
      expect(workspace.workspaces.value).toHaveLength(2)
      expect(workspace.workspaces.value[0].id).toBe('work')
    })

    it('should filter out null values from API response', async () => {
      mockApi.getWorkspaces.mockResolvedValue([
        { id: 'work', name: 'Work' },
        null,
        { id: 'personal', name: 'Personal' },
      ])

      await workspace.loadWorkspaces()

      expect(workspace.workspaces.value).toHaveLength(2)
    })

    it('should handle API error gracefully', async () => {
      mockApi.getWorkspaces.mockRejectedValue(new Error('API Error'))

      await workspace.loadWorkspaces()

      expect(workspace.workspaces.value).toEqual([])
    })
  })

  describe('createWorkspace', () => {
    beforeEach(async () => {
      await workspace.loadWorkspaces()
    })

    it('should create a new workspace', async () => {
      workspace.newWorkspaceName.value = 'New Project'

      await workspace.createWorkspace()

      expect(mockApi.createWorkspace).toHaveBeenCalledWith({ name: 'New Project' })
    })

    it('should switch to new workspace after creation', async () => {
      workspace.newWorkspaceName.value = 'New Project'

      await workspace.createWorkspace()

      expect(workspace.currentWorkspace.value).toBe('new-ws')
    })

    it('should clear input state after creation', async () => {
      workspace.newWorkspaceName.value = 'New Project'
      workspace.showNewWorkspaceInput.value = true

      await workspace.createWorkspace()

      expect(workspace.newWorkspaceName.value).toBe('')
      expect(workspace.showNewWorkspaceInput.value).toBe(false)
    })

    it('should not create workspace with empty name', async () => {
      workspace.newWorkspaceName.value = '   '

      await workspace.createWorkspace()

      expect(mockApi.createWorkspace).not.toHaveBeenCalled()
    })

    it('should reload workspaces after creation', async () => {
      workspace.newWorkspaceName.value = 'New Project'

      await workspace.createWorkspace()

      expect(mockApi.getWorkspaces).toHaveBeenCalledTimes(2)
    })
  })

  describe('deleteWorkspace', () => {
    beforeEach(async () => {
      await workspace.loadWorkspaces()
    })

    it('should not delete if only one workspace exists', async () => {
      mockApi.getWorkspaces.mockResolvedValue([{ id: 'work', name: 'Work' }])
      await workspace.loadWorkspaces()

      const result = await workspace.deleteCurrentWorkspace()

      expect(result).toBe(false)
      expect(mockApi.deleteWorkspace).not.toHaveBeenCalled()
    })

    it('should not delete if workspace has nodes', async () => {
      mockApi.getRoots.mockResolvedValue([{ id: 1, title: 'Node' }])

      const result = await workspace.deleteCurrentWorkspace()

      expect(result).toBe(false)
      expect(mockApi.deleteWorkspace).not.toHaveBeenCalled()
    })

    it('should delete empty workspace', async () => {
      mockApi.getRoots.mockResolvedValue([])

      await workspace.deleteCurrentWorkspace()

      expect(mockApi.deleteWorkspace).toHaveBeenCalledWith('work')
    })

    it('should switch to first workspace after deletion', async () => {
      mockApi.getRoots.mockResolvedValue([])
      mockApi.getWorkspaces
        .mockResolvedValueOnce([
          { id: 'work', name: 'Work' },
          { id: 'personal', name: 'Personal' },
        ])
        .mockResolvedValueOnce([{ id: 'personal', name: 'Personal' }])

      await workspace.loadWorkspaces()
      await workspace.deleteCurrentWorkspace()

      expect(workspace.currentWorkspace.value).toBe('personal')
    })
  })

  describe('openNewWorkspaceDialog', () => {
    it('should show input and clear name', () => {
      workspace.newWorkspaceName.value = 'old value'

      workspace.openNewWorkspaceDialog()

      expect(workspace.showNewWorkspaceInput.value).toBe(true)
      expect(workspace.newWorkspaceName.value).toBe('')
    })
  })

  describe('getWorkspaceIdForNode', () => {
    it('should return current workspace id', () => {
      workspace.currentWorkspace.value = 'personal'

      expect(workspace.getWorkspaceIdForNode()).toBe('personal')
    })
  })

  describe('switchWorkspace', () => {
    it('should update currentWorkspace', () => {
      workspace.switchWorkspace('personal')

      expect(workspace.currentWorkspace.value).toBe('personal')
    })

    it('should persist to localStorage', () => {
      workspace.switchWorkspace('personal')

      expect(localStorage.setItem).toHaveBeenCalledWith('graphcore-workspace', 'personal')
    })

    it('should call onSwitch callback', () => {
      const onSwitch = vi.fn()
      const ws = useWorkspace({ api: mockApi, onSwitch })

      ws.switchWorkspace('personal')

      expect(onSwitch).toHaveBeenCalledWith('personal')
    })
  })

  describe('persistence', () => {
    it('should persist workspace changes to localStorage', async () => {
      workspace.currentWorkspace.value = 'personal'
      await nextTick()

      expect(localStorage.setItem).toHaveBeenCalledWith('graphcore-workspace', 'personal')
    })
  })
})
