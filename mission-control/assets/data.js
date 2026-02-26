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
    
    // ===================
    // Initialization
    // ===================
    
    init() {
        this.load();
        if (this.projects.length === 0) {
            this.seedDemoData();
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
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    DataStore.init();
});
