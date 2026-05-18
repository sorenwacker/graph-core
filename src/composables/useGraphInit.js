import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import d3Force from 'cytoscape-d3-force'
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { marked } from 'marked'
import { getContrastColor } from '../utils/formatting.js'
import { LAYOUT_SETTLE_DELAY_MS, NODE_POSITION_SETTLE_DELAY_MS } from '../utils/settingsConstants'

// Register cytoscape extensions once
if (!window.__cytoscapeExtensionsRegistered) {
  cytoscape.use(coseBilkent)
  cytoscape.use(cola)
  cytoscape.use(dagre)
  cytoscape.use(d3Force)
  nodeHtmlLabel(cytoscape)
  window.__cytoscapeExtensionsRegistered = true
}

// Configure marked for notes
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      return `<a href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noopener">${text}</a>`
    },
  },
})

/**
 * Render markdown text as HTML, truncated to first paragraph.
 * @param {string} text - Markdown text to render
 * @param {number} maxLen - Maximum character length
 * @returns {string} HTML string
 */
export function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  // Get first paragraph (split by double newline or single newline)
  const paragraphs = text.split(/\n\n|\n/)
  let firstPara = paragraphs[0].trim()

  // Also apply character limit
  if (firstPara.length > maxLen) {
    firstPara = firstPara.substring(0, maxLen)
    // Don't cut in middle of a markdown link
    const lastOpen = firstPara.lastIndexOf('['),
      lastClose = firstPara.lastIndexOf(')')
    if (lastOpen > lastClose) {
      firstPara = firstPara.substring(0, lastOpen).trimEnd()
    }
  }

  return marked.parse(firstPara)
}

/**
 * Composable for graph initialization.
 * Handles creating the cytoscape instance, setting up HTML labels, and applying initial layout.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getContainer - Function returning container element
 * @param {Function} options.getLayoutOptions - Function returning layout options for current mode
 * @param {Function} options.getProps - Function returning component props
 * @param {Function} options.savePositions - Function to save node positions
 * @param {Object} options.relaxLocked - Ref for relax lock state
 * @param {Object} options.fitLocked - Ref for fit lock state
 * @param {Object} options.layout - Layout composable instance
 * @returns {Object} Graph initialization functions
 */
