# Connecting an AI agent (MCP)

Graph Core includes a Model Context Protocol (MCP) server. An MCP client such as Claude Code or Claude Desktop can read and edit the nodes of the running app through it. Changes an agent makes appear in the open views immediately.

## Prerequisites

- Graph Core is running. The MCP server reaches the database through the app; with the app closed, every tool reports that Graph Core is not running.
- The MCP server is enabled in **Settings > General > MCP server**. It is off by default.

## Connect a client

1. Open **Settings > General > MCP server** and turn on **Enable MCP server**.
2. Click **Copy client configuration**. The clipboard now holds a JSON entry that runs the MCP server bundled with the app, using the app's own executable; no separate installation is needed.
3. Add the entry to the client's MCP configuration: for Claude Code, run `claude mcp add-json graph-core '<pasted JSON>'`; for Claude Desktop, add it under `mcpServers` in `claude_desktop_config.json`.
4. Restart the client.

The settings section shows **Connected clients: 1** once the client has connected. The configuration contains the path of the installed app; after moving the app, copy it again.

## Tools

| Tool | Effect |
|------|--------|
| `list_workspaces`, `set_workspace` | List workspaces; choose the one the connection reads and writes. Without `set_workspace`, the connection follows the workspace open in the app |
| `get_tree`, `get_roots`, `get_children`, `get_ancestors` | Read the hierarchy |
| `get_node`, `search_nodes`, `get_nodes_of_type`, `get_nodes_by_tag`, `list_tags` | Read nodes |
| `get_links` | Read the links of a node |
| `create_node` | Create a node, optionally under a parent |
| `update_node` | Change title, notes, type, dates, tags, completion and other fields |
| `move_node` | Change a node's parent or position among its siblings |
| `link_nodes`, `unlink_nodes` | Add or remove a link between two nodes |
| `delete_node` | Move a node to the trash. It can be restored from the Trash view |

## Sensitive nodes

An MCP client can see that a node marked sensitive exists and can move it, but cannot read its content or change it, whether sensitive notes are locked or unlocked in the app:

- Every tool returns a sensitive node in reduced form: `id`, `title`, `type`, `parent_id`, `workspace_id` and `sensitive: true`. Its notes, dates, tags, contact fields and other content are left out.
- `move_node` moves it, and other nodes can be moved or created under it.
- `update_node`, `delete_node`, `link_nodes` and `unlink_nodes` refuse it with an error that names it as sensitive.
- `search_nodes` matches it on its title only.
- Its children are not sensitive by inheritance.

See [Sensitive notes](../architecture/sensitive-notes.md).