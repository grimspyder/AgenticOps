/**
 * Mission Control Dashboard - Backend Server
 * Fastify + Prisma API
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Fastify
const fastify = Fastify({
  logger: true
});

// Add Prisma to fastify instance
fastify.decorate('prisma', prisma);

// Register CORS
await fastify.register(cors, {
  origin: true, // Allow all origins for dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
});

// Register WebSocket plugin
await fastify.register(fastifyWebsocket);

// Serve static frontend from the mission-control root (one level above backend/)
await fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../../'),
  prefix: '/',
  index: 'index.html',
  // Don't intercept /api or /ws routes
  constraints: {}
});

// Simple API key authentication (future-proofing)
// In production, replace with proper JWT auth
const API_KEY = process.env.API_KEY || 'dev-key-123'; // Change in production!

fastify.addHook('onRequest', async (request, reply) => {
  // Skip auth for health check and CORS preflight
  if (request.url === '/api/health' || request.method === 'OPTIONS') {
    return;
  }
  
  // Check API key header
  const providedKey = request.headers['x-api-key'];
  
  // For development, we'll allow requests without key (but log it)
  // In production, uncomment the enforcement below:
  /*
  if (!providedKey || providedKey !== API_KEY) {
    reply.code(401);
    return { error: 'Invalid or missing API key' };
  }
  */
  
  // Log API usage (optional)
  if (process.env.NODE_ENV === 'production') {
    console.log(`${request.method} ${request.url} - API Key: ${providedKey ? 'provided' : 'none'}`);
  }
});

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// ===================
// Import Routes
// ===================
import { mcEvents } from './events.js';
import projectsRoutes from './routes/projects.js';
import tasksRoutes from './routes/tasks.js';
import agentsRoutes from './routes/agents.js';
import websocketRoutes from './routes/websocket.js';

// Register routes
fastify.register(projectsRoutes, { prefix: '/api/projects' });
fastify.register(tasksRoutes, { prefix: '/api' });
fastify.register(agentsRoutes, { prefix: '/api/agents' });
fastify.register(websocketRoutes);

// Activity routes
fastify.get('/api/activities', async (request, reply) => {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { project: true, agent: true }
    });
    return activities;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Notes routes