export function useGraphInit(options = {}) {
  const { getContainer, getLayoutOptions, getProps, savePositions, relaxLocked, fitLocked, layout } = options

  /**
   * Create the cytoscape instance with configuration.
   * @param {Array} elements - Graph elements (nodes and edges)
   * @param {boolean} hasPos - Whether saved positions exist
   * @returns {Object} Cytoscape instance
   */
  function createCytoscapeInstance(elements, hasPos) {
    const container = getContainer()
    const layoutOptions = getLayoutOptions()

    return cytoscape({
      container,
      elements,
      boxSelectionEnabled: true,
      selectionType: 'additive',
      userZoomingEnabled: false, // Disable default wheel zoom - we handle it custom
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'transparent',
            'background-opacity': 0,
            'border-width': 0,
            label: '',
            width: 180,
            height: 80,
            shape: 'rectangle',
            'overlay-opacity': 0,
          },
        },
        { selector: 'node[?isParent]', style: { width: 200, height: 100 } },
        { selector: 'node[?isPerson]', style: { width: 120, height: 40, shape: 'round-rectangle' } },
        { selector: 'node:selected', style: { 'border-width': 0 } },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#999',
            'target-arrow-color': '#999',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2,
          },
        },
        { selector: 'edge:selected', style: { width: 3, 'line-color': '#f39c12', 'target-arrow-color': '#f39c12' } },
        {
          selector: 'edge[isLink]',
          style: {
            'line-style': 'dashed',
            'line-color': '#9b59b6',
            'target-arrow-color': '#9b59b6',
            'target-arrow-shape': 'none',
            opacity: 0.7,
          },
        },
      ],
      layout: hasPos ? { name: 'preset' } : layoutOptions,
    })
  }

  /**
   * Configure the node HTML label plugin for rendering custom node templates.
   * @param {Object} cy - Cytoscape instance
   */
  function setupHtmlLabels(cy) {
    const props = getProps()

    cy.nodeHtmlLabel(
      [
        {
          query: 'node',
          halign: 'center',
          valign: 'center',
          halignBox: 'center',
          valignBox: 'center',
          tpl: d => {
            const n = d.nodeData
            if (!n) return ''
            if (n.type === 'person') {
              const c = n.color && n.color !== '#0f4c75' ? n.color : d.customBgTint || '#6b7280'
              return `<div class="node-person" data-node-id="${n.id}" data-selected="${d.isSelected}" style="background-color:${c};color:${getContrastColor(c)}"><span class="person-name">${n.title || 'Untitled'}</span></div>`
            }
            const bc = d.borderColor || '#3498db',
              bg = d.customBgTint
                ? `background:linear-gradient(135deg,${d.customBgTint}99 0%,${d.customBgTint}44 50%,var(--bg-secondary) 100%),var(--bg-secondary);`
                : ''
            let notes = ''
            if (d.showDetails && n.notes) {
              notes =
                n.notes_sensitive || props.hideSensitive
                  ? '<span style="opacity:0.5"></span>'
                  : renderMarkdownHtml(n.notes, props.notesPreviewLength)
            }
            const childBadge = d.childCount > 0 ? `<span class="child-count-badge">${d.childCount}</span>` : ''
            const collapseBtn = d.hasChildren
              ? `<button class="collapse-btn" data-collapse-node="${n.id}" title="${d.isCollapsed ? 'Expand children' : 'Collapse children'}">${d.isCollapsed ? '+' : '-'}</button>`
              : ''
            return `<div class="node-html ${n.completed ? 'completed' : ''} ${d.shouldGlow ? 'current-container' : ''} ${n.favorite ? 'favorite' : ''} ${d.isCollapsed ? 'collapsed-node' : ''}" data-node-id="${n.id}" data-selected="${d.isSelected}" style="border-color:${bc};--glow-color:${bc};${bg}">${collapseBtn}${childBadge}<div class="node-html-title">${n.title || 'Untitled'}${n.notes && !d.showDetails ? '<span class="notes-indicator"></span>' : ''}</div>${notes ? `<div class="node-html-notes">${notes}</div>` : ''}</div>`
          },
        },
      ],
      { enablePointerEvents: true }
    )
  }

  /**
   * Run layout and save positions for initial graph setup.
   * @param {Object} cy - Cytoscape instance
   * @param {boolean} hasPos - Whether saved positions exist
   * @param {Function} onInitComplete - Callback when initialization completes
   */
  function applyInitialLayout(cy, hasPos, onInitComplete) {
    const props = getProps()
    const layoutOptions = getLayoutOptions()

    if (props.selectedIds?.size > 0) props.selectedIds.forEach(id => cy.$(`#${id}`).select())
    else if (props.selectedId) cy.$(`#${props.selectedId}`).select()

    if (!hasPos && cy.nodes().length > 0) {
      setTimeout(() => {
        // Use custom grid layout if in grid mode
        if (layout?.isGridMode?.()) {
          layout.runGridLayout()
          setTimeout(() => {
            if (onInitComplete) onInitComplete()
            if (relaxLocked?.value && layout) layout.startContinuousRelax()
            if (fitLocked?.value && layout) layout.startContinuousFit()
          }, 300)
        } else {
          cy.layout(layoutOptions).run()
          setTimeout(() => {
            cy.fit(50)
            if (savePositions) savePositions()
            if (onInitComplete) onInitComplete()
            if (relaxLocked?.value && layout) layout.startContinuousRelax()
            if (fitLocked?.value && layout) layout.startContinuousFit()
          }, LAYOUT_SETTLE_DELAY_MS)
        }
      }, NODE_POSITION_SETTLE_DELAY_MS)
    } else {
      if (onInitComplete) onInitComplete()
      if (relaxLocked?.value && layout) layout.startContinuousRelax()
      if (fitLocked?.value && layout) layout.startContinuousFit()
    }
  }

  return {
    createCytoscapeInstance,
    setupHtmlLabels,
    applyInitialLayout,
    renderMarkdownHtml,
  }
}
