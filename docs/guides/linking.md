# Linking Nodes

Links create non-hierarchical relationships between nodes. Unlike parent-child relationships (which form a strict hierarchy), links allow any node to reference any other node, enabling cross-references and associations.

## Links vs Parent-Child Relationships

| Aspect | Parent-Child | Links |
|--------|--------------|-------|
| Structure | Hierarchical tree | Flat associations |
| Direction | Parent owns child | Bidirectional |
| Deletion | Deleting parent affects children | Independent |
| Navigation | Up/down hierarchy | Direct jump |
| Visibility | Tree, Cards, Table views | Graph view (external links), Detail panel |

## Creating Links

There are three methods to create links between nodes:

### Method 1: Option+Drag in Graph View

1. Open Graph view
2. Hold `Option` (Mac) or `Alt` (Windows/Linux)
3. Drag from source node to target node
4. Release to create the link

The cursor changes to indicate link mode when Option is held.

### Method 2: Link Mode in Search

1. Select a node (the source)
2. Open spotlight search (`Cmd/Ctrl + K`)
3. Search for the target node
4. Hold `Option` and click the result, or use the Link action

This method works from any view.

### Method 3: Context Menu

1. Right-click a node
2. Select "Link to..."
3. Search for the target node in the dialog
4. Select the target to create the link

## Viewing Links

### In Graph View

Enable "Show External Links" in the graph toolbar to display link edges. Links appear as dashed lines (distinct from solid parent-child edges).

### In Detail Panel

The "Linked Items" section shows all nodes linked to the current node:

- Click a linked node to navigate to it
- Click the X button to remove the link
- Use the search field to add new links

### In Cards View

Linked nodes can be toggled visible in the Children section of the detail panel using the "Show Linked" option.

## Removing Links

### From Detail Panel

1. Open the detail panel for either linked node
2. Scroll to "Linked Items" section
3. Click the X button next to the link to remove

### From Context Menu

1. Right-click a node that has links
2. Select "Unlink from..."
3. Choose which link(s) to remove

### From Graph View

Links cannot be directly deleted from the graph view. Use the detail panel or context menu.

## Use Cases

### Cross-References

Link related topics that exist in different parts of your hierarchy:

- A task linked to the person responsible
- A meeting linked to its agenda items
- A research note linked to source materials

### Project Associations

Connect nodes across projects without duplicating them:

- Shared resources used by multiple projects
- Dependencies between components
- Related milestones

### Person Connections

Link people to relevant nodes:

- Team members to their projects
- Contacts to meeting notes
- Stakeholders to decisions

## Mentions in Notes

The notes editor supports `@mentions` that automatically create links:

1. Type `@` followed by a person's name
2. Select from the dropdown of matching persons (arrow keys plus Enter or Tab, or click)
3. The mention is inserted and a link between the person and the current node is created

Mention format: `@[Person Name](person:123)`, rendered as a `@Name` chip in the preview.

Suggestions come from the persons in the current workspace.

See [Detail Panel](detail-panel.md#mentions) for more details.

## Link Behavior

- Links are bidirectional: if A links to B, B also shows A in its linked items
- Links persist independently of hierarchy changes
- Moving a node preserves its links
- Deleting a node removes all its links
- Links are included in export/import operations

## See Also

- [Graph View](views.md#graph-view) - Visualizing links
- [Detail Panel](detail-panel.md#linked-items-section) - Managing links
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md) - Link shortcuts
