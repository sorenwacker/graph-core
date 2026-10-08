import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Selecting a node in the graph adds an outer frame and leaves the
 * node's own colours alone (docs/guides/views.md, graph "Interactions"). The
 * border colour is how the graph shows a node's type; selection used to
 * repaint it in the accent colour, so the type could not be read off a
 * selected node.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
  const input = ctx.page.getByPlaceholder('Add new...')
  await input.fill('Colour note')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await ctx.page.locator('body').press(`${MOD}+Digit1`)
})

test.afterAll(async () => {
  await ctx?.close()
})

function colours(node) {
  return node.evaluate(el => {
    const style = getComputedStyle(el)
    return {
      border: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      background: style.backgroundImage,
      outline: `${style.outlineStyle} ${style.outlineColor}`,
    }
  })
}

const FRAME = { dark: 'solid rgb(255, 255, 255)', light: 'solid rgb(26, 26, 26)' }

test('a selected node keeps its border and background and gains a frame', async () => {
  const page = ctx.page
  const setTheme = theme => page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
  const node = page.locator('.node-html', { hasText: 'Colour note' })
  await expect(node).toBeVisible()
  await expect(node).toHaveAttribute('data-selected', 'false')

  const before = {}
  for (const theme of ['dark', 'light']) {
    await setTheme(theme)
    await page.waitForTimeout(500)
    before[theme] = await colours(node)
  }

  // The pointer lands on the graph canvas layered over the node, which is what
  // handles the tap; Playwright's own click refuses a target that is covered.
  const box = await node.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(node).toHaveAttribute('data-selected', 'true')

  for (const theme of ['dark', 'light']) {
    await setTheme(theme)
    // The node's colours are animated, so read them once they have settled.
    await expect.poll(async () => (await colours(node)).outline, theme).toBe(FRAME[theme])
    await page.waitForTimeout(500)
    const after = await colours(node)
    expect(after.border, theme).toBe(before[theme].border)
    expect(after.borderWidth, theme).toBe(before[theme].borderWidth)
    expect(after.background, theme).toBe(before[theme].background)
  }
})
