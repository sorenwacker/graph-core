# Node Types

Graph Core supports multiple node types for organizing different kinds of information.

## Available Types

| Type | Description | Default Workspace |
|------|-------------|-------------------|
| **Task** | Actionable items with status tracking | Current |
| **Project** | Container for organizing related nodes | Current |
| **Note** | General-purpose text content | Current |
| **Milestone** | Achievement markers and deadlines | Current |
| **Topic** | Discussion or knowledge areas | Current |
| **Group** | Organizational containers | Current |
| **Event** | Time-based occurrences | Current |
| **Person** | Contact information | People |
| **Organization** | Company or group entities | People |
| **Component** | Technical or modular elements | Current |

## Type Details

### Task

Tasks represent actionable items.

**Fields:**

- Title
- Notes
- Status (not_started, in_progress, done)
- Due date
- Tags
- Importance (1-5)

**Behavior:**

- Appears in Tasks view grouped by due date
- Shows completion checkbox
- Urgency indicators based on due date

### Project

Projects are containers for organizing related work.

**Fields:**

- Title
- Notes
- Start date
- End date
- Tags

**Behavior:**

- Groups children in Timeline view
- Inherits color to children in Cards view
- Shows progress based on child task completion

### Note

Notes are general-purpose text containers.

**Fields:**

- Title
- Notes (markdown content)
- Tags

**Behavior:**

- Full-text search includes content
- Markdown rendering in detail panel

### Person

Persons represent contacts and people.

**Fields:**

- Title (name)
- Notes
- Email
- Phone
- Organization (link)

**Behavior:**

- Automatically assigned to People workspace
- Can be @mentioned from any workspace
- Shows in Persons view with organization grouping
- Unique color based on ID for visual distinction

### Organization

Organizations group related persons.

**Fields:**

- Title (company name)
- Notes

**Behavior:**

- Automatically assigned to People workspace
- Groups persons in Persons view
- Can be linked from person nodes

### Event

Events represent time-based occurrences.

**Fields:**

- Title
- Notes
- Start date
- End date

**Behavior:**

- Displays in Timeline and Calendar views
- Shows duration as bar in timeline
- Events without end_date stretch to today

### Milestone

Milestones mark achievements or deadlines.

**Fields:**

- Title
- Notes
- Due date

**Behavior:**

- Displayed as markers in Timeline view
- Shows urgency based on date proximity

## Importance Levels

All node types support importance levels:

| Level | Label |
|-------|-------|
| 1 | Critical |
| 2 | High |
| 3 | Medium |
| 4 | Low |
| 5 | Trivial |

## Color Coding

Each type has a distinct color scheme for visual identification:

- **Project**: Deep blue
- **Task**: Amber
- **Note**: Green
- **Milestone**: Violet
- **Group**: Slate
- **Person**: Warm orange
- **Event**: Rose
- **Topic**: Teal
- **Organization**: Indigo
- **Component**: Cyan

## See Also

- [Workspaces](../guides/workspaces.md)
- [Views Guide](../guides/views.md)