fastify.get('/api/projects/:projectId/notes', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const notes = await prisma.note.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
    return notes;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/projects/:projectId/notes', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const { author, authorRole, content, noteType, relatedTaskId } = request.body;
    
    const note = await prisma.note.create({
      data: {
        projectId,
        author: author || 'Unknown',
        authorRole: authorRole || 'agent',
        content,
        noteType: noteType || 'update',
        relatedTaskId
      }
    });
    
    // Add activity
    await prisma.activity.create({
      data: {
        projectId,
        type: 'note',
        action: 'created',
        description: `${author || 'Unknown'} added a note`
      }
    });
    
    return note;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.put('/api/projects/:projectId/notes/:noteId', async (request, reply) => {
  try {
    const { noteId } = request.params;
    const { content } = request.body;
    
    const note = await prisma.note.update({
      where: { id: noteId },
      data: { content }
    });
    
    return note;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.delete('/api/projects/:projectId/notes/:noteId', async (request, reply) => {
  try {
    const { noteId } = request.params;
    
    await prisma.note.delete({
      where: { id: noteId }
    });
    
    return { success: true };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Messages routes
fastify.get('/api/projects/:projectId/messages', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
    return messages;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/projects/:projectId/messages', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const { author, authorRole, content, messageType, parentId } = request.body;
    
    const message = await prisma.message.create({
      data: {
        projectId,
        author: author || 'Unknown',
        authorRole: authorRole || 'agent',
        content,
        messageType: messageType || 'note',
        parentId
      }
    });
    
    // Add activity
    await prisma.activity.create({
      data: {
        projectId,
        type: 'message',
        action: 'posted',
        description: `${author || 'Unknown'} posted a message`
      }
    });
    
    return message;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/projects/:projectId/messages/:messageId/upvote', async (request, reply) => {
  try {
    const { messageId } = request.params;
    const { voter } = request.body;
    
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });
    
    if (!message) {
      reply.code(404);
      return { error: 'Message not found' };
    }
    
    let upvotes = message.upvotes ? JSON.parse(message.upvotes) : [];
    
    if (upvotes.includes(voter)) {
      upvotes = upvotes.filter(v => v !== voter);
    } else {
      upvotes.push(voter);
    }
    
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { upvotes: JSON.stringify(upvotes) }
    });
    
    return updated;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.delete('/api/projects/:projectId/messages/:messageId', async (request, reply) => {
  try {
    const { messageId } = request.params;
    
    await prisma.message.delete({
      where: { id: messageId }
    });
    
    return { success: true };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Task assignment routes
fastify.post('/api/tasks/:taskId/assign', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const { assignedTo, assignedBy, parentTaskId } = request.body;
    
    // Create task assignment
    const assignment = await prisma.taskAssignment.create({
      data: {
        taskId,
        assignedTo,
        assignedBy,
        parentTaskId,
        statusHistory: JSON.stringify([
          {
            status: 'pending',
            changedAt: new Date().toISOString(),
            changedBy: 'system',
            note: 'Task created'
          },
          {
            status: 'assigned',
            changedAt: new Date().toISOString(),
            changedBy: assignedBy,
            note: `Assigned to ${assignedTo}`
          }
        ])
      }
    });
    
    // Update task with assignee info
    await prisma.task.update({
      where: { id: taskId },
      data: {
        assignee: assignedTo,
        assignedBy: assignedBy,
        parentTaskId,
        status: 'assigned',
        assignment: JSON.stringify(assignment)
      }
    });
    
    // Add activity
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: 'assigned',
        description: `${assignedBy} assigned "${task.title}" to ${assignedTo}`
      }
    });
    
    return assignment;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/tasks/:taskId/progress', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const { agentName, progress, message, action } = request.body;
    
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });
    
    if (!task || !task.assignment) {
      reply.code(404);
      return { error: 'Task or assignment not found' };
    }
    
    const assignment = JSON.parse(task.assignment);
    
    // Build response object
    const response = {
      id: crypto.randomUUID(),
      agentName,
      message,
      progress,
      action,
      timestamp: new Date().toISOString()
    };
    
    // Update responses
    const responses = assignment.responses ? JSON.parse(assignment.responses) : [];
    responses.push(response);
    
    // Update assignment
    const updatedAssignment = {
      ...assignment,
      currentAction: action || message,
      progress,
      responses: JSON.stringify(responses)
    };
    
    // Update task status based on progress
    let newStatus = task.status;
    if (progress >= 100) {
      newStatus = 'done';
    } else if (progress > 0) {
      newStatus = 'in_progress';
    }
    
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: newStatus,
        assignment: JSON.stringify(updatedAssignment)
      }
    });
    
    // Add activity
    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: 'progress',
        description: `${agentName} reported ${progress}% progress: ${message}`
      }
    });
    
    return response;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// Agent Reporting API — used by mc-report script
// No assignment pre-requirement; agents self-report via callsign
// ===================

// POST /api/tasks/:taskId/report — agent reports task progress/status
fastify.post('/api/tasks/:taskId/report', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const { agentName, status, progress, message } = request.body;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    // Determine new status
    let newStatus = task.status;
    if (status) {
      newStatus = status;
    } else if (progress !== undefined) {
      if (progress >= 100) newStatus = 'done';
      else if (progress > 0) newStatus = 'in_progress';
    }

    const updateData = {
      status: newStatus,
      ...(progress !== undefined && { progress }),
      ...(agentName && !task.assignee && { assignee: agentName }),
      ...(newStatus === 'done' && { completedAt: new Date() })
    };

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData
    });

    // Log activity
    const activityDescription = message
      ? `${agentName || 'Agent'}: ${message}`
      : `${agentName || 'Agent'} marked task ${newStatus}${progress !== undefined ? ` (${progress}%)` : ''}`;

    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: newStatus === 'done' ? 'completed' : 'progress',
        description: activityDescription
      }
    });

    // Broadcast to dashboard via WebSocket
    mcEvents.emit('task:updated', {
      taskId,
      task: updated,
      agentName,
      status: newStatus,
      progress,
      message
    });

    return { success: true, task: updated };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// POST /api/agents/report — agent reports its own status by callsign name
