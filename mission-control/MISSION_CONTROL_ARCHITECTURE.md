# Mission Control Dashboard: Architecture Plan

## Executive Summary
This document outlines the architecture plan for upgrading the Mission Control Dashboard from a LocalStorage-based frontend prototype into a fully functional, production-ready tracking system. This dashboard will serve as the visual orchestration layer for the OpenClaw system (ATLAS and sub-agents), part of the AgenticOps suite.

---

## 1. Architecture Recommendations

### Frontend (Presentation Layer)
*   **Current State:** Single-file HTML/JS/CSS prototype.
*   **Recommendation:** Migrate to a lightweight component-based framework like **SvelteKit** or **React (Vite)** + **Tailwind CSS**.
*   **Why:** Dashboards require complex state management (real-time agent status, project filtering, log streaming). A component-based framework ensures maintainability and scalability over pure Vanilla JS. SvelteKit is ideal for a fast, low-overhead local footprint.

### Backend (Application Layer)
*   **Recommendation:** **Node.js** with **Express** or **Fastify**. 
*   **Real-time engine:** **Socket.io** or native WebSockets (`ws`).
*   **Why:** OpenClaw is heavily integrated with the Node/JS ecosystem. Using Node.js allows seamless shared tooling and potentially running the dashboard as a native OpenClaw gateway plugin.

### Data Storage (Persistence Layer)
*   **Recommendation:** **SQLite** using an ORM like **Prisma** or **Drizzle**.
*   **Why:** SQLite is zero-configuration, serverless, and stores the entire database in a single local file. This is perfect for a self-hosted agent orchestration tool. It provides relational integrity for Projects → Tasks → Agents without the overhead of PostgreSQL.

---

## 2. Integration Points with OpenClaw

To ensure ATLAS and its sub-agents can seamlessly interact with the dashboard:

1.  **Local REST API:** The dashboard backend will expose an API (e.g., `http://localhost:PORT/api/v1/...`) for standard CRUD operations (creating projects, spawning agents, updating task states).
2.  **WebSockets (Event Stream):** A pub/sub system where OpenClaw's orchestration layer (ATLAS) pushes real-time telemetry (logs, CPU/token usage, status changes) to the dashboard.
3.  **Agent SDK / CLI Tools:** A lightweight wrapper script or OpenClaw tool (e.g., `mission_control_update`) that agents can call natively from their toolset to report progress without needing to write raw HTTP requests.
4.  **Gateway Plugin:** Potentially wrap the dashboard backend as an OpenClaw Gateway service so it boots automatically with `openclaw gateway start`.

---

## 3. Data Flow (Agent ↔ Dashboard Communication)

The core loop for how agents report to the dashboard:

1.  **Initialization:** ATLAS spawns a sub-agent and registers the task with the Dashboard API (`POST /api/tasks`). The Dashboard generates a `task_id`.
2.  **Execution & Reporting:**
    *   As the agent (e.g., CodeWright) works, it uses an internal tool (e.g., `update_status`) to send payloads: `{"task_id": "123", "status": "in_progress", "log": "Compiling assets..."}`.
    *   This hits the Dashboard REST API.
3.  **Persistence:** The Backend updates the SQLite database.
4.  **Broadcast:** The Backend emits a WebSocket event (`task_updated`) to all connected frontend clients.
5.  **UI Update:** The React/Svelte frontend catches the event and re-renders the specific DOM node (e.g., changing a status badge from "Pending" to "Active").

---

## 4. Security Considerations

Even for local tools, security is critical when executing automated AI actions:

*   **Network Isolation:** Bind the web server strictly to `127.0.0.1` by default. Do not expose to `0.0.0.0` unless explicitly configured by the user.
*   **Authentication:** 
    *   **Human UI:** Implement a simple passkey or integrate with OpenClaw's Gateway Token system for UI access.
    *   **Agent API:** Require a local `AGENT_API_KEY` for all `POST`/`PUT` requests to prevent unauthorized local processes from manipulating the state.
*   **Input Sanitization:** Agents output generated text. All logs and status updates must be strictly sanitized on the frontend to prevent Stored XSS attacks (e.g., an agent accidentally outputting malicious HTML in a log).
*   **Rate Limiting:** Protect the WebSocket server from being flooded if an agent gets stuck in an infinite error loop.

---

## 5. Phased Implementation Approach

### Phase 1: Foundation (Backend & DB)
*   Set up Node.js server and SQLite database.
*   Define the schema: `Projects`, `Tasks`, `Agents`, `Logs`.
*   Build basic REST endpoints (GET/POST for projects and tasks).
*   *Milestone:* Replace LocalStorage in the current prototype with API calls to the backend.

### Phase 2: Real-time & Frontend Refactor
*   Migrate the HTML prototype to React/Vite or Svelte.
*   Implement WebSockets (`Socket.io`) on the server.
*   Connect the UI to listen for live state changes.
*   *Milestone:* Dashboard updates dynamically without refreshing the page.

### Phase 3: OpenClaw / ATLAS Integration
*   Develop the OpenClaw integration tools (a specific `mission_control` tool for agents).
*   Update ATLAS prompts/policies to require agents to report status changes to the dashboard.
*   *Milestone:* Real agents running real tasks automatically populate the dashboard.

### Phase 4: Advanced Features
*   Add Log streaming (viewing a sub-agent's console output live).
*   Add metric tracking (token usage, execution time).
*   Implement manual overrides (kill/pause an agent directly from the UI via OpenClaw's `subagents` tool).
*   *Milestone:* Production-ready AgenticOps Mission Control.