/**
 * Mission Control Dashboard - UI Controller
 * AgenticOps - Interactive Dashboard
 */

const App = {
    currentView: 'dashboard',
    selectedProject: null,
    
    // ===================
    // Initialization
    // ===================
    
    init() {
        this.render();
        this.bindEvents();
    },
    
    // ===================
    // Rendering
    // ===================
    
    render() {
        this.renderStats();
        this.renderProjects();
        this.renderAgents();
        this.renderActivity();
    },
    
    renderStats() {
        const stats = DataStore.getStats();
        
        document.getElementById('stat-projects').textContent = stats.projects.active;
        document.getElementById('stat-tasks').textContent = stats.tasks.open;
        document.getElementById('stat-agents').textContent = stats.agents.active;
        document.getElementById('stat-issues').textContent = stats.issues.unresolved;
    },
    
    renderProjects() {
        const container = document.getElementById('projects-grid');
        const projects = DataStore.getAllProjects();
        
        container.innerHTML = projects.map(project => {
            const taskCount = project.tasks.length;
            const doneCount = project.tasks.filter(t => t.status === 'done').length;
            const agentCount = [...new Set(project.tasks.map(t => t.assignee).filter(a => a))].length;
            const issueCount = project.tasks.filter(t => t.status === 'blocked').length;
            
            return `
                <div class="project-card" onclick="App.openProjectDetail('${project.id}')">
                    <div class="project-header">
                        <div>
                            <div class="project-name">${this.escapeHtml(project.name)}</div>
                            <div class="project-desc">${this.escapeHtml(project.description)}</div>
                        </div>
                        <span class="project-status status-${project.status}">${this.formatStatus(project.status)}</span>
                    </div>
                    <div class="project-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${project.progress}%"></div>
                        </div>
                        <div class="progress-text">
                            <span>${project.progress}% complete</span>
                            <span>${project.targetEndDate || 'TBD'}</span>
                        </div>
                    </div>
                    <div class="project-meta">
                        <div class="project-meta-item">📋 ${taskCount} tasks</div>
                        <div class="project-meta-item">🤖 ${agentCount} agents</div>
                        ${issueCount > 0 ? `<div class="project-meta-item">⚠️ ${issueCount} issues</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    renderAgents() {
        const container = document.getElementById('agents-grid');
        const agents = DataStore.agents;
        
        container.innerHTML = agents.map(agent => {
            const avatarInitials = agent.name.split(' ').map(n => n[0]).join('');
            const roleClass = agent.role.toLowerCase();
            const unresolvedIssues = agent.agentActivity?.issues?.filter(i => !i.resolved).length || 0;
            
            return `
                <div class="agent-card">
                    <div class="agent-header">
                        <div class="agent-avatar ${roleClass}">${avatarInitials}</div>
                        <div class="agent-info">
                            <div class="agent-name">${this.escapeHtml(agent.name)}</div>
                            <div class="agent-role">${this.formatRole(agent.role)}</div>
                        </div>
                        <div class="agent-status ${agent.status}" title="${agent.status}"></div>
                    </div>
                    <div class="agent-current-task">
                        <div class="agent-task-label">Currently Working On</div>
                        <div>${agent.currentTaskTitle || '<span style="color: var(--text-muted)">No active task</span>'}</div>
                    </div>
                    <div class="agent-stats">
                        <span class="agent-stat"><strong>${agent.totalTasksCompleted}</strong> tasks done</span>
                        <span class="agent-stat"><strong>${agent.totalErrors}</strong> errors</span>
                    </div>
                    ${unresolvedIssues > 0 ? `
                        <div class="agent-issues">
                            <span class="issue-badge">⚠️ ${unresolvedIssues} unresolved issue${unresolvedIssues > 1 ? 's' : ''}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },
    
    renderActivity() {
        const container = document.getElementById('activity-feed');
        const activities = DataStore.getActivities(10);
        
        container.innerHTML = activities.map(activity => {
            const iconClass = this.getActivityIcon(activity.type, activity.action);
            const icon = this.getActivityEmoji(activity.type, activity.action);
            
            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-text">${this.formatActivity(activity)}</div>
                        <div class="activity-time">${this.formatTime(activity.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (activities.length === 0) {
            container.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-text" style="color: var(--text-muted)">No recent activity</div></div></div>';
        }
    },
    
    // ===================
    // Project Detail
    // ===================
    
    openProjectDetail(projectId) {
        const project = DataStore.getProject(projectId);
        if (!project) return;
        
        this.selectedProject = project;
        
        // Update detail panel
        document.getElementById('detail-title').textContent = project.name;
        document.getElementById('detail-problem').textContent = project.problemStatement || 'No problem statement defined.';
        document.getElementById('detail-solution').textContent = project.solution || 'No solution defined.';
        
        // Render plan
        const planList = document.getElementById('detail-plan');
        if (project.plan && project.plan.length > 0) {
            planList.innerHTML = project.plan.map(step => `<li>${this.escapeHtml(step)}</li>`).join('');
        } else {
            planList.innerHTML = '<li style="color: var(--text-muted)">No plan defined.</li>';
        }
        
        // Render tasks
        this.renderProjectTasks(project);
        
        // Render notes
        this.renderProjectNotes(project);
        
        // Render messages
        this.renderProjectMessages(project);
        
        // Show panel
        document.getElementById('detailPanel').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
    },
    
    closeProjectDetail() {
        document.getElementById('detailPanel').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        this.selectedProject = null;
    },
    
    renderProjectTasks(project) {
        const container = document.getElementById('detail-tasks');
        const taskCount = document.getElementById('detail-task-count');
        
        taskCount.textContent = `Tasks (${project.tasks.length})`;
        
        container.innerHTML = project.tasks.map(task => {
            const priorityClass = `priority-${task.priority}`;
            const isChecked = task.status === 'done';
            
            return `
                <div class="task-item" onclick="event.stopPropagation(); App.toggleTask('${project.id}', '${task.id}')">
                    <div class="task-checkbox ${isChecked ? 'checked' : ''}" onclick="event.stopPropagation(); App.toggleTask('${project.id}', '${task.id}')">
                        ${isChecked ? '✓' : ''}
                    </div>
                    <div class="task-info">
                        <div class="task-title" style="${isChecked ? 'text-decoration: line-through; color: var(--text-muted)' : ''}">${this.escapeHtml(task.title)}</div>
                        <div class="task-meta">
                            <span>${task.assignee || 'Unassigned'}</span>
                            <span>${this.formatStatus(task.status)}</span>
                        </div>
                    </div>
                    <span class="task-priority ${priorityClass}">${task.priority}</span>
                </div>
            `;
        }).join('');
        
        if (project.tasks.length === 0) {
            container.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No tasks yet. Add one below.</div>';
        }
    },
    
    // ===================
    // Project Notes
    // ===================
    
    renderProjectNotes(project) {
        const container = document.getElementById('detail-notes');
        const notesCount = document.getElementById('detail-notes-count');
        const notes = project.notes || [];
        
        notesCount.textContent = `Agent Notes (${notes.length})`;
        
        container.innerHTML = notes.map(note => {
            const noteTypeClass = this.getNoteTypeClass(note.noteType);
            const noteTypeLabel = this.getNoteTypeLabel(note.noteType);
            
            return `
                <div class="note-item">
                    <div class="note-header">
                        <div class="note-author">
                            <span class="note-avatar">${note.author.split(' ').map(n => n[0]).join('')}</span>
                            <span>${this.escapeHtml(note.author)}</span>
                        </div>
                        <span class="note-type ${noteTypeClass}">${noteTypeLabel}</span>
                    </div>
                    <div class="note-content">${this.escapeHtml(note.content)}</div>
                    <div class="note-time">${this.formatTime(note.createdAt)}</div>
                </div>
            `;
        }).join('');
        
        if (notes.length === 0) {
            container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); text-align: center; font-size: 13px;">No notes yet. Agents can add notes to track progress.</div>';
        }
    },
    
    getNoteTypeClass(noteType) {
        const types = {
            'update': 'type-update',
            'progress': 'type-progress',
            'blocker': 'type-blocker',
            'idea': 'type-idea',
            'summary': 'type-summary'
        };
        return types[noteType] || 'type-update';
    },
    
    getNoteTypeLabel(noteType) {
        const labels = {
            'update': 'Update',
            'progress': 'Progress',
            'blocker': 'Blocker',
            'idea': 'Idea',
            'summary': 'Summary'
        };
        return labels[noteType] || 'Note';
    },
    
    // ===================
    // Project Messages
    // ===================
    
    renderProjectMessages(project) {
        const container = document.getElementById('detail-messages');
        const messagesCount = document.getElementById('detail-messages-count');
        const messages = project.messages || [];
        
        messagesCount.textContent = `Discussion (${messages.length})`;
        
        container.innerHTML = messages.map(message => {
            const msgTypeClass = this.getMessageTypeClass(message.messageType);
            const msgTypeLabel = this.getMessageTypeLabel(message.messageType);
            const replies = message.replies || [];
            
            return `
                <div class="message-item">
                    <div class="message-header">
                        <div class="message-author">
                            <span class="message-avatar">${message.author.split(' ').map(n => n[0]).join('')}</span>
                            <span>${this.escapeHtml(message.author)}</span>
                        </div>
                        <span class="message-type ${msgTypeClass}">${msgTypeLabel}</span>
                    </div>
                    <div class="message-content">${this.escapeHtml(message.content)}</div>
                    <div class="message-footer">
                        <span class="message-time">${this.formatTime(message.createdAt)}</span>
                        <div class="message-actions">
                            <button class="message-action-btn" onclick="App.openReplyModal('${message.id}')">💬 Reply</button>
                            <button class="message-action-btn" onclick="App.upvoteMessage('${project.id}', '${message.id}')">
                                👍 ${message.upvotes?.length || 0}
                            </button>
                        </div>
                    </div>
                    ${replies.length > 0 ? `
                        <div class="message-replies">
                            ${replies.map(reply => `
                                <div class="reply-item">
                                    <div class="reply-author">${this.escapeHtml(reply.author)}</div>
                                    <div class="reply-content">${this.escapeHtml(reply.content)}</div>
                                    <div class="reply-time">${this.formatTime(reply.createdAt)}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        if (messages.length === 0) {
            container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); text-align: center; font-size: 13px;">No messages yet. Start a discussion!</div>';
        }
    },
    
    getMessageTypeClass(messageType) {
        const types = {
            'issue': 'msg-issue',
            'idea': 'msg-idea',
            'note': 'msg-note',
            'question': 'msg-question',
            'discussion': 'msg-discussion'
        };
        return types[messageType] || 'msg-note';
    },
    
    getMessageTypeLabel(messageType) {
        const labels = {
            'issue': 'Issue',
            'idea': 'Idea',
            'note': 'Note',
            'question': 'Question',
            'discussion': 'Discussion'
        };
        return labels[messageType] || 'Message';
    },
    
    // ===================
    // Actions
    // ===================
    
    toggleTask(projectId, taskId) {
        const project = DataStore.getProject(projectId);
        const task = project.tasks.find(t => t.id === taskId);
        
        if (task.status === 'done') {
            DataStore.updateTask(projectId, taskId, { status: 'pending' });
        } else {
            DataStore.updateTask(projectId, taskId, { status: 'done' });
            
            // If assigned to agent, complete the task
            const agent = DataStore.agents.find(a => a.currentTaskId === taskId);
            if (agent) {
                DataStore.completeAgentTask(agent.id);
            }
        }
        
        this.render();
        if (this.selectedProject && this.selectedProject.id === projectId) {
            this.openProjectDetail(projectId);
        }
    },
    
    // ===================
    // Forms & Modals
    // ===================
    
    openNewProjectModal() {
        document.getElementById('newProjectModal').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
    },
    
    closeNewProjectModal() {
        document.getElementById('newProjectModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('newProjectForm').reset();
    },
    
    saveNewProject() {
        const form = document.getElementById('newProjectForm');
        const formData = new FormData(form);
        
        DataStore.createProject({
            name: formData.get('name'),
            description: formData.get('description'),
            problemStatement: formData.get('problemStatement'),
            solution: formData.get('solution'),
            targetEndDate: formData.get('targetEndDate'),
            owner: formData.get('owner')
        });
        
        this.closeNewProjectModal();
        this.render();
    },
    
    openNewTaskModal() {
        if (!this.selectedProject) return;
        document.getElementById('newTaskModal').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
        
        // Populate assignee dropdown
        const select = document.getElementById('taskAssignee');
        select.innerHTML = '<option value="">Unassigned</option>' +
            DataStore.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
    },
    
    closeNewTaskModal() {
        document.getElementById('newTaskModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('newTaskForm').reset();
    },
    
    saveNewTask() {
        if (!this.selectedProject) return;
        
        const form = document.getElementById('newTaskForm');
        const formData = new FormData(form);
        
        DataStore.createTask(this.selectedProject.id, {
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            assignee: formData.get('assignee'),
            dueDate: formData.get('dueDate')
        });
        
        this.closeNewTaskModal();
        this.openProjectDetail(this.selectedProject.id);
        this.render();
    },
    
    // ===================
    // Notes Modals & Actions
    // ===================
    
    openNewNoteModal() {
        if (!this.selectedProject) return;
        document.getElementById('newNoteModal').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
        
        // Populate author dropdown with agents
        const select = document.getElementById('noteAuthor');
        select.innerHTML = DataStore.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('') +
            '<option value="Human">Human</option>';
    },
    
    closeNewNoteModal() {
        document.getElementById('newNoteModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('newNoteForm').reset();
    },
    
    saveNewNote() {
        if (!this.selectedProject) return;
        
        const form = document.getElementById('newNoteForm');
        const formData = new FormData(form);
        
        DataStore.addProjectNote(this.selectedProject.id, {
            author: formData.get('author'),
            authorRole: 'agent',
            content: formData.get('content'),
            noteType: formData.get('noteType')
        });
        
        this.closeNewNoteModal();
        this.openProjectDetail(this.selectedProject.id);
        this.render();
    },
    
    // ===================
    // Messages Modals & Actions
    // ===================
    
    openNewMessageModal() {
        if (!this.selectedProject) return;
        document.getElementById('newMessageModal').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
        
        // Populate author dropdown with agents
        const select = document.getElementById('messageAuthor');
        select.innerHTML = DataStore.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('') +
            '<option value="Human">Human</option>';
    },
    
    closeNewMessageModal() {
        document.getElementById('newMessageModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('newMessageForm').reset();
    },
    
    saveNewMessage() {
        if (!this.selectedProject) return;
        
        const form = document.getElementById('newMessageForm');
        const formData = new FormData(form);
        
        DataStore.addProjectMessage(this.selectedProject.id, {
            author: formData.get('author'),
            authorRole: 'agent',
            content: formData.get('content'),
            messageType: formData.get('messageType')
        });
        
        this.closeNewMessageModal();
        this.openProjectDetail(this.selectedProject.id);
        this.render();
    },
    
    openReplyModal(messageId) {
        if (!this.selectedProject) return;
        document.getElementById('replyMessageId').value = messageId;
        document.getElementById('replyAuthor').innerHTML = DataStore.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('') +
            '<option value="Human">Human</option>';
        document.getElementById('replyModal').classList.add('open');
        document.getElementById('modalOverlay').classList.add('open');
    },
    
    closeReplyModal() {
        document.getElementById('replyModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('replyForm').reset();
    },
    
    saveReply() {
        if (!this.selectedProject) return;
        
        const messageId = document.getElementById('replyMessageId').value;
        const form = document.getElementById('replyForm');
        const formData = new FormData(form);
        
        DataStore.replyToMessage(this.selectedProject.id, messageId, {
            author: formData.get('author'),
            authorRole: 'agent',
            content: formData.get('content')
        });
        
        this.closeReplyModal();
        this.openProjectDetail(this.selectedProject.id);
        this.render();
    },
    
    upvoteMessage(projectId, messageId) {
        DataStore.upvoteMessage(projectId, messageId, 'CurrentUser');
        const project = DataStore.getProject(projectId);
        if (project) {
            this.openProjectDetail(projectId);
        }
        this.render();
    },
    
    // ===================
    // Event Binding
    // ===================
    
    bindEvents() {
        // Close panels on overlay click
        document.getElementById('modalOverlay').addEventListener('click', () => {
            this.closeProjectDetail();
            this.closeNewProjectModal();
            this.closeNewTaskModal();
            this.closeNewNoteModal();
            this.closeNewMessageModal();
            this.closeReplyModal();
        });
        
        // Form submissions
        document.getElementById('newProjectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewProject();
        });
        
        document.getElementById('newTaskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewTask();
        });
        
        document.getElementById('newNoteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewNote();
        });
        
        document.getElementById('newMessageForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewMessage();
        });
        
        document.getElementById('replyForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveReply();
        });
        
        // Close buttons
        document.querySelectorAll('.detail-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeProjectDetail());
        });
        
        // Nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            });
        });
    },
    
    // ===================
    // Utilities
    // ===================
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatStatus(status) {
        const statusMap = {
            'not_started': 'Not Started',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'on_hold': 'On Hold',
            'blocked': 'Blocked',
            'pending': 'Pending',
            'done': 'Done',
            'deferred': 'Deferred'
        };
        return statusMap[status] || status;
    },
    
    formatRole(role) {
        const roleMap = {
            'coding': 'Coding Agent',
            'research': 'Research Agent',
            'testing': 'Testing Agent',
            'orchestration': 'Orchestration Agent',
            'general': 'General Agent'
        };
        return roleMap[role] || role;
    },
    
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        return `${days} day${days > 1 ? 's' : ''} ago`;
    },
    
    getActivityIcon(type, action) {
        if (action === 'error') return 'error';
        if (type === 'task' && action === 'done') return 'complete';
        return 'code';
    },
    
    getActivityEmoji(type, action) {
        if (action === 'created') return '✨';
        if (action === 'updated') return '📝';
        if (action === 'deleted') return '🗑️';
        if (action === 'error') return '⚠️';
        if (action === 'done' || action === 'completed') return '✓';
        if (action === 'active') return '⚡';
        if (action === 'idle') return '💤';
        if (action === 'assigned') return '→';
        return '•';
    },
    
    formatActivity(activity) {
        return activity.details;
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
