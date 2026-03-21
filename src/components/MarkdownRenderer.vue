<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import mermaid from 'mermaid'
import { decodeHtmlEntities } from '../utils/html.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'

const { handleError } = useErrorHandler()

const props = defineProps({
  content: { type: String, default: '' }
})

const container = ref(null)
const renderedHtml = ref('')

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true
})

// Configure mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#1a4d7a',
    primaryTextColor: '#fff',
    primaryBorderColor: '#3a8dba',
    lineColor: '#666',
    secondaryColor: '#2a5a2a',
    tertiaryColor: '#1a1a2e'
  }
})

async function renderContent() {
  if (!props.content) {
    renderedHtml.value = ''
    return
  }

  // Parse markdown then decode HTML entities
  let html = marked.parse(props.content)
  html = decodeHtmlEntities(html)

  // Convert person mention links to styled chips
  // Matches: <a href="person:123">@[Person Name]</a> or <a href="person:123">Person Name</a>
  html = html.replace(
    /<a href="person:(\d+)">@?\[?([^\]<]+)\]?<\/a>/g,
    '<span class="person-mention" data-person-id="$1">@$2</span>'
  )

  // Style inline #hashtags (not already in a link)
  // Matches #word or #multi-word-tag but not already inside HTML tags
  html = html.replace(
    /(?<!["\w])#([\w-]+)(?![^<]*>)/g,
    '<span class="hashtag">#$1</span>'
  )

  // Extract and process mermaid blocks
  const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g
  let mermaidIndex = 0
  const mermaidBlocks = []

  html = html.replace(mermaidRegex, (match, code) => {
    const id = `mermaid-${Date.now()}-${mermaidIndex++}`
    mermaidBlocks.push({ id, code: code.trim() })
    return `<div class="mermaid-container" id="${id}"></div>`
  })

  renderedHtml.value = html

  // Render mermaid diagrams after DOM update
  await nextTick()

  for (const block of mermaidBlocks) {
    try {
      const el = document.getElementById(block.id)
      if (el) {
        const { svg } = await mermaid.render(`svg-${block.id}`, block.code)
        el.innerHTML = svg
      }
    } catch (e) {
      handleError(e, { context: 'Rendering mermaid diagram', silent: true })
      const el = document.getElementById(block.id)
      if (el) {
        el.innerHTML = `<pre class="mermaid-error">${block.code}\n\nError: ${e.message}</pre>`
      }
    }
  }
}

watch(() => props.content, renderContent, { immediate: true })
onMounted(renderContent)
</script>

<template>
  <div ref="container" class="markdown-content" v-html="renderedHtml"></div>
</template>

<style scoped>
.markdown-content {
  line-height: 1.6;
  color: var(--text-primary);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
  color: var(--text-primary);
}

.markdown-content :deep(h1) { font-size: 1.5em; }
.markdown-content :deep(h2) { font-size: 1.3em; }
.markdown-content :deep(h3) { font-size: 1.1em; }

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(li) {
  margin: 0.25em 0;
}

.markdown-content :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.9em;
  color: #a0e0a0;
}

.markdown-content :deep(pre) {
  background: var(--bg-tertiary);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  padding-left: 1em;
  margin: 0.5em 0;
  color: var(--text-secondary);
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.9em;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: var(--bg-tertiary);
  font-weight: 600;
  color: var(--text-secondary);
}

.markdown-content :deep(tr:nth-child(even)) {
  background: var(--bg-secondary);
}

.markdown-content :deep(a) {
  color: #5dade2;
  text-decoration: underline;
  text-decoration-color: rgba(93, 173, 226, 0.4);
  text-underline-offset: 2px;
}

.markdown-content :deep(a:hover) {
  color: #7ec8f0;
  text-decoration-color: rgba(93, 173, 226, 0.8);
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1em 0;
}

.markdown-content :deep(.mermaid-container) {
  margin: 1em 0;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  overflow-x: auto;
}

.markdown-content :deep(.mermaid-container svg) {
  max-width: 100%;
  height: auto;
}

.markdown-content :deep(.mermaid-error) {
  color: #e07d7d;
  background: rgba(224, 125, 125, 0.1);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* Person mention chips */
.markdown-content :deep(.person-mention) {
  display: inline-flex;
  align-items: center;
  background: rgba(52, 152, 219, 0.2);
  color: #5dade2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.markdown-content :deep(.person-mention:hover) {
  background: rgba(52, 152, 219, 0.35);
}

/* Hashtag chips */
.markdown-content :deep(.hashtag) {
  display: inline-flex;
  align-items: center;
  background: rgba(74, 144, 226, 0.15);
  color: #7fb3e8;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.markdown-content :deep(.hashtag:hover) {
  background: rgba(74, 144, 226, 0.3);
}
</style>
