import { api } from '../services/api.js'
import { handleError } from './useErrorHandler.js'

/**
 * Tag interaction actions for the main view: searching by a legacy hashtag,
 * navigating into a tag node, and deleting a tag everywhere.
 *
 * @param {Object} deps - Injected reactive state and actions from the host view.
 * @param {import('vue').Ref<string>} deps.searchQuery - Two-way search query ref.
 * @param {import('vue').Ref<boolean>} deps.showSearch - Search panel visibility ref.
 * @param {Function} deps.onSearchInput - Trigger a search with the current query.
 * @param {Function} deps.enterContainer - Navigate into a node container.
 * @param {import('vue').Ref<number|null>} deps.currentContainerId - Current container id ref.
 * @param {Function} deps.navigateToBreadcrumb - Navigate to a breadcrumb index.
 * @param {Function} deps.loadTags - Reload the tag list.
 * @returns {{selectTag: Function, navigateToTag: Function, deleteTag: Function}}
 */
export function useTagActions({
  searchQuery,
  showSearch,
  onSearchInput,
  enterContainer,
  currentContainerId,
  navigateToBreadcrumb,
  loadTags,
}) {
  // For legacy string tags, search by hashtag.
  const selectTag = tag => {
    const tagName = tag.title || tag
    searchQuery.value = `#${tagName}`
    showSearch.value = true
    onSearchInput()
  }

  // Navigate into the tag node to show all linked items.
  const navigateToTag = async tagNode => {
    if (tagNode && tagNode.id) {
      await enterContainer(tagNode)
    }
  }

  // Delete a tag everywhere (removes the tag node and all its links). Soft-delete,
  // so it lands in Trash and stays recoverable like any other node deletion.
  const deleteTag = async tag => {
    if (!tag?.id) return
    if (!confirm(`Delete tag "${tag.title || tag}" everywhere? It will be moved to Trash.`)) return
    try {
      await api.deleteNode(tag.id)
      // If we were viewing the deleted tag, return to the root view.
      if (currentContainerId.value === tag.id) navigateToBreadcrumb(-1)
      await loadTags()
    } catch (e) {
      handleError(e, { context: 'Deleting tag' })
    }
  }

  return { selectTag, navigateToTag, deleteTag }
}
