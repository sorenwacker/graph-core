# Graph Core

A unified node-based graph data structure with tree hierarchy. Vue 3 frontend with FastAPI backend.

## Prerequisites

- Python 3.13+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Installation

```bash
# Install all dependencies (Python + Node.js)
make install
```

Or manually:

```bash
# Python dependencies
uv sync

# Frontend dependencies
cd frontend && npm install
```

## Development

Start both backend and frontend servers:

```bash
make dev
```

This runs:
- Backend (FastAPI): http://127.0.0.1:9742
- Frontend (Vite): http://localhost:9741

The frontend proxies API requests to the backend via `/api`.

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start backend and frontend concurrently |
| `make backend` | Start only the FastAPI backend |
| `make frontend` | Start only the Vite frontend |
| `make install` | Install all dependencies |
| `make test` | Run pytest tests |
| `make build` | Build frontend for production |
| `make stop` | Stop all running dev servers |
| `make clean` | Remove build artifacts and caches |
| `make reset-db` | Delete the SQLite database (destructive) |

## Project Structure

```
graph-core/
├── src/graph_core/       # Python backend
│   ├── api.py            # FastAPI routes
│   ├── db.py             # SQLite database layer
│   └── cli.py            # Command line interface
├── frontend/             # Vue 3 frontend
│   ├── src/
│   │   ├── App.vue       # Main application
│   │   ├── components/   # Vue components
│   │   └── services/     # API client
│   └── vite.config.js    # Vite configuration
├── tests/                # Pytest tests
├── Makefile              # Development commands
└── pyproject.toml        # Python project config
```

## Architecture

The application uses a unified node-based data model where all entities (projects, tasks, notes, folders) are stored in a single `nodes` table with:

- Tree hierarchy via `parent_id`
- Materialized path for efficient subtree queries
- Cross-references through `node_links` table
- Person associations via `node_persons` table

Views include:
- Graph view (Cytoscape.js) with drag-drop node manipulation
- Table view with nested hierarchy
- Timeline view for date-based visualization
