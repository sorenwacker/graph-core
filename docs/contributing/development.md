# Development Guide

Setup and guidelines for contributing to Graph Core.

## Prerequisites

- Node.js 20+
- npm
- Git

## Setup

```bash
# Clone repository
git clone https://github.com/sorenwacker/graph-core.git
cd graph-core

# Install dependencies
npm install

# Start development
npm run electron:dev
```

## Project Structure

```
graph-core/
├── src/                 # Vue application source
│   ├── components/      # Vue components
│   ├── composables/     # Vue composition functions
│   ├── stores/          # Pinia state stores
│   ├── commands/        # Command pattern implementations
│   ├── services/        # API services
│   ├── utils/           # Utility functions
│   └── __tests__/       # Vitest tests
├── electron/            # Electron main process
│   ├── database/        # SQLite (sql.js) operations
│   └── ipc/             # IPC handlers
└── docs/                # Documentation (MkDocs)
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/__tests__/useUndoRedo.test.js
```

### Linting

```bash
npm run lint
```

### Building

```bash
# Development build
npm run build

# Production Electron build
npm run electron:build
```

## Code Style

### Vue Components

- Use Composition API with `<script setup>`
- Extract reusable logic to composables
- Keep components focused and single-purpose
- Use TypeScript-style JSDoc for complex props

```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const emit = defineEmits(['select', 'update'])
</script>
```

### Composables

- Prefix with `use` (e.g., `useNodeOperations`)
- Return reactive refs and functions
- Accept configuration as object parameter

```javascript
export function useFeature(options = {}) {
  const state = ref(options.initial)

  function doSomething() {
    // implementation
  }

  return { state, doSomething }
}
```

### Commands

All state mutations use the Command pattern:

```javascript
import Command from './Command.js'

export default class MyCommand extends Command {
  constructor(store, params) {
    super()
    this.store = store
    this.params = params
  }

  async execute() {
    // Perform action
    // Store state for undo
  }

  async undo() {
    // Revert action
  }
}
```

## Testing Guidelines

### Unit Tests

- Co-locate tests in `src/__tests__/`
- Use Vitest for test runner
- Mock IPC calls with `vi.mock`

```javascript
import { describe, it, expect, vi } from 'vitest'

describe('featureName', () => {
  it('should do something', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

### Integration Tests

Database integration tests run against the real database. `createTestDatabase()` constructs the production `Database` (`electron/database/index.js`) on a throwaway temp file — same schema, same migrations, same operations — and adds a `close()` that also removes the file. Nothing under `electron/database/` needs the `electron` module, so it imports cleanly in Vitest.

```javascript
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'

describe('database operations', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => {
    db.close()
  })

  it('keeps descendant paths correct after a move', () => {
    const { root, children } = factory.tree()
    const other = factory.project({ title: 'Other' })

    db.moveNode(children[0].id, other.id)

    expect(db.getNode(children[0].id).path).toBe(`${other.id}`)
    expect(db.getDescendants(root.id)).not.toContainEqual(expect.objectContaining({ id: children[0].id }))
  })
})
```

`createNodeFactory(db)` provides `task()`, `project()`, `note()`, `person()`, `tree()` and `linked()` builders.

Because the helper is the production class, a regression in `electron/database/*` fails these tests. Do not add schema or path logic to the helper — that turns it back into a mirror that can silently drift from the code it is supposed to protect.

## Documentation

Documentation uses MkDocs with Material theme.

### Serving Docs Locally

```bash
make docs
```

The target creates `.venv/` with `mkdocs`, `mkdocs-material` and `pymdown-extensions` on first run, then serves the site. To check for broken links and nav problems before pushing:

```bash
.venv/bin/mkdocs build --strict
```

### Writing Docs

- Place guides in `docs/guides/`
- Place reference docs in `docs/reference/`
- Add the page to `nav` in `mkdocs.yml` — MkDocs publishes every file under `docs/`, so a page missing from the nav is live but unreachable
- Keep internal engineering documents out of the build with `exclude_docs`
- Mermaid diagrams use ` ```mermaid ` fences (rendered by `pymdownx.superfences`, no extra plugin)
- Use admonitions sparingly
- Include code examples

## Commit Guidelines

Commit messages are checked by commitlint (`@commitlint/config-conventional`) in a Husky hook:

- `type(scope): description` with a type from `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`, `build`, `style`, `revert`
- Header at most 72 characters, imperative mood, no emojis
- Reference issues when applicable

```
feat(timeline): add Ctrl+scroll zoom
```

See [Standards](standards.md#commit-conventions).

## Pull Request Process

1. Create feature branch from `main`
2. Write tests for new functionality
3. Update documentation if needed
4. Ensure all tests pass
5. Submit PR with clear description

## See Also

- [Architecture Overview](../architecture/overview.md)
- [Installation](../getting-started/installation.md)
