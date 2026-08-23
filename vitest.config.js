import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // e2e/ is Playwright's; running its specs under Vitest fails on import.
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,vue}', 'electron/**/*.js'],
      exclude: [
        'src/__tests__/**',
        'src/main.js',
        'node_modules/**'
      ],
      thresholds: {
        statements: 1,
        branches: 1,
        functions: 0.5,
        lines: 1
      }
    }
  },
})
