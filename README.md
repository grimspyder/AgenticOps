# AgenticOps - Mission Control Dashboard

A centralized mission control dashboard for managing AI agents, projects, and tasks in real-time.

## Overview

AgenticOps provides a unified interface to:
- Track multiple projects and their progress
- Monitor AI agent status and activity
- Log agent tasks, outputs, and issues
- Coordinate agent workflows

## Features

- 📊 **Real-time project tracking** - Monitor project status, progress, and tasks
- 🤖 **Agent status monitoring** - See what each agent is working on
- 📋 **Task management** - Create, assign, and track tasks with priorities
- ⚡ **Activity feed** - Log of all actions and changes
- 🔔 **Issue tracking** - Monitor agent errors and blockers
- 🎯 **Progress visualization** - Visual progress bars and statistics

## Tech Stack

- **HTML5** - Semantic markup
- **CSS3** - Custom properties, Grid, Flexbox
- **JavaScript (ES6+)** - Vanilla JS, no frameworks
- **LocalStorage** - Data persistence

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/grimspyder/AgenticOps.git
   ```

2. Open the dashboard:
   ```bash
   # Simply open in browser
   open projects/mission-control/index.html
   
   # Or serve locally
   npx serve .
   ```

3. The dashboard will initialize with demo data on first load.

## Project Structure

```
projects/
├── .gitignore                 # Security-focused gitignore
├── README.md                  # This file
├── CONTRIBUTING.md            # Contribution guidelines
├── .github/
│   ├── workflows/
│   │   └── ci-cd.yml         # CI/CD pipeline
│   └── ISSUE_TEMPLATE/       # Issue templates
└── mission-control/
    ├── index.html            # Main dashboard
    ├── .gitignore
    └── assets/
        ├── data.js           # Data model & persistence
        └── app.js           # UI controller
```

## Data Model

### Projects
- Name, description, problem statement, solution
- Status (not_started, in_progress, completed, on_hold, blocked)
- Progress percentage
- Tasks list
- Owner, dates

### Tasks
- Title, description, status, priority
- Assignee (agent or human)
- Due date, dependencies
- Agent activity tracking

### Agents
- Name, role, capabilities
- Status (active, idle, error)
- Current task
- Activity logs
- Issue tracking
- Statistics (tasks completed, errors)

## Usage

### Creating a Project
1. Click **"+ New Project"** in the header
2. Fill in project details (name, description, problem, solution)
3. Set target end date and owner

### Adding Tasks
1. Click on a project card
2. Click **"+ Add Task"** in the project detail panel
3. Fill in task details and assign to an agent

### Tracking Agents
- Agent cards show current status and task
- Click on tasks to mark them complete
- Agents automatically update when tasks are done

### Data Persistence
All data is stored in your browser's **LocalStorage**. 
- Data persists between sessions
- Can be cleared by clearing browser data

## Security

- No sensitive data stored in repo
- Environment variables for API keys (future)
- Comprehensive `.gitignore` for security

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT
