/**
 * Single source of truth for determining a node's effective color.
 *
 * The placeholder color (#0f4c75) means "no explicit color" and is treated as
 * unset, so inheritance can flow through it. One rule is shared by the two
 * access patterns the app needs:
 *  - resolveNodeColor: walk a node's ancestor chain (flat data + parent lookup)
 *  - buildColorMap: push colors down a node tree (recursive)
 *
 * Both implement the same precedence: a node's own explicit color wins;
 * otherwise the nearest ancestor's explicit color; otherwise a linked color
 * (e.g. a person's organization); otherwise null so the caller applies its own
 * fallback fill.
 */

/** Placeholder color meaning "no explicit color set". */
export const DEFAULT_NODE_COLOR = '#0f4c75'

/**
 * Whether a node carries an explicit (non-placeholder) color.
 *
 * @param {Object} node - Node to inspect
 * @returns {boolean} True if the node has a real, non-default color
 */
export function hasExplicitColor(node) {
  return !!(node && node.color && node.color !== DEFAULT_NODE_COLOR)
}

/**
 * Resolve the effective color for a single node by walking its ancestor chain.
 *
 * @param {Object} node - Node to resolve a color for
 * @param {Object} [options] - Resolution context
 * @param {function(Object): (Object|null)} [options.getParent] - Returns a node's parent, or null
 * @param {function(Object): (string|null)} [options.getLinkedColor] - Returns a linked color (e.g. organization), or null
 * @param {boolean} [options.inherit=true] - Whether to inherit from ancestors
 * @returns {string|null} The effective color, or null if none resolved
 */
export function resolveNodeColor(node, options = {}) {
  const { getParent = () => null, getLinkedColor = () => null, inherit = true } = options
  if (!node) return null
  if (hasExplicitColor(node)) return node.color

  if (inherit) {
    // Walk up to the nearest ancestor with an explicit color. Guard against
    // cycles in case parent links are malformed.
    const seen = new Set([node.id])
    let current = getParent(node)
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (hasExplicitColor(current)) return current.color
      current = getParent(current)
    }
  }

  const linked = getLinkedColor(node)
  if (linked && linked !== DEFAULT_NODE_COLOR) return linked

  return null
}

/**
 * Build a { nodeId: color } map by pushing colors down a node tree, applying the
 * same precedence as resolveNodeColor (own explicit color wins, else inherited).
 *
 * @param {Array} nodeList - Top-level nodes (each may have a `children` array)
 * @param {string|null} [inheritedColor] - Color flowing in from the parent
 * @param {Object} [colorMap] - Accumulator (used in recursion)
 * @param {boolean} [inherit=true] - Whether colors flow from parent to children
 * @returns {Object} Map of node id to effective color (or null)
 */
export function buildColorMap(nodeList, inheritedColor = null, colorMap = {}, inherit = true) {
  if (!nodeList) return colorMap
  for (const node of nodeList) {
    if (!node || !node.id) continue
    const own = hasExplicitColor(node)
    const effectiveColor = inherit ? (own ? node.color : inheritedColor) : own ? node.color : null
    colorMap[node.id] = effectiveColor

    if (node.children?.length) {
      buildColorMap(node.children, inherit ? effectiveColor : null, colorMap, inherit)
    }
  }
  return colorMap
}
