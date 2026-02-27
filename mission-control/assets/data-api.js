/**
 * Mission Control Dashboard - DataStore API Bridge
 * Provides the same interface as the original DataStore but uses API
 */

const DataStore = {
  projects: [],
  agents: [],
  activities: [],
  taskHierarchy: [],
  
  // ===================
  // Initialization
  // ===================
  
  async init() {
    await this.load();
    if (this.projects.length === 0) {
      console.log('No projects found in API - database may need seeding');
    }
  },
  
  async load() {
    try {
      this.projects = await ApiClient.getProjects();
      this.agents = await ApiClient.getAgents();
      this.activities = await ApiClient.getActivities();
      this.taskHierarchy = await ApiClient.getTaskHierarchy();
    } catch (error) {
      console.error('Failed to load from API:', error);
      this.projects = [];
      this.agents = [];
      this.activities = [];
      this.taskHierarchy = [];
    }
  },
  
  // For compatibility - save is no-op since we use API
  save() {
    console.log('Data is persisted via API - no local save needed');
  },
  
  // Generate UUID
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  
  // ===================
  // Project Notes
  // ===================
  
  async addProjectNote(projectId, noteData) {
    const note = await ApiClient.createNote(projectId, {
      author: noteData.author || 'Unknown',
      authorRole: noteData.authorRole || 'agent',
      content: noteData.content,
      noteType: noteData.noteType || 'update',
      relatedTaskId: noteData.relatedTaskId || null
    });
    await this.load(); // Refresh data
    return note;
  },
  
  async updateProjectNote(projectId, noteId, content) {
    const note = await ApiClient.updateNote(projectId, noteId, { content });
    await this.load();
    return note;
  },
  
  async deleteProjectNote(projectId, noteId) {
    await ApiClient.deleteNote(projectId, noteId);
    await this.load();
  },
  
  // ===================
  // Project Messages
  // ===================
  
  async addProjectMessage(projectId, messageData) {
    const message = await ApiClient.createMessage(projectId, {
      author: messageData.author || 'Unknown',
      authorRole: messageData.authorRole || 'agent',
      content: messageData.content,
      messageType: messageData.messageType || 'note',
      parentId: messageData.parentId || null
    });
    await this.load();
    return message;
  },
  
  async replyToMessage(projectId, messageId, replyData) {
    // Not directly supported by API - would need thread support
    console.log('Reply to message not implemented in API');
    return null;
  },
  
  async upvoteMessage(projectId, messageId, voter) {
    const message = await ApiClient.upvoteMessage(projectId, messageId, voter);
    await this.load();
    return message;
  },
  
  async deleteProjectMessage(projectId, messageId) {
    await ApiClient.deleteMessage(projectId, messageId);
    await this.load();
  },
  
  // ===================
  // Projects
  // ===================
  
  async createProject(projectData) {
    const project = await ApiClient.createProject(projectData);
    await this.load();
    return project;
  },
  
  async updateProject(projectId, updates) {
    const project = await ApiClient.updateProject(projectId, updates);
    await this.load();
    return project;
  },
  
  async deleteProject(projectId) {
    await ApiClient.deleteProject(projectId);
    await this.load();
  },
  
  getProject(projectId) {
    return this.projects.find(p => p.id === projectId);
  },
  
  getAllProjects() {
    return this.projects;
  },
  
  // ===================
  // Tasks
  // ===================
  
  async createTask(projectId, taskData) {
    const task = await ApiClient.createTask(projectId, taskData);
    await this.load();
    return task;
  },
  
  async updateTask(projectId, taskId, updates) {
    const task = await ApiClient.updateTask(taskId, updates);
    await this.load();
    return task;
  },
  
  async deleteTask(projectId, taskId) {
    await ApiClient.deleteTask(taskId);
    await this.load();
  },
  
  recalculateProgress(projectId) {
    // Handled by API on task updates
    this.load();
  },
  
  // ===================
  // Task Assignment
  // ===================
  
  async assignTask(taskId, assignedTo, assignedBy, parentTaskId = null) {
    const assignment = await ApiClient.assignTask(taskId, {
      assignedTo,
      assignedBy,
      parentTaskId
    });
    await this.load();
    return assignment;
  },
  
  async reportProgress(taskId, agentName, progress, message, action = '') {
    const response = await ApiClient.reportProgress(taskId, {
      agentName,
      progress,
      message,
      action
    });
    await this.load();
    return response;
  },
  
  getTaskHierarchy() {
    return this.taskHierarchy;
  },
  
  getTasksForAgent(agentName) {
    const tasks = [];
    for (const project of this.projects) {
      for (const task of (project.tasks || [])) {
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
  
  getTasksAssignedBy(assignedBy) {
    const tasks = [];
    for (const project of this.projects) {
      for (const task of (project.tasks || [])) {
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
  
  getSubTasks(taskId) {
    return this.taskHierarchy.filter(t => t.parentTaskId === taskId);
  },
  
  // ===================
  // Simulation (for demo)
  // ===================
  
  simulateAgentWork() {
    // Simulate agent work - updates via API would happen here
    console.log('Agent simulation not implemented with API backend');
  },
  
  // ===================
  // Agents
  // ===================
  
  async createAgent(agentData) {
    const agent = await ApiClient.createAgent(agentData);
    await this.load();
    return agent;
  },
  
  async updateAgent(agentId, updates) {
    const agent = await ApiClient.updateAgent(agentId, updates);
    await this.load();
    return agent;
  },
  
  async assignTaskToAgent(agentId, taskId, taskTitle) {
    const agent = await ApiClient.updateAgentStatus(agentId, {
      status: 'active',
      currentTaskId: taskId,
      currentTaskTitle: taskTitle
    });
    await this.load();
    return agent;
  },
  
  async logAgentActivity(agentId, action, details) {
    await ApiClient.logAgentActivity(agentId, { action, details });
    await this.load();
  },
  
  async logAgentIssue(agentId, issue, resolution = '') {
    await ApiClient.logAgentIssue(agentId, { issue, resolution });
    await this.load();
  },
  
  async resolveAgentIssue(agentId, issueIndex, resolution) {
    // Would need API endpoint for this
    console.log('Resolve agent issue not implemented');
    await this.load();
  },
  
  completeAgentTask(agentId) {
    // Mark agent as idle after task completion
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      this.updateAgent(agentId, {
        status: 'idle',
        currentTaskId: null,
        currentTaskTitle: '',
        totalTasksCompleted: (agent.totalTasksCompleted || 0) + 1
      });
    }
  },
  
  // ===================
  // Activities
  // ===================
  
  getActivities(limit = 10) {
    return this.activities.slice(0, limit);
  },
  
  async addActivity(type, action, description) {
    // Activities are created automatically by API on relevant actions
    await this.load();
  },
  
  // ===================
  // Stats
  // ===================
  
  getStats() {
    let totalTasks = 0;
    let completedTasks = 0;
    let openTasks = 0;
    
    for (const project of this.projects) {
      const tasks = project.tasks || [];
      totalTasks += tasks.length;
      completedTasks += tasks.filter(t => t.status === 'done').length;
      openTasks += tasks.filter(t => t.status !== 'done').length;
    }
    
    const activeAgents = this.agents.filter(a => a.status === 'active').length;
    
    // Return structure matching what app.js expects
    return {
      projects: {
        total: this.projects.length,
        active: this.projects.filter(p => p.status === 'in_progress').length
      },
      tasks: {
        total: totalTasks,
        open: openTasks,
        completed: completedTasks
      },
      agents: {
        total: this.agents.length,
        active: activeAgents
      },
      issues: {
        total: 0,
        unresolved: 0
      }
    };
  }
};

// Make it globally available
window.DataStore = DataStore;
