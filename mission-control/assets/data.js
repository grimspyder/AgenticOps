/**
 * Mission Control Dashboard - Data Model
 * AgenticOps - Project & Agent Tracking
 */

const DataStore = {
    // ===================
    // Data Structure
    // ===================
    
    projects: [],
    agents: [],
    activities: [],
    taskHierarchy: [],  // Task assignment chain
    
    // ===================
    // Initialization
    // ===================
    
    init() {
        this.load();
        if (this.projects.length === 0) {
            this.seedDemoData();
        }
        // Ensure taskHierarchy exists
        if (!this.taskHierarchy) {
            this.taskHierarchy = [];
        }
    },
    
    // ===================
    // Persistence
    // ===================
    
    save() {
        localStorage.setItem('agenticops_data', JSON.stringify({
            projects: this.projects,
            agents: this.agents,
            activities: this.activities,
            taskHierarchy: this.taskHierarchy,
            lastUpdated: new Date().toISOString()
        }));
    },
    
    load() {
        const data = localStorage.getItem('agenticops_data');
        if (data) {
            const parsed = JSON.parse(data);
            this.projects = parsed.projects || [];
            this.agents = parsed.agents || [];
            this.activities = parsed.activities || [];
            this.taskHierarchy = parsed.taskHierarchy || [];
        }
    },
    
    // ===================
    // Project Notes (Agent Memory)
    // ===================
    
    addProjectNote(projectId, noteData) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;
        
        if (!project.notes) project.notes = [];
        
        const note = {
            id: this.generateId(),
            author: noteData.author || 'Unknown',
            authorRole: noteData.authorRole || 'agent',
            content: noteData.content,
            noteType: noteData.noteType || 'update', // update, progress, blocker, idea, summary
            relatedTaskId: noteData.relatedTaskId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        project.notes.push(note);
        project.updatedAt = new Date().toISOString();
        this.addActivity('note', 'created', `${note.author} added a note to ${project.name}`);
        this.save();
        
        return note;
    },
    
    updateProjectNote(projectId, noteId, content) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || !project.notes) return null;
        
        const note = project.notes.find(n => n.id === noteId);
        if (note) {
            note.content = content;
            note.updatedAt = new Date().toISOString();
            project.updatedAt = new Date().toISOString();
            this.save();
        }
        return note;
    },
    
    deleteProjectNote(projectId, noteId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project && project.notes) {
            project.notes = project.notes.filter(n => n.id !== noteId);
            this.save();
        }
    },
    
    // ===================
    // Project Message Board
    // ===================
    
    addProjectMessage(projectId, messageData) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;
        
        if (!project.messages) project.messages = [];
        
        const message = {
            id: this.generateId(),
            author: messageData.author || 'Unknown',
            authorRole: messageData.authorRole || 'agent',
            content: messageData.content,
            messageType: messageData.messageType || 'note', // issue, idea, note, question, discussion
            parentId: messageData.parentId || null, // for replies
            upvotes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        project.messages.push(message);
        project.updatedAt = new Date().toISOString();
        this.addActivity('message', 'posted', `${message.author} posted in ${project.name}: ${message.content.substring(0, 50)}...`);
        this.save();
        
        return message;
    },
    
    replyToMessage(projectId, messageId, replyData) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || !project.messages) return null;
        
        const parentMessage = project.messages.find(m => m.id === messageId);
        if (!parentMessage) return null;
        
        if (!parentMessage.replies) parentMessage.replies = [];
        
        const reply = {
            id: this.generateId(),
            author: replyData.author || 'Unknown',
            authorRole: replyData.authorRole || 'agent',
            content: replyData.content,
            createdAt: new Date().toISOString()
        };
        
        parentMessage.replies.push(reply);
        project.updatedAt = new Date().toISOString();
        this.addActivity('message', 'replied', `${reply.author} replied in ${project.name}`);
        this.save();
        
        return reply;
    },
    
    upvoteMessage(projectId, messageId, voter) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || !project.messages) return null;
        
        const message = project.messages.find(m => m.id === messageId);
        if (message) {
            if (!message.upvotes) message.upvotes = [];
            
            if (message.upvotes.includes(voter)) {
                // Remove upvote
                message.upvotes = message.upvotes.filter(v => v !== voter);
            } else {
                message.upvotes.push(voter);
            }
            this.save();
        }
        return message;
    },
    
    deleteProjectMessage(projectId, messageId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project && project.messages) {
            // Also delete replies
            const deleteMessageAndReplies = (msgs, id) => {
                msgs = msgs.filter(m => m.id !== id);
                msgs.forEach(m => {
                    if (m.replies) {
                        m.replies = m.replies.filter(r => r.id !== id);
                    }
                });
                return msgs;
            };
            project.messages = deleteMessageAndReplies(project.messages, messageId);
            this.save();
        }
    },
    
    // ===================
    // Project Methods
    // ===================
    
    createProject(projectData) {
        const project = {
            id: this.generateId(),
            name: projectData.name,
            description: projectData.description || '',
            problemStatement: projectData.problemStatement || '',
            solution: projectData.solution || '',
            plan: projectData.plan || [],
            status: 'not_started',
            progress: 0,
            startDate: projectData.startDate || new Date().toISOString().split('T')[0],
            targetEndDate: projectData.targetEndDate || '',
            owner: projectData.owner || '',
            tasks: [],
            notes: [],
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.projects.push(project);
        this.addActivity('project', 'created', `Created project: ${project.name}`);
        this.save();
        
        return project;
    },
    
    updateProject(projectId, updates) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            Object.assign(project, updates);
            project.updatedAt = new Date().toISOString();
            this.addActivity('project', 'updated', `Updated project: ${project.name}`);
            this.save();
        }
        return project;
    },
    
    deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        this.projects = this.projects.filter(p => p.id !== projectId);
        if (project) {
            this.addActivity('project', 'deleted', `Deleted project: ${project.name}`);
        }
        this.save();
    },
    
    getProject(projectId) {
        return this.projects.find(p => p.id === projectId);
    },
    
    getAllProjects() {
        return this.projects;
    },
    
    // ===================
    // Task Methods
    // ===================
    
    createTask(projectId, taskData) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;
        
        const task = {
            id: this.generateId(),
            projectId: projectId,
            title: taskData.title,
            description: taskData.description || '',
            status: 'pending',
            priority: taskData.priority || 'medium',
            assignee: taskData.assignee || '',
            dueDate: taskData.dueDate || '',
            dependencies: [],
            subTasks: [],
            agentActivity: {
                currentAction: '',
                logs: [],
                issues: []
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        project.tasks.push(task);
        project.updatedAt = new Date().toISOString();
        this.recalculateProgress(projectId);
        this.addActivity('task', 'created', `Created task: ${task.title}`);
        this.save();
        
        return task;
    },
    
    updateTask(projectId, taskId, updates) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;
        
        const task = project.tasks.find(t => t.id === taskId);
        if (task) {
            Object.assign(task, updates);
            task.updatedAt = new Date().toISOString();
            project.updatedAt = new Date().toISOString();
            
            if (updates.status) {
                this.addActivity('task', updates.status, `Task "${task.title}" marked as ${updates.status}`);
            }
            
            this.recalculateProgress(projectId);
            this.save();
        }
        return task;
    },
    
    deleteTask(projectId, taskId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.tasks = project.tasks.filter(t => t.id !== taskId);
            this.recalculateProgress(projectId);
            this.save();
        }
    },
    
    recalculateProgress(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || project.tasks.length === 0) {
            project.progress = 0;
            return;
        }
        
        const completedTasks = project.tasks.filter(t => t.status === 'done').length;
        project.progress = Math.round((completedTasks / project.tasks.length) * 100);
    },
    
    // ===================
    // Task Assignment Hierarchy
    // ===================
    
    /**
     * Assign a task to an agent with tracking of who assigned it
     * @param {string} taskId - The task ID
     * @param {string} assignedTo - Agent name to assign to
     * @param {string} assignedBy - Who made the assignment (Human, ATLAS, or agent name)
     * @param {string} parentTaskId - Optional parent task ID for hierarchy
     */
    assignTask(taskId, assignedTo, assignedBy, parentTaskId = null) {
        // Find the task across all projects
        let task = null;
        let projectId = null;
        
        for (const project of this.projects) {
            const found = project.tasks.find(t => t.id === taskId);
            if (found) {
                task = found;
                projectId = project.id;
                break;
            }
        }
        
        if (!task) return null;
        
        // Add assignment tracking to task
        const assignment = {
            id: this.generateId(),
            taskId: taskId,
            assignedTo: assignedTo,
            assignedBy: assignedBy,
            parentTaskId: parentTaskId,
            status: 'assigned',
            assignedAt: new Date().toISOString(),
            statusHistory: [
                {
                    status: 'pending',
                    changedAt: task.createdAt,
                    changedBy: 'system',
                    note: 'Task created'
                },
                {
                    status: 'assigned',
                    changedAt: new Date().toISOString(),
                    changedBy: assignedBy,
                    note: `Assigned to ${assignedTo}`
                }
            ],
            responses: [],
            currentAction: '',
            progress: 0
        };
        
        // Update task with assignment info
        task.assignee = assignedTo;
        task.assignedBy = assignedBy;
        task.parentTaskId = parentTaskId;
        task.assignment = assignment;
        task.status = 'assigned';
        
        // Add to hierarchy
        this.taskHierarchy.push(assignment);
        
        // Update agent status
        const agent = this.agents.find(a => a.name === assignedTo);
        if (agent) {
            this.assignTaskToAgent(agent.id, taskId, task.title);
        }
        
        this.addActivity('task', 'assigned', `${assignedBy} assigned "${task.title}" to ${assignedTo}`);
        this.save();
        
        return assignment;
    },
    
    /**
     * Agent reports progress on their task
     */
    reportProgress(taskId, agentName, progress, message, action = '') {
        // Find task
        let task = null;
        for (const project of this.projects) {
            const found = project.tasks.find(t => t.id === taskId);
            if (found) {
                task = found;
                break;
            }
        }
        
        if (!task || !task.assignment) return null;
        
        // Add response
        const response = {
            id: this.generateId(),
            agentName: agentName,
            message: message,
            progress: progress,
            action: action,
            timestamp: new Date().toISOString()
        };
        
        task.assignment.responses.push(response);
        task.assignment.currentAction = action || message;
        task.assignment.progress = progress;
        
        // Update status history if progress reached certain thresholds
        if (progress >= 100) {
            task.assignment.statusHistory.push({
                status: 'completed',
                changedAt: new Date().toISOString(),
                changedBy: agentName,
                note: message || 'Task completed'
            });
            task.status = 'done';
            task.assignment.status = 'completed';
        } else if (progress > 0 && task.status === 'assigned') {
            task.status = 'in_progress';
            task.assignment.status = 'in_progress';
        }
        
        // Log agent activity
        const agent = this.agents.find(a => a.name === agentName);
        if (agent) {
            this.logAgentActivity(agent.id, action || message, `Progress: ${progress}%`);
        }
        
        this.addActivity('task', 'progress', `${agentName} reported ${progress}% progress on "${task.title}": ${message}`);
        this.save();
        
        return response;
    },
    
    /**
     * Get task hierarchy view - shows all assignments in chain
     */
    getTaskHierarchy() {
        return this.taskHierarchy.map(entry => {
            let task = null;
            let projectName = '';
            
            for (const project of this.projects) {
                const found = project.tasks.find(t => t.id === entry.taskId);
                if (found) {
                    task = found;
                    projectName = project.name;
                    break;
                }
            }
            
            return {
                ...entry,
                taskTitle: task?.title || 'Unknown Task',
                projectName: projectName
            };
        });
    },
    
    /**
     * Get tasks assigned to a specific agent
     */
    getTasksForAgent(agentName) {
        const tasks = [];
        for (const project of this.projects) {
            for (const task of project.tasks) {
                if (task.assignee === agentName) {
                    tasks.push({
                        ...task,
                        projectName: project.name
                    });
                }
            }
        }
        return tasks;
    },
    
    /**
     * Get tasks assigned by a specific agent/person
     */
    getTasksAssignedBy(assignedBy) {
        const tasks = [];
        for (const project of this.projects) {
            for (const task of project.tasks) {
                if (task.assignedBy === assignedBy) {
                    tasks.push({
                        ...task,
                        projectName: project.name
                    });
                }
            }
        }
        return tasks;
    },
    
    /**
     * Get sub-tasks (tasks assigned by this task's assignee)
     */
    getSubTasks(taskId) {
        return this.taskHierarchy.filter(t => t.parentTaskId === taskId);
    },
    
    /**
     * Simulate agent working - for demo purposes
     */
    simulateAgentWork() {
        const activeAgents = this.agents.filter(a => a.status === 'active' && a.currentTaskId);
        
        for (const agent of activeAgents) {
            const taskId = agent.currentTaskId;
            
            // Find current progress
            let currentProgress = 0;
            for (const project of this.projects) {
                const task = project.tasks.find(t => t.id === taskId);
                if (task && task.assignment) {
                    currentProgress = task.assignment.progress || 0;
                    break;
                }
            }
            
            // Random progress increment (5-20%)
            const increment = Math.floor(Math.random() * 16) + 5;
            const newProgress = Math.min(100, currentProgress + increment);
            
            const actions = [
                'Analyzing requirements...',
                'Writing code...',
                'Running tests...',
                'Debugging...',
                'Refactoring...',
                'Reviewing documentation...',
                'Building components...',
                'Testing integration...',
                'Optimizing performance...',
                'Fixing edge cases...'
            ];
            
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            
            const messages = [
                'Making good progress!',
                'Almost done with this section.',
                'Found and fixed a tricky bug.',
                'Code is coming together nicely.',
                'Completed the main functionality.',
                'Working on edge cases now.',
                'Need to review some tests.',
                'All tests passing so far.'
            ];
            
            const randomMessage = messages[Math.floor(Math.random() * messages.length)];
            
            this.reportProgress(taskId, agent.name, newProgress, randomMessage, randomAction);
        }
    },
    
    // ===================
    // Agent Methods
    // ===================
    
    createAgent(agentData) {
        const agent = {
            id: this.generateId(),
            name: agentData.name,
            role: agentData.role || 'general',
            status: 'idle',
            currentTaskId: null,
            currentTaskTitle: '',
            capabilities: agentData.capabilities || [],
            model: agentData.model || '',
            totalTasksCompleted: 0,
            totalErrors: 0,
            issues: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.agents.push(agent);
        this.addActivity('agent', 'created', `New agent added: ${agent.name}`);
        this.save();
        
        return agent;
    },
    
    updateAgent(agentId, updates) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent) {
            const oldStatus = agent.status;
            Object.assign(agent, updates);
            agent.updatedAt = new Date().toISOString();
            
            if (updates.status && updates.status !== oldStatus) {
                this.addActivity('agent', updates.status, `Agent ${agent.name} is now ${updates.status}`);
            }
            
            this.save();
        }
        return agent;
    },
    
    assignTaskToAgent(agentId, taskId, taskTitle) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent) {
            agent.currentTaskId = taskId;
            agent.currentTaskTitle = taskTitle;
            agent.status = 'active';
            agent.updatedAt = new Date().toISOString();
            this.addActivity('agent', 'assigned', `${agent.name} assigned to: ${taskTitle}`);
            this.save();
        }
    },
    
    logAgentActivity(agentId, action, details) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent) {
            const log = {
                timestamp: new Date().toISOString(),
                action: action,
                details: details
            };
            
            if (!agent.agentActivity) {
                agent.agentActivity = { currentAction: '', logs: [], issues: [] };
            }
            
            agent.agentActivity.logs.push(log);
            agent.agentActivity.currentAction = action;
            agent.updatedAt = new Date().toISOString();
            this.save();
        }
    },
    
    logAgentIssue(agentId, issue, resolution = '') {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent) {
            const issueEntry = {
                timestamp: new Date().toISOString(),
                issue: issue,
                resolution: resolution,
                resolved: false
            };
            
            if (!agent.agentActivity) {
                agent.agentActivity = { currentAction: '', logs: [], issues: [] };
            }
            
            agent.agentActivity.issues.push(issueEntry);
            agent.totalErrors++;
            agent.updatedAt = new Date().toISOString();
            this.addActivity('agent', 'error', `${agent.name} encountered issue: ${issue}`);
            this.save();
        }
    },
    
    resolveAgentIssue(agentId, issueIndex, resolution) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent && agent.agentActivity && agent.agentActivity.issues[issueIndex]) {
            agent.agentActivity.issues[issueIndex].resolution = resolution;
            agent.agentActivity.issues[issueIndex].resolved = true;
            agent.agentActivity.issues[issueIndex].resolvedAt = new Date().toISOString();
            this.save();
        }
    },
    
    completeAgentTask(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (agent) {
            agent.totalTasksCompleted++;
            agent.currentTaskId = null;
            agent.currentTaskTitle = '';
            agent.status = 'idle';
            agent.updatedAt = new Date().toISOString();
            this.addActivity('agent', 'completed', `${agent.name} completed task`);
            this.save();
        }
    },
    
    // ===================
    // Activity Methods
    // ===================
    
    addActivity(type, action, details) {
        const activity = {
            id: this.generateId(),
            type: type,
            action: action,
            details: details,
            timestamp: new Date().toISOString()
        };
        
        this.activities.unshift(activity);
        
        // Keep only last 100 activities
        if (this.activities.length > 100) {
            this.activities = this.activities.slice(0, 100);
        }
        
        this.save();
    },
    
    getActivities(limit = 20) {
        return this.activities.slice(0, limit);
    },
    
    // ===================
    // Stats
    // ===================
    
    getStats() {
        const activeProjects = this.projects.filter(p => p.status === 'in_progress').length;
        const completedProjects = this.projects.filter(p => p.status === 'completed').length;
        
        const allTasks = this.projects.flatMap(p => p.tasks);
        const openTasks = allTasks.filter(t => t.status !== 'done').length;
        const completedTasks = allTasks.filter(t => t.status === 'done').length;
        
        const activeAgents = this.agents.filter(a => a.status === 'active').length;
        const idleAgents = this.agents.filter(a => a.status === 'idle').length;
        
        const totalIssues = this.agents.reduce((sum, a) => sum + (a.agentActivity?.issues?.length || 0), 0);
        const unresolvedIssues = this.agents.reduce((sum, a) => {
            return sum + (a.agentActivity?.issues?.filter(i => !i.resolved)?.length || 0);
        }, 0);
        
        return {
            projects: {
                total: this.projects.length,
                active: activeProjects,
                completed: completedProjects
            },
            tasks: {
                total: allTasks.length,
                open: openTasks,
                completed: completedTasks
            },
            agents: {
                total: this.agents.length,
                active: activeAgents,
                idle: idleAgents
            },
            issues: {
                total: totalIssues,
                unresolved: unresolvedIssues
            }
        };
    },
    
    // ===================
    // Demo Data
    // ===================
    
    seedDemoData() {
        // Create demo agents
        const codeWright = this.createAgent({
            name: 'CodeWright',
            role: 'coding',
            capabilities: ['full-stack', 'debugging', 'refactoring'],
            model: 'MiniMax-M2.1'
        });
        
        const researcher = this.createAgent({
            name: 'Researcher',
            role: 'research',
            capabilities: ['web-search', 'analysis', 'documentation'],
            model: 'MiniMax-M2.1'
        });
        
        const qaTester = this.createAgent({
            name: 'QA Tester',
            role: 'testing',
            capabilities: ['unit-tests', 'integration-tests', 'QA'],
            model: 'MiniMax-M2.1'
        });
        
        const atlas = this.createAgent({
            name: 'ATLAS',
            role: 'orchestration',
            capabilities: ['coordination', 'task-management', 'planning'],
            model: 'MiniMax-M2.1'
        });
        
        // Create Cost Monitor project
        const costMonitor = this.createProject({
            name: 'Cost Monitor',
            description: 'Track AI usage costs across all agents and sessions',
            problemStatement: 'Need a way to track and monitor AI costs across all agents and sessions to manage budget and optimize usage.',
            solution: 'Build a real-time dashboard that aggregates cost data from all OpenClaw agents, displays usage metrics, and provides alerts for budget thresholds.',
            plan: [
                'Research existing cost monitoring solutions',
                'Design data model for cost tracking',
                'Build UI dashboard',
                'Integrate with OpenClaw cost APIs',
                'Add alerting system'
            ],
            status: 'in_progress',
            targetEndDate: '2026-02-28',
            owner: 'ATLAS'
        });
        
        // Add demo notes to Cost Monitor
        this.addProjectNote(costMonitor.id, {
            author: 'CodeWright',
            authorRole: 'agent',
            content: 'Initial research complete. Found several approaches: (1) Use OpenClaw cost APIs directly, (2) Build middleware service, (3) Manual tracking with spreadsheet export. Recommend approach #1 for MVP.',
            noteType: 'summary'
        });
        
        this.addProjectNote(costMonitor.id, {
            author: 'CodeWright',
            authorRole: 'agent',
            content: 'Currently building the UI components. Progress is good - using vanilla JS with localStorage for persistence. Need to research OpenClaw cost API endpoints next.',
            noteType: 'progress'
        });
        
        this.addProjectNote(costMonitor.id, {
            author: 'ATLAS',
            authorRole: 'agent',
            content: 'Reminder: Need to add budget threshold alerts. Should notify when project reaches 80% of allocated budget.',
            noteType: 'idea'
        });
        
        // Add demo messages to Cost Monitor
        this.addProjectMessage(costMonitor.id, {
            author: 'CodeWright',
            authorRole: 'agent',
            content: 'I\'ve encountered an issue with the API rate limits. We need to implement caching or batching to avoid hitting limits. Any ideas?',
            messageType: 'issue'
        });
        
        this.addProjectMessage(costMonitor.id, {
            author: 'Researcher',
            authorRole: 'agent',
            content: 'I found that OpenClaw exposes cost data through the session status endpoint. We can poll that every minute and aggregate locally.',
            messageType: 'idea'
        });
        
        this.addProjectMessage(costMonitor.id, {
            author: 'ATLAS',
            authorRole: 'agent',
            content: 'Great find! Let\'s implement that approach. CodeWright - can you create a cost aggregation service based on Researcher\'s findings?',
            messageType: 'note'
        });
        
        // Add tasks to Cost Monitor
        this.createTask(costMonitor.id, {
            title: 'Research dashboard UX patterns',
            description: 'Analyze best practices for mission control dashboards',
            priority: 'high',
            assignee: 'Researcher',
            status: 'done'
        });
        
        this.createTask(costMonitor.id, {
            title: 'Design data model for cost tracking',
            description: 'Create JSON schema for cost data',
            priority: 'high',
            assignee: 'ATLAS',
            status: 'done'
        });
        
        this.createTask(costMonitor.id, {
            title: 'Build dashboard UI components',
            description: 'Create HTML/CSS/JS for the dashboard',
            priority: 'high',
            assignee: 'CodeWright',
            status: 'in_progress'
        });
        
        this.createTask(costMonitor.id, {
            title: 'Create cost aggregation service',
            description: 'Backend service to collect cost data from agents',
            priority: 'medium',
            assignee: 'CodeWright',
            status: 'pending'
        });
        
        this.createTask(costMonitor.id, {
            title: 'Integrate with OpenClaw APIs',
            description: 'Connect to OpenClaw cost tracking endpoints',
            priority: 'medium',
            assignee: '',
            status: 'pending'
        });
        
        // Log an issue for CodeWright
        this.logAgentIssue(codeWright.id, 'API rate limit exceeded');
        
        // Create Atlas Dashboard project
        const atlasDashboard = this.createProject({
            name: 'Atlas Dashboard',
            description: 'Mission control interface for managing AI operations',
            problemStatement: 'Need a centralized dashboard to monitor all AI agents, their tasks, and system health.',
            solution: 'Build a comprehensive dashboard with project tracking, agent monitoring, and real-time updates.',
            plan: [
                'Design dashboard wireframes',
                'Implement frontend UI',
                'Add real-time updates',
                'Integrate with OpenClaw',
                'Add agent coordination features'
            ],
            status: 'in_progress',
            targetEndDate: '2026-03-15',
            owner: 'ATLAS'
        });
        
        this.createTask(atlasDashboard.id, {
            title: 'Design dashboard wireframes',
            description: 'Create UI/UX mockups',
            priority: 'high',
            assignee: '',
            status: 'done'
        });
        
        this.createTask(atlasDashboard.id, {
            title: 'Implement frontend UI',
            description: 'Build HTML/CSS/JS interface',
            priority: 'high',
            assignee: '',
            status: 'in_progress'
        });
        
        // Create Voice Interface project
        this.createProject({
            name: 'Voice Interface',
            description: 'Natural language voice commands for agent control',
            problemStatement: 'Need ability to control agents via voice commands.',
            solution: 'Implement voice recognition and natural language processing.',
            plan: [
                'Research voice APIs',
                'Design voice command schema',
                'Implement voice capture',
                'Add NLP processing',
                'Integrate with agent system'
            ],
            status: 'not_started',
            targetEndDate: '',
            owner: ''
        });
        
        // Assign agents to current tasks
        this.assignTaskToAgent(codeWright.id, costMonitor.tasks[2].id, 'Build dashboard UI components');
        this.assignTaskToAgent(researcher.id, atlasDashboard.tasks[1].id, 'Implement frontend UI');
    },
    
    // ===================
    // Utility
    // ===================
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    
    clearAllData() {
        localStorage.removeItem('agenticops_data');
        this.projects = [];
        this.agents = [];
        this.activities = [];
        this.taskHierarchy = [];
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    DataStore.init();
});
