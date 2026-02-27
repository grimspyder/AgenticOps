# Mission Control Dashboard - Architecture Plan

## Overview

This document outlines the architecture transformation from the current LocalStorage-based prototype to a production-ready system integrated with OpenClaw.

**Current State:**
- Single HTML file with embedded CSS/JS
- LocalStorage for persistence
- Simulated real-time updates (setInterval)
- No backend infrastructure

**Target State:**
- Full-stack application with API backend
- Real-time agent↔dashboard communication via WebSockets
- Persistent database storage
- OpenClaw integration for agent management

---

## 1. Architecture Recommendations

### 1.1 Frontend Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Framework | React 18+ or Vue 3 | Component-based, strong ecosystem |
| State Management | Zustand or TanStack Query | Simpler than Redux, great for server state |
| UI Components | Radix UI + Tailwind CSS | Accessible, customizable |
| Real-time | Socket.io client | Established WebSocket abstraction |
| Build Tool | Vite | Fast dev server, optimized builds |

**Alternative:** Keep vanilla JS but add:
- ES modules for code organization
- A lightweight state management pattern
- WebSocket client for real-time

### 1.2 Backend Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Runtime | Node.js 20+ | Matches OpenClaw's runtime |
| Framework | Fastify | Fast, built-in TypeScript support |
| WebSocket | @fastify/websocket | Native WebSocket support |
| ORM | Prisma | Type-safe, easy migrations |
| Database | SQLite (dev) / PostgreSQL (prod) | SQL for complex queries |

**Microservices Approach (Future):**
- `mission-control-api` - REST + WebSocket server
- `agent-bridge` - Agent communication relay
- `cost-aggregator` - Cost tracking service

### 1.3 Data Storage

```
┌─────────────────────────────────────────────────────────┐
│                    PostgreSQL                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │projects │ │  tasks  │ │ agents  │ │activity │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────┘
```

**Key Tables:**
- `projects` - Project metadata, problem statements, solutions
- `tasks` - Task details, assignments, status
- `agents` - Agent registry, capabilities, current status
- `activity_logs` - Timestamped activity events
- `task_assignments` - Assignment chains (Human→ATLAS→Agent)
- `notes` / `messages` - Project discussions

---

## 2. OpenClaw Integration Points

### 2.1 Agent Communication

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│   OpenClaw   │◄──────────────────►│ Mission Control  │
│   Agents     │   Agent Bridge     │    Dashboard     │
└──────────────┘                    └──────────────────┘
```

**Integration Methods:**

| Method | Use Case | Implementation |
|--------|----------|----------------|
| WebSocket | Real-time status updates | Agent connects to `ws://host/agents` |
| REST API | Task CRUD, agent queries | `POST /api/tasks/:id/assign` |
| Event Bus | System-wide events | Subscribe to OpenClaw events |
| Hooks | Agent lifecycle events | `onTaskStart`, `onTaskComplete` |

### 2.2 Agent → Dashboard Protocol

```typescript
// Agent reports status
interface AgentStatusReport {
  agentId: string;
  timestamp: string;
  status: 'idle' | 'active' | 'error';
  currentTaskId?: string;
  progress: number; // 0-100
  message?: string;
  logs?: AgentLog[];
}

// Agent requests task
interface TaskRequest {
  agentId: string;
  requestType: 'pickup' | 'status' | 'complete';
  taskId?: string;
  result?: any;
}
```

### 2.3 Dashboard → Agent Protocol

```typescript
// Dashboard assigns task
interface TaskAssignment {
  assignmentId: string;
  taskId: string;
  assignedBy: 'human' | 'atlas' | 'agent';
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  deadline?: string;
  context: {
    projectId: string;
    description: string;
    parentTaskId?: string;
  };
}
```

---

## 3. Data Flow

### 3.1 Task Assignment Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Human  │────►│ ATLAS  │────►│Dashboard│────►│ Agent  │
│ Request│     │Parse   │     │ Store   │     │ Execute│
└────────┘     └────────┘     └────────┘     └────────┘
                                              │
                                              ▼
                                         ┌────────┐
                                         │Report  │────► Dashboard (WebSocket)
                                         │Progress│
                                         └────────┘
```

**Steps:**
1. Human creates task via Dashboard UI
2. Dashboard stores task in database
3. ATLAS (or human) assigns task to agent
4. Agent receives assignment via WebSocket
5. Agent executes and reports progress periodically
6. Dashboard updates UI in real-time
7. Agent completes task → task marked done

### 3.2 Real-time Update Pipeline

```
Agent Event (status change)
        │
        ▼
┌───────────────────┐
│  Agent Bridge     │ ◄── WebSocket connection
│  (middleware)     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Event Router    │ ◄── Parses event type
└───────────────────┘
        │
    ┌───┴───┐
    │       │
    ▼       ▼
┌───────┐ ┌───────┐
│ DB    │ │ WS    │
│Update │ │Broadcast
└───────┘ └───────┘
    │
    ▼
┌───────────────────┐
│  Dashboard UI     │ ◄── Updates React/Vue state
└───────────────────┘
```

### 3.3 Data Synchronization

| Scenario | Strategy |
|----------|----------|
| New task created | Broadcast to all connected agents |
| Task assigned | Direct WebSocket message to assigned agent |
| Agent status change | Real-time broadcast to dashboard |
| Agent progress update | Debounced WebSocket messages (max 1/sec) |
| Connection lost | Reconnect with state sync |

---

## 4. Security Considerations

### 4.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────┐
│                   Security Layer                │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐              │
│  │  JWT Auth   │  │  RBAC      │              │
│  │  (tokens)   │  │  (roles)   │              │
│  └─────────────┘  └─────────────┘              │
│                                                 │
│  Roles:                                         │
│  - admin: Full access                           │
│  - operator: Projects, tasks, view agents      │
│  - agent: Limited (own tasks, status updates) │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- JWT tokens with short expiry (15 min)
- Refresh token rotation
- Role-based access control middleware
- API key for service-to-service (agent bridge)

### 4.2 Input Validation

```typescript
// All inputs validated server-side
const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high']),
  assignee: z.string().uuid().optional(),
  projectId: z.string().uuid()
});

