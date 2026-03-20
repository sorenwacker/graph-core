import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createNodeCache } from '../services/nodeCache.js'

describe('nodeCache', () => {
  let cache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = createNodeCache({ maxSize: 5, ttlMs: 1000 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', { id: 1, name: 'test' })

      const result = cache.get('key1')

      expect(result).toEqual({ id: 1, name: 'test' })
    })

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should check key existence with has()', () => {
      cache.set('key1', 'value')

      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
    })

    it('should delete specific keys', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.delete('key1')

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
    })

    it('should clear all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.clear()

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(false)
    })

    it('should return cache size', () => {
      expect(cache.size()).toBe(0)

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      expect(cache.size()).toBe(2)
    })
  })

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1')

      expect(cache.get('key1')).toBe('value1')

      vi.advanceTimersByTime(1001)

      expect(cache.get('key1')).toBeUndefined()
    })

    it('should support custom TTL per entry', () => {
      cache.set('short', 'value', 500)
      cache.set('long', 'value', 2000)

      vi.advanceTimersByTime(600)

      expect(cache.get('short')).toBeUndefined()
      expect(cache.get('long')).toBe('value')

      vi.advanceTimersByTime(1500)

      expect(cache.get('long')).toBeUndefined()
    })

    it('should report expired keys as not existing', () => {
      cache.set('key1', 'value')

      vi.advanceTimersByTime(1001)

      expect(cache.has('key1')).toBe(false)
    })

    it('should refresh TTL when value is updated', () => {
      cache.set('key1', 'value1')

      vi.advanceTimersByTime(800)
      cache.set('key1', 'value2')

      vi.advanceTimersByTime(800)

      expect(cache.get('key1')).toBe('value2')
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used when at capacity', () => {
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.set('d', 4)
      cache.set('e', 5)

      // Cache is now full (maxSize: 5)
      cache.set('f', 6)

      // 'a' should be evicted as it was least recently used
      expect(cache.has('a')).toBe(false)
      expect(cache.has('f')).toBe(true)
    })

    it('should update access time on get()', () => {
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)
      cache.set('d', 4)
      cache.set('e', 5)

      // Access 'a' to make it recently used
      cache.get('a')

      // Add new entry
      cache.set('f', 6)

      // 'b' should be evicted instead of 'a'
      expect(cache.has('a')).toBe(true)
      expect(cache.has('b')).toBe(false)
    })

    it('should call onEvict callback when entry is evicted', () => {
      const onEvict = vi.fn()
      cache = createNodeCache({ maxSize: 2, ttlMs: 1000, onEvict })

      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)

      expect(onEvict).toHaveBeenCalledWith('a', 1)
    })
  })

  describe('prefix invalidation', () => {
    it('should invalidate all keys with matching prefix', () => {
      cache.set('node:1', { id: 1 })
      cache.set('node:2', { id: 2 })
      cache.set('node:3', { id: 3 })
      cache.set('children:1', [])
      cache.set('children:2', [])

      cache.invalidatePrefix('node:')

      expect(cache.has('node:1')).toBe(false)
      expect(cache.has('node:2')).toBe(false)
      expect(cache.has('node:3')).toBe(false)
      expect(cache.has('children:1')).toBe(true)
      expect(cache.has('children:2')).toBe(true)
    })

    it('should return count of invalidated entries', () => {
      cache.set('node:1', { id: 1 })
      cache.set('node:2', { id: 2 })
      cache.set('other:1', { id: 1 })

      const count = cache.invalidatePrefix('node:')

      expect(count).toBe(2)
    })
  })

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached')
      const factory = vi.fn().mockResolvedValue('fresh')

      const result = await cache.getOrSet('key1', factory)

      expect(result).toBe('cached')
      expect(factory).not.toHaveBeenCalled()
    })

    it('should call factory and cache result if not exists', async () => {
      const factory = vi.fn().mockResolvedValue('fresh')

      const result = await cache.getOrSet('key1', factory)

      expect(result).toBe('fresh')
      expect(factory).toHaveBeenCalled()
      expect(cache.get('key1')).toBe('fresh')
    })

    it('should not cache if factory throws', async () => {
      const factory = vi.fn().mockRejectedValue(new Error('Failed'))

      await expect(cache.getOrSet('key1', factory)).rejects.toThrow('Failed')
      expect(cache.has('key1')).toBe(false)
    })
  })

  describe('statistics', () => {
    it('should track hit and miss counts', () => {
      cache.set('key1', 'value')

      cache.get('key1')  // hit
      cache.get('key1')  // hit
      cache.get('key2')  // miss
      cache.get('key3')  // miss

      const stats = cache.stats()

      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(2)
      expect(stats.hitRate).toBe(0.5)
    })

    it('should reset statistics', () => {
      cache.set('key1', 'value')
      cache.get('key1')
      cache.get('missing')

      cache.resetStats()
      const stats = cache.stats()

      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('disabled cache', () => {
    it('should bypass cache when disabled', () => {
      cache = createNodeCache({ maxSize: 5, ttlMs: 1000, enabled: false })

      cache.set('key1', 'value')

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.has('key1')).toBe(false)
    })

    it('should still execute factory in getOrSet when disabled', async () => {
      cache = createNodeCache({ maxSize: 5, ttlMs: 1000, enabled: false })
      const factory = vi.fn().mockResolvedValue('result')

      const result = await cache.getOrSet('key1', factory)

      expect(result).toBe('result')
      expect(factory).toHaveBeenCalled()
    })
  })
})
