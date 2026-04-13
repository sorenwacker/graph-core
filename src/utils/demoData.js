/**
 * Demo workspace data and creation utilities.
 * Creates a sample workspace with nodes demonstrating all node types and relationships.
 */

export const DEMO_WORKSPACE_ID = 'demo'

export const demoWorkspace = {
  id: DEMO_WORKSPACE_ID,
  name: 'Demo',
  color: '#9333ea',
  icon: 'sparkles',
}

/**
 * Demo nodes organized by hierarchy.
 * parentRef is used to resolve parent IDs after creation.
 */
const demoNodesDefinition = [
  // ============================================
  // ROOT LEVEL NODES
  // ============================================

  // Project: Learn GraphCore
  {
    ref: 'project-learn',
    type: 'project',
    title: 'Learn GraphCore',
    color: '#3b82f6',
    favorite: true,
    notes: `# Welcome to GraphCore

This demo project will help you learn how to use GraphCore effectively.

## What you'll learn

- Creating and organizing nodes
- Using different view modes
- Linking related items
- Keyboard shortcuts for power users

## Getting started

1. **Drill down** into this project by pressing \`Enter\` or double-clicking
2. Explore the child nodes to see examples of different types
3. Try the graph view to see relationships visually

> Tip: Press \`Space\` on any node to see its full details in the side panel.

#tutorial #getting-started`,
  },

  // Group: Team & Contacts
  {
    ref: 'group-team',
    type: 'group',
    title: 'Team & Contacts',
    color: '#22c55e',
    notes: `# Team Directory

This group contains people, organizations, and departments you work with.

## Use cases for Groups

- **Team rosters** - Keep track of team members
- **Departments** - Organize by business unit
- **External contacts** - Vendors, clients, partners

Groups are containers that help you organize related items together without implying a project workflow.

#team #contacts`,
  },

  // Topic: GraphCore Features
  {
    ref: 'topic-features',
    type: 'topic',
    title: 'GraphCore Features',
    color: '#f59e0b',
    notes: `# Feature Documentation

This topic contains documentation about GraphCore's capabilities.

## Topics vs Projects

- **Topics** are for knowledge, documentation, and reference material
- **Projects** are for work that has tasks, milestones, and deadlines

Use topics to build your personal knowledge base!

#documentation #features`,
  },

  // Project: Product Launch
  {
    ref: 'project-launch',
    type: 'project',
    title: 'Product Launch Q2',
    color: '#ec4899',
    notes: `# Q2 Product Launch

A sample project showing how to track a product launch with milestones, tasks, and team assignments.

## Timeline

- **Planning**: Complete
- **Development**: In Progress
- **Marketing**: Starting Soon
- **Launch**: Q2 Target

## Success Metrics

- [ ] 1000 signups in first week
- [ ] 4.5+ app store rating
- [ ] <2% churn in first month

#project #launch #q2`,
  },

  // Project: Website Redesign
  {
    ref: 'project-website',
    type: 'project',
    title: 'Website Redesign',
    color: '#8b5cf6',
    notes: `# Website Redesign Project

Complete overhaul of the company website.

## Goals

- Modern, responsive design
- Improved performance (Core Web Vitals)
- Better SEO
- Accessibility compliance (WCAG 2.1)

## Stakeholders

- Marketing team
- Design agency (PixelPerfect)
- Engineering

#project #website #design`,
  },

  // ============================================
  // LEARN GRAPHCORE - CHILDREN
  // ============================================

  // Milestone: Getting Started (completed)
  {
    ref: 'milestone-started',
    type: 'milestone',
    title: 'Getting Started',
    parentRef: 'project-learn',
    completed: true,
    notes: `# Getting Started Milestone

You've completed the first milestone by opening the demo workspace.

## What you accomplished

- Opened the demo workspace
- Started exploring the interface
- Found this milestone node

## Next steps

Continue exploring the other nodes in this project to learn more features.

#milestone #complete`,
  },

  // Milestone: Intermediate
  {
    ref: 'milestone-intermediate',
    type: 'milestone',
    title: 'Become Proficient',
    parentRef: 'project-learn',
    notes: `# Intermediate Skills

Master these skills to become proficient with GraphCore.

## Skills to develop

- [ ] Navigate using keyboard shortcuts
- [ ] Create and organize nodes efficiently
- [ ] Use links to connect related items
- [ ] Customize views and settings

#milestone #learning`,
  },

  // Task: Explore Graph View (completed)
  {
    ref: 'task-explore',
    type: 'task',
    title: 'Explore graph view',
    parentRef: 'project-learn',
    completed: true,
    importance: 2,
    notes: `# Explore the Graph View

The graph view shows your nodes as an interactive visual network.

## How to access

Click the graph icon in the toolbar, or use the view switcher.

## Features

- **Drag nodes** to rearrange the layout
- **Zoom** with scroll wheel or pinch
- **Pan** by dragging the background
- **Double-click** a node to drill down
- **Right-click** for context menu

#task #views #graph`,
  },

  // Task: Create Your First Node
  {
    ref: 'task-create',
    type: 'task',
    title: 'Create your first node',
    parentRef: 'project-learn',
    importance: 3,
    notes: `# Create Your First Node

Time to create something of your own!

## Methods to create nodes

### 1. Quick Input Bar
Use the input bar at the top of the screen:
1. Select a node type from the dropdown
2. Type a title
3. Press Enter

### 2. Keyboard Shortcut
Press \`N\` to open the new node dialog with more options.

### 3. Context Menu
Right-click on any node and select "Add Child" to create a nested node.

## Try it now

Create a simple task node to track something you need to do today.

#task #creating-nodes`,
  },

  // Task List: Learn Keyboard Shortcuts
  {
    ref: 'task-shortcuts',
    type: 'task',
    title: 'Learn keyboard shortcuts',
    parentRef: 'project-learn',
    notes: `# Keyboard Shortcuts

Keyboard shortcuts make you much faster at navigating and editing.

## Essential shortcuts

| Shortcut | Action |
|----------|--------|
| \`Space\` | View details panel |
| \`Enter\` | Drill down into node |
| \`Backspace\` | Go back to parent |
| \`N\` | Create new node |
| \`Cmd/Ctrl + K\` | Quick search |
| \`Cmd/Ctrl + /\` | Show all shortcuts |

Press \`Cmd/Ctrl + /\` right now to see the full shortcuts reference!

#task #keyboard #productivity`,
  },

  // Note: Tips & Tricks
  {
    ref: 'note-tips',
    type: 'note',
    title: 'Tips & Tricks',
    parentRef: 'project-learn',
    notes: `# Power User Tips

A collection of tips to help you get the most out of GraphCore.

## Organization

1. **Use colors consistently** - Assign colors to top-level nodes and let children inherit them
2. **Keep hierarchies shallow** - 3-4 levels deep is usually enough
3. **Link, don't duplicate** - Use links to connect related items instead of copying

## Productivity

1. **Pin the detail panel** - Click the pin icon to keep it open while navigating
2. **Use quick search** - \`Cmd/Ctrl + K\` finds anything instantly
3. **Keyboard navigation** - Learn the shortcuts for 10x faster navigation

## Markdown

Notes support full Markdown:
- **Bold** and *italic* text
- \`Code\` and code blocks
- Lists, tables, and blockquotes
- Links and images

> Pro tip: Use tags like #important or #todo to categorize nodes!

#tips #productivity #guide`,
  },

  // ============================================
  // LEARN GRAPHCORE - GRANDCHILDREN (subtasks under task-shortcuts)
  // ============================================

  {
    ref: 'task-learn-nav',
    type: 'task',
    title: 'Practice navigation shortcuts',
    parentRef: 'task-shortcuts',
    notes: `# Navigation Shortcuts Practice

## Key shortcuts to practice

- \`↑\` / \`↓\` - Move between siblings
- \`Enter\` - Drill down
- \`Backspace\` - Go back
- \`Cmd/Ctrl + ↑\` - Jump to parent

Try navigating this demo using only the keyboard!

#task #shortcuts`,
  },

  {
    ref: 'task-learn-editing',
    type: 'task',
    title: 'Practice editing shortcuts',
    parentRef: 'task-shortcuts',
    notes: `# Editing Shortcuts Practice

## Key shortcuts to practice

- \`N\` - Create new node
- \`E\` or \`F2\` - Edit title
- \`Delete\` - Delete node
- \`Cmd/Ctrl + Z\` - Undo

#task #shortcuts`,
  },

  {
    ref: 'task-learn-search',
    type: 'task',
    title: 'Try quick search',
    parentRef: 'task-shortcuts',
    completed: true,
    notes: `# Quick Search

Press \`Cmd/Ctrl + K\` to open quick search.

## Features

- Fuzzy search across all nodes
- Filter by type
- Recent items
- Tag search with #

#task #search #complete`,
  },

  // ============================================
  // TEAM GROUP - CHILDREN (Organizations and Subgroups)
  // ============================================

  // Subgroup: Internal Team
  {
    ref: 'group-internal',
    type: 'group',
    title: 'Internal Team',
    parentRef: 'group-team',
    color: '#06b6d4',
    notes: `# Internal Team Members

Our company's team members organized by department.

#team #internal`,
  },

  // Subgroup: Clients
  {
    ref: 'group-clients',
    type: 'group',
    title: 'Clients',
    parentRef: 'group-team',
    color: '#f97316',
    notes: `# Client Organizations

Companies and individuals we work with as clients.

#clients #external`,
  },

  // Subgroup: Vendors & Partners
  {
    ref: 'group-vendors',
    type: 'group',
    title: 'Vendors & Partners',
    parentRef: 'group-team',
    color: '#84cc16',
    notes: `# Vendors and Partners

External organizations we partner with or purchase from.

#vendors #partners`,
  },

  // ============================================
  // INTERNAL TEAM - GRANDCHILDREN
  // ============================================

  // Organization: Engineering Dept
  {
    ref: 'org-engineering',
    type: 'organization',
    title: 'Engineering Department',
    parentRef: 'group-internal',
    notes: `# Engineering Department

The engineering team responsible for product development.

## Teams

- Frontend
- Backend
- Infrastructure
- QA

## Head Count

12 engineers

#engineering #department`,
  },

  // Organization: Product Dept
  {
    ref: 'org-product',
    type: 'organization',
    title: 'Product Department',
    parentRef: 'group-internal',
    notes: `# Product Department

Product management and design.

## Teams

- Product Management
- UX Design
- User Research

## Head Count

5 members

#product #department`,
  },

  // Organization: Marketing Dept
  {
    ref: 'org-marketing',
    type: 'organization',
    title: 'Marketing Department',
    parentRef: 'group-internal',
    notes: `# Marketing Department

Marketing, communications, and growth.

## Teams

- Growth Marketing
- Content
- Brand

## Head Count

4 members

#marketing #department`,
  },

  // Person: Alice (under Engineering)
  {
    ref: 'person-alice',
    type: 'person',
    title: 'Alice Chen',
    parentRef: 'org-engineering',
    notes: `# Alice Chen

**Role:** Engineering Manager
**Email:** alice@example.com
**Location:** San Francisco

## Responsibilities

- Team leadership
- Technical architecture
- Code review
- Hiring

## Current Focus

Leading the API v2 migration project.

#team #engineering #manager`,
  },

  // Person: Bob (under Engineering)
  {
    ref: 'person-bob',
    type: 'person',
    title: 'Bob Martinez',
    parentRef: 'org-engineering',
    notes: `# Bob Martinez

**Role:** Senior Backend Engineer
**Email:** bob@example.com
**Location:** Austin

## Expertise

- Go, Python
- PostgreSQL, Redis
- API design
- Performance optimization

#team #engineering #backend`,
  },

  // Person: Carol (under Product)
  {
    ref: 'person-carol',
    type: 'person',
    title: 'Carol Johnson',
    parentRef: 'org-product',
    notes: `# Carol Johnson

**Role:** Lead UX Designer
**Email:** carol@example.com
**Location:** New York

## Expertise

- User research
- Interaction design
- Prototyping
- Design systems

#team #design #ux`,
  },

  // Person: David (under Product)
  {
    ref: 'person-david',
    type: 'person',
    title: 'David Kim',
    parentRef: 'org-product',
    notes: `# David Kim

**Role:** Product Manager
**Email:** david@example.com
**Location:** Seattle

## Responsibilities

- Roadmap planning
- Feature specs
- Stakeholder management
- Analytics

#team #product #pm`,
  },

  // Person: Emma (under Marketing)
  {
    ref: 'person-emma',
    type: 'person',
    title: 'Emma Wilson',
    parentRef: 'org-marketing',
    notes: `# Emma Wilson

**Role:** Marketing Director
**Email:** emma@example.com
**Location:** Chicago

## Responsibilities

- Marketing strategy
- Campaign planning
- Brand management
- Budget allocation

#team #marketing #director`,
  },

  // ============================================
  // CLIENTS GROUP - GRANDCHILDREN
  // ============================================

  // Organization: Acme Corp
  {
    ref: 'org-acme',
    type: 'organization',
    title: 'Acme Corp',
    parentRef: 'group-clients',
    notes: `# Acme Corp

**Type:** Enterprise Client
**Industry:** Manufacturing
**Size:** 5000+ employees
**Website:** acme.example.com

## Relationship

Key enterprise client since 2024. Enterprise license agreement.

## Contract Value

$250K/year

## Primary Contact

John Smith, CTO

#client #enterprise`,
  },

  // Organization: TechStart Inc
  {
    ref: 'org-techstart',
    type: 'organization',
    title: 'TechStart Inc',
    parentRef: 'group-clients',
    notes: `# TechStart Inc

**Type:** Startup Client
**Industry:** SaaS
**Size:** 50 employees
**Website:** techstart.example.com

## Relationship

Early adopter, great for case studies and feedback.

## Contract Value

$24K/year

## Primary Contact

Sarah Lee, CEO

#client #startup`,
  },

  // Organization: Global Finance
  {
    ref: 'org-globalfin',
    type: 'organization',
    title: 'Global Finance Ltd',
    parentRef: 'group-clients',
    notes: `# Global Finance Ltd

**Type:** Enterprise Client
**Industry:** Financial Services
**Size:** 10000+ employees
**Website:** globalfin.example.com

## Relationship

Onboarding in progress. High compliance requirements.

## Contract Value

$500K/year (pending)

## Primary Contact

Michael Brown, VP Engineering

#client #enterprise #finance`,
  },

  // Person: John Smith (Acme contact)
  {
    ref: 'person-john',
    type: 'person',
    title: 'John Smith',
    parentRef: 'org-acme',
    notes: `# John Smith

**Role:** CTO at Acme Corp
**Email:** john.smith@acme.example.com

## Notes

Key decision maker. Prefers technical deep-dives.
Met at TechConf 2024.

#contact #acme #cto`,
  },

  // Person: Sarah Lee (TechStart contact)
  {
    ref: 'person-sarah',
    type: 'person',
    title: 'Sarah Lee',
    parentRef: 'org-techstart',
    notes: `# Sarah Lee

**Role:** CEO at TechStart Inc
**Email:** sarah@techstart.example.com

## Notes

Very hands-on, provides great product feedback.
Interested in partnership opportunities.

#contact #techstart #ceo`,
  },

  // ============================================
  // VENDORS GROUP - GRANDCHILDREN
  // ============================================

  // Organization: CloudHost
  {
    ref: 'org-cloudhost',
    type: 'organization',
    title: 'CloudHost',
    parentRef: 'group-vendors',
    notes: `# CloudHost

**Type:** Infrastructure Vendor
**Service:** Cloud Hosting
**Website:** cloudhost.example.com

## Services Used

- Kubernetes hosting
- Managed databases
- CDN

## Monthly Spend

$15K/month

## Account Manager

Tom Davis

#vendor #infrastructure #cloud`,
  },

  // Organization: PixelPerfect
  {
    ref: 'org-pixelperfect',
    type: 'organization',
    title: 'PixelPerfect Agency',
    parentRef: 'group-vendors',
    notes: `# PixelPerfect Agency

**Type:** Design Agency
**Service:** Brand & Web Design
**Website:** pixelperfect.example.com

## Current Projects

- Website redesign
- Brand refresh

## Contract

Project-based, currently $50K engagement

#vendor #design #agency`,
  },

  // Organization: SecureAuth
  {
    ref: 'org-secureauth',
    type: 'organization',
    title: 'SecureAuth',
    parentRef: 'group-vendors',
    notes: `# SecureAuth

**Type:** Security Vendor
**Service:** Identity & Access Management
**Website:** secureauth.example.com

## Services Used

- SSO integration
- MFA provider
- Identity verification

## Annual Cost

$36K/year

#vendor #security #iam`,
  },

  // Person: Tom Davis (CloudHost contact)
  {
    ref: 'person-tom',
    type: 'person',
    title: 'Tom Davis',
    parentRef: 'org-cloudhost',
    notes: `# Tom Davis

**Role:** Account Manager at CloudHost
**Email:** tom.davis@cloudhost.example.com
**Phone:** 555-0123

## Notes

Very responsive. Good for escalations.
Quarterly business reviews scheduled.

#contact #vendor #cloudhost`,
  },

  // ============================================
  // GRAPHCORE FEATURES - CHILDREN
  // ============================================

  // Component: Graph View
  {
    ref: 'component-graph',
    type: 'component',
    title: 'Graph View',
    parentRef: 'topic-features',
    notes: `# Graph View Component

The graph view renders your nodes as an interactive force-directed graph.

## Technical Details

- Uses D3.js for force simulation
- WebGL acceleration for large graphs
- Supports up to 1000+ nodes smoothly

## Features

| Feature | Description |
|---------|-------------|
| Force Layout | Automatic positioning based on relationships |
| Manual Override | Drag nodes to custom positions |
| Zoom/Pan | Navigate large graphs |
| Link Visualization | See connections between nodes |

#component #graph #visualization`,
  },

  // Component: List View
  {
    ref: 'component-list',
    type: 'component',
    title: 'List View',
    parentRef: 'topic-features',
    notes: `# List View Component

The list/tree view shows nodes in a traditional hierarchical outline.

## Features

- **Expand/Collapse** - Click arrows to show/hide children
- **Inline Editing** - Double-click to edit titles
- **Drag Reorder** - Drag nodes to reorder within a level
- **Keyboard Navigation** - Full arrow key support
- **Multi-select** - Shift/Cmd click for multiple selection

#component #list #tree`,
  },

  // Component: Cards View
  {
    ref: 'component-cards',
    type: 'component',
    title: 'Cards View',
    parentRef: 'topic-features',
    notes: `# Cards View Component

Cards view displays nodes as visual cards in a responsive grid.

## Features

- **Visual scanning** - See many items at once
- **Color coding** - Cards inherit parent colors
- **Completion status** - Visual indicators for tasks
- **Hover preview** - Quick peek at notes

#component #cards #grid`,
  },

  // Event: Weekly Review
  {
    ref: 'event-review',
    type: 'event',
    title: 'Weekly Review',
    parentRef: 'topic-features',
    notes: `# Weekly Review

An example event node showing recurring activities.

## Suggested Weekly Review Agenda

1. Review completed tasks
2. Update project statuses
3. Plan next week's priorities
4. Clear inbox items
5. Archive old items

#event #recurring #review`,
  },

  // Note: Linking Nodes
  {
    ref: 'note-linking',
    type: 'note',
    title: 'Linking Nodes',
    parentRef: 'topic-features',
    notes: `# How to Link Nodes

Links create relationships between nodes without changing the hierarchy.

## Links vs Parent-Child

| Relationship | Use Case |
|--------------|----------|
| **Parent-Child** | "Contains" or "Part of" |
| **Link** | "Related to" or "References" |

## Creating Links

### Method 1: Keyboard
1. Select a node
2. Press \`Cmd/Ctrl + L\`
3. Search for target node
4. Press Enter to link

### Method 2: Context Menu
1. Right-click a node
2. Select "Link to..."
3. Choose target

#guide #links #relationships`,
  },

  // Topic: Workspaces
  {
    ref: 'topic-workspaces',
    type: 'topic',
    title: 'Workspaces',
    parentRef: 'topic-features',
    notes: `# Workspaces

Workspaces let you organize completely separate sets of nodes.

## Use Cases

- **Work vs Personal** - Keep work and personal items separate
- **Client Projects** - One workspace per client
- **Archive** - Move old projects to an archive workspace

## Workspace Features

- Each workspace has its own root-level nodes
- Switch workspaces from the dropdown in the header
- Workspaces can have custom colors and icons

#workspaces #organization`,
  },

  // Topic: Node Types
  {
    ref: 'topic-nodetypes',
    type: 'topic',
    title: 'Node Types Guide',
    parentRef: 'topic-features',
    notes: `# Node Types

GraphCore supports 10 different node types, each suited for different purposes.

## Action-Oriented Types

- **Task** - Individual work items
- **Project** - Collections of related tasks and milestones
- **Milestone** - Key checkpoints or deliverables

## People & Organizations

- **Person** - Individual contacts
- **Organization** - Companies, departments, teams
- **Group** - Containers for organizing related items

## Knowledge & Content

- **Note** - Freeform text and documentation
- **Topic** - Knowledge areas and reference material

## Structure & Events

- **Component** - Reusable elements or modules
- **Event** - Meetings, deadlines, activities

#guide #types`,
  },

  // ============================================
  // FEATURES - GRANDCHILDREN (under Graph View)
  // ============================================

  {
    ref: 'note-graph-controls',
    type: 'note',
    title: 'Graph Controls',
    parentRef: 'component-graph',
    notes: `# Graph View Controls

## Mouse Controls

- **Click** - Select node
- **Double-click** - Drill down
- **Drag node** - Reposition
- **Drag background** - Pan view
- **Scroll** - Zoom in/out
- **Right-click** - Context menu

## Keyboard

- **Arrow keys** - Navigate selection
- **Enter** - Drill down
- **Space** - Open detail panel

#graph #controls`,
  },

  {
    ref: 'note-graph-performance',
    type: 'note',
    title: 'Performance Tips',
    parentRef: 'component-graph',
    notes: `# Graph Performance

Tips for working with large graphs.

## Settings to Adjust

1. **Max Depth** - Reduce to show fewer levels
2. **Detail Threshold** - Hide details for large graphs
3. **Notes Preview** - Shorter previews = faster rendering

## Best Practices

- Drill down into sections rather than viewing everything
- Use "Collapse All" before navigating

#graph #performance #tips`,
  },

  // ============================================
  // PRODUCT LAUNCH PROJECT - CHILDREN
  // ============================================

  {
    ref: 'milestone-planning',
    type: 'milestone',
    title: 'Planning Complete',
    parentRef: 'project-launch',
    completed: true,
    notes: `# Planning Phase

Completed planning activities:

- [x] Market research
- [x] Feature prioritization
- [x] Resource allocation
- [x] Timeline finalized

#milestone #planning #complete`,
  },

  {
    ref: 'milestone-development',
    type: 'milestone',
    title: 'Development',
    parentRef: 'project-launch',
    notes: `# Development Phase

Current phase - building the product.

## Status

- Core features: 80% complete
- API integration: In progress
- Testing: Starting next week

#milestone #development`,
  },

  {
    ref: 'milestone-launch',
    type: 'milestone',
    title: 'Launch Day',
    parentRef: 'project-launch',
    notes: `# Launch Day

Target: End of Q2

## Launch Checklist

- [ ] Final QA sign-off
- [ ] Marketing materials ready
- [ ] Support team briefed
- [ ] Monitoring in place
- [ ] Rollback plan documented

#milestone #launch`,
  },

  // Task List: API v2
  {
    ref: 'task-api-v2',
    type: 'task',
    title: 'Complete API v2',
    parentRef: 'project-launch',
    importance: 1,
    notes: `# API v2 Migration

**Priority:** Critical
**Assigned:** Bob Martinez

## Requirements

- Backwards compatible
- 50% performance improvement
- Full OpenAPI documentation
- Rate limiting

#task #api #critical`,
  },

  // Task List: Onboarding
  {
    ref: 'task-onboarding',
    type: 'task',
    title: 'New user onboarding',
    parentRef: 'project-launch',
    importance: 2,
    notes: `# Onboarding Redesign

**Priority:** High
**Assigned:** Carol Johnson

## Goals

- Reduce time-to-value
- Increase activation rate
- Lower support tickets

#task #design #ux`,
  },

  // Task List: Marketing
  {
    ref: 'task-marketing-prep',
    type: 'task',
    title: 'Marketing preparation',
    parentRef: 'project-launch',
    importance: 2,
    notes: `# Marketing Prep

**Priority:** High
**Assigned:** Emma Wilson

## Deliverables

- Launch announcement
- Press kit
- Social media campaign
- Email sequence

#task #marketing`,
  },

  // Event: Launch Meeting
  {
    ref: 'event-launch-meeting',
    type: 'event',
    title: 'Weekly Launch Planning',
    parentRef: 'project-launch',
    notes: `# Weekly Launch Planning

**When:** Tuesdays at 10am
**Where:** Zoom
**Duration:** 1 hour

## Attendees

- Product: David
- Engineering: Alice, Bob
- Design: Carol
- Marketing: Emma

## Agenda

1. Status updates
2. Blockers
3. Next week priorities

#event #meeting #recurring`,
  },

  // ============================================
  // PRODUCT LAUNCH - GRANDCHILDREN (API v2 subtasks)
  // ============================================

  {
    ref: 'task-api-auth',
    type: 'task',
    title: 'Implement OAuth2',
    parentRef: 'task-api-v2',
    completed: true,
    notes: `# OAuth2 Implementation

- [x] Authorization code flow
- [x] Refresh tokens
- [x] Scope management
- [x] Token revocation

#task #auth #complete`,
  },

  {
    ref: 'task-api-endpoints',
    type: 'task',
    title: 'Migrate endpoints',
    parentRef: 'task-api-v2',
    notes: `# Endpoint Migration

## Endpoints to migrate

- [ ] /users (80%)
- [ ] /projects (100%)
- [ ] /tasks (50%)
- [ ] /reports (0%)

#task #api #migration`,
  },

  {
    ref: 'task-api-docs',
    type: 'task',
    title: 'Write API documentation',
    parentRef: 'task-api-v2',
    notes: `# API Documentation

Create comprehensive API docs using OpenAPI.

## Sections

- [ ] Authentication guide
- [ ] Endpoint reference
- [ ] Code examples (Python, JS, Go)
- [ ] Rate limiting info
- [ ] Changelog

#task #documentation`,
  },

  {
    ref: 'task-api-testing',
    type: 'task',
    title: 'Integration tests',
    parentRef: 'task-api-v2',
    notes: `# Integration Testing

## Coverage Goals

- 90% endpoint coverage
- All error cases
- Rate limiting behavior
- Concurrent access
- Performance benchmarks

#task #testing #qa`,
  },

  // ============================================
  // PRODUCT LAUNCH - GRANDCHILDREN (Onboarding subtasks)
  // ============================================

  {
    ref: 'task-onboarding-research',
    type: 'task',
    title: 'User research',
    parentRef: 'task-onboarding',
    completed: true,
    notes: `# User Research

- [x] Interviewed 10 new users
- [x] Identified pain points
- [x] Created user journey map
- [x] Documented findings

#task #research #complete`,
  },

  {
    ref: 'task-onboarding-wireframes',
    type: 'task',
    title: 'Create wireframes',
    parentRef: 'task-onboarding',
    completed: true,
    notes: `# Onboarding Wireframes

- [x] Welcome screen
- [x] Account setup
- [x] First project creation
- [x] Feature tour

#task #design #complete`,
  },

  {
    ref: 'task-onboarding-prototype',
    type: 'task',
    title: 'Build prototype',
    parentRef: 'task-onboarding',
    notes: `# Interactive Prototype

Build clickable prototype for user testing.

## Status

In progress using Figma.

## Next Steps

5 user testing sessions scheduled.

#task #design #prototype`,
  },

  {
    ref: 'task-onboarding-implement',
    type: 'task',
    title: 'Implement in app',
    parentRef: 'task-onboarding',
    notes: `# Implementation

Build the new onboarding flow in the app.

## Dependencies

- Prototype approval
- Engineering availability
- Copy finalized

#task #implementation`,
  },

  // ============================================
  // PRODUCT LAUNCH - GRANDCHILDREN (Marketing subtasks)
  // ============================================

  {
    ref: 'task-marketing-announcement',
    type: 'task',
    title: 'Draft announcement',
    parentRef: 'task-marketing-prep',
    notes: `# Launch Announcement

Draft the official launch announcement.

## Channels

- Blog post
- Email to customers
- Social media posts
- Press release

#task #marketing #content`,
  },

  {
    ref: 'task-marketing-presskit',
    type: 'task',
    title: 'Prepare press kit',
    parentRef: 'task-marketing-prep',
    notes: `# Press Kit

## Contents

- [ ] Company overview
- [ ] Product screenshots
- [ ] Executive bios
- [ ] Logo assets
- [ ] Fact sheet

#task #marketing #pr`,
  },

  {
    ref: 'task-marketing-email',
    type: 'task',
    title: 'Email campaign',
    parentRef: 'task-marketing-prep',
    notes: `# Email Campaign

## Sequence

1. Teaser (1 week before)
2. Launch day announcement
3. Feature highlights (day 3)
4. Early feedback request (day 7)

#task #marketing #email`,
  },

  // ============================================
  // WEBSITE PROJECT - CHILDREN
  // ============================================

  {
    ref: 'milestone-website-design',
    type: 'milestone',
    title: 'Design Approved',
    parentRef: 'project-website',
    completed: true,
    notes: `# Design Phase Complete

Final designs approved by stakeholders.

- [x] Homepage
- [x] Product pages
- [x] Pricing page
- [x] Blog templates
- [x] Mobile responsive designs

#milestone #design #complete`,
  },

  {
    ref: 'milestone-website-dev',
    type: 'milestone',
    title: 'Development',
    parentRef: 'project-website',
    notes: `# Development Phase

Currently building the new site.

## Tech Stack

- Next.js 14
- Tailwind CSS
- Contentful CMS
- Vercel hosting

#milestone #development`,
  },

  {
    ref: 'task-website-homepage',
    type: 'task',
    title: 'Build homepage',
    parentRef: 'project-website',
    completed: true,
    notes: `# Homepage Development

- [x] Hero section
- [x] Features grid
- [x] Testimonials
- [x] CTA sections
- [x] Footer

#task #website #complete`,
  },

  {
    ref: 'task-website-product',
    type: 'task',
    title: 'Build product pages',
    parentRef: 'project-website',
    notes: `# Product Pages

## Pages to build

- [ ] Product overview
- [ ] Features detail
- [ ] Integrations
- [ ] Security

#task #website`,
  },

  {
    ref: 'task-website-cms',
    type: 'task',
    title: 'CMS integration',
    parentRef: 'project-website',
    notes: `# CMS Setup

Set up Contentful for content management.

## Content Types

- [ ] Blog posts
- [ ] Case studies
- [ ] Team bios
- [ ] Changelog

#task #website #cms`,
  },

  // ============================================
  // WEBSITE PROJECT - GRANDCHILDREN
  // ============================================

  {
    ref: 'task-website-seo',
    type: 'task',
    title: 'SEO optimization',
    parentRef: 'task-website-product',
    notes: `# SEO Optimization

## Tasks

- [ ] Meta tags
- [ ] Schema markup
- [ ] Sitemap
- [ ] robots.txt
- [ ] Core Web Vitals

#task #seo`,
  },

  {
    ref: 'task-website-analytics',
    type: 'task',
    title: 'Analytics setup',
    parentRef: 'task-website-product',
    notes: `# Analytics

## Tools to set up

- [ ] Google Analytics 4
- [ ] Hotjar heatmaps
- [ ] Conversion tracking
- [ ] A/B testing framework

#task #analytics`,
  },
]

