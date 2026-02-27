/**
 * Mission Control Dashboard - API Client
 * Replaces localStorage DataStore with API calls
 */

// Use environment variable or default to Tailscale IP for remote access
const API_BASE = window.ENV?.API_URL || 'http://100.101.241.21:3001/api';

const ApiClient = {
  // ===================
  // Projects
  // ===================
  
  async getProjects() {
    const res = await fetch(`${API_BASE}/projects`);
    return res.json();
  },
  
  async getProject(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`);
    return res.json();
  },
  
  async createProject(data) {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async updateProject(projectId, data) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async deleteProject(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  // ===================
  // Tasks
  // ===================
  
  async getTasks(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`);
    return res.json();
  },
  
  async getTask(taskId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`);
    return res.json();
  },
  
  async createTask(projectId, data) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async updateTask(taskId, data) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async deleteTask(taskId) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  async assignTask(taskId, data) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async reportProgress(taskId, data) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  // ===================
  // Agents
  // ===================
  
  async getAgents() {
    const res = await fetch(`${API_BASE}/agents`);
    return res.json();
  },
  
  async getAgent(agentId) {
    const res = await fetch(`${API_BASE}/agents/${agentId}`);
    return res.json();
  },
  
  async createAgent(data) {
    const res = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async updateAgent(agentId, data) {
    const res = await fetch(`${API_BASE}/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async updateAgentStatus(agentId, data) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async deleteAgent(agentId) {
    const res = await fetch(`${API_BASE}/agents/${agentId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  async getAgentTasks(agentName) {
    const res = await fetch(`${API_BASE}/agents/${agentName}/tasks`);
    return res.json();
  },
  
  async logAgentActivity(agentId, data) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async logAgentIssue(agentId, data) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  // ===================
  // Notes
  // ===================
  
  async getNotes(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/notes`);
    return res.json();
  },
  
  async createNote(projectId, data) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async updateNote(projectId, noteId, data) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async deleteNote(projectId, noteId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/notes/${noteId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  // ===================
  // Messages
  // ===================
  
  async getMessages(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/messages`);
    return res.json();
  },
  
  async createMessage(projectId, data) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async upvoteMessage(projectId, messageId, voter) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/messages/${messageId}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voter })
    });
    return res.json();
  },
  
  async deleteMessage(projectId, messageId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/messages/${messageId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  // ===================
  // Activities
  // ===================
  
  async getActivities() {
    const res = await fetch(`${API_BASE}/activities`);
    return res.json();
  },
  
  // ===================
  // Task Hierarchy
  // ===================
  
  async getTaskHierarchy() {
    const res = await fetch(`${API_BASE}/task-hierarchy`);
    return res.json();
  },
  
  // ===================
  // OpenClaw Integration
  // ===================
  
  async getOpenClawHealth() {
    const res = await fetch(`${API_BASE}/openclaw/health`);
    return res.json();
  },
  
  async getOpenClawSessions() {
    const res = await fetch(`${API_BASE}/openclaw/sessions`);
    return res.json();
  },
  
  async assignTaskViaOpenClaw(taskId, agentName) {
    const res = await fetch(`${API_BASE}/openclaw/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, agentName })
    });
    return res.json();
  }
};

// Make it globally available
window.ApiClient = ApiClient;
