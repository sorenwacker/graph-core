# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## Build Notes

### electron-builder compatibility (2026-01-18)

electron-builder >= 26.x and @electron/rebuild >= 4.x have a bug with the `tar` module ESM/CommonJS import that breaks builds on Node.js 20-24. The error shows:

```
SyntaxError: The requested module 'tar' does not provide an export named 'default'
```

Fix: Pin to older versions in package.json:
- `electron-builder`: 25.1.8
- `@electron/rebuild`: 3.6.2
