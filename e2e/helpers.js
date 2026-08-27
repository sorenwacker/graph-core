import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Launch the built app in real Electron with an isolated profile, so the
 * developer's own database is never read or written. The isolation is checked
 * from inside the running app before any test gets a handle to it.
 *
 * @returns {Promise<{app: import('@playwright/test').ElectronApplication, page: import('@playwright/test').Page, profileDir: string, relaunch: Function, close: Function}>}
 */
export async function launchApp(existingProfileDir) {
  const profileDir = existingProfileDir || mkdtempSync(join(tmpdir(), 'graph-core-e2e-'))

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profileDir}`],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Refuse to run against anything but the throwaway profile. --user-data-dir
  // is the only thing standing between a test run and the developer's own
  // database, and a silent failure of that flag would let a destructive test
  // (trashing rows, disabling encryption) loose on real data. Assert it from
  // inside the app rather than trusting the flag was honoured.
  // Compare resolved paths: on macOS /var is a symlink to /private/var, so the
  // app reports a real path where mkdtemp handed back the symlinked one.
  const dataPath = await page.evaluate(() => window.electronAPI.getDataPath())
  const expected = realpathSync(profileDir)
  if (!realpathSync(String(dataPath)).startsWith(expected)) {
    await app.close()
    throw new Error(`Refusing to run: the app is using ${dataPath}, which is outside the test profile ${profileDir}.`)
  }

  return {
    app,
    page,
    profileDir,
    // Relaunch against the same profile to verify persistence.
    relaunch: async () => {
      await app.close()
      return launchApp(profileDir)
    },
    close: async ({ keepProfile = false } = {}) => {
      await app.close()
      if (!keepProfile) rmSync(profileDir, { recursive: true, force: true })
    },
  }
}

/** Dismiss the first-run onboarding dialog if it is showing, and wait until
 *  it is gone so the next action cannot race the teardown. */
export async function dismissOnboarding(page) {
  const getStarted = page.getByRole('button', { name: 'Get Started' })
  try {
    await getStarted.click({ timeout: 5000 })
    await getStarted.waitFor({ state: 'detached', timeout: 5000 })
  } catch {
    // Not showing - nothing to dismiss.
  }
}

/** The platform's primary modifier, for view-switching shortcuts. */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
