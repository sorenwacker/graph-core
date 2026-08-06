# Settings

Access settings via the gear icon in the toolbar.

## Display Settings

Settings > General > Display.

### Theme

| Option | Description |
|--------|-------------|
| Light | Light color scheme |
| Dark | Dark color scheme |
| System | Follow system preference |

### Display Options

| Setting | Description | Default |
|---------|-------------|---------|
| Open detail fullscreen | Open the detail panel in fullscreen mode by default | Off |
| Hover preview | Show a preview tooltip when hovering over nodes | On |
| Inherit colors | Child nodes inherit colors from their parent | On |
| Show hint bar | Show keyboard shortcut hints at the bottom of the screen | On |

!!! note "Toolbar toggles"
    **Sort alphabetically** and **Hide completed** are toolbar buttons, not settings-panel entries. The Persons view has its own **Reveal / Hide** button for masking contact details, which starts in the masked state.

## Graph Settings

Settings that affect the Graph view visualization (Settings > General > Graph).

| Setting | Description | Range | Default |
|---------|-------------|-------|---------|
| Detail threshold | Show node details while the graph has at most this many nodes | 5-100 | 50 |
| Max depth | Levels of hierarchy to render (`0` = All) | 0-20 | 0 |
| Notes preview | Maximum characters of the notes preview on a node | 50-5000 | 200 |

Max depth is stored per workspace and in the database, so each workspace keeps its own depth and the value survives a reinstall.

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
| Context Size | Context window (4K-128K slider), sent to Ollama as `num_ctx` | 32768 |

### OpenAI-Compatible

| Setting | Description | Default |
|---------|-------------|---------|
| Endpoint | API URL | `https://api.openai.com/v1` |
| API Key | Authentication key | Required |
| Model | Model name | `gpt-4o-mini` |
| Skip SSL verification | Accept self-signed or untrusted certificates **on local endpoints only** | Off |

### Skip SSL Verification

The bypass applies only to local endpoints: `localhost`, `127.0.0.1`, `::1` (including the bracketed `[::1]` form) and any `*.local` host. Certificates for every other host are verified even while the setting is enabled — a remote endpoint with a bad certificate fails with:

```
SSL/TLS error: <reason>. "Skip SSL verification" only applies to local endpoints
(localhost, 127.0.0.1, ::1, *.local); certificates for remote hosts are always verified.
```

The setting applies to note improvement as well as research and agent runs when the OpenAI-compatible provider is selected.

!!! warning
    Disabling verification exposes data to interception. Only use it on trusted networks.

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

Snapshots are written next to the main database (`graph.db`) as `graph-backup-{timestamp}.db`:

- **macOS**: `~/Library/Application Support/graph-core/`
- **Windows**: `%APPDATA%/graph-core/`
- **Linux**: `~/.config/graph-core/`

A snapshot is also taken automatically before a destructive migration (`-pre-workspace-migration`, `-pre-tag-migration`) and before restoring another snapshot (`-pre-restore`).

### Database Operations

| Action | Description |
|--------|-------------|
| Reload Database | Refresh from disk |
| Import JSON / CSV | Import a file into the current workspace at root level |

Emptying the trash is done from the Trash view ("Empty Trash"), not from Settings.

### Lost and Found

A node is orphaned when its parent is missing or sitting in the trash. Deleting a node re-attaches its children to their grandparent, so this is rare in day-to-day use — it mostly shows up in databases from older versions. Use Lost and Found to:

- View orphaned nodes
- Reparent them to root (their path and depth are rebuilt, descendants included)
- Delete permanently

## About

Settings > About shows the app version and provides:

| Action | Description |
|--------|-------------|
| Show Welcome | Reopen the onboarding modal |
| Create Demo Workspace | Create the Demo workspace with sample data (shown when it does not exist) |
| Reset Demo Workspace | Delete and recreate the demo data (shown when it exists) |

See [Demo Workspace](../guides/demo-workspace.md).

## Keyboard Shortcuts

For the complete keyboard shortcut reference, see [Keyboard Shortcuts](keyboard-shortcuts.md).

## See Also

- [AI Notes](../guides/ai-notes.md)
- [Workspaces](../guides/workspaces.md)
- [Installation](../getting-started/installation.md)
