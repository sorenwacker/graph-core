import { handleError } from './useErrorHandler.js'
import { typeListingId } from '../utils/typeListings'

/**
 * Tag interaction actions for the main view: searching by a legacy hashtag,
 * navigating into a tag node, and deleting a tag everywhere.
 *
 * @param {Object} deps - Injected reactive state and actions from the host view.
 * @param {import('vue').Ref<string>} deps.searchQuery - Two-way search query ref.
 * @param {import('vue').Ref<boolean>} deps.showSearch - Search panel visibility ref.
 * @param {Function} deps.onSearchInput - Trigger a search with the current query.
 * @param {Function} deps.enterContainer - Navigate into a node container.
 * @param {Function} deps.deleteNode - Shared node-delete action (undo command, refreshes, navigation).
 * @returns {{selectTag: Function, navigateToTag: Function, navigateToType: Function, deleteTag: Function}}
 */
export function useTagActions({ searchQuery, showSearch, onSearchInput, enterContainer, deleteNode }) {
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
  // Routed through the shared deleteNode action so tag deletes behave like every
  // other node deletion: undo command, view/sidebar/tags refresh, and navigation
  // away when the deleted tag (or an ancestor) is the current container.
  const deleteTag = async tag => {
    if (!tag?.id) return
    if (!confirm(`Delete tag "${tag.title || tag}" everywhere? It will be moved to Trash.`)) return
    try {
      await deleteNode(tag.id)
    } catch (e) {
      handleError(e, { context: 'Deleting tag' })
    }
  }

  // Every type is also a tag: open the listing of every node of that type
  // (utils/typeListings.ts).
  const navigateToType = async type => {
    await enterContainer(typeListingId(type))
  }

  return { selectTag, navigateToTag, navigateToType, deleteTag }
}
