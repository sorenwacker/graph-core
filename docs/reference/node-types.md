# Node Types

Graph Core supports multiple node types for organizing different kinds of information.

## Available Types

| Type | Description |
|------|-------------|
| **Task** | Actionable items with completion tracking |
| **Project** | Container for organizing related work |
| **Note** | General-purpose text content |
| **Milestone** | Achievement markers and deadlines |
| **Topic** | Discussion or knowledge areas |
| **Group** | Organizational containers |
| **Event** | Time-based occurrences |
| **Person** | Contact information |
| **Organization** | Company or group entities |
| **Component** | Technical or modular elements |

Every type is created in the current workspace; see [Workspaces](../guides/workspaces.md).

## Type Details

### Task

Tasks represent actionable items with completion tracking.

**Fields:**

- Title, Notes, Tags
- Due date, Start date, End date
- Importance (1-5)
- Completed status

**Special Behaviors:**

- Shows checkbox in Cards, Table, Detail Panel, and Tooltips
- Auto-sets `start_date` to today when created
- Auto-sets `end_date` when marked complete
- Appears in Tasks view grouped by due date
- Shows urgency indicators based on due date proximity
- Timeline view renders tasks as date-range bars

---

### Project

Projects are containers for organizing related work.

**Fields:**

- Title, Notes, Tags
- Start date, End date
- Importance
- Completed status

**Special Behaviors:**

- Shows completion checkbox (like tasks)
- Auto-sets `start_date` to today when created
- Timeline view renders children within project bar span
- Can have custom colors that inherit to children
- Shows progress based on child task completion

---

### Note

Notes are general-purpose text containers.

**Fields:**

- Title, Notes (markdown), Tags
- Importance

**Special Behaviors:**

- No completion checkbox
- Full-text search includes content
- Markdown rendering in detail panel
- Notes field uses rich text editor

---

### Person

Persons represent contacts and people.

**Fields:**

- Title (name), Notes
- Email, Phone
- Organization, Role
- Website
- Color (auto-assigned or custom)

**Special Behaviors:**

- Created in the current workspace, like any other node
- Can be @mentioned in the notes of any node in the same workspace via the `@` key
- Shows in Persons view with organization grouping
- Unique color auto-assigned based on node ID
- Color inheritance: own color > parent org color > linked org color
- Graph view renders as circular badge with initials (not rectangular card)
- No completion checkbox in tooltips
- Person-specific form layout in detail panel
- Mini-avatar badges in child lists

---

### Organization

Organizations group related persons.

**Fields:**

- Title (company name), Notes
- Color

**Special Behaviors:**

- Created in the current workspace, like any other node
- Groups persons in Persons view
- Shows members count and linked persons
- Members section displays persons linked to organization
- Can be created on-demand when linking persons
- Organization-specific form layout in detail panel

---

### Event

Events represent time-based occurrences.

**Fields:**

- Title, Notes
- Start date, End date
- Location

**Special Behaviors:**

- Timeline view renders events as date-range bars
- Events without end_date extend to current date
- Supports custom bar labels in timeline

---

### Milestone

Milestones mark achievements or deadlines.

**Fields:**

- Title, Notes
- Due date
- Importance

**Special Behaviors:**

- Displayed as markers in Timeline view
- Shows urgency based on date proximity
- Standard icon and color display

---

### Group

Groups are structural containers for organizing nodes.

**Fields:**

- Title, Notes, Tags

**Special Behaviors:**

- Timeline view renders as vertical bars spanning all child rows
- Used for hierarchical organization of content
- No special completion tracking

---

### Topic

Topics represent discussion or knowledge areas.

**Fields:**

- Title, Notes, Tags

**Special Behaviors:**

- Standard display type
- Uses standard icon and color
- No special completion logic

---

### Component

Components represent technical or modular elements.

**Fields:**

- Title, Notes, Tags

**Special Behaviors:**

- Standard display type
- Uses standard icon and color
- Useful for technical documentation

---

## Common Fields

All node types support these fields:

| Field | Description |
|-------|-------------|
| `title` | Display name |
| `notes` | Markdown content |
| `notes_sensitive` | Mark notes as sensitive; content is always masked in card displays and hover tooltips, independent of the Hide Sensitive setting |
| `tags` | Array of tag strings |
| `color` | Custom color override |
| `importance` | Priority level 1-5 |
| `favorite` | Starred status |
| `due_date` | Deadline |
| `start_date` | Begin date |
| `end_date` | Completion date |
| `location` | Location string |

## Importance Levels

| Level | Label |
|-------|-------|
| 1 | Critical |
| 2 | High |
| 3 | Medium |
| 4 | Low |
| 5 | Trivial |

## Color Coding

Each type has a distinct color scheme:

| Type | Color | Hex |
|------|-------|-----|
| Project | Deep blue | `#1e3a5f` |
| Task | Amber | `#78350f` |
| Note | Green | `#14532d` |
| Milestone | Violet | `#4c1d95` |
| Group | Slate | `#334155` |
| Person | Dynamic | Based on ID |
| Event | Rose | `#881337` |
| Topic | Teal | `#134e4a` |
| Organization | Indigo | `#312e81` |
| Component | Cyan | `#164e63` |

## View-Specific Rendering

| Type | Cards | Graph | Timeline | Table |
|------|-------|-------|----------|-------|
| Task | Checkbox | Rectangle | Date bar | Checkbox |
| Project | Checkbox | Rectangle | Container bar | Checkbox |
| Person | Standard | Circle badge | - | Icon |
| Group | Standard | Rectangle | Vertical span | Standard |
| Event | Standard | Rectangle | Date bar | Standard |

## See Also

- [Workspaces](../guides/workspaces.md)
- [Views Guide](../guides/views.md)
- [Keyboard Shortcuts](keyboard-shortcuts.md)
