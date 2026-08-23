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
└── docs/                # Documentation (Zensical)
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

Documentation is built with [Zensical](https://zensical.org/), the successor to Material for MkDocs.

### Serving Docs Locally

```bash
make docs
```

The target runs `uvx zensical serve`, so [uv](https://docs.astral.sh/uv/) resolves the tool into a cached environment - there is no virtualenv to create or keep in sync, and no Python setup beyond installing uv itself. This is a Node project with no `pyproject.toml`, so the docs tool is deliberately not declared as a Python dependency. To check for broken links and nav problems before pushing:

```bash
make docs-build
```

### Writing Docs

- Place guides in `docs/guides/`
- Place reference docs in `docs/reference/`
- Add the page to `nav` in `zensical.toml` - every file under `docs/` is published, so a page missing from the nav is live but unreachable
- Keep internal engineering documents outside `docs/` entirely. Zensical ignores MkDocs' `exclude_docs` key without warning, so an exclusion list is not a reliable way to hold a page back; `CODEBASE-REVIEW.md` sits at the repository root for this reason
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

## Dependencies

Dependabot opens PRs weekly, with minor and patch updates grouped into one PR. Merging is automated only for the safe subset:

- `.github/workflows/dependabot-automerge.yml` merges Dependabot PRs whose update type is semver-patch or semver-minor. The workflow polls the CI `test` check by name and refuses to merge unless it succeeded, so red CI blocks the merge even if `main` carries no required-checks protection; it polls that one named check rather than watching all checks because the workflow is itself a check on the PR and would otherwise wait on itself. The merge uses GitHub auto-merge (squash), so if required-checks protection exists as well, GitHub enforces it a second time.
- Major updates are never merged automatically. CI here is weak evidence for majors: the AG Grid tests mock the grid and CI does not package the Electron app, so a green check on an Electron or AG Grid major proves little. They wait for a person.
- Branch protection requiring the `test` check is recommended on `main` as a second, platform-enforced layer (no reviews, admins exempt so direct pushes keep working), but the workflow does not depend on it.
- The auto-merge is performed with the workflow's `GITHUB_TOKEN`, and pushes made with that token do not trigger other workflows: the resulting merge commit on `main` gets no CI run of its own. The PR itself was gated on the same `test` check, which is why this is acceptable.

`src/__tests__/dependabotAutomerge.test.js` gates the workflow: it fails if the merge step stops requiring the patch/minor guard, drops `--auto`, or loses the Dependabot actor check.

## Releases

Releases are tag-driven: pushing a semver tag runs `.github/workflows/release.yml`, pushing to `main` does not. A full release requires an existing pre-release for the same base version, so the order is `v1.12.0-rc.1` first, then `v1.12.0`.

The workflow creates the GitHub release as a draft, builds artifacts on each platform and uploads them to that draft, then flips it to published only once the artifacts are in place.

### Release creation is idempotent

The step that creates the release reuses an existing release for the tag rather than creating a new one. This matters because a draft release is not bound to its tag: `gh release create` will happily create a *second* draft for a tag that already has a release, so a re-run or a retried job silently produces duplicates. Four such duplicate pairs accumulated on the repository before this was enforced (v1.10.1, v1.10.1-rc.1, v1.10.3, v1.10.3-beta.1), each an empty draft shadowing the real published release.

`src/__tests__/releaseWorkflow.test.js` executes the step's script against a stubbed `gh` and fails if a second release is created when one already exists.

### Release notes

Notes combine a fixed Installation section with GitHub's `--generate-notes` output. The generated "What's Changed" list is derived from merged pull requests, so work committed directly to `main` produces an empty changelog. When a release covers direct commits, write its notes from `CHANGELOG.md` instead.

The generated "Full Changelog" link compares against the previous tag. Deleting a tag after release, as happened with the pulled v1.11.1, leaves that link pointing at a tag that no longer exists and it 404s; repoint it at the last surviving tag.

## See Also

- [Architecture Overview](../architecture/overview.md)
- [Installation](../getting-started/installation.md)