/**
 * Demo links between nodes (by reference).
 * Kept minimal to avoid cluttering the graph view.
 */
const demoLinksDefinition = [
  // Key project assignments (demonstrating people-to-work relationships)
  { sourceRef: 'person-alice', targetRef: 'project-launch' },
  { sourceRef: 'person-bob', targetRef: 'task-api-v2' },
  { sourceRef: 'person-carol', targetRef: 'project-website' },

  // Vendor relationship
  { sourceRef: 'org-pixelperfect', targetRef: 'project-website' },

  // Cross-reference example
  { sourceRef: 'note-tips', targetRef: 'task-shortcuts' },
]

/**
 * Check if the demo workspace already exists.
 * @param {Object} api - The API service
 * @returns {Promise<boolean>}
 */
export async function demoWorkspaceExists(api) {
  try {
    const workspaces = await api.getWorkspaces()
    return workspaces.some(ws => ws.id === DEMO_WORKSPACE_ID)
  } catch {
    return false
  }
}

/**
 * Delete the demo workspace if it exists.
 * @param {Object} api - The API service
 * @returns {Promise<boolean>} Whether deletion succeeded
 */
export async function deleteDemoWorkspace(api) {
  const exists = await demoWorkspaceExists(api)
  if (!exists) {
    return true
  }

  try {
    await api.deleteWorkspace(DEMO_WORKSPACE_ID)
    return true
  } catch {
    return false
  }
}

