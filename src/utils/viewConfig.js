// View mode configuration - centralized definition of all views
export const viewModes = [
  {
    id: 'graph',
    label: 'Graph',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
      <line x1="8.5" y1="7.5" x2="10.5" y2="16"/><line x1="15.5" y1="7.5" x2="13.5" y2="16"/>
    </svg>`,
  },
  {
    id: 'cards',
    label: 'Cards',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>`,
  },
  {
    id: 'tree',
    label: 'Table',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="5" width="4" height="4" rx="1"/><line x1="10" y1="7" x2="21" y2="7"/>
      <rect x="3" y="15" width="4" height="4" rx="1"/><line x1="10" y1="17" x2="21" y2="17"/>
    </svg>`,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      <rect x="5" y="4" width="8" height="4" rx="1" fill="currentColor"/>
      <rect x="9" y="10" width="10" height="4" rx="1" fill="currentColor"/>
      <rect x="4" y="16" width="6" height="4" rx="1" fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <rect x="7" y="14" width="3" height="3" rx="0.5"/><rect x="14" y="14" width="3" height="3" rx="0.5"/>
    </svg>`,
  },
  {
    id: 'persons',
    label: 'People',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <circle cx="17" cy="7" r="3"/><path d="M21 21v-2a3 3 0 0 0-2-2.8"/>
    </svg>`,
  },
  {
    id: 'trash',
    label: 'Trash',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`,
  },
]
