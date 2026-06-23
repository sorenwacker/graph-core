/**
 * Wrap an async function so overlapping calls cannot run concurrently.
 *
 * While a run is in progress, further calls do not start a second run; instead a
 * single trailing run is scheduled to execute once the current one finishes. This
 * guarantees at most one in-flight execution while still honouring the most recent
 * request, which is exactly what graph (re)initialisation needs: several reactive
 * watchers firing in the same tick must not each spin up a separate Cytoscape
 * instance and orphan the others.
 *
 * @param {() => Promise<unknown>} fn - The async function to serialise.
 * @returns {() => Promise<void>} A function that runs `fn` without overlap.
 */
export function createCoalescingRunner(fn) {
  let running = false
  let queued = false

  async function run() {
    if (running) {
      // A run is already in flight - remember that another was requested so we
      // re-run once with the latest state instead of starting in parallel.
      queued = true
      return
    }
    running = true
    try {
      await fn()
    } finally {
      running = false
      if (queued) {
        queued = false
        run()
      }
    }
  }

  return run
}
