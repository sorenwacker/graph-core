# Accessibility

Graph Core implements accessibility features following WCAG 2.1 guidelines.

## ARIA Landmarks

Key interface regions are marked with ARIA landmark roles:

| Component | Role | Purpose |
|-----------|------|---------|
| AppSidebar | `navigation` | Primary navigation tree |
| MainToolbar | buttons with `aria-label` | Toolbar actions |
| DetailPanel | `complementary` | Selected node details |
| ToastContainer | `aria-live="polite"` | Non-intrusive notifications |

## Keyboard Navigation

Full keyboard support is available throughout the application:

### Global Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` / `Ctrl+K` | Open search |
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo |
| `Cmd+N` / `Ctrl+N` | New node |
| `Escape` | Close modal/panel |

### Tree Navigation

| Key | Action |
|-----|--------|
| `Arrow Up/Down` | Move selection |
| `Arrow Left` | Collapse node / go to parent |
| `Arrow Right` | Expand node / go to first child |
| `Enter` | Open detail panel |
| `Space` | Toggle completion |

### Search Navigation

| Key | Action |
|-----|--------|
| `Arrow Up/Down` | Navigate results |
| `Enter` | Select result |
| `Escape` | Close search |

## Focus Management

- Modal dialogs trap focus
- Focus returns to trigger element when modals close
- Visible focus indicators on all interactive elements
- Skip links for main content areas

## Screen Reader Support

- Semantic HTML structure
- Descriptive button labels
- Status announcements for async operations
- Meaningful link text

## Color and Contrast

- Minimum 4.5:1 contrast ratio for text
- High contrast theme available
- Color not used as sole indicator
- Focus indicators meet contrast requirements

## Motion and Animation

- Respects `prefers-reduced-motion` media query
- No auto-playing animations
- Transitions are brief and purposeful

## Error Feedback

Errors are surfaced via:

1. Toast notifications with `aria-live="polite"`
2. Visual error states on form fields
3. Error messages associated with inputs via `aria-describedby`

## Testing Accessibility

Run accessibility audit:

```bash
# Using Lighthouse CLI
lighthouse http://localhost:5173 --only-categories=accessibility
```

## See Also

- [Keyboard Shortcuts](keyboard-shortcuts.md)
- [Interactions](interactions.md)
