// Node types - single source of truth
export const nodeTypes = ['project', 'task', 'note', 'milestone', 'group', 'person', 'event']

// Node type colors - consistent across all views
export const typeColors = {
  project: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(129, 140, 248, 0.5)' },
  task: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.5)' },
  note: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(52, 211, 153, 0.5)' },
  milestone: { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa', border: 'rgba(167, 139, 250, 0.5)' },
  group: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.5)' },
  person: { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: 'rgba(251, 146, 60, 0.5)' },
  event: { bg: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: 'rgba(251, 113, 133, 0.5)' }
}

// Importance labels
export const importanceLabels = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Trivial'
}

export function getImportanceLabel(level) {
  return importanceLabels[level] || ''
}
