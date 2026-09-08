# Installation

## Download the app

Builds for macOS, Windows and Linux are at <https://sorenwacker.net/nodus/>.

The app is not code-signed, so the first launch needs one extra step:

| Platform | First launch |
|----------|--------------|
| macOS | Run `xattr -cr "/Applications/Graph Core.app"` in Terminal, then open the app |
| Windows | Click **More info**, then **Run anyway**, if SmartScreen warns |
| Linux | `chmod +x Graph-Core-*.AppImage` |

That is all most people need. The rest of this page is for building the app from source, which is only necessary to develop it.

## Prerequisites

- Node.js 22+
- npm
- Git

## Clone and Install

```bash
# Clone the repository
git clone https://github.com/sorenwacker/graph-core.git
cd graph-core

# Install dependencies
npm install
```

## Running the Application

### Development Mode

```bash
# The desktop app
npm run electron:dev
```

`npm run dev` starts the Vite renderer alone. It is a build step that `electron:dev` runs for you, not a way to use the app: outside Electron the renderer talks to an HTTP API at `/api`, and no server in this repository serves it, so every request fails.

### Production Build

```bash
# Build for current platform
npm run electron:build

# Platform-specific builds
npm run electron:build:mac    # macOS
npm run electron:build:win    # Windows
npm run electron:build:linux  # Linux
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start Electron app in development mode |
| `make install` | Install npm dependencies |
| `make build` | Build Electron app for production |
| `make stop` | Stop running dev servers |
| `make clean` | Remove build artifacts |
| `make reset-db` | Delete the SQLite database |

## Database Location

The SQLite database is stored in the Electron user data directory:

- **macOS**: `~/Library/Application Support/graph-core/graph.db`
- **Windows**: `%APPDATA%/graph-core/graph.db`
- **Linux**: `~/.config/graph-core/graph.db`

## Troubleshooting

### Port Already in Use

If port 9743 is in use, Vite will automatically try the next available port.

### Database Reset

To start fresh with a clean database:

```bash
make reset-db
```

!!! warning
    This permanently deletes all data. There is a 3-second confirmation delay.

## See Also

- [Quickstart Guide](../guides/quickstart.md)
- [Development Setup](../contributing/development.md)
