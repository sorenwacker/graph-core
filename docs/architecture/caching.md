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
import { createNodeCache } from '@/services/nodeCache'

// Cache configuration
const cache = createNodeCache({
  maxSize: 1000,      // Maximum entries
  ttlMs: 5 * 60000,   // 5 minutes TTL
  onEvict: (key) => console.log(`Evicted: ${key}`)
})
```

Options: `maxSize` (default 1000), `ttlMs` (default 300000), `onEvict`, `enabled`. `createNodeCache` is the only export — each caller owns its instance, there is no app-wide singleton.

### API

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve cached value, returns `undefined` if expired/missing |
| `set(key, value, ttl?)` | Store value with optional custom TTL |
| `has(key)` | Check if key exists and is not expired |
| `getOrSet(key, factory, ttl?)` | Return the cached value or await `factory()` and cache it |
| `delete(key)` | Remove specific key |
| `clear()` | Clear entire cache |
| `size()` | Number of live entries |
| `invalidatePrefix(prefix)` | Remove all keys matching prefix |
| `stats()` | `{ hits, misses, hitRate }` |
| `resetStats()` | Reset hit/miss counters |

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

Entries expire after their TTL and are evicted LRU-style at capacity. Beyond that, invalidation is explicit — the owner of a cache instance decides what a write invalidates.

The sidebar cache invalidates by prefix, because one workspace's tree is one entry:

```javascript
sidebarCache.invalidatePrefix('sidebar:')
```

`loadSidebarTree(true)` bypasses the cache for a single load without dropping the other workspaces' entries.

## Integration Points

### useDataLoading

`useDataLoading` owns the app's one cache instance, `sidebarCache` (`maxSize: 100`, `ttlMs: 60000`), keyed `sidebar:{workspaceId}`:

```javascript
async function loadSidebarTree(skipCache = false) {
  const cacheKey = `sidebar:${currentWorkspace.value}`

  if (!skipCache) {
    const cached = sidebarCache.get(cacheKey)
    if (cached) {
      sidebarTree.value = cached
      return
    }
  }

  const roots = await api.getRoots(currentWorkspace.value)
  const descendants = await api.getDescendantsBatch(roots.map(r => r.id))
  const tree = buildTreeFromBatch(roots, descendants)

  sidebarCache.set(cacheKey, tree)
  sidebarTree.value = tree
}
```

Operations that change the tree call `invalidateSidebarCache()` before reloading.

## Performance Characteristics

| Metric | Before | After |
|--------|--------|-------|
| Sidebar load (10 roots) | 11 queries | 2 queries |
| Repeated sidebar load | 11 queries | 0 queries (cached) |
| Memory overhead | - | ~1MB for 1000 nodes |

## See Also

- [Database Schema](database.md)
- [Architecture Overview](overview.md)
