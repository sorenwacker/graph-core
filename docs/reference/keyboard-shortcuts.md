# Keyboard Shortcuts

Complete keyboard shortcut reference for Graph Core.

## Navigation

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open spotlight search |
| `Cmd/Ctrl + Up` | Go to parent container |
| `Cmd/Ctrl + Down` | Go into first child |
| `Cmd/Ctrl + Left` | Go to previous sibling |
| `Cmd/Ctrl + Right` | Go to next sibling |
| `Tab` | Select next visible node |
| `Shift + Tab` | Select previous visible node |
| `Arrow keys` | Grid navigation (Cards) / Up/Down (Table/Tree) |
| `Double-click` | Enter node (view subgraph) |
| `Escape` | Close detail panel / Clear selection |

## Switching Views

`Cmd/Ctrl` plus a digit switches the main view. The digits follow the order the view switcher shows in the toolbar, so the Nth button is always `Cmd/Ctrl + N`.

| Shortcut | View |
|----------|------|
| `Cmd/Ctrl + 1` | Graph |
| `Cmd/Ctrl + 2` | Cards |
| `Cmd/Ctrl + 3` | Table |
| `Cmd/Ctrl + 4` | Tasks |
| `Cmd/Ctrl + 5` | Timeline |
| `Cmd/Ctrl + 6` | People |
| `Cmd/Ctrl + 7` | Trash |

The modifier is required rather than using bare digits, because a bare digit would be captured while the user is typing into a surface the application does not treat as a text input. Like every other application shortcut, these do not fire while focus is inside the node spreadsheet.

## Node Operations

| Shortcut | Action |
|----------|--------|
| `N` | Create new node |
| `Cmd/Ctrl + Enter` | Add new child node |
| `Cmd/Ctrl + Click` | Add child to clicked node |
| `Opt/Alt + Cmd/Ctrl + Click` | Delete node |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y` | Redo |
| `Cmd/Ctrl + Delete/Backspace` | Delete selected nodes |
| `Cmd/Ctrl + A` | Select all visible items |

## Selection

| Shortcut | Action |
|----------|--------|
| `Click` | Select node |
| `Tab` | Select next visible node |
| `Shift + Tab` | Select previous visible node |
| `Space` | Open/close detail panel (fullscreen if no children) |
| `Shift + Space` | Open in detached window |
| `Enter` | Navigate into node (view subgraph) |
| `Shift + Enter` | Navigate to parent |
| `Shift + Click` | Range select (like Finder) |
| `Shift + Drag` | Lasso/box select (Graph view) |
| `Cmd/Ctrl + A` | Select all visible items |

## Graph View

| Shortcut | Action |
|----------|--------|
| `Option` (hold) | Enable link mode |
| `Option + Drag` | Create link between nodes |
| `Cmd/Ctrl + Click node` | Add child node |
| `Cmd/Ctrl + Click edge` | Insert node between connected nodes |
| `Opt/Alt + Cmd/Ctrl + Click edge` | Delete edge |
| `Shift + Drag` | Lasso select multiple nodes |
| `Scroll` | Zoom in/out |
| `Drag background` | Pan view |
| `Drag node` | Reposition (position saved) |

## Timeline View

| Shortcut | Action |
|----------|--------|
| `Ctrl + Scroll` | Zoom timeline |
| `Drag bar` | Move item dates |
| `Drag handles` | Adjust start/end dates |

## Editor

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Alt + Up` | Add cursor above |
| `Cmd/Ctrl + Alt + Down` | Add cursor below |
| `Ctrl + Enter` | Submit AI prompt |

## Table View (Spreadsheet)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + C` | Copy selection |
| `Cmd/Ctrl + V` | Paste |
| `Enter` | Edit cell |
| `Arrow keys` | Navigate cells |

## Drag Modifiers

| Shortcut | Action |
|----------|--------|
| `Shift + Drag` | Reorder only (disable nesting) |
| `Option + Drag` | Create link (Graph view) |

## Global

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + N` | Quick capture, from any application |

Quick capture is registered by the main process, so it fires while another app has focus. It is the one shortcut that cannot be discovered from inside the window. Enable it and change the combination in Settings > General; the value above is the default. The hotkey registers only once the database is unlocked.

## Discoverability

Every shortcut the app binds is listed in the in-app reference (`?`, or `Ctrl/Cmd + /`), which renders `src/utils/keyboardShortcuts.js`.

That list is a gate, not a convention: `hotkeysAreDocumented.test.js` reads the three places shortcuts are actually bound - the Electron menu accelerators, the global quick-capture accelerator, and the key comparisons in `useKeyboardShortcuts.js` - and fails if any of them is missing from the list. Adding a binding without explaining it breaks the build.

## See Also

- [Quickstart](../guides/quickstart.md)
- [Views Guide](../guides/views.md)
- [Drag and Drop](../guides/drag-drop.md)
- [Interactions](interactions.md)
