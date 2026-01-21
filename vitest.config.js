import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
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
