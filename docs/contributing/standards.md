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

### Controls state their preconditions

An action that can fail must know before it is offered whether it can succeed, and say what is missing when it cannot. A control that is live in a state where its own write is rejected teaches users that the interface does not know its own state.

Three bugs in one week came from this single omission:

- The sensitivity toggle stayed active while the sensitive-notes session was locked. Marking a note sensitive encrypts it, so the write reached `session.encrypt()` in the main process and surfaced a raw `db:updateNode` failure.
- The same flag in the graph edit modal consulted the session not at all, so guarding one surface only moved the error.
- Two adjacent fields both read `Recovery password`; one unlocked notes for the session, the other decrypted the whole database.

What this requires of a control that depends on a precondition:

- Ask the state, not a proxy for it. `isLockedNote(notes)` answers whether *this note* is ciphertext, which is not the same question as whether the session is unlocked.
- Offer the way forward rather than only refusing. The sensitivity toggle asks for the recovery password in place and applies the change once the session unlocks.
- Name the action on any control whose neighbour takes the same input. A shared placeholder is not a label.
- Cover the blocked state with a test that mounts the control and asserts it does not act.

`src/__tests__/preconditionGuards.test.js` gates the class of control this was found in: a component that toggles `notes_sensitive` must also consult the session state. It fails on a surface that offers the flag without a guard, which is exactly what the graph edit modal did.

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

### Test the Production Module

A test must import and exercise the module it claims to cover. Never re-implement production logic inside the test file and assert against the copy — such a test passes forever while the real code rots. Three test files were deleted for exactly this reason.

```javascript
// Wrong: asserts on a copy of the logic, not the logic
function buildPath(parent, id) { return parent ? `${parent}/${id}` : `${id}` }
expect(buildPath('1', 5)).toBe('1/5')

// Right: import what ships
import { createNodeOperations } from '../../electron/database/nodes.js'
```

The same rule applies to helpers: `src/__tests__/helpers/testDatabase.js` builds the **real** `Database` on a temp file rather than mirroring the schema. See [Development Guide](development.md#integration-tests).

!!! warning "vi.mock paths must resolve"
    `vi.mock('./useErrorHandler')` from a file in `src/__tests__/` points at `src/__tests__/useErrorHandler`, not the composable. A path that resolves to nothing mocks nothing — silently, with no error — and the test then runs against the real module. Check the relative path from the *test* file.

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