// Sanitize HTML in user content
const sanitizeContent = (input: string) => {
  return DOMPurify.sanitize(marked.parse(input));
};
```

### 4.3 Network Security

| Protection | Implementation |
|------------|----------------|
| HTTPS | TLS 1.3 required |
| CORS | Explicit origin allowlist |
| Rate limiting | 100 req/min per client |
| Request size | Max 1MB payload |
| WebSocket | WSS (WebSocket Secure) |

### 4.4 Agent Security

- Agents authenticate via API key + JWT
- Task context sanitized before execution
- Agent actions logged for audit
- Resource limits on agent operations

---

## 5. Phased Implementation

### Phase 1: Foundation (Week 1-2)

**Goal:** Backend API with database, replace LocalStorage

| Task | Description |
|------|-------------|
| 1.1 | Set up Node.js project with Fastify |
| 1.2 | Configure Prisma with SQLite |
| 1.3 | Create database schema |
| 1.4 | Build REST API endpoints (CRUD) |
| 1.5 | Migrate existing data model |
| 1.6 | Connect frontend to API |

**Deliverables:**
- Working REST API
- SQLite database with schema
- Frontend using API instead of LocalStorage

### Phase 2: Real-time (Week 3-4)

**Goal:** WebSocket communication between agents and dashboard

| Task | Description |
|------|-------------|
| 2.1 | Implement WebSocket server |
| 2.2 | Create agent connection handler |
| 2.3 | Build real-time event system |
| 2.4 | Connect frontend WebSocket client |
| 2.5 | Implement agent↔dashboard protocol |

**Deliverables:**
- Real-time agent status updates
- Live progress tracking
- Activity feed updates

### Phase 3: OpenClaw Integration (Week 5-6)

**Goal:** Integrate with OpenClaw infrastructure

| Task | Description |
|------|-------------|
| 3.1 | Create OpenClaw plugin/extension |
| 3.2 | Implement agent bridge service |
| 3.3 | Add webhook handlers for events |
| 3.4 | Build agent command interface |
| 3.5 | Test full integration |

**Deliverables:**
- Agents report directly to dashboard
- Task assignment via OpenClaw
- Unified agent management

### Phase 4: Production Hardening (Week 7-8)

**Goal:** Security, scaling, monitoring

| Task | Description |
|------|-------------|
| 4.1 | Add JWT authentication |
| 4.2 | Implement RBAC |
| 4.3 | Set up PostgreSQL (production) |
| 4.4 | Add rate limiting |
| 4.5 | Configure monitoring/logging |
| 4.6 | CI/CD pipeline setup |

**Deliverables:**
- Secure, production-ready system
- Deployed infrastructure
- Monitoring dashboards

---

## 6. Technical Decisions to Make

### Decision 1: Frontend Framework
- **Option A:** React + TypeScript (recommended)
- **Option B:** Keep vanilla JS with better organization
- **Option C:** Vue 3

### Decision 2: Database
- **Option A:** SQLite → PostgreSQL (recommended)
- **Option B:** MongoDB
- **Option C:** Keep LocalStorage + sync to cloud

### Decision 3: Deployment
- **Option A:** Docker containers (recommended)
- **Option B:** Serverless functions
- **Option C:** VM/traditional server

### Decision 4: Real-time Protocol
- **Option A:** Socket.io (recommended)
- **Option B:** Raw WebSockets
- **Option C:** Server-Sent Events (one-way)

---

## 7. API Reference (Draft)

### Projects

```
GET    /api/projects           - List all projects
POST   /api/projects           - Create project
GET    /api/projects/:id       - Get project details
PUT    /api/projects/:id       - Update project
DELETE /api/projects/:id       - Delete project
```

### Tasks

```
GET    /api/projects/:id/tasks         - List project tasks
POST   /api/projects/:id/tasks         - Create task
GET    /api/tasks/:id                   - Get task
PUT    /api/tasks/:id                   - Update task
DELETE /api/tasks/:id                   - Delete task
POST   /api/tasks/:id/assign            - Assign to agent
POST   /api/tasks/:id/progress         - Report progress
```

### Agents

```
GET    /api/agents              - List all agents
GET    /api/agents/:id          - Get agent details
PUT    /api/agents/:id/status   - Update agent status
GET    /api/agents/:id/tasks    - Get agent's tasks
```

### WebSocket Events

```
ws://host/ws
├── agent:connect      - Agent connects
├── agent:status      - Status update
├── agent:progress    - Task progress
├── task:assigned     - New task assigned
├── task:completed    - Task done
└── activity:new      - New activity
```

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Real-time latency | < 500ms |
| API response time | < 100ms |
| Agent connection stability | 99.9% uptime |
| Data persistence | Zero data loss |
| Authentication | All endpoints secured |

---

## 9. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenClaw API changes | Integration breaks | Version detection, graceful degradation |
| Real-time scalability | Performance issues | Horizontal scaling, message queuing |
| Data migration | Data loss | Backup strategy, migration scripts |
| Agent security | System compromise | Sandboxing, audit logs |

---

*Document Version: 1.0*  
*Last Updated: 2026-02-27*  
*Part of AgenticOps*
