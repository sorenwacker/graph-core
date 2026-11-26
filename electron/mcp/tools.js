/**
 * MCP tool declarations (docs/guides/mcp.md, "Tools"). Each name is a bridge
 * method; a gate test holds the two lists equal.
 */

const id = { type: 'integer', description: 'Node id' }

const nodeFields = {
  title: { type: 'string' },
  type: { type: 'string', description: 'Node type, e.g. note, task, project, person, event' },
  notes: { type: 'string', description: 'Markdown content' },
  completed: { type: 'boolean' },
  color: { type: 'string', description: 'Hex color' },
  importance: { type: 'integer', minimum: 1, maximum: 5 },
  start_date: { type: 'string', description: 'ISO date' },
  end_date: { type: 'string', description: 'ISO date' },
  due_date: { type: 'string', description: 'ISO date' },
  tags: { type: 'array', items: { type: 'string' } },
  favorite: { type: 'boolean' },
  location: { type: 'string' },
  email: { type: 'string' },
  phone: { type: 'string' },
  organization: { type: 'string' },
  role: { type: 'string' },
  address: { type: 'string' },
  website: { type: 'string' },
}

const schema = (properties = {}, required = []) => ({ type: 'object', properties, required })

const TOOLS = [
  {
    name: 'list_workspaces',
    description: 'List workspaces; the one open in the app is marked open.',
    inputSchema: schema(),
  },
  {
    name: 'set_workspace',
    description:
      'Choose the workspace this connection reads and writes, by id or name. Without it, the connection follows the workspace open in the app.',
    inputSchema: schema({ workspace: { type: 'string' } }, ['workspace']),
  },
  { name: 'get_roots', description: 'Top-level nodes of the workspace.', inputSchema: schema() },
  {
    name: 'get_tree',
    description: 'A node and all its descendants, or the whole workspace when root_id is omitted.',
    inputSchema: schema({ root_id: id }),
  },
  { name: 'get_children', description: 'Direct children of a node.', inputSchema: schema({ id }, ['id']) },
  { name: 'get_ancestors', description: 'Ancestors of a node, root first.', inputSchema: schema({ id }, ['id']) },
  {
    name: 'get_node',
    description: 'One node. Notes of a sensitive node are withheld (notes_withheld: true).',
    inputSchema: schema({ id }, ['id']),
  },
  {
    name: 'search_nodes',
    description: 'Find nodes whose title or notes contain the query.',
    inputSchema: schema(
      { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer', default: 50 } },
      ['query']
    ),
  },
  {
    name: 'get_nodes_of_type',
    description: 'All nodes of one type.',
    inputSchema: schema({ type: { type: 'string' } }, ['type']),
  },
  {
    name: 'get_nodes_by_tag',
    description: 'Nodes carrying a tag.',
    inputSchema: schema({ tag: { type: 'string' } }, ['tag']),
  },
  { name: 'list_tags', description: 'All tags used in the workspace.', inputSchema: schema() },
  { name: 'get_links', description: 'Nodes linked to a node.', inputSchema: schema({ id }, ['id']) },
  {
    name: 'create_node',
    description:
      'Create a node. With parent_id it goes under that parent, in the parent workspace; otherwise it is a root of the connection workspace.',
    inputSchema: schema({ parent_id: id, ...nodeFields }, ['title']),
  },
  {
    name: 'update_node',
    description: 'Change fields of a node. Notes of a sensitive node cannot be changed.',
    inputSchema: schema({ id, ...nodeFields }, ['id']),
  },
  {
    name: 'move_node',
    description: 'Reparent a node (parent_id; omit for top level), or place it before_id or after_id a sibling-to-be.',
    inputSchema: schema({ id, parent_id: id, before_id: id, after_id: id }, ['id']),
  },
  {
    name: 'link_nodes',
    description: 'Link two nodes.',
    inputSchema: schema({ source_id: id, target_id: id }, ['source_id', 'target_id']),
  },
  {
    name: 'unlink_nodes',
    description: 'Remove the link between two nodes.',
    inputSchema: schema({ source_id: id, target_id: id }, ['source_id', 'target_id']),
  },
  {
    name: 'delete_node',
    description: 'Move a node to the trash. It can be restored from the Trash view.',
    inputSchema: schema({ id }, ['id']),
  },
]

module.exports = { TOOLS }
