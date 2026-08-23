# Graph Core

[![CI](https://github.com/sorenwacker/graph-core/actions/workflows/ci.yml/badge.svg)](https://github.com/sorenwacker/graph-core/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://sorenwacker.github.io/graph-core/)
![Node](https://img.shields.io/badge/node-22%2B-green)
![Electron](https://img.shields.io/badge/electron-41-blue)
![Vue](https://img.shields.io/badge/vue-3-brightgreen)

A hierarchical node management application built with Vue 3, Vite, and Electron. Organize tasks, notes, and information in a tree structure with multiple visualization modes.

## Documentation

Full documentation is published at **<https://sorenwacker.github.io/graph-core/>**.

![Graph Core cards view with the Demo workspace](docs/assets/screenshots/view-cards.png)

| Section | Contents |
|---------|----------|
| [Installation](https://sorenwacker.github.io/graph-core/getting-started/installation/) | Prerequisites and setup |
| [Quickstart](https://sorenwacker.github.io/graph-core/guides/quickstart/) | First steps in the app |
| [Views](https://sorenwacker.github.io/graph-core/guides/views/) | Graph, Cards, Table, Tasks, Timeline, People, Trash |
| [Keyboard Shortcuts](https://sorenwacker.github.io/graph-core/reference/keyboard-shortcuts/) | Complete shortcut reference |
| [Architecture](https://sorenwacker.github.io/graph-core/architecture/overview/) | System design and data model |
| [Contributing](https://sorenwacker.github.io/graph-core/contributing/development/) | Developer setup, testing, releases |

The sources live in [`docs/`](docs/) and are built with [Zensical](https://zensical.org/); run `make docs` to serve them locally.

## Features

- **Multiple Views**: Graph, Cards, Table, Tasks, Timeline, People, and Trash
- **Node Types**: Tasks, notes, topics, events, contacts, and more with distinct colors
- **Hierarchical Organization**: Nest nodes within nodes for structured data
- **Detachable Windows**: Open nodes in separate windows for focused editing
- **Workspaces**: Organize nodes into separate workspaces
- **Search**: Spotlight-style search (Cmd+K) for quick navigation
- **Favorites & Recents**: Quick access to frequently used nodes
- **Keyboard Shortcuts**: Efficient navigation and editing
- **AI Notes**: Local LLM integration via Ollama for improving, summarizing, and transforming notes

## AI Notes

The app supports AI-powered note improvements via two providers:

### Ollama (Local)

1. Install Ollama: https://ollama.ai/download
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama: `ollama serve`
4. In Settings, select "Ollama" as provider and test the connection

**Settings:**
- **Endpoint**: Ollama server URL (default: `http://localhost:11434`)
- **Model**: Any Ollama model (default: `llama3.2`)
- **Context Size**: Token limit for processing (4K-128K, default: 32K)

### OpenAI-compatible APIs

Use OpenAI, Azure OpenAI, or any compatible endpoint.

1. In Settings, select "OpenAI-compatible" as provider
2. Enter your API endpoint and API key
3. Select a model and test the connection

**Settings:**
- **Endpoint**: API URL (default: `https://api.openai.com/v1`)
- **API Key**: Your API key (required)
- **Model**: Model name (default: `gpt-4o-mini`)

### Features

- **Preset Actions**: Improve, Summarize, Expand, Fix Grammar, Simplify, Bullet Points, Action Items, Continue
- **Custom Prompts**: Create your own prompts in Settings
- **Preview & Diff**: Review changes before applying
- **Undo Support**: All AI changes can be undone

## Development

### Prerequisites

- Node.js 22+
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

### Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start Electron app in development mode |
| `make install` | Install npm dependencies |
| `make build` | Build Electron app for production |
| `make stop` | Stop running dev servers (kills Electron and Vite processes) |
| `make clean` | Remove build artifacts (dist, dist-electron, .vite cache) |
| `make reset-db` | Delete the SQLite database (with 3s confirmation delay) |

## Tech Stack

- **Frontend**: Vue 3 with Composition API
- **Build Tool**: Vite
- **Desktop**: Electron
- **Database**: SQLite (via sql.js)
- **Testing**: Vitest + Vue Test Utils
- **Visualization**: Cytoscape.js for graph view

## Build Notes

### electron-builder compatibility (2026-01-18)

electron-builder >= 26.x has a bug with the `tar` module ESM/CommonJS import on Node.js 20+:

```
SyntaxError: The requested module 'tar' does not provide an export named 'default'
```

Fix: Pin to older versions in package.json:
- `electron-builder`: 25.1.8
- `@electron/rebuild`: 3.6.2

