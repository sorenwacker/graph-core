import { describe, it, expect, vi } from 'vitest'
import { createCoalescingRunner } from '../utils/asyncRunner.js'

/**
 * Create a manually-resolvable deferred promise for controlling async timing.
 */
function deferred() {
  let resolve
  const promise = new Promise(r => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createCoalescingRunner', () => {
  it('runs the function when called once', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const run = createCoalescingRunner(fn)

    await run()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not run concurrently - overlapping calls collapse to one trailing run', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const calls = [d1, d2]
    let i = 0
    const fn = vi.fn().mockImplementation(() => calls[i++]?.promise ?? Promise.resolve())
    const run = createCoalescingRunner(fn)

    run() // starts run #1 (awaiting d1)
    run() // queued (does not start)
    run() // still just queued, not stacked
    expect(fn).toHaveBeenCalledTimes(1)

    d1.resolve() // finish run #1 -> single trailing run #2 starts
    await Promise.resolve()
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(2)

    d2.resolve()
    await Promise.resolve()
    // No further runs were queued after #2 started.
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears its in-flight state after rejection so later calls still run', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const run = createCoalescingRunner(fn)

    await expect(run()).rejects.toThrow('boom')
    await run()

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('allows sequential (non-overlapping) calls to each run', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const run = createCoalescingRunner(fn)

    await run()
    await run()
    await run()

    expect(fn).toHaveBeenCalledTimes(3)
  })
})
