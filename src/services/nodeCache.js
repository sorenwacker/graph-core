/**
 * LRU Cache with TTL for node data
 *
 * Provides an in-memory cache with:
 * - Least Recently Used (LRU) eviction when at capacity
 * - Time To Live (TTL) expiration for entries
 * - Prefix-based invalidation for related keys
 * - Statistics tracking for hit/miss rates
 */

/**
 * Creates a new node cache instance
 * @param {Object} options - Cache configuration
 * @param {number} options.maxSize - Maximum number of entries (default: 1000)
 * @param {number} options.ttlMs - Default TTL in milliseconds (default: 300000 = 5 min)
 * @param {Function} options.onEvict - Callback when entry is evicted (key, value)
 * @param {boolean} options.enabled - Whether cache is enabled (default: true)
 * @returns {Object} Cache instance with get, set, delete, clear, etc.
 */
export function createNodeCache(options = {}) {
  const { maxSize = 1000, ttlMs = 300000, onEvict = null, enabled = true } = options

  // Internal storage: Map preserves insertion order for LRU
  const cache = new Map()

  // Entry metadata: { value, expiresAt, accessOrder }
  const metadata = new Map()

  // Statistics
  let hits = 0
  let misses = 0

  // Monotonically increasing counter for LRU tracking
  // Using counter instead of Date.now() ensures proper ordering even with fake timers
  let accessCounter = 0

  /**
   * Check if an entry is expired
   */
  function isExpired(key) {
    const meta = metadata.get(key)
    if (!meta) return true
    return Date.now() > meta.expiresAt
  }

  /**
   * Remove an entry and call onEvict if provided
   */
  function removeEntry(key, triggerCallback = true) {
    const value = cache.get(key)
    cache.delete(key)
    metadata.delete(key)
    if (triggerCallback && onEvict && value !== undefined) {
      onEvict(key, value)
    }
  }

  /**
   * Evict least recently used entry
   */
  function evictLRU() {
    let oldestKey = null
    let oldestAccess = Infinity

    for (const [key, meta] of metadata.entries()) {
      if (meta.accessOrder < oldestAccess) {
        oldestAccess = meta.accessOrder
        oldestKey = key
      }
    }

    if (oldestKey !== null) {
      removeEntry(oldestKey, true)
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  function get(key) {
    if (!enabled) {
      misses++
      return undefined
    }

    if (!cache.has(key) || isExpired(key)) {
      if (cache.has(key)) {
        // Clean up expired entry
        removeEntry(key, false)
      }
      misses++
      return undefined
    }

    // Update access order for LRU
    const meta = metadata.get(key)
    meta.accessOrder = ++accessCounter

    hits++
    return cache.get(key)
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} customTtl - Optional custom TTL in ms
   */
  function set(key, value, customTtl = null) {
    if (!enabled) {
      return
    }

    // If key exists, remove it first (will be re-added)
    if (cache.has(key)) {
      removeEntry(key, false)
    }

    // Evict if at capacity
    if (cache.size >= maxSize) {
      evictLRU()
    }

    const now = Date.now()
    const entryTtl = customTtl !== null ? customTtl : ttlMs

    cache.set(key, value)
    metadata.set(key, {
      expiresAt: now + entryTtl,
      accessOrder: ++accessCounter,
    })
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  function has(key) {
    if (!enabled) {
      return false
    }

    if (!cache.has(key)) {
      return false
    }

    if (isExpired(key)) {
      removeEntry(key, false)
      return false
    }

    return true
  }

  /**
   * Delete a specific key
   * @param {string} key - Cache key
   */
  function del(key) {
    removeEntry(key, false)
  }

  /**
   * Clear all entries
   */
  function clear() {
    cache.clear()
    metadata.clear()
  }

  /**
   * Get current cache size
   * @returns {number}
   */
  function size() {
    return cache.size
  }

  /**
   * Invalidate all keys with matching prefix
   * @param {string} prefix - Key prefix to match
   * @returns {number} Number of entries invalidated
   */
  function invalidatePrefix(prefix) {
    let count = 0
    const keysToDelete = []

    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      removeEntry(key, false)
      count++
    }

    return count
  }

  /**
   * Get or set pattern: return cached value or call factory
   * @param {string} key - Cache key
   * @param {Function} factory - Async function to create value if not cached
   * @param {number} customTtl - Optional custom TTL
   * @returns {Promise<*>} Cached or newly created value
   */
  async function getOrSet(key, factory, customTtl = null) {
    const cached = get(key)
    if (cached !== undefined) {
      return cached
    }

    // Call factory and cache result
    const value = await factory()
    set(key, value, customTtl)
    return value
  }

  /**
   * Get cache statistics
   * @returns {Object} { hits, misses, hitRate }
   */
  function stats() {
    const total = hits + misses
    return {
      hits,
      misses,
      hitRate: total === 0 ? 0 : hits / total,
    }
  }

  /**
   * Reset statistics
   */
  function resetStats() {
    hits = 0
    misses = 0
  }

  return {
    get,
    set,
    has,
    delete: del,
    clear,
    size,
    invalidatePrefix,
    getOrSet,
    stats,
    resetStats,
  }
}
