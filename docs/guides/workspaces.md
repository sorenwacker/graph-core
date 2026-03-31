# Workspaces

Organize your nodes into separate workspaces for different contexts.

## Overview

Workspaces provide logical separation between different domains of work:

- **Work**: Professional projects and tasks
- **Personal**: Personal notes and todos
- **People**: Contact management (special workspace)

## Creating Workspaces

1. Click the workspace selector in the header
2. Click "New Workspace"
3. Enter a name
4. Press Enter or click Create

## Switching Workspaces

1. Click the workspace selector
2. Select the workspace to switch to

Switching workspaces:

- Navigates to root level
- Clears current selection
- Reloads sidebar tree
- Updates recent items and favorites
- Restores workspace-specific graph settings

## Graph Settings

Graph settings are stored per-workspace. Each workspace maintains its own:

- Layout mode (tree, radial, etc.)
- External links visibility
- Root node visibility
- Node type filters
- Radial layout parameters

When you toggle external links or change the layout at the root level of one workspace, these settings do not affect other workspaces.

## Workspace Behavior

### Node Isolation

Nodes belong to a single workspace. When viewing a workspace:

- Only nodes from that workspace are shown
- Search results are filtered to current workspace
- Recent items show workspace-specific history

### People Workspace

The People workspace is special:

- Person nodes can be @mentioned from any workspace
- Organization nodes provide grouping
- Links between people and other nodes work across workspaces

### Node Type Assignment

Some node types are automatically assigned to workspaces:

| Type | Default Workspace |
|------|-------------------|
| person | People |
| organization | People |
| task | Current workspace |
| project | Current workspace |
| note | Current workspace |

## Deleting Workspaces

1. Select the workspace to delete
2. Click the workspace selector
3. Click the delete icon
4. Confirm deletion

!!! warning
    Deleting a workspace deletes all nodes within it. This cannot be undone.

## See Also

- [Quickstart](quickstart.md)
- [Node Types](../reference/node-types.md)
- [Settings](../reference/settings.md)
