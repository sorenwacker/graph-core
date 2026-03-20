# Caching Architecture

Graph Core implements an in-memory caching layer to optimize performance for tree operations.

## Problem Statement

The sidebar tree loading exhibits N+1 query behavior:

```javascript
// Current implementation calls getDescendants for each root
const rootsWithChildren = await Promise.all(
  filteredRoots.map(async (root) => {
    const descendants = await api.getDescendants(root.id)  // N queries
    return { ...root, children: buildChildTree(descendants, root.id) }
  })
)
```

With 10 root nodes, this results in 11 database queries (1 for roots + 10 for descendants).

## Solution: Node Cache

### Cache Structure

The `nodeCache` service provides an LRU (Least Recently Used) cache with TTL (Time To Live):

```javascript
import { nodeCache } from '@/services/nodeCache'

// Cache configuration
const cache = createNodeCache({
  maxSize: 1000,      // Maximum entries
  ttlMs: 5 * 60000,   // 5 minutes TTL
  onEvict: (key) => console.log(`Evicted: ${key}`)
})
```

### API

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve cached value, returns `undefined` if expired/missing |
| `set(key, value, ttl?)` | Store value with optional custom TTL |
| `has(key)` | Check if key exists and is not expired |
| `delete(key)` | Remove specific key |
| `clear()` | Clear entire cache |
| `invalidatePrefix(prefix)` | Remove all keys matching prefix |

### Cache Keys

Cache keys follow a consistent naming convention:

| Pattern | Example | Description |
|---------|---------|-------------|
| `node:{id}` | `node:123` | Single node data |
| `children:{parentId}` | `children:123` | Children of a node |
| `descendants:{rootId}` | `descendants:123` | All descendants of a node |
| `roots:{workspaceId}` | `roots:work` | Root nodes for workspace |

### Batch Loading

The `getDescendantsBatch` method reduces N+1 queries to a single query:

```javascript
// Before: N queries
for (const rootId of rootIds) {
  descendants[rootId] = await db.getDescendants(rootId)
}

// After: 1 query
const allDescendants = await db.getDescendantsBatch(rootIds)
```

Implementation uses path-based filtering:

```sql
SELECT * FROM nodes
WHERE deleted_at IS NULL
  AND (
    path LIKE '123/%' OR path = '123'
    OR path LIKE '456/%' OR path = '456'
    -- ... for each root ID
  )
ORDER BY depth, sort_order
```

## Cache Invalidation

### Write Operations

Cache is invalidated on write operations:

| Operation | Invalidation |
|-----------|-------------|
| Create node | `children:{parentId}`, `descendants:{rootId}` |
| Update node | `node:{id}`, parent caches if moved |
| Delete node | `node:{id}`, `children:{parentId}`, descendant caches |
| Move node | Old parent caches, new parent caches |

### Manual Invalidation

```javascript
// Invalidate specific node
nodeCache.delete(`node:${nodeId}`)

// Invalidate all descendants caches
nodeCache.invalidatePrefix('descendants:')

// Clear everything
nodeCache.clear()
```

## Integration Points

### useDataLoading

The composable uses caching for sidebar loading:

```javascript
async function loadSidebarTree() {
  const cacheKey = `sidebar:${currentWorkspace.value}`

  // Check cache first
  const cached = nodeCache.get(cacheKey)
  if (cached) {
    sidebarTree.value = cached
    return
  }

  // Fetch and cache
  const roots = await api.getRoots(currentWorkspace.value)
  const descendants = await api.getDescendantsBatch(roots.map(r => r.id))
  const tree = buildTreeFromBatch(roots, descendants)

  nodeCache.set(cacheKey, tree)
  sidebarTree.value = tree
}
```

### Write Operations

Node operations invalidate relevant caches:

```javascript
async function createNode(data) {
  const node = await api.createNode(data)

  // Invalidate parent's children cache
  if (data.parent_id) {
    nodeCache.delete(`children:${data.parent_id}`)
  }

  // Invalidate workspace sidebar cache
  nodeCache.delete(`sidebar:${data.workspace_id}`)

  return node
}
```

## Performance Characteristics

| Metric | Before | After |
|--------|--------|-------|
| Sidebar load (10 roots) | 11 queries | 2 queries |
| Repeated sidebar load | 11 queries | 0 queries (cached) |
| Memory overhead | - | ~1MB for 1000 nodes |

## Configuration

Cache settings can be adjusted via environment or settings:

```javascript
// Default configuration
{
  enabled: true,
  maxSize: 1000,
  ttlMs: 300000,  // 5 minutes
  debug: false
}
```

## Debugging

Enable cache debugging:

```javascript
nodeCache.setDebug(true)
// Logs: [Cache] GET node:123 -> HIT
// Logs: [Cache] SET children:456 (expires in 300000ms)
```

## See Also

- [Database Schema](database.md)
- [Architecture Overview](overview.md)
