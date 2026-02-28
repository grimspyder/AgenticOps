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
    
    async init() {
        try {
            // Show loading state
            document.getElementById('stat-projects').textContent = '...';
            document.getElementById('stat-tasks').textContent = '...';
            document.getElementById('stat-agents').textContent = '...';
            document.getElementById('stat-issues').textContent = '...';
            
            // Initialize DataStore from API (async)
            await DataStore.init();
            this.render();
            this.bindEvents();
            this.startLiveTracking();
            
            // Check OpenClaw connection status
            this.checkOpenClawStatus();
            
            console.log('Dashboard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            document.getElementById('projects-grid').innerHTML = 
                '<div style="padding: 40px; text-align: center; color: var(--accent-red);">' +
                '<h3>Failed to load dashboard</h3>' +
                '<p>' + error.message + '</p>' +
                '<button onclick="location.reload()" class="btn btn-primary" style="margin-top: 20px;">Retry</button>' +
                '</div>';
        }
    },
    
    // ===================
    // OpenClaw Status
    // ===================
    
    async checkOpenClawStatus() {
        const indicator = document.getElementById('oc-connection-indicator');
        if (!indicator) return;
        
        try {
            const health = await ApiClient.getOpenClawHealth();
            if (health.openclaw === 'connected') {
                indicator.textContent = '🦞 Connected';
                indicator.className = 'ws-connection-indicator ws-connected';
                indicator.style.color = '#4caf50';
            } else {
                indicator.textContent = '🦞 Disconnected';
                indicator.className = 'ws-connection-indicator ws-disconnected';
            }
        } catch (err) {
            indicator.textContent = '🦞 Offline';
            indicator.className = 'ws-connection-indicator ws-disconnected';
        }
        
        // Refresh OpenClaw agents periodically
        setInterval(() => {
            this.checkOpenClawStatus();
            DataStore.load().then(() => this.render());
        }, 30000);
    },
    
    // ===================
    // Live Tracking (WebSocket)
    // ===================
    
    startLiveTracking() {
        // Set up WebSocket event listeners for real-time updates
        
        // Agent connected
        WebSocketClient.on('agent:connected', (data) => {
            console.log('Agent connected:', data);
            this.showNotification(`${data.name} connected`, 'success');
            DataStore.load().then(() => this.render());
        });
        
        // Agent disconnected
        WebSocketClient.on('agent:disconnected', (data) => {
            console.log('Agent disconnected:', data);
            this.showNotification(`${data.name} disconnected`, 'warning');
            DataStore.load().then(() => this.render());
        });
        
        // Agent status update
        WebSocketClient.on('agent:status:update', (data) => {
            console.log('Agent status update:', data);
            DataStore.load().then(() => this.render());
        });
        
        // Task progress update
        WebSocketClient.on('task:progress:update', (data) => {
            console.log('Task progress:', data);
            this.showNotification(`Task progress: ${data.progress}% - ${data.message}`, 'info');
            DataStore.load().then(() => this.render());
        });
        
        // Task completed
        WebSocketClient.on('task:completed', (data) => {
            console.log('Task completed:', data);
            this.showNotification('Task completed! 🎉', 'success');
            DataStore.load().then(() => this.render());
        });
        
        // Dashboard state received (initial sync)
        WebSocketClient.on('dashboard:state', (data) => {
            console.log('Dashboard state received:', data);
            DataStore.agents = data.agents || DataStore.agents;
            DataStore.load().then(() => this.render());
        });
        
        // Activity update
        WebSocketClient.on('activity:new', (data) => {
            console.log('New activity:', data);
            DataStore.load().then(() => this.render());
        });
        
        // Connection status
        WebSocketClient.on('connected', () => {
            console.log('WebSocket connected - real-time updates active');
            this.showNotification('Real-time updates connected', 'success');
        });
        
        WebSocketClient.on('disconnected', () => {
            console.log('WebSocket disconnected - using fallback polling');
            this.showNotification('Reconnecting to real-time updates...', 'warning');
        });
        
        // Fallback: Also keep polling as backup (every 30 seconds)
        // This ensures we still get updates if WebSocket fails
        setInterval(() => {
            if (!WebSocketClient.isConnected) {
                console.log('Polling fallback: refreshing data');
                DataStore.load().then(() => this.render());
            }
        }, 30000);
        
    },
    
    // ===================
    // Rendering
    // ===================
    
    render() {
        this.renderStats();
        this.showView(this.currentView);
    },
    
    renderStats() {
        const stats = DataStore.getStats() || {};
        
        document.getElementById('stat-projects').textContent = stats.projects?.active || 0;
        document.getElementById('stat-tasks').textContent = stats.tasks?.open || 0;
        document.getElementById('stat-agents').textContent = stats.agents?.active || 0;
        document.getElementById('stat-issues').textContent = stats.issues?.unresolved || 0;
    },
    
    // ===================
    // View Switching
    // ===================

    showView(view) {
        this.currentView = view;

        const all = ['section-projects', 'section-agents', 'section-activity',
                     'section-assignments', 'section-live',
                     'view-all-tasks', 'view-kanban', 'view-timeline'];
        all.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Update active nav item
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        const show = (...ids) => ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });

        switch (view) {
            case 'dashboard':
                show('section-projects', 'section-agents', 'section-activity');
                document.getElementById('section-projects-title').textContent = 'Projects';
                document.getElementById('section-agents-title').textContent = 'Agents';
                document.getElementById('projects-grid').className = 'projects-grid';
                this.renderProjects('grid');
                this.renderAgents();
                this.renderActivity();
                break;

            case 'all-tasks':
                show('view-all-tasks');
                this.renderAllTasks();
                break;

            case 'active-agents':
                show('section-agents');
                document.getElementById('section-agents-title').textContent = 'Active Agents';
                this.renderAgents('active');
                break;

            case 'grid':
            case 'all-projects':
                show('section-projects');
                document.getElementById('section-projects-title').textContent = 'All Projects';
                document.getElementById('projects-grid').className = 'projects-grid';
                this.renderProjects('grid');
                break;

            case 'list':
                show('section-projects');
                document.getElementById('section-projects-title').textContent = 'Projects — List View';
                document.getElementById('projects-grid').className = '';
                this.renderProjects('list');
                break;

            case 'kanban':
                show('view-kanban');
                this.renderKanban();
                break;

            case 'timeline':
                show('view-timeline');
                this.renderTimeline();
                break;
        }
    },

    renderAllTasks() {
        const allTasks = DataStore.projects.flatMap(p =>
            (p.tasks || []).map(t => ({ ...t, projectName: p.name }))
        );
        const statusOrder = { in_progress: 0, blocked: 1, todo: 2, pending: 2, assigned: 2, done: 3 };
        allTasks.sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));

        document.getElementById('view-all-tasks-count').textContent = allTasks.length + ' tasks';
        document.getElementById('all-tasks-content').innerHTML = `
            <table class="tasks-table">
                <thead>
                    <tr>
                        <th>Task</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Assignee</th>
                        <th>Priority</th>
                    </tr>
                </thead>
                <tbody>
                    ${allTasks.map(t => `
                        <tr>
                            <td>${this.escapeHtml(t.title)}</td>
                            <td class="task-project">${this.escapeHtml(t.projectName || '')}</td>
                            <td><span class="task-status status-${t.status}">${this.formatStatus(t.status)}</span></td>
                            <td style="color:var(--text-muted)">${this.escapeHtml(t.assignee || '—')}</td>
                            <td><span class="priority-badge priority-${t.priority || 'medium'}">${t.priority || 'medium'}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    },

    renderKanban() {
        const allTasks = DataStore.projects.flatMap(p =>
            (p.tasks || []).map(t => ({ ...t, projectName: p.name }))
        );
        const cols = {
            todo:        { label: 'To Do',      color: 'var(--text-muted)',    tasks: [] },
            in_progress: { label: 'In Progress', color: 'var(--accent-blue)',   tasks: [] },
            done:        { label: 'Done',        color: 'var(--accent-green)',  tasks: [] },
            blocked:     { label: 'Blocked',     color: 'var(--accent-red)',    tasks: [] },
        };
        for (const t of allTasks) {
            const key = (t.status === 'pending' || t.status === 'assigned') ? 'todo' : (cols[t.status] ? t.status : 'todo');
            cols[key].tasks.push(t);
        }
        document.getElementById('kanban-content').innerHTML = `
            <div class="kanban-board">
                ${Object.entries(cols).map(([key, col]) => `
                    <div class="kanban-col">
                        <div class="kanban-col-header" style="color:${col.color}">
                            ${col.label}
                            <span class="kanban-col-count">${col.tasks.length}</span>
                        </div>
                        ${col.tasks.length === 0
                            ? '<div class="kanban-empty">No tasks</div>'
                            : col.tasks.map(t => `
                                <div class="kanban-task">
                                    <div class="kanban-task-title">${this.escapeHtml(t.title)}</div>
                                    <div class="kanban-task-meta">
                                        <span>${this.escapeHtml(t.projectName || '')}</span>
                                        ${t.assignee ? `<span>→ ${this.escapeHtml(t.assignee)}</span>` : ''}
                                    </div>
                                </div>`).join('')}
                    </div>`).join('')}
            </div>`;
    },

    renderTimeline() {
        const allTasks = DataStore.projects.flatMap(p =>
            (p.tasks || []).map(t => ({ ...t, projectName: p.name }))
        );
        allTasks.sort((a, b) => new Date(a.dueDate || a.createdAt) - new Date(b.dueDate || b.createdAt));
        document.getElementById('timeline-content').innerHTML = `
            <div class="timeline-list">
                ${allTasks.map(t => {
                    const dateStr = t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString()
                        : new Date(t.createdAt).toLocaleDateString() + ' (created)';
                    return `
                        <div class="timeline-item status-${t.status}">
                            <div class="timeline-date">${dateStr}</div>
                            <div>
                                <div class="timeline-task-title">${this.escapeHtml(t.title)}</div>
                                <div class="timeline-task-project">${this.escapeHtml(t.projectName || '')} · ${this.escapeHtml(t.assignee || 'unassigned')}</div>
                            </div>
                            <span class="task-status status-${t.status}">${this.formatStatus(t.status)}</span>
                        </div>`;
                }).join('')}
            </div>`;
    },

    renderProjects(mode = 'grid') {
        const container = document.getElementById('projects-grid');
        const projects = DataStore.getAllProjects();

        if (mode === 'list') {
            container.innerHTML = `
                <table class="projects-list-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>Tasks</th>
                            <th>Owner</th>
                            <th>Target Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${projects.map(p => {
                            const done = p.tasks.filter(t => t.status === 'done').length;
                            return `
                            <tr onclick="App.openProjectDetail('${p.id}')">
                                <td>
                                    <div style="font-weight:500">${this.escapeHtml(p.name)}</div>
                                    <div style="color:var(--text-muted);font-size:12px">${this.escapeHtml(p.description || '')}</div>
                                </td>
                                <td><span class="project-status status-${p.status}">${this.formatStatus(p.status)}</span></td>
                                <td>
                                    <div class="progress-bar" style="display:inline-block;width:80px;height:4px;vertical-align:middle;margin-right:6px"><div class="progress-fill" style="width:${p.progress}%"></div></div>
                                    ${p.progress}%
                                </td>
                                <td style="color:var(--text-muted)">${done}/${p.tasks.length} done</td>
                                <td style="color:var(--text-muted)">${this.escapeHtml(p.owner || '—')}</td>
                                <td style="color:var(--text-muted)">${p.targetEndDate || '—'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
            return;
        }

        container.className = 'projects-grid';
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
    
    renderAgents(filter = 'all') {
        const container = document.getElementById('agents-grid');
        const agents = filter === 'active'
            ? DataStore.agents.filter(a => a.status === 'active')
            : DataStore.agents;

        // Build task lookup from all projects
        const allTasks = DataStore.projects.flatMap(p => (p.tasks || []).map(t => ({ ...t, projectName: p.name })));
        const taskById = Object.fromEntries(allTasks.map(t => [t.id, t]));

        // Compute per-agent stats from real task data
        const agentStats = {};
        for (const task of allTasks) {
            const name = task.assignee;
            if (!name) continue;
            if (!agentStats[name]) agentStats[name] = { done: 0, active: null };
            if (task.status === 'done') agentStats[name].done++;
            else if (task.status === 'in_progress' && !agentStats[name].active) agentStats[name].active = task;
        }

        container.innerHTML = agents.map(agent => {
            const avatarInitials = agent.name.split(' ').map(n => n[0]).join('');
            const roleClass = agent.role.toLowerCase();
            const unresolvedIssues = agent.agentActivity?.issues?.filter(i => !i.resolved).length || 0;
            const isOpenClaw = agent.source === 'openclaw';
            const ocBadge = isOpenClaw ? '<span class="oc-badge" title="Connected via OpenClaw">🦞</span>' : '';

            const stats = agentStats[agent.name] || { done: 0, active: null };
            // Resolve current task: prefer in_progress task, fall back to DB currentTaskId lookup
            const currentTask = stats.active || (agent.currentTaskId ? taskById[agent.currentTaskId] : null);
            const taskDisplay = currentTask
                ? `${this.escapeHtml(currentTask.title)} <span style="color:var(--text-muted);font-size:11px">(${currentTask.projectName || ''})</span>`
                : '<span style="color: var(--text-muted)">No active task</span>';
            const tasksDone = stats.done || agent.totalTasksCompleted || 0;

            return `
                <div class="agent-card ${isOpenClaw ? 'openclaw-agent' : ''}">
                    <div class="agent-header">
                        <div class="agent-avatar ${roleClass} ${isOpenClaw ? 'oc' : ''}">${avatarInitials}</div>
                        <div class="agent-info">
                            <div class="agent-name">${this.escapeHtml(agent.name)} ${ocBadge}</div>
                            <div class="agent-role">${this.formatRole(agent.role)}${isOpenClaw ? ' (OpenClaw)' : ''}</div>
                        </div>
                        <div class="agent-status ${agent.status}" title="${agent.status}"></div>
                    </div>
                    <div class="agent-current-task">
                        <div class="agent-task-label">Currently Working On</div>
                        <div>${taskDisplay}</div>
                    </div>
                    <div class="agent-stats">
                        <span class="agent-stat"><strong>${tasksDone}</strong> tasks done</span>
                        <span class="agent-stat"><strong>${agent.totalErrors ?? 0}</strong> errors</span>
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
                        <div class="activity-time">${this.formatTime(activity.createdAt || activity.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (activities.length === 0) {
            container.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-text" style="color: var(--text-muted)">No recent activity</div></div></div>';
        }
    },
    
    // ===================
    // Task Assignment View
    // ===================
    
    renderTaskAssignment() {
        const container = document.getElementById('task-assignment-grid');
        const hierarchy = DataStore.getTaskHierarchy();
        
        if (hierarchy.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <div class="empty-text">No tasks assigned yet</div>
                    <div class="empty-hint">Assign tasks to agents to see the hierarchy here</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = hierarchy.map(entry => {
            const statusClass = `status-${entry.status}`;
            const progress = entry.progress || 0;
            
            // Get latest response
            const latestResponse = entry.responses && entry.responses.length > 0 
                ? entry.responses[entry.responses.length - 1] 
                : null;
            
            return `
                <div class="assignment-card">
                    <div class="assignment-header">
                        <div class="assignment-chain">
                            <span class="chain-assigner">${this.escapeHtml(entry.assignedBy)}</span>
                            <span class="chain-arrow">→</span>
                            <span class="chain-assignee">${this.escapeHtml(entry.assignedTo)}</span>
                        </div>
                        <span class="assignment-status ${statusClass}">${this.formatStatus(entry.status)}</span>
                    </div>
                    <div class="assignment-task">${this.escapeHtml(entry.taskTitle)}</div>
                    <div class="assignment-project">📁 ${this.escapeHtml(entry.projectName)}</div>
                    ${entry.parentTaskId ? `<div class="assignment-parent">🔗 Sub-task of parent</div>` : ''}
                    <div class="assignment-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="progress-text">
                            <span>${progress}%</span>
                            <span>${this.formatTime(entry.assignedAt)}</span>
                        </div>
                    </div>
                    ${latestResponse ? `
                        <div class="assignment-activity">
                            <div class="activity-current">
                                <span class="activity-label">Current:</span>
                                <span class="activity-action">${this.escapeHtml(latestResponse.action || latestResponse.message)}</span>
                            </div>
                            <div class="activity-agent">👤 ${this.escapeHtml(latestResponse.agentName)}</div>
                        </div>
                    ` : ''}
                    <div class="assignment-timeline">
                        ${(() => {
                            let history = entry.statusHistory;
                            if (typeof history === 'string') {
                                try { history = JSON.parse(history); } catch(e) { history = []; }
                            }
                            return (history || []).slice(-2).map(h => `
                            <div class="timeline-item">
                                <span class="timeline-status">${this.formatStatus(h.status)}</span>
                                <span class="timeline-note">${this.escapeHtml(h.note || '')}</span>
                            </div>
                            `).join('');
                        })()}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // ===================
    // Live Agent View
    // ===================
    
    renderLiveTracking() {
        const container = document.getElementById('live-tracking-grid');
        const agents = DataStore.agents.filter(a => a.status === 'active');
        
        if (agents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💤</div>
                    <div class="empty-text">No active agents</div>
                    <div class="empty-hint">Assign tasks to agents to see them working</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = agents.map(agent => {
            const tasks = DataStore.getTasksForAgent(agent.name);
            const currentTask = tasks.find(t => t.id === agent.currentTaskId);
            
            // Get latest log
            const latestLog = agent.agentActivity?.logs?.slice(-1)[0];
            
            return `
                <div class="live-agent-card">
                    <div class="live-agent-header">
                        <div class="agent-avatar ${agent.role}">${agent.name.split(' ').map(n => n[0]).join('')}</div>
                        <div class="live-agent-info">
                            <div class="live-agent-name">${this.escapeHtml(agent.name)}</div>
                            <div class="live-agent-status">
                                <span class="pulse-indicator"></span>
                                <span>Active</span>
                            </div>
                        </div>
                    </div>
                    ${currentTask ? `
                        <div class="live-current-task">
                            <div class="task-label">Working on:</div>
                            <div class="task-title">${this.escapeHtml(currentTask.title)}</div>
                            <div class="task-progress-bar">
                                <div class="task-progress-fill" style="width: ${currentTask.assignment?.progress || 0}%"></div>
                            </div>
                            <div class="task-progress-text">${currentTask.assignment?.progress || 0}% complete</div>
                        </div>
                        ${currentTask.assignment?.currentAction ? `
                            <div class="live-action">
                                <span class="action-icon">⚡</span>
                                <span>${this.escapeHtml(currentTask.assignment.currentAction)}</span>
                            </div>
                        ` : ''}
                    ` : ''}
                    ${latestLog ? `
                        <div class="live-log">
                            <div class="log-label">Latest:</div>
                            <div class="log-message">${this.escapeHtml(latestLog.details || latestLog.action)}</div>
                            <div class="log-time">${this.formatTime(latestLog.timestamp)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
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
        
        // Render plan - handle both JSON string and array
        const planList = document.getElementById('detail-plan');
        let planArray = project.plan;
        if (typeof project.plan === 'string') {
            try { planArray = JSON.parse(project.plan); } catch(e) { planArray = []; }
        }
        if (planArray && planArray.length > 0) {
            planList.innerHTML = planArray.map(step => `<li>${this.escapeHtml(step)}</li>`).join('');
        } else {
            planList.innerHTML = '<li style="color: var(--text-muted)">No plan defined.</li>';
        }
        
        // Render tasks
        this.renderProjectTasks(project);
        
        // Render notes
        this.renderProjectNotes(project);
        
        // Render agents
        this.renderProjectAgents(project);

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
    // Project Agents
    // ===================

    renderProjectAgents(project) {
        const container = document.getElementById('detail-agents');
        const countEl = document.getElementById('detail-agents-count');
        if (!container || !countEl) return;

        const assigneeNames = [...new Set(
            (project.tasks || []).filter(t => t.assignee).map(t => t.assignee)
        )];

        countEl.textContent = `Assigned Agents (${assigneeNames.length})`;

        if (assigneeNames.length === 0) {
            container.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">No agents assigned to tasks yet.</div>';
            return;
        }

        const statusColor = { active: '#4caf50', idle: '#ff9800', offline: '#666', unknown: '#666' };

        container.innerHTML = assigneeNames.map(name => {
            const agent = DataStore.agents.find(a => a.name === name);
            const status = agent?.status || 'unknown';
            const color = statusColor[status] || statusColor.unknown;
            const projectTasks = project.tasks.filter(t => t.assignee === name);
            const activeTasks = projectTasks.filter(t => t.status === 'in_progress');
            const doneTasks = projectTasks.filter(t => t.status === 'done');
            const currentTask = activeTasks[0] || projectTasks.find(t => t.status !== 'done');

            return `
                <div class="agent-assignment-item">
                    <div class="agent-assignment-header">
                        <div class="agent-assignment-name">
                            <span class="agent-dot" style="background: ${color}"></span>
                            ${this.escapeHtml(name)}
                        </div>
                        <span class="agent-status ${status}">${status}</span>
                    </div>
                    <div class="agent-assignment-tasks">
                        ${currentTask
                            ? `<span>Working on: <strong>${this.escapeHtml(currentTask.title)}</strong> <span style="color:var(--text-muted)">(${this.formatStatus(currentTask.status)})</span></span>`
                            : `<span>All tasks complete</span>`}
                        <span style="margin-left:auto">${doneTasks.length}/${projectTasks.length} done</span>
                    </div>
                </div>
            `;
        }).join('');
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
    // Task Assignment Modal
    // ===================
    
    openTaskAssignmentModal(taskId = null, taskTitle = null) {
        const modal = document.getElementById('taskAssignmentModal');
        const overlay = document.getElementById('modalOverlay');
        
        // Get all unassigned tasks
        const unassignedTasks = [];
        for (const project of DataStore.projects) {
            for (const task of project.tasks) {
                if (!task.assignee || task.status === 'pending') {
                    unassignedTasks.push({
                        id: task.id,
                        title: task.title,
                        projectName: project.name
                    });
                }
            }
        }
        
        // Populate task dropdown
        const taskSelect = document.getElementById('assignTaskSelect');
        taskSelect.innerHTML = unassignedTasks.map(t => 
            `<option value="${t.id}">${this.escapeHtml(t.title)} (${this.escapeHtml(t.projectName)})</option>`
        ).join('');
        
        // Pre-select if provided
        if (taskId) {
            taskSelect.value = taskId;
        }
        
        // Populate assignee dropdown
        const assigneeSelect = document.getElementById('assignAgentSelect');
        assigneeSelect.innerHTML = DataStore.agents.map(a => 
            `<option value="${a.name}">${a.name} (${this.formatRole(a.role)})</option>`
        ).join('');
        
        // Populate assigned by dropdown (includes Human and ATLAS)
        const assignedBySelect = document.getElementById('assignBySelect');
        assignedBySelect.innerHTML = `
            <option value="Human">👤 Human (Grim)</option>
            <option value="ATLAS">🤖 ATLAS</option>
            ${DataStore.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('')}
        `;
        
        modal.classList.add('open');
        overlay.classList.add('open');
    },
    
    closeTaskAssignmentModal() {
        document.getElementById('taskAssignmentModal').classList.remove('open');
        document.getElementById('modalOverlay').classList.remove('open');
    },
    
    saveTaskAssignment() {
        const taskId = document.getElementById('assignTaskSelect').value;
        const assignedTo = document.getElementById('assignAgentSelect').value;
        const assignedBy = document.getElementById('assignBySelect').value;
        
        if (!taskId || !assignedTo) return;
        
        DataStore.assignTask(taskId, assignedTo, assignedBy);
        
        this.closeTaskAssignmentModal();
        this.render();
    },
    
    // ===================
    // Quick Assign from Task Item
    // ===================
    
    quickAssignTask(projectId, taskId) {
        this.selectedProject = DataStore.getProject(projectId);
        this.openTaskAssignmentModal(taskId);
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
            this.closeTaskAssignmentModal();
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
        
        document.getElementById('taskAssignmentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTaskAssignment();
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
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                App.showView(item.dataset.view);
            });
        });

        // Search
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');

        searchInput.addEventListener('input', () => {
            App.runSearch(searchInput.value.trim());
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                App.closeSearch();
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) App.closeSearch();
        });
    },

    closeSearch() {
        document.getElementById('search-results').classList.remove('visible');
    },

    runSearch(query) {
        const results = document.getElementById('search-results');
        if (!query) { results.classList.remove('visible'); return; }

        const q = query.toLowerCase();

        const matchedProjects = DataStore.projects.filter(p =>
            p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
        ).slice(0, 4);

        const matchedTasks = DataStore.projects.flatMap(p =>
            (p.tasks || []).map(t => ({ ...t, projectName: p.name, projectId: p.id }))
        ).filter(t =>
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.assignee || '').toLowerCase().includes(q)
        ).slice(0, 6);

        const matchedAgents = DataStore.agents.filter(a =>
            a.name.toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q)
        ).slice(0, 4);

        if (!matchedProjects.length && !matchedTasks.length && !matchedAgents.length) {
            results.innerHTML = `<div class="search-no-results">No results for "${this.escapeHtml(query)}"</div>`;
            results.classList.add('visible');
            return;
        }

        let html = '';

        if (matchedProjects.length) {
            html += `<div class="search-result-section">
                <div class="search-result-section-label">Projects</div>
                ${matchedProjects.map(p => `
                    <div class="search-result-item" onclick="App.closeSearch(); App.openProjectDetail('${p.id}')">
                        <span class="search-result-icon">▦</span>
                        <div class="search-result-main">
                            <div class="search-result-title">${this.escapeHtml(p.name)}</div>
                            <div class="search-result-sub">${this.escapeHtml(p.description || '')}</div>
                        </div>
                        <span class="search-result-badge status-${p.status}">${this.formatStatus(p.status)}</span>
                    </div>`).join('')}
            </div>`;
        }

        if (matchedTasks.length) {
            if (html) html += '<hr class="search-result-divider">';
            html += `<div class="search-result-section">
                <div class="search-result-section-label">Tasks</div>
                ${matchedTasks.map(t => `
                    <div class="search-result-item" onclick="App.closeSearch(); App.openProjectDetail('${t.projectId}')">
                        <span class="search-result-icon">◫</span>
                        <div class="search-result-main">
                            <div class="search-result-title">${this.escapeHtml(t.title)}</div>
                            <div class="search-result-sub">${this.escapeHtml(t.projectName)} · ${this.escapeHtml(t.assignee || 'unassigned')}</div>
                        </div>
                        <span class="search-result-badge status-${t.status}">${this.formatStatus(t.status)}</span>
                    </div>`).join('')}
            </div>`;
        }

        if (matchedAgents.length) {
            if (html) html += '<hr class="search-result-divider">';
            html += `<div class="search-result-section">
                <div class="search-result-section-label">Agents</div>
                ${matchedAgents.map(a => `
                    <div class="search-result-item" onclick="App.closeSearch(); App.showView('all-agents')">
                        <span class="search-result-icon">⚡</span>
                        <div class="search-result-main">
                            <div class="search-result-title">${this.escapeHtml(a.name)}</div>
                            <div class="search-result-sub">${this.escapeHtml(a.role || '')}</div>
                        </div>
                        <span class="search-result-badge status-${a.status}">${this.escapeHtml(a.status)}</span>
                    </div>`).join('')}
            </div>`;
        }

        results.innerHTML = html;
        results.classList.add('visible');
    },
    
    // ===================
    // Utilities
    // ===================
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to page
        const container = document.getElementById('notifications') || document.body;
        if (!document.getElementById('notifications')) {
            const nc = document.createElement('div');
            nc.id = 'notifications';
            nc.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;';
            document.body.appendChild(nc);
        }
        
        document.getElementById('notifications').appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
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
        return activity.description || activity.details || '';
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await App.init();
});
