# Graph Core

A hierarchical node management application built with Vue 3, Vite, and Electron. Organize tasks, notes, and information in a tree structure with multiple visualization modes.

This documentation was generated with Claude Code.

## Features

- **Multiple Views**: Graph, Cards, Table, Tasks, Timeline, People, and Trash
- **Node Types**: Tasks, projects, notes, milestones, topics, events, persons, organizations, groups, components, and tags
- **Hierarchical Organization**: Nest nodes within nodes for structured data
- **Cross-Links**: Create relationships between nodes beyond the tree hierarchy
- **Detachable Windows**: Open nodes in separate windows for focused editing
- **Workspaces**: Organize nodes into separate workspaces (Work and Private by default, plus your own)
- **Search**: Spotlight-style search (Cmd+K) with type filtering and multiple modes
- **Favorites & Recents**: Quick access to frequently used nodes
- **Keyboard Shortcuts**: Efficient navigation and editing
- **AI Notes**: LLM integration via Ollama or OpenAI-compatible APIs
- **Import/Export**: Support for Markdown, JSON, and CSV formats
- **Undo/Redo**: Full operation history with Cmd+Z support
- **Database Snapshots**: Backup and restore your data

## Documentation

**Getting Started**

- [Installation](getting-started/installation.md) - Setup and prerequisites
- [Quickstart](guides/quickstart.md) - Get started in minutes

**Guides**

- [Views](guides/views.md) - All visualization modes explained
- [Detail Panel](guides/detail-panel.md) - Editing nodes, notes, tables, and metadata
- [Linking Nodes](guides/linking.md) - Relationships beyond the tree hierarchy
- [Drag and Drop](guides/drag-drop.md) - Reordering and reparenting
- [Search](guides/search.md) - Finding and navigating nodes
- [Workspaces](guides/workspaces.md) - Organizing by context
- [Demo Workspace](guides/demo-workspace.md) - Sample data to explore the app
- [AI Notes](guides/ai-notes.md) - LLM-powered note enhancement
- [Import and Export](guides/import-export.md) - Data portability

**Reference**

- [Node Types](reference/node-types.md) - All node types and their properties
- [Keyboard Shortcuts](reference/keyboard-shortcuts.md) - Complete shortcut reference
- [Interactions](reference/interactions.md) - Mouse and keyboard actions per view
- [Settings](reference/settings.md) - Configuration options
- [Accessibility](reference/accessibility.md) - Keyboard navigation and screen readers

**Architecture**

- [Overview](architecture/overview.md) - System design and components
- [Database](architecture/database.md) - Schema and persistence
- [Caching](architecture/caching.md) - Node cache behaviour
- [Encryption](architecture/encryption.md) - At-rest encryption design and limits

**Contributing**

- [Development](contributing/development.md) - Developer setup, testing, and releases
- [Standards](contributing/standards.md) - Code style and conventions
