# Graph Core

A hierarchical node management application built with Vue 3, Vite, and Electron. Organize tasks, notes, and information in a tree structure with multiple visualization modes.

## Features

- **Multiple Views**: Tree, Cards, Graph, Table, Timeline, Calendar, Tasks, and Persons views
- **Node Types**: Tasks, notes, topics, events, contacts, and more with distinct colors
- **Hierarchical Organization**: Nest nodes within nodes for structured data
- **Detachable Windows**: Open nodes in separate windows for focused editing
- **Workspaces**: Organize nodes into separate workspaces
- **Search**: Spotlight-style search (Cmd+K) for quick navigation
- **Favorites & Recents**: Quick access to frequently used nodes
- **Keyboard Shortcuts**: Efficient navigation and editing
- **AI Notes**: Local LLM integration via Ollama for improving, summarizing, and transforming notes

## Quick Install

```bash
# Clone repository
git clone https://github.com/sorenwacker/graph-core.git
cd graph-core

# Install dependencies
npm install

# Run in development mode
npm run electron:dev
```

## Quick Start

1. Launch the app with `npm run electron:dev`
2. Create your first node using the input bar at the top
3. Double-click a node to navigate into it
4. Use Cmd+K to open spotlight search
5. Switch between views using the toolbar

## Documentation

**Getting Started**

- [Installation](getting-started/installation.md)
- [Quickstart](guides/quickstart.md)

**Guides**

- [Views](guides/views.md)
- [AI Notes](guides/ai-notes.md)
- [Workspaces](guides/workspaces.md)

**Reference**

- [Keyboard Shortcuts](reference/keyboard-shortcuts.md)
- [Node Types](reference/node-types.md)
- [Interactions](reference/interactions.md)

**Architecture**

- [Overview](architecture/overview.md)

**Contributing**

- [Development](contributing/development.md)
