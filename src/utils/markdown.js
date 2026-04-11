import { marked } from 'marked'

// Configure marked for inline rendering with links handled by click handler
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr} class="external-link" rel="noopener">${text}</a>`
    },
  },
})

// Global click handler for external links - opens in system browser
export function handleExternalLinkClick(e) {
  const link = e.target.closest('a[href]')
  if (link) {
    const href = link.getAttribute('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      e.preventDefault()
      e.stopPropagation()
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(href)
      } else {
        window.open(href, '_blank')
      }
    }
  }
}

export { marked }
