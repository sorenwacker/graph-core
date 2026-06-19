# Settings

Access settings via the gear icon in the toolbar.

## Display Settings

### Theme

| Option | Description |
|--------|-------------|
| Light | Light color scheme |
| Dark | Dark color scheme |
| System | Follow system preference |

### View Options

| Setting | Description |
|---------|-------------|
| Sort Alphabetically | Sort nodes A-Z in list views |
| Hide Completed | Hide completed tasks and projects |
| Hide Sensitive | Mask notes containing sensitive keywords (password, secret, api_key, credential) and contact info. Notes explicitly flagged `notes_sensitive` are always masked regardless of this setting. |

### Hover Preview

Enable or disable tooltip previews when hovering over nodes.

## Graph Settings

Settings that affect the Graph view visualization.

| Setting | Description | Default |
|---------|-------------|---------|
| Detail Threshold | Number of nodes before abbreviation | 50 |
| Max Depth | Maximum depth of visible hierarchy | 3 |
| Root Max Depth | Depth when viewing multi-root graphs | 2 |
| Open Detail Fullscreen | Default detail panel behavior | Off |

### Graph Display Options

| Option | Description |
|--------|-------------|
| Show Type Borders | Display colored borders by node type |
| Darken Completed | Dim completed nodes visually |

### Physics Settings (Radial Layout)

The radial layout uses a physics simulation. Adjust these parameters via the Graph view settings panel:

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Node Repulsion | 5000 | 100-10000 | Force pushing nodes apart |
| Edge Length | 100 | 20-1000 | Ideal distance between connected nodes |
| Elasticity | 0.5 | 0.1-1.5 | Edge tension/spring stiffness |
| Gravity | 10000 | 0-50000 | Pull toward graph center |
| Iterations | 2500 | 1000-500000 | Simulation steps |

**Tuning tips:**

- Increase **Node Repulsion** for sparse layouts with more space between nodes
- Decrease **Edge Length** for tighter clustering of connected nodes
- Higher **Gravity** pulls nodes toward center; lower values allow spreading
- More **Iterations** produces smoother results but takes longer to compute

Settings are saved per-workspace with keys like `graph-radial-repulsion-{workspace}`.

### Node Position Storage

Node positions in Graph view are automatically persisted:

- **Storage:** Browser localStorage
- **Key format:** `graph-positions-{workspace}-{parentId}`
- **Scope:** Per-workspace and per-parent context
- **Validation:** Positions outside bounds (50000) are filtered

Positions are saved after:
- Dragging nodes
- Layout operations (relax, reset)
- Graph updates

## AI Settings

Configure AI providers for note enhancement.

### Ollama (Local)

| Setting | Description | Default |
|---------|-------------|---------|
| Endpoint | Ollama server URL | `http://localhost:11434` |
| Model | Installed Ollama model | `llama3.2` |
| Context Size | Token limit for context | 32768 |

### OpenAI-Compatible

| Setting | Description | Default |
|---------|-------------|---------|
| Endpoint | API URL | `https://api.openai.com/v1` |
| API Key | Authentication key | Required |
| Model | Model name | `gpt-4o-mini` |
| Verify SSL | Validate SSL certificates | On |

### Custom Prompts

Create custom AI prompts:

1. Navigate to Settings > AI
2. Scroll to Custom Prompts
3. Click "Add Prompt"
4. Enter name and template
5. Use `{{selection}}` as placeholder for selected text

For detailed AI usage, see [AI Notes](../guides/ai-notes.md).

## Database Management

Available in the desktop (Electron) application.

### Snapshots

Create point-in-time backups of your database.

| Action | Description |
|--------|-------------|
| Create Snapshot | Save current database state |
| List Snapshots | Browse available backups |
| Restore Snapshot | Recover from a backup |

**Snapshot Location:**

Snapshots are stored alongside the main database:

- **macOS**: `~/Library/Application Support/graph-core/snapshots/`
- **Windows**: `%APPDATA%/graph-core/snapshots/`
- **Linux**: `~/.config/graph-core/snapshots/`

### Database Operations

| Action | Description |
|--------|-------------|
| Reload Database | Refresh from disk |
| Repair Workspaces | Fix workspace assignment issues |
| Empty Trash | Permanently delete trashed items |

### Lost and Found

Nodes with deleted parents become orphaned. Use Lost and Found to:

- View orphaned nodes
- Reparent them to root
- Delete permanently

## Keyboard Shortcuts

For the complete keyboard shortcut reference, see [Keyboard Shortcuts](keyboard-shortcuts.md).

## See Also

- [AI Notes](../guides/ai-notes.md)
- [Workspaces](../guides/workspaces.md)
- [Installation](../getting-started/installation.md)
