# Graph Core

A hierarchical node management application built with Vue 3, Vite, and Electron. Organize tasks, notes, and information in a tree structure with multiple visualization modes.

## Features

- **Multiple Views**: Switch between tree/table view, card view, and graph visualization
- **Node Types**: Tasks, notes, topics, events, contacts, and more with distinct colors
- **Hierarchical Organization**: Nest nodes within nodes for structured data
- **Detachable Windows**: Open nodes in separate windows for focused editing
- **Workspaces**: Organize nodes into separate workspaces
- **Search**: Spotlight-style search (Cmd+K) for quick navigation
- **Favorites & Recents**: Quick access to frequently used nodes
- **Keyboard Shortcuts**: Efficient navigation and editing

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

### Run Development Server

```bash
# Web only
npm run dev

# Electron app
npm run electron:dev
```

### Run Tests

```bash
npm run test        # Watch mode
npm run test:run    # Single run
```

### Build

```bash
# Web build
npm run build

# Electron app (macOS)
npm run electron:build
```

## Tech Stack

- **Frontend**: Vue 3 with Composition API
- **Build Tool**: Vite
- **Desktop**: Electron
- **Database**: SQLite (via better-sqlite3)
- **Testing**: Vitest + Vue Test Utils
- **Visualization**: D3.js for graph view

## Build Notes

### electron-builder compatibility (2026-01-18)

electron-builder >= 26.x has a bug with the `tar` module ESM/CommonJS import on Node.js 20+:

```
SyntaxError: The requested module 'tar' does not provide an export named 'default'
```

Fix: Pin to older versions in package.json:
- `electron-builder`: 25.1.8
- `@electron/rebuild`: 3.6.2

### Window drag region fix (2026-01-19)

In Electron with `titleBarStyle: 'hiddenInset'`, elements with `-webkit-app-region: drag` create native drag zones that don't respect CSS z-index. Fixed-position overlays (like the sidebar) cannot intercept clicks in these areas.

Solution: Use a `::before` pseudo-element with `z-index: -1` for drag regions, keeping interactive elements above.
