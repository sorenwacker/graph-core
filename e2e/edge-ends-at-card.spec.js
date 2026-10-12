import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * An edge in the graph ends at the border of the card it points to
 * (docs/guides/views.md, "Graph View"). Cytoscape draws edges to a node box
 * that is separate from the visible card, and the box used to be sized to the
 * card only when the graph opened or a layout ran. A card that grew afterwards,
 * here because its title wrapped, left the box at its old size, so arrowheads
 * floated in space or hid beneath the card.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
  const input = ctx.page.getByPlaceholder('Add new...')
  await input.fill('Arrow note')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await ctx.page.locator('body').press(`${MOD}+Digit1`)
})

test.afterAll(async () => {
  await ctx?.close()
})

/**
 * How far the Cytoscape node box behind a card is from the card's own size,
 * with the card's height. The label plugin rebuilds the card element on every
 * data or style event, so the card is looked up afresh on each read rather
 * than held across one.
 */
function fit(page, title) {
  return page.evaluate(title => {
    const cy = document.querySelector('.graph-container')._cyreg.cy
    const node = cy.nodes().filter(n => n.data('nodeData')?.title === title)
    const card = cy.container().querySelector(`.node-html[data-node-id="${node.id()}"]`)
    if (!card) return null
    return {
      widthGap: Math.round(node.width() - card.offsetWidth),
      heightGap: Math.round(node.height() - card.offsetHeight),
      cardHeight: card.offsetHeight,
    }
  }, title)
}

const SNUG = { widthGap: 0, heightGap: 0 }
const LONG_TITLE = 'Arrow note with a title long enough to wrap onto several lines inside the card'

test('the node box follows the card when its title wraps', async () => {
  const page = ctx.page
  const card = page.locator('.node-html', { hasText: 'Arrow note' })
  await expect(card).toBeVisible()
  // Let the initial layout and fit finish before interacting, as the other
  // graph specs do: a click that lands mid-animation selects nothing.
  await page.waitForTimeout(1000)
  await expect.poll(() => fit(page, 'Arrow note'), 'box matches the card before the rename').toMatchObject(SNUG)
  const before = await fit(page, 'Arrow note')

  // Give the node a title long enough to wrap onto several lines in the card.
  const box = await card.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(card).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Space')
  const title = page.locator('.detail-panel .title-input')
  await expect(title).toBeVisible()
  await title.fill(LONG_TITLE)
  await title.blur()
  await expect(card).toContainText('several lines inside the card')

  await expect
    .poll(async () => (await fit(page, LONG_TITLE))?.cardHeight, 'the card grew')
    .toBeGreaterThan(before.cardHeight)
  await expect.poll(() => fit(page, LONG_TITLE), 'box matches the grown card').toMatchObject(SNUG)
})