fastify.post('/api/agents/report', async (request, reply) => {
  try {
    const { name, status, currentTaskId, currentTaskTitle, action } = request.body;

    if (!name) {
      reply.code(400);
      return { error: 'name is required' };
    }

    // Upsert agent by name
    const agent = await prisma.agent.upsert({
      where: { name },
      update: {
        ...(status !== undefined && { status }),
        ...(currentTaskId !== undefined && { currentTaskId }),
        ...(currentTaskTitle !== undefined && { currentTaskTitle }),
        ...(action !== undefined && {
          agentActivity: JSON.stringify({
            currentAction: action,
            updatedAt: new Date().toISOString()
          })
        }),
        updatedAt: new Date()
      },
      create: {
        name,
        status: status || 'active',
        role: 'general',
        currentTaskId: currentTaskId || null,
        currentTaskTitle: currentTaskTitle || null,
        ...(action && {
          agentActivity: JSON.stringify({
            currentAction: action,
            updatedAt: new Date().toISOString()
          })
        })
      }
    });

    // Log status change as activity
    if (status) {
      await prisma.activity.create({
        data: {
          agentId: agent.id,
          type: 'agent',
          action: status,
          description: action
            ? `${name} is ${status}: ${action}`
            : `${name} is now ${status}`
        }
      });
    }

    // Broadcast to dashboard
    mcEvents.emit('agent:updated', { agent });

    return { success: true, agent };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Task hierarchy routes
fastify.get('/api/task-hierarchy', async (request, reply) => {
  try {
    const assignments = await prisma.taskAssignment.findMany({
      orderBy: { assignedAt: 'desc' },
      include: { task: { include: { project: true } } }
    });
    
    return assignments.map(a => ({
      ...a,
      taskTitle: a.task?.title,
      projectName: a.task?.project?.name
    }));
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.get('/api/agents/:agentName/tasks', async (request, reply) => {
  try {
    const { agentName } = request.params;
    
    const tasks = await prisma.task.findMany({
      where: { assignee: agentName },
      include: { project: true }
    });
    
    return tasks.map(t => ({
      ...t,
      projectName: t.project?.name
    }));
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// OpenClaw Integration
// ===================
import { initOpenClawIntegration, assignTaskToAgent, checkOpenClawHealth } from './openclaw-integration.js';

// Initialize OpenClaw integration
let openClawCleanup = null;

const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Mission Control API running on http://localhost:${port}`);
    
    // Initialize OpenClaw integration
    try {
      openClawCleanup = await initOpenClawIntegration(prisma);
    } catch (err) {
      console.log('OpenClaw integration deferred:', err.message);
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (openClawCleanup) {
    await openClawCleanup();
  }
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
});

// ===================
// OpenClaw Webhook Handler
// ===================

// Webhook endpoint for OpenClaw events
fastify.post('/api/openclaw/webhook', async (request, reply) => {
  try {
    const { event, data } = request.body;
    
    console.log(`OpenClaw webhook received: ${event}`);
    
    switch (event) {
      case 'session_start':
      case 'session:start':
        return { received: true, event };
      case 'session_end':
      case 'session:end':
        return { received: true, event };
      case 'message':
        return { received: true, event };
      case 'agent:spawned':
        return { received: true, event };
      case 'agent:despawned':
        return { received: true, event };
      default:
        console.log('Unknown OpenClaw event:', event);
        return { received: true, event: 'unknown' };
    }
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// OpenClaw health check — cached for 15s to avoid blocking the event loop
let healthCache = { result: null, ts: 0 };
fastify.get('/api/openclaw/health', async (request, reply) => {
  const now = Date.now();
  if (now - healthCache.ts < 15000) {
    return healthCache.result;
  }
  const isHealthy = await checkOpenClawHealth();
  healthCache = {
    result: { openclaw: isHealthy ? 'connected' : 'disconnected', timestamp: new Date().toISOString() },
    ts: now
  };
  return healthCache.result;
});

// Assign task via OpenClaw
fastify.post('/api/openclaw/assign', async (request, reply) => {
  try {
    const { taskId, agentName } = request.body;
    
    // Get task details
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });
    
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }
    
    // Assign via OpenClaw integration
    const result = await assignTaskToAgent(taskId, agentName, {
      title: task.title,
      description: task.description,
      priority: task.priority
    });
    
    return result;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Get OpenClaw sessions (proxy)
fastify.get('/api/openclaw/sessions', async (request, reply) => {
  try {
    const { stdout } = await execAsync(
      'openclaw gateway call status --json --timeout 5000',
      { timeout: 10000 }
    );
    const status = JSON.parse(stdout);
    return {
      agents: status.heartbeat?.agents || [],
      sessions: status.sessions?.recent || [],
      count: status.sessions?.count || 0
    };
  } catch (error) {
    reply.code(503);
    return { error: 'OpenClaw gateway unavailable', details: error.message };
  }
});

start();
