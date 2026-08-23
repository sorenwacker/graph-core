import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Launch the built app in real Electron with an isolated profile, so the
 * developer's own database is never read or written.
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
