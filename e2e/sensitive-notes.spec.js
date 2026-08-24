import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding } from './helpers.js'

/**
 * Sensitive notes end to end, in an isolated app instance so it does not depend
 * on or destabilize the smoke chain. Enables database encryption, then sensitive
 * notes, then verifies the session locks across a relaunch and needs the
 * recovery password (docs/architecture/sensitive-notes.md).
 */

const PW = 'e2e-recovery-pw'
let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)

  // Enable database encryption first: sensitive notes reuse its recovery password.
  await ctx.page.getByRole('button', { name: 'Open settings menu' }).click()
  await ctx.page.getByRole('button', { name: 'Security' }).click()
  await ctx.page.getByTestId('enable-password').fill(PW)
  await ctx.page.getByTestId('enable-password-confirm').fill(PW)
  await ctx.page.getByRole('button', { name: 'Encrypt database' }).click()
  await expect(ctx.page.getByText('Encryption enabled', { exact: false })).toBeVisible()
})

test.afterAll(async () => {
  await ctx.close()
})

test('enables sensitive notes and reports the session unlocked', async () => {
  const sensitive = ctx.page.getByTestId('sensitive-settings')
  await expect(sensitive).toBeVisible()
  await ctx.page.getByTestId('sensitive-enable-password').fill(PW)
  await sensitive.getByRole('button', { name: 'Enable', exact: true }).click()
  await expect(sensitive).toContainText('unlocked')
})

test('locks the session across a relaunch and needs the password', async () => {
  ctx = await ctx.relaunch()
  const unlock = ctx.page.getByTestId('unlock-password')
  try {
    await unlock.waitFor({ timeout: 5000 })
    await unlock.fill(PW)
    await ctx.page.getByRole('button', { name: 'Unlock' }).click()
  } catch {
    // keychain opened the database silently
  }
  await dismissOnboarding(ctx.page)

  await ctx.page.getByRole('button', { name: 'Open settings menu' }).click()
  await ctx.page.getByRole('button', { name: 'Security' }).click()
  const sensitive = ctx.page.getByTestId('sensitive-settings')
  await expect(sensitive).toBeVisible()
  await expect(sensitive).toContainText('locked')

  await ctx.page.getByTestId('sensitive-unlock-password').fill(PW)
  await sensitive.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(sensitive).toContainText('unlocked')
})
