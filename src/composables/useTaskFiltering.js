import { ref, computed } from 'vue'
import { api } from '../services/api'
import { useErrorHandler } from './useErrorHandler.js'
import { getImportanceLabel, getImportanceClass } from '../utils/constants.js'
import { formatDate as formatDateShared, daysFromToday, isOverdue, isDueSoon } from '../utils/formatting.js'

/**
 * Composable for task filtering, sorting, and data loading.
 * Handles fetching tasks, filtering by container/completion/importance,
 * and computing sorted task lists.
 *
 * @param {Object} options
 * @param {Function} options.getWorkspaceId - Function returning current workspace ID
 * @param {Function} options.getContainerId - Function returning current container ID (or null)
 */
export function useTaskFiltering({ getWorkspaceId, getContainerId }) {
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

      // Fetch once: all matching workspace tasks. When a container is set,
      // filter the same result down to the container's subtree.
      let items = await api.getTasks(params)
      if (containerId && items) {
        items = await filterTasksByContainer(items, containerId)
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
   * Uses a single getDescendants call; the descendant set fully determines
   * subtree membership, so no per-task ancestry fetches are needed.
   */
  async function filterTasksByContainer(items, containerId) {
    try {
      // Get all descendant IDs
      const descendants = await api.getDescendants(containerId)
      const descendantIds = new Set((descendants || []).map(d => d.id))

      // Tasks below the container, but not the container itself
      return items.filter(task => descendantIds.has(task.id) || task.parent_id === containerId)
    } catch (e) {
      handleError(e, { context: 'Filtering tasks by container', silent: true })
      // Fallback: at least keep direct children of the container
      return items.filter(task => task.parent_id === containerId)
    }
  }

  /**
   * Build parent paths for each task.
   * Returns tasks augmented with parentPath, ancestorIds, and isDirectChild properties.
   */
  async function buildTaskPaths(items, containerId) {
    return Promise.all(
      items.filter(Boolean).map(async task => {
        let path = []
        let ancestorIds = []
        let isDirectChild = false
        try {
          // getAncestors returns ancestors ordered by depth (root first)
          const ancestors = await api.getAncestors(task.id)
          if (ancestors && ancestors.length > 0) {
            // Store all ancestor IDs for color lookup
            ancestorIds = ancestors.map(a => a.id)
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
            ancestorIds = [task.parent_id]
          }
        } catch {
          // Silently fail - task might be at root
          if (task.parent_id) {
            const parentInfo = await fetchParentInfo(task.parent_id, containerId)
            path = parentInfo.path
            isDirectChild = parentInfo.isDirectChild
            ancestorIds = [task.parent_id]
          }
        }
        return { ...task, parentPath: path, ancestorIds, isDirectChild }
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
    return sortAsc.value ? ' \u25B2' : ' \u25BC'
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
 * Date comparisons are date-based in LOCAL time (date-only strings are never
 * treated as UTC midnight), so a task due today is neither overdue nor 'Yesterday'.
 */
export function useTaskDisplayUtils() {
  /**
   * Format date as YYYY-MM-DD ('-' for missing dates).
   */
  function formatDate(dateStr) {
    return formatDateShared(dateStr, { style: 'iso', empty: '-' })
  }

  /**
   * Format date as relative string (Today, Tomorrow, in 3d, etc).
   */
  function formatRelativeDate(dateStr) {
    if (!dateStr) return '-'
    const diff = daysFromToday(dateStr)
    if (diff === null) return '-'

    if (diff < -1) return `${Math.abs(diff)}d ago`
    if (diff === -1) return 'Yesterday'
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff <= 7) return `in ${diff}d`
    return formatDate(dateStr)
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
