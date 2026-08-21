# Workspaces

Organize your nodes into separate workspaces for different contexts.

## Overview

Workspaces provide logical separation between different domains of work. Two are created on first run:

- **Work** (`work`): Professional projects and tasks
- **Private** (`private`): Personal notes and todos

Add as many more as you need. The [Demo workspace](demo-workspace.md) is created on request from the onboarding modal or Settings > About.

!!! note
    People is a *view*, not a workspace. Person and organization nodes live in a normal workspace like any other node.

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

### Persons and Organizations

Person and organization nodes belong to a workspace like every other node:

- The People view lists the persons of the current workspace
- `@mention` autocomplete in notes offers the persons of the current workspace
- Links between persons and other nodes are not restricted by workspace

### Node Type Assignment

New nodes are created in the workspace you are currently in, whatever their type. Upgrades from older versions moved unassigned nodes — persons and organizations included — into **Work**.

## Moving Nodes Between Workspaces

Right-click a node and choose **Move to Workspace**. The list contains your real workspaces only; the current one is highlighted.

## Deleting Workspaces

1. Switch to the workspace to delete
2. Click the workspace selector
3. Click the delete icon
4. Confirm deletion

A workspace can only be deleted when it is empty and it is not your last workspace. If it still has root nodes you are told how many, and nothing is deleted — move or delete them first.

## See Also

- [Quickstart](quickstart.md)
- [Node Types](../reference/node-types.md)
- [Settings](../reference/settings.md)
