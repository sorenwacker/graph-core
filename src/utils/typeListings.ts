/**
 * Every node type doubles as a tag: the sidebar lists the types present in a
 * workspace, and opening one shows every node of that type in one place, at
 * any depth of the hierarchy (docs/reference/node-types.md, "Every type is
 * also a list").
 *
 * A listing is a virtual container. It has no row in the database, so its id
 * is a string, `type:person`, that navigation recognises and answers with the
 * nodes of that type instead of children. Nothing is ever written to it:
 * anything created while it is open goes to the top level, as the listed type.
 */
import { nodeTypes, getTypePlural } from './constants.js'
import type { Node, NodeType } from '../types'

const PREFIX = 'type:'

/** The virtual container id for a type's listing: `type:person` */
export function typeListingId(type: NodeType): string {
  return PREFIX + type
}

/** The type a listing id stands for, or null for a node id or an unknown type */
export function typeOfListing(id: unknown): NodeType | null {
  if (typeof id !== 'string' || !id.startsWith(PREFIX)) return null
  const type = id.slice(PREFIX.length)
  return (nodeTypes as string[]).includes(type) ? (type as NodeType) : null
}

/** The parent a node created inside this container gets: a listing is not one */
export function parentForCreation<T>(containerId: T): T | null {
  return typeOfListing(containerId) ? null : containerId
}

/**
 * The container node a listing is shown as: titled with the plural, typed as
 * the listed type so it takes that type's icon and colour. The id is the
 * listing id, which is why it is cast: a listing is not a stored node.
 */
export function makeTypeListing(type: NodeType): Node {
  return {
    id: typeListingId(type) as unknown as number,
    title: getTypePlural(type),
    type,
    parent_id: null,
    workspace_id: null,
    completed: false,
    in_progress: false,
    blocked: false,
    favorite: false,
    notes: null,
    notes_sensitive: false,
    notes_withheld: false,
    has_notes: false,
    due_date: null,
    start_date: null,
    end_date: null,
    color: null,
    importance: null,
    location: null,
    email: null,
    phone: null,
    organization: null,
    role: null,
    website: null,
    tags: [],
    sort_order: 0,
    depth: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    show_links: false,
    show_root_node: true,
    show_external_links: false,
    graph_layout: null,
    graph_max_depth: null,
    graph_type_filter: null,
    graph_relax_locked: false,
    graph_fit_locked: false,
    graph_physics: null,
    collapsed: false,
  } as Node
}
