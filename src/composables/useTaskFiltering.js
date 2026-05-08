import { ref, computed, watch } from 'vue'
import { api } from '../services/api'
import { useErrorHandler } from './useErrorHandler.js'

/**
 * Composable for task filtering, sorting, and data loading.
 * Handles fetching tasks, filtering by container/completion/importance,
 * and computing sorted task lists.
 *
 * @param {Object} options
 * @param {Function} options.getWorkspaceId - Function returning current workspace ID
 * @param {Function} options.getContainerId - Function returning current container ID (or null)
 * @param {Function} options.getHideSensitive - Function returning hideSensitive flag
 */
export function useTaskFiltering({ getWorkspaceId, getContainerId, getHideSensitive }) {
  const { handleError } = useErrorHandler()

  // State
  const tasks = ref([])
  const loading = ref(true)
  const sortBy = ref('due_date') // due_date, importance, created_at, title, project, completed
  const sortAsc = ref(true)
  const showCompleted = ref(false)
  const filterImportance = ref(0) // 0 = all

  /**
   * Load tasks from API with current filters.
   * Handles container scoping and builds parent paths for each task.
   */
  async function loadTasks() {
    loading.value = true
    try {
      const workspaceId = getWorkspaceId()
      const containerId = getContainerId()

      const params = {
        workspaceId,
        completed: showCompleted.value ? undefined : false,
      }
      if (filterImportance.value > 0) {
        params.importance = filterImportance.value
      }
      // Filter by parent container if specified
      if (containerId) {
        params.parentId = containerId
      }

      let items = await api.getTasks(params)

      // If we have a container, also get tasks from descendants
      if (containerId && items) {
        items = await filterTasksByContainer(items, containerId, workspaceId)
      }

      // Load parent paths for each task
      const tasksWithPaths = await buildTaskPaths(items || [], containerId)

      tasks.value = tasksWithPaths
    } catch (e) {
      handleError(e, { context: 'Loading tasks', silent: true })
      tasks.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Filter tasks to only include those within a container's subtree.
   */
  async function filterTasksByContainer(items, containerId, workspaceId) {
    try {
      // Get all descendant IDs
      const descendants = await api.getDescendants(containerId)
      const descendantIds = new Set((descendants || []).map(d => d.id))
      descendantIds.add(containerId)

      // Get all tasks and filter to those in the subtree
      const allParams = {
        workspaceId,
        completed: showCompleted.value ? undefined : false,
      }
      if (filterImportance.value > 0) {
        allParams.importance = filterImportance.value
      }
      const allTasks = await api.getTasks(allParams)

      // Filter to tasks that are descendants of the container
      const preliminaryItems = (allTasks || []).filter(task => {
        // Check if task itself or any of its ancestors is in the descendant set
        return descendantIds.has(task.id) || descendantIds.has(task.parent_id)
      })

      // Also need to check full ancestry for deeply nested tasks
      const filteredItems = []
      for (const task of preliminaryItems) {
        try {
          const ancestors = await api.getAncestors(task.id)
          const ancestorIds = (ancestors || []).map(a => a.id)
          if (ancestorIds.includes(containerId) || task.parent_id === containerId) {
            filteredItems.push(task)
          }
        } catch {
          // If we can't get ancestors, include if direct child
          if (task.parent_id === containerId) {
            filteredItems.push(task)
          }
        }
      }
      return filteredItems
    } catch (e) {
      handleError(e, { context: 'Filtering tasks by container', silent: true })
      return items
    }
  }

  /**
   * Build parent paths for each task.
   * Returns tasks augmented with parentPath and isDirectChild properties.
   */
  async function buildTaskPaths(items, containerId) {
    return Promise.all(
      items.filter(Boolean).map(async task => {
        let path = []
        let isDirectChild = false
        try {
          // getAncestors returns ancestors ordered by depth (root first)
          const ancestors = await api.getAncestors(task.id)
          if (ancestors && ancestors.length > 0) {
            let ancestorList = [...ancestors]

            // If in a container, show path relative to container
            if (containerId) {
              const containerIndex = ancestorList.findIndex(a => a.id === containerId)
              if (containerIndex >= 0) {
                // Check if task is direct child of container
                if (containerIndex === ancestorList.length - 1) {
                  isDirectChild = true
                }
                // Show everything after the container
                ancestorList = ancestorList.slice(containerIndex + 1)
              }
            }

            path = ancestorList.map(a => a.title)
          } else if (task.parent_id) {
            // No ancestors returned but has parent - fetch parent directly
            const parentInfo = await fetchParentInfo(task.parent_id, containerId)
            path = parentInfo.path
            isDirectChild = parentInfo.isDirectChild
          }
        } catch {
          // Silently fail - task might be at root
          if (task.parent_id) {
            const parentInfo = await fetchParentInfo(task.parent_id, containerId)
            path = parentInfo.path
            isDirectChild = parentInfo.isDirectChild
          }
        }
        return { ...task, parentPath: path, isDirectChild }
      })
    )
  }

  /**
   * Fetch parent information for path building.
   */
  async function fetchParentInfo(parentId, containerId) {
    try {
      const parent = await api.getNode(parentId)
      if (parent && parent.title) {
        if (containerId && parent.id === containerId) {
          return { path: [], isDirectChild: true }
        }
        return { path: [parent.title], isDirectChild: false }
      }
    } catch {
      // Ignore
    }
    return { path: [], isDirectChild: false }
  }

  /**
   * Computed sorted tasks based on current sort settings.
   */
  const sortedTasks = computed(() => {
    const sorted = [...tasks.value]

    sorted.sort((a, b) => {
      let cmp = 0

      switch (sortBy.value) {
        case 'due_date':
          // Nulls last
          if (!a.due_date && !b.due_date) cmp = 0
          else if (!a.due_date) cmp = 1
          else if (!b.due_date) cmp = -1
          else cmp = a.due_date.localeCompare(b.due_date)
          break
        case 'importance':
          // Higher importance first (descending by default)
          cmp = (b.importance || 0) - (a.importance || 0)
          break
        case 'created_at':
          cmp = (a.created_at || '').localeCompare(b.created_at || '')
          break
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '')
          break
        case 'project': {
          // Sort by joined path string
          const pathA = (a.parentPath || []).join(' / ')
          const pathB = (b.parentPath || []).join(' / ')
          // Empty paths last
          if (!pathA && !pathB) cmp = 0
          else if (!pathA) cmp = 1
          else if (!pathB) cmp = -1
          else cmp = pathA.localeCompare(pathB)
          break
        }
        case 'completed':
          cmp = (a.completed ? 1 : 0) - (b.completed ? 1 : 0)
          break
      }

      return sortAsc.value ? cmp : -cmp
    })

    return sorted
  })

  /**
   * Toggle sort column. Clicking same column toggles direction.
   */
  function toggleSort(column) {
    if (sortBy.value === column) {
      sortAsc.value = !sortAsc.value
    } else {
      sortBy.value = column
      sortAsc.value = column === 'importance' ? false : true
    }
  }

  /**
   * Get sort indicator for column header.
   */
  function getSortIcon(column) {
    if (sortBy.value !== column) return ''
    return sortAsc.value ? ' ^' : ' v'
  }

  return {
    // State
    tasks,
    loading,
    sortBy,
    sortAsc,
    showCompleted,
    filterImportance,

    // Computed
    sortedTasks,

    // Methods
    loadTasks,
    toggleSort,
    getSortIcon,
  }
}

/**
 * Date and importance utility functions for task display.
 */
export function useTaskDisplayUtils() {
  /**
   * Check if a due date is overdue (before today).
   */
  function isOverdue(dueDateStr) {
    if (!dueDateStr) return false
    const dueDate = new Date(dueDateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today
  }

  /**
   * Check if a due date is within the next 3 days.
   */
  function isDueSoon(dueDateStr) {
    if (!dueDateStr) return false
    const dueDate = new Date(dueDateStr)
    const today = new Date()
    const threeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate >= today && dueDate <= threeDays
  }

  /**
   * Format date as YYYY-MM-DD.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return dateStr.split('T')[0]
  }

  /**
   * Format date as relative string (Today, Tomorrow, in 3d, etc).
   */
  function formatRelativeDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((date - now) / (1000 * 60 * 60 * 24))

    if (diff < -1) return `${Math.abs(diff)}d ago`
    if (diff === -1) return 'Yesterday'
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff <= 7) return `in ${diff}d`
    return dateStr.split('T')[0]
  }

  /**
   * Get human-readable importance label.
   */
  function getImportanceLabel(importance) {
    if (!importance) return '-'
    const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent', 5: 'Critical' }
    return labels[importance] || importance
  }

  /**
   * Get CSS class for importance styling.
   */
  function getImportanceClass(importance) {
    if (!importance) return ''
    if (importance >= 4) return 'importance-critical'
    if (importance >= 3) return 'importance-high'
    if (importance >= 2) return 'importance-medium'
    return 'importance-low'
  }

  return {
    isOverdue,
    isDueSoon,
    formatDate,
    formatRelativeDate,
    getImportanceLabel,
    getImportanceClass,
  }
}
