# Development Standards

Quality standards for Graph Core development, adapted from CropXR conventions.

## Toolchain

| Tool | Purpose |
|------|---------|
| **npm** | Package management and script execution |
| **Prettier** | Code formatter |
| **ESLint** | Linter for JavaScript/Vue |
| **TypeScript** | Static type checking (strict mode) |
| **Husky** | Git hooks for automated checks |
| **lint-staged** | Run checks on staged files only |
| **Vitest** | Testing framework |

## Commands

### Setup

```bash
npm install
```

Husky hooks are installed automatically via the `prepare` script.

### Daily Workflow

```bash
npm run lint:fix                    # Lint with auto-fix
npm run format                      # Format code
npm run type-check                  # Type check TypeScript/Vue
npm test                            # Run tests (watch mode)
npm run test:run                    # Run tests once
npm run test:coverage               # Run tests with coverage
```

### Pre-commit Checks

The pre-commit hook runs automatically via lint-staged:

- ESLint with auto-fix
- Prettier formatting

To run all checks manually:

```bash
npm run lint && npm run format:check && npm run type-check && npm run test:run
```

## Code Style Requirements

- **Line length**: 120 characters (Prettier)
- **Quote style**: Single quotes
- **Indent style**: 2 spaces
- **Semicolons**: None
- **Trailing commas**: ES5-compatible positions

### Function Constraints

| Metric | Limit | Enforcement |
|--------|-------|-------------|
| Max parameters | 5 | Code review |
| Max function length | 50 lines | Code review |
| Max file length | 500 lines | Code review |
| Cyclomatic complexity | 10 | Code review |

### Vue Component Constraints

| Metric | Limit |
|--------|-------|
| Max component lines | 300 |
| Max template depth | 5 levels |
| Max props | 10 |

## TypeScript Configuration

TypeScript runs in strict mode. Key settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true
  }
}
```

Type checking is performed via `vue-tsc`:

```bash
npm run type-check
```

## Testing Requirements

- Use **Vitest** for all tests
- Tests go in `src/__tests__/` directory
- Test files use `.test.js` suffix
- Coverage thresholds are configured in `vitest.config.js`
- Use `vi.mock()` for mocking

### Test Structure

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('featureName', () => {
  beforeEach(() => {
    // Setup
  })

  it('should describe expected behavior', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`, `build`, `style`, `revert`

**Rules**:

- Short, one line, no emojis
- Use YYMMDD date format where dates appear
- Reference issues when applicable

**Examples**:

```
feat(canvas): add zoom controls
fix(db): handle null values in export
refactor(commands): extract base command class
docs(api): document node operations
test(stores): add graph store tests
```

## Inline Suppressions

Always include rule code and reason:

```javascript
// eslint-disable-next-line no-console -- debug logging for development
console.log(debugInfo)

// @ts-ignore -- external library missing types
const result = untypedLibrary.call()
```

Never use bare `// eslint-disable` or `// @ts-ignore`.

## Code Organization

### Directory Structure

```
src/
├── components/      # Vue components
├── composables/     # Vue composition functions (use* prefix)
├── stores/          # Pinia state stores
├── commands/        # Command pattern implementations
├── services/        # External service integrations
├── utils/           # Pure utility functions
└── __tests__/       # Test files
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `NodeEditor.vue` |
| Composables | camelCase with `use` prefix | `useNodeOperations.js` |
| Stores | camelCase with `Store` suffix | `graphStore.js` |
| Commands | PascalCase with `Command` suffix | `AddNodeCommand.js` |
| Utils | camelCase | `formatDate.js` |
| Tests | Same as source with `.test` | `graphStore.test.js` |

### Import Order

1. External packages (vue, pinia, etc.)
2. Internal absolute imports
3. Relative imports

```javascript
import { ref, computed } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { formatNode } from './utils'
```

## Dead Code

- Remove unused imports, variables, and functions
- Do not leave commented-out code
- Delete unused files

## Documentation

- Use JSDoc for complex functions
- Document non-obvious behavior
- Keep comments current with code changes

```javascript
/**
 * Calculates the shortest path between two nodes.
 *
 * @param {string} sourceId - Starting node ID
 * @param {string} targetId - Destination node ID
 * @returns {string[]} Array of node IDs forming the path
 */
function findPath(sourceId, targetId) {
  // ...
}
```

## See Also

- [Development Guide](development.md)
- [Architecture Overview](../architecture/overview.md)
