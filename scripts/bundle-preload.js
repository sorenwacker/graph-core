const path = require('path')
const esbuild = require('esbuild')

const ROOT = path.join(__dirname, '..')
const ENTRY = path.join(ROOT, 'electron', 'preload.js')
const OUTFILE = path.join(ROOT, 'electron', 'preload.build.js')

/**
 * Bundle the Electron preload script into a single CommonJS file.
 *
 * The window runs with ``sandbox: true``. A sandboxed preload's ``require`` is a
 * polyfill that only resolves a small whitelist (electron, events, timers, url)
 * and cannot load relative modules such as ``./ipcChannels``. Bundling inlines
 * those local dependencies so the preload loads under the sandbox, while
 * ipcChannels.js stays the single source of truth shared with the main process.
 * ``electron`` is left external because the sandbox polyfill provides it.
 *
 * @param {string} [outfile] Destination path for the bundled preload.
 * @returns {string} The path that was written.
 */
function bundlePreload(outfile = OUTFILE) {
  esbuild.buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['electron'],
    outfile,
  })
  return outfile
}

module.exports = { bundlePreload, ENTRY, OUTFILE }

if (require.main === module) {
  const out = bundlePreload(process.argv[2] || OUTFILE)
  console.log(`Bundled preload -> ${path.relative(ROOT, out)}`)
}