/**
 * Reset the demo workspace (delete and recreate).
 * @param {Object} api - The API service
 * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
 */
export async function resetDemoWorkspace(api) {
  // Delete existing demo workspace
  const deleted = await deleteDemoWorkspace(api)
  if (!deleted) {
    return { success: false, error: 'Failed to delete existing demo workspace' }
  }

  // Create fresh demo workspace
  return createDemoWorkspaceInternal(api)
}

/**
 * Create the demo workspace with sample nodes and links.
 * @param {Object} api - The API service
 * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
 */
export async function createDemoWorkspace(api) {
  // Check if demo workspace already exists
  const exists = await demoWorkspaceExists(api)
  if (exists) {
    return { success: false, error: 'Demo workspace already exists' }
  }

  return createDemoWorkspaceInternal(api)
}

/**
 * Internal function to create demo workspace (without existence check).
 */
async function createDemoWorkspaceInternal(api) {
  const createdNodeIds = new Map() // ref -> id

  try {
    // 1. Create workspace
    await api.createWorkspace({
      id: demoWorkspace.id,
      name: demoWorkspace.name,
      color: demoWorkspace.color,
      icon: demoWorkspace.icon,
    })

    // 2. Create nodes (in order to resolve parent refs)
    for (const nodeDef of demoNodesDefinition) {
      const parentId = nodeDef.parentRef ? createdNodeIds.get(nodeDef.parentRef) : null

      const nodeData = {
        type: nodeDef.type,
        title: nodeDef.title,
        notes: nodeDef.notes || '',
        workspace_id: DEMO_WORKSPACE_ID,
        parent_id: parentId,
        completed: nodeDef.completed || false,
        color: nodeDef.color || null,
        importance: nodeDef.importance || null,
        favorite: nodeDef.favorite || false,
      }

      const created = await api.createNode(nodeData)
      if (created?.id) {
        createdNodeIds.set(nodeDef.ref, created.id)
      }
    }

    // 3. Create links between nodes
    for (const linkDef of demoLinksDefinition) {
      const sourceId = createdNodeIds.get(linkDef.sourceRef)
      const targetId = createdNodeIds.get(linkDef.targetRef)

      if (sourceId && targetId) {
        await api.linkNodes(sourceId, targetId)
      }
    }

    return { success: true, workspaceId: DEMO_WORKSPACE_ID }
  } catch (error) {
    // Attempt cleanup on failure
    try {
      await api.deleteWorkspace(DEMO_WORKSPACE_ID)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: error.message || 'Failed to create demo workspace' }
  }
}
