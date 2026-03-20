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
│   └── utils/           # Utility functions
├── electron/            # Electron main process
├── docs/                # Documentation (MkDocs)
└── tests/               # Test files (co-located)
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

Database integration tests use a shared test helper:

```javascript
import { createTestDatabase, cleanup } from './helpers/testDatabase.js'

describe('database operations', () => {
  let db

  beforeEach(async () => {
    db = await createTestDatabase()
  })

  afterEach(async () => {
    await cleanup(db)
  })
})
```

## Documentation

Documentation uses MkDocs with Material theme.

### Serving Docs Locally

```bash
# Install mkdocs
pip install mkdocs-material mkdocs-mermaid2-plugin

# Serve documentation
mkdocs serve
```

### Writing Docs

- Place guides in `docs/guides/`
- Place reference docs in `docs/reference/`
- Use admonitions sparingly
- Include code examples

## Commit Guidelines

- Use imperative mood ("Add feature" not "Added feature")
- Keep first line under 72 characters
- Reference issues when applicable

```
Add timeline zoom controls

- Implement Ctrl+scroll zoom
- Add zoom level indicator
- Store zoom preference in settings

Fixes #123
```

## Pull Request Process

1. Create feature branch from `main`
2. Write tests for new functionality
3. Update documentation if needed
4. Ensure all tests pass
5. Submit PR with clear description

## See Also

- [Architecture Overview](../architecture/overview.md)
- [Installation](../getting-started/installation.md)
