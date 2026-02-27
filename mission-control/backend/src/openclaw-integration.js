/**
 * Mission Control - OpenClaw Integration
 * Bridges the dashboard with OpenClaw gateway
 * 
 * Features:
 * - Poll OpenClaw sessions and register agents in dashboard
 * - Task assignment pipeline: dashboard → OpenClaw → sub-agent
 * - Agent status sync from OpenClaw sessions
 * 
 * Uses CLI polling - reliable and simple
 */

// Configuration
// Note: prisma instance is passed in from the main server via initOpenClawIntegration(prisma)
let prisma = null;
const POLL_INTERVAL_MS = 30000; // Poll every 30 seconds

let pollInterval = null;

// Session tracking for change detection
const knownSessions = new Map(); // sessionId -> session data

// ===================
// Session Fetching (CLI-based)
// ===================

async function fetchOpenClawSessions() {
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      'openclaw gateway call status --json --timeout 5000',
      { encoding: 'utf8', timeout: 10000 }
    );
    
    const status = JSON.parse(result);
    return status.sessions?.recent || [];
  } catch (err) {
    console.log('OpenClaw: Unable to fetch sessions');
    return [];
  }
}

// ===================
// Agent Registration
// ===================

async function registerOpenClawAgent(data) {
  const { sessionId, agentId, key, model, status = 'active' } = data;
  
  // Extract agent name from key or use agentId
  const name = key?.split(':').slice(0, 3).join(':') || agentId;
  
  try {
    // Check if agent exists
    let agent = await prisma.agent.findUnique({
      where: { name }
    });
    
    if (agent) {
      // Update existing agent
      agent = await prisma.agent.update({
        where: { id: agent.id },
        data: { 
          status,
          currentTaskId: sessionId,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new agent
      agent = await prisma.agent.create({
        data: {
          name,
          role: key?.includes(':subagent:') ? 'subagent' : 'main',
          status,
          currentTaskId: sessionId,
          model: model || 'grok-4',
          capabilities: JSON.stringify({ sessionId, key })
        }
      });
    }
    
    return agent;
  } catch (err) {
    console.error('Failed to register OpenClaw agent:', err.message);
    return null;
  }
}

// ===================
// Sync Agents from OpenClaw
// ===================

async function syncOpenClawAgents() {
  console.log('Syncing OpenClaw agents...');
  
  const sessions = await fetchOpenClawSessions();
  
  // Process sessions
  for (const session of sessions) {
    const sessionKey = session.sessionId;
    
    // Skip if we already know about this session
    if (knownSessions.has(sessionKey)) {
      continue;
    }
    
    // New session - register it
    knownSessions.set(sessionKey, session);
    
    const isSubAgent = session.key?.includes(':subagent:');
    
    if (isSubAgent || session.key?.includes(':direct:')) {
      await registerOpenClawAgent({
        sessionId: session.sessionId,
        agentId: session.agentId,
        key: session.key,
        model: session.model,
        status: 'active'
      });
    }
  }
  
  // Mark sessions that ended as offline
  for (const [sessionId, session] of knownSessions) {
    const stillExists = sessions.find(s => s.sessionId === sessionId);
    if (!stillExists && session.key?.includes(':subagent:')) {
      knownSessions.delete(sessionId);
      
      // Mark agent as offline
      try {
        await prisma.agent.updateMany({
          where: { currentTaskId: sessionId },
          data: { status: 'offline' }
        });
      } catch (err) {
        // Ignore
      }
    }
  }
  
  console.log(`OpenClaw sync complete: ${sessions.length} sessions`);
}

// ===================
// Polling
// ===================

function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  // Initial sync
  syncOpenClawAgents();
  
  // Set up polling
  pollInterval = setInterval(async () => {
    await syncOpenClawAgents();
  }, POLL_INTERVAL_MS);
}

// ===================
// Task Assignment Pipeline
// ===================

/**
 * Send a task to an agent via OpenClaw
 * This bridges the dashboard to OpenClaw sub-agents
 */
export async function assignTaskToAgent(taskId, agentName, taskData) {
  // Find the OpenClaw session for this agent
  const sessions = await fetchOpenClawSessions();
  const targetSession = sessions.find(s => 
    s.agentId === agentName || s.key?.includes(agentName)
  );
  
  if (!targetSession) {
    throw new Error(`Agent ${agentName} not found in OpenClaw sessions`);
  }
  
  // Create task assignment in database
  const assignment = await prisma.taskAssignment.create({
    data: {
      taskId,
      assignedTo: agentName,
      assignedBy: 'dashboard',
      status: 'assigned',
      statusHistory: JSON.stringify([{
        status: 'assigned',
        changedAt: new Date().toISOString(),
        changedBy: 'dashboard',
        note: `Assigned via OpenClaw to session ${targetSession.sessionId}`
      }])
    }
  });
  
  // Update task with assignment
  await prisma.task.update({
    where: { id: taskId },
    data: {
      assignee: agentName,
      assignedBy: 'dashboard',
      status: 'assigned',
      assignment: JSON.stringify({
        ...assignment,
        sessionId: targetSession.sessionId,
        openClawSession: targetSession.key
      })
    }
  });
  
  // Add activity
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  await prisma.activity.create({
    data: {
      projectId: task.projectId,
      type: 'task',
      action: 'assigned',
      description: `Task "${task.title}" assigned to ${agentName} via OpenClaw`
    }
  });
  
  return {
    assignment,
    sessionId: targetSession.sessionId,
    openClawKey: targetSession.key
  };
}

// ===================
// Initialization
// ===================

export async function initOpenClawIntegration(prismaInstance) {
  prisma = prismaInstance;
  console.log('Initializing OpenClaw integration...');

  // Start polling (CLI-based, reliable)
  startPolling();
  console.log('✓ OpenClaw integration active (polling)');
  
  // Return cleanup function
  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}

/**
 * Check if OpenClaw is available
 */
export async function checkOpenClawHealth() {
  try {
    const { execSync } = await import('child_process');
    execSync('openclaw gateway call health --json', { 
      encoding: 'utf8', 
      timeout: 5000 
    });
    return true;
  } catch {
    return false;
  }
}

export default {
  initOpenClawIntegration,
  assignTaskToAgent,
  checkOpenClawHealth
};
