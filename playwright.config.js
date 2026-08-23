import { defineConfig } from '@playwright/test'

// End-to-end smoke pack against the built Electron app. One worker: every
// test file launches its own Electron instance with an isolated profile, and
// parallel instances would fight over the singleton lock.
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: process.env.CI ? 'line' : 'list',
})
