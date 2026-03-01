/**
 * Mission Control Dashboard - Backend Server
 * Fastify + Prisma API
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
// execFileAsync bypasses /bin/sh — safe for messages containing backticks/special chars
const execFileAsync = promisify(execFile);

// Callsign → openclaw agent ID mapping
const CALLSIGN_TO_AGENT = {
  'CodeWright': 'coding-agent',
  'Archon':     'architecture-agent',
  'Scout':      'research-agent',
  'Sentry':     'devops-agent',
  'Validator':  'testing-agent',
  'ATLAS':      'main'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Prisma
const prisma = new PrismaClient();

// Returns unique sub-agent callsigns (non-Atlas) assigned to tasks in a project,
// optionally excluding one callsign (e.g. the author, to avoid self-notification).
async function getProjectSubAgents(projectId, excludeCallsign = null) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { assignee: true }
  });
  return [...new Set(
    tasks.map(t => t.assignee)
      .filter(a => a && a !== 'ATLAS' && a !== excludeCallsign && CALLSIGN_TO_AGENT[a])
  )];
}

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

// Prevent index.html from being cached by browsers
fastify.addHook('onSend', async (request, reply, payload) => {
  if (request.url === '/' || request.url === '/index.html') {
    reply.header('Cache-Control', 'no-store');
  }
  return payload;
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
    const limit = Math.min(parseInt(request.query.limit) || 100, 500);
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
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

    await prisma.activity.create({
      data: {
        projectId,
        type: 'note',
        action: 'created',
        description: `${author || 'Unknown'} added a note`
      }
    });

    mcEvents.emit('note:new', { projectId, note });

    // Notify Atlas and sub-agents about this note
    {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { tasks: true }
      });
      if (project) {
        const recentNotes = await prisma.note.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          take: 5
        });
        const noteHistory = recentNotes.reverse().map(n =>
          `  [${n.author}]: ${n.content}`
        ).join('\n');

        // Notify Atlas (unless Atlas posted it) — Atlas auto-responds with a note
        if (author !== 'ATLAS' && authorRole !== 'atlas') {
          const contextMsg = [
            `[Mission Control — Agent Notes: ${project.name}]`,
            ``,
            `A new note has been added to the project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Recent notes:`,
            noteHistory,
            ``,
            `Open tasks: ${project.tasks.filter(t => !['done','completed'].includes(t.status)).map(t => `"${t.title}" (${t.status})`).join(', ') || 'none'}`,
            ``,
            `Please acknowledge this note and respond with any relevant observations, actions, or follow-up.`,
            `Your response will be posted back to Mission Control Agent Notes.`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', 'main', '--message', contextMsg], { timeout: 120000 })
            .then(({ stdout }) => {
              const response = stdout.trim();
              if (!response) return;
              return prisma.note.create({
                data: {
                  projectId,
                  author: 'ATLAS',
                  authorRole: 'atlas',
                  content: response,
                  noteType: 'update'
                }
              }).then(atlasNote => {
                mcEvents.emit('note:new', { projectId, note: atlasNote });
              });
            })
            .catch(err => console.error('Atlas note response failed:', err.message));
        }

        // Notify sub-agents assigned to this project (excluding the note author)
        const subAgents = await getProjectSubAgents(projectId, author);
        for (const callsign of subAgents) {
          const agentId = CALLSIGN_TO_AGENT[callsign];
          const myTasks = project.tasks.filter(t => t.assignee === callsign);
          const subContextMsg = [
            `[Mission Control — Project Note: ${project.name}]`,
            ``,
            `${author} posted a note on project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Recent notes:`,
            noteHistory,
            ``,
            myTasks.length > 0
              ? `Your tasks on this project: ${myTasks.map(t => `"${t.title}" (${t.status})`).join(', ')}`
              : `You have no tasks currently assigned on this project.`,
            ``,
            `MISSION_CONTROL_PROJECT_ID: ${projectId}`,
            `To post a response, run:`,
            `  mc-post note ${projectId} ${callsign} "Your message here"`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', agentId, '--message', subContextMsg], { timeout: 60000 })
            .catch(err => console.error(`Sub-agent ${callsign} note notification failed:`, err.message));
        }
      }
    }

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

    await prisma.activity.create({
      data: {
        projectId,
        type: 'message',
        action: 'posted',
        description: `${author || 'Unknown'} posted a message`
      }
    });

    mcEvents.emit('message:new', { projectId, message });

    // Notify Atlas and sub-agents about this message
    {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { tasks: true }
      });
      if (project) {
        const recentMessages = await prisma.message.findMany({
          where: { projectId },
          orderBy: { createdAt: 'asc' },
          take: 10
        });
        const thread = recentMessages.map(m => {
          const lines = [`  [${m.author}]: ${m.content}`];
          const replies = m.replies ? JSON.parse(m.replies) : [];
          replies.forEach(r => lines.push(`    ↳ [${r.author}]: ${r.content}`));
          return lines.join('\n');
        }).join('\n');

        // Notify Atlas (unless Atlas posted it) — Atlas auto-responds with a reply
        if (author !== 'ATLAS' && authorRole !== 'atlas') {
          const contextMsg = [
            `[Mission Control — Discussion Board: ${project.name}]`,
            ``,
            `A message has been posted to the Discussion board for project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Discussion thread:`,
            thread,
            ``,
            `Open tasks: ${project.tasks.filter(t => !['done','completed'].includes(t.status)).map(t => `"${t.title}" (${t.status}${t.assignee ? ', ' + t.assignee : ''})`).join(', ') || 'none'}`,
            ``,
            `Please read the discussion and respond appropriately. Address any questions, provide status, or take action.`,
            `Your response will be posted back to the Mission Control Discussion board.`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', 'main', '--message', contextMsg], { timeout: 120000 })
            .then(({ stdout }) => {
              const response = stdout.trim();
              if (!response) return;
              // Append Atlas reply to the original message's replies JSON field
              const existing = message.replies ? JSON.parse(message.replies) : [];
              existing.push({
                id: crypto.randomUUID(),
                author: 'ATLAS',
                authorRole: 'atlas',
                content: response,
                createdAt: new Date().toISOString()
              });
              return prisma.message.update({
                where: { id: message.id },
                data: { replies: JSON.stringify(existing) }
              }).then(updated => {
                mcEvents.emit('message:new', { projectId, message: updated });
              });
            })
            .catch(err => console.error('Atlas message response failed:', err.message));
        }

        // Notify sub-agents assigned to this project (excluding the message author)
        const subAgents = await getProjectSubAgents(projectId, author);
        for (const callsign of subAgents) {
          const agentId = CALLSIGN_TO_AGENT[callsign];
          const myTasks = project.tasks.filter(t => t.assignee === callsign);
          const subContextMsg = [
            `[Mission Control — Discussion: ${project.name}]`,
            ``,
            `${author} posted a message on project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Discussion thread:`,
            thread,
            ``,
            myTasks.length > 0
              ? `Your tasks on this project: ${myTasks.map(t => `"${t.title}" (${t.status})`).join(', ')}`
              : `You have no tasks currently assigned on this project.`,
            ``,
            `MISSION_CONTROL_PROJECT_ID: ${projectId}`,
            `MESSAGE_ID: ${message.id}`,
            `To reply, run:`,
            `  mc-post reply ${projectId} ${message.id} ${callsign} "Your reply here"`,
            `To post a new message, run:`,
            `  mc-post message ${projectId} ${callsign} "Your message here"`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', agentId, '--message', subContextMsg], { timeout: 60000 })
            .catch(err => console.error(`Sub-agent ${callsign} message notification failed:`, err.message));
        }
      }
    }

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

fastify.post('/api/projects/:projectId/messages/:messageId/reply', async (request, reply) => {
  try {
    const { projectId, messageId } = request.params;
    const { author, authorRole, content } = request.body;

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) { reply.code(404); return { error: 'Message not found' }; }

    const existing = message.replies ? JSON.parse(message.replies) : [];
    existing.push({
      id: crypto.randomUUID(),
      author: author || 'Unknown',
      authorRole: authorRole || 'agent',
      content,
      createdAt: new Date().toISOString()
    });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { replies: JSON.stringify(existing) }
    });

    mcEvents.emit('message:new', { projectId, message: updated });

    // Notify Atlas and sub-agents about this reply
    {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { tasks: true }
      });
      if (project) {
        const threadLines = [
          `  [${message.author}]: ${message.content}`,
          ...existing.map(r => `    ↳ [${r.author}]: ${r.content}`)
        ].join('\n');

        // Notify Atlas (unless Atlas posted it) — Atlas auto-responds
        if (author !== 'ATLAS' && authorRole !== 'atlas') {
          const contextMsg = [
            `[Mission Control — Discussion Reply: ${project.name}]`,
            ``,
            `A reply has been posted in the Discussion board for project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Thread:`,
            threadLines,
            ``,
            `Open tasks: ${project.tasks.filter(t => !['done','completed'].includes(t.status)).map(t => `"${t.title}" (${t.status}${t.assignee ? ', ' + t.assignee : ''})`).join(', ') || 'none'}`,
            ``,
            `Please respond to the latest reply. Your response will be appended to this thread.`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', 'main', '--message', contextMsg], { timeout: 120000 })
            .then(({ stdout }) => {
              const response = stdout.trim();
              if (!response) return;
              const withAtlas = [...existing, {
                id: crypto.randomUUID(),
                author: 'ATLAS',
                authorRole: 'atlas',
                content: response,
                createdAt: new Date().toISOString()
              }];
              return prisma.message.update({
                where: { id: messageId },
                data: { replies: JSON.stringify(withAtlas) }
              }).then(final => {
                mcEvents.emit('message:new', { projectId, message: final });
              });
            })
            .catch(err => console.error('Atlas reply response failed:', err.message));
        }

        // Notify sub-agents assigned to this project (excluding the reply author)
        const subAgents = await getProjectSubAgents(projectId, author);
        for (const callsign of subAgents) {
          const agentId = CALLSIGN_TO_AGENT[callsign];
          const myTasks = project.tasks.filter(t => t.assignee === callsign);
          const subContextMsg = [
            `[Mission Control — Discussion Reply: ${project.name}]`,
            ``,
            `${author} replied in the Discussion board for project "${project.name}" (${project.status}, ${project.progress}% complete).`,
            ``,
            `Thread:`,
            threadLines,
            ``,
            myTasks.length > 0
              ? `Your tasks on this project: ${myTasks.map(t => `"${t.title}" (${t.status})`).join(', ')}`
              : `You have no tasks currently assigned on this project.`,
            ``,
            `MISSION_CONTROL_PROJECT_ID: ${projectId}`,
            `MESSAGE_ID: ${message.id}`,
            `To reply, run:`,
            `  mc-post reply ${projectId} ${message.id} ${callsign} "Your reply here"`
          ].join('\n');

          execFileAsync('openclaw', ['agent', '--agent', agentId, '--message', subContextMsg], { timeout: 60000 })
            .catch(err => console.error(`Sub-agent ${callsign} reply notification failed:`, err.message));
        }
      }
    }

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

    // Auto-dispatch Atlas verification when a task is marked done
    if (newStatus === 'done' && agentName && agentName !== 'ATLAS') {
      const taskWithProject = await prisma.task.findUnique({
        where: { id: taskId },
        include: { project: true }
      });
      if (taskWithProject) {
        const verifyMsg = [
          `Task completion verification needed:`,
          ``,
          `MISSION_CONTROL_TASK_ID: ${taskId}`,
          `PROJECT: ${taskWithProject.project.name}`,
          `TASK: ${taskWithProject.title}`,
          `COMPLETED BY: ${agentName}`,
          `AGENT MESSAGE: ${message || 'No message provided'}`,
          ``,
          `Please verify this task is truly complete. If satisfied, run:`,
          `  mc-report task-verify ${taskId} ATLAS "Verified"`,
          `If rework is needed:`,
          `  mc-report task-reopen ${taskId} ATLAS "Reason for rework"`
        ].join('\n');
        // Fire-and-forget — don't block the response
        execAsync(
          `openclaw agent --agent main --channel telegram --deliver --message ${JSON.stringify(verifyMsg)}`,
          { timeout: 60000 }
        ).catch(err => console.error('Atlas verification dispatch failed:', err.message));
      }
    }

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

// POST /api/tasks/:taskId/dispatch-verify — manually trigger Atlas verification
fastify.post('/api/tasks/:taskId/dispatch-verify', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });
    if (!task) { reply.code(404); return { error: 'Task not found' }; }

    const verifyMsg = [
      `Task completion verification needed:`,
      ``,
      `MISSION_CONTROL_TASK_ID: ${task.id}`,
      `PROJECT: ${task.project.name}`,
      `TASK: ${task.title}`,
      `COMPLETED BY: ${task.assignee || 'Manual (dashboard)'}`,
      ``,
      `Please verify this task is truly complete. If satisfied, run:`,
      `  mc-report task-verify ${task.id} ATLAS "Verified"`,
      `If rework is needed:`,
      `  mc-report task-reopen ${task.id} ATLAS "Reason for rework"`
    ].join('\n');

    execAsync(
      `openclaw agent --agent main --channel telegram --deliver --message ${JSON.stringify(verifyMsg)}`,
      { timeout: 60000 }
    ).catch(err => console.error('Verification dispatch failed:', err.message));

    return { success: true };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// Atlas Chat (Comms)
// ===================

fastify.get('/api/comms/messages', async (request, reply) => {
  try {
    const messages = await prisma.commMessage.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return messages;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/comms/message', async (request, reply) => {
  try {
    const { content } = request.body;
    if (!content || !content.trim()) {
      reply.code(400);
      return { error: 'content is required' };
    }

    const userMessage = await prisma.commMessage.create({
      data: { role: 'user', content: content.trim(), status: 'done' }
    });

    const pendingAtlas = await prisma.commMessage.create({
      data: { role: 'atlas', content: '', status: 'pending' }
    });

    mcEvents.emit('comms:message:user', userMessage);

    // Build context: pull live projects + tasks so Atlas knows the MC dashboard state
    const projects = await prisma.project.findMany({
      include: { tasks: true },
      orderBy: { createdAt: 'asc' }
    });

    const projectSummary = projects.map(p => {
      const tasks = p.tasks || [];
      const open = tasks.filter(t => !['done', 'completed'].includes(t.status));
      const done = tasks.filter(t => ['done', 'completed'].includes(t.status));
      const lines = [
        `  PROJECT: ${p.name} [${p.status}] ${p.progress}% complete`,
        `  Tasks: ${tasks.length} total, ${open.length} open, ${done.length} done`
      ];
      if (open.length > 0) {
        lines.push(`  Open tasks: ${open.map(t => `"${t.title}" (${t.status}${t.assignee ? ', assigned to ' + t.assignee : ''})`).join('; ')}`);
      }
      return lines.join('\n');
    }).join('\n\n');

    const contextualMessage = [
      `[Mission Control Dashboard — Direct Chat]`,
      ``,
      `The user is speaking to you directly via the Mission Control Dashboard chat.`,
      `All references to projects, tasks, and work below are referring to the following`,
      `live project data from the Mission Control Dashboard:`,
      ``,
      projects.length > 0 ? projectSummary : `  (No projects currently in Mission Control)`,
      ``,
      `---`,
      `USER MESSAGE: ${content.trim()}`
    ].join('\n');

    // Run Atlas async — no blocking
    execFileAsync('openclaw', ['agent', '--agent', 'main', '--message', contextualMessage], { timeout: 120000 })
      .then(({ stdout }) => {
        const response = stdout.trim() || '(no response)';
        return prisma.commMessage.update({
          where: { id: pendingAtlas.id },
          data: { content: response, status: 'done' }
        }).then(() => {
          mcEvents.emit('comms:atlas:response', { id: pendingAtlas.id, content: response, status: 'done' });
        });
      })
      .catch(err => {
        const errMsg = 'Error: ' + err.message;
        prisma.commMessage.update({
          where: { id: pendingAtlas.id },
          data: { content: errMsg, status: 'error' }
        }).then(() => {
          mcEvents.emit('comms:atlas:response', { id: pendingAtlas.id, content: 'Atlas could not respond.', status: 'error' });
        }).catch(() => {});
      });

    return { userMessage, atlasMessageId: pendingAtlas.id };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// Project Complete / Reactivate
// ===================

fastify.post('/api/projects/:projectId/complete', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { status: 'completed', progress: 100 }
    });
    await prisma.activity.create({
      data: { projectId, type: 'project', action: 'completed', description: `Project "${project.name}" marked as completed` }
    });
    mcEvents.emit('task:updated', { projectId });
    return { success: true, project };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/projects/:projectId/reactivate', async (request, reply) => {
  try {
    const { projectId } = request.params;
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { status: 'in_progress' }
    });
    await prisma.activity.create({
      data: { projectId, type: 'project', action: 'reactivated', description: `Project "${project.name}" reactivated` }
    });
    mcEvents.emit('task:updated', { projectId });
    return { success: true, project };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// Task Verify / Reopen — called by Atlas via mc-report
// ===================

fastify.post('/api/tasks/:taskId/verify', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const { agentName, message } = request.body;
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { verified: true, verifiedBy: agentName || 'ATLAS', verifiedAt: new Date() }
    });
    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: 'verified',
        description: `${agentName || 'ATLAS'} verified task "${task.title}"${message ? ': ' + message : ''}`
      }
    });
    mcEvents.emit('task:updated', { taskId, task, verified: true });
    return { success: true, task };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify.post('/api/tasks/:taskId/reopen', async (request, reply) => {
  try {
    const { taskId } = request.params;
    const { agentName, message } = request.body;
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: 'in_progress', verified: false, verifiedBy: null, verifiedAt: null, completedAt: null, progress: 0 }
    });
    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: 'reopened',
        description: `${agentName || 'ATLAS'} reopened task "${task.title}"${message ? ': ' + message : ''}`
      }
    });
    mcEvents.emit('task:updated', { taskId, task, reopened: true });
    return { success: true, task };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// ===================
// Dispatch to Atlas — sends task to Atlas via OpenClaw
// ===================

fastify.post('/api/dispatch/atlas', async (request, reply) => {
  try {
    const { taskId } = request.body;
    if (!taskId) {
      reply.code(400);
      return { error: 'taskId required' };
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });
    if (!task) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    // Build structured message for Atlas per AGENTS.md Section 7.2
    const dueStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Not set';
    const message = [
      `New task dispatched from Mission Control:`,
      ``,
      `MISSION_CONTROL_TASK_ID: ${task.id}`,
      `PROJECT: ${task.project.name}`,
      `TASK: ${task.title}`,
      `DESCRIPTION: ${task.description || 'No description provided'}`,
      `PRIORITY: ${task.priority || 'medium'}`,
      `DUE DATE: ${dueStr}`,
      `CURRENT ASSIGNEE: ${task.assignee || 'Unassigned'}`,
      ``,
      `Apply the command cycle: RECEIVE → UNDERSTAND INTENT → ASSESS → PLAN → DELEGATE → MONITOR → REPORT`,
      `Use mc-report to track progress on this task.`
    ].join('\n');

    // Send to Atlas via OpenClaw — deliver reply back to Grim via Telegram
    const { stdout, stderr } = await execAsync(
      `openclaw agent --agent main --channel telegram --deliver --message ${JSON.stringify(message)}`,
      { timeout: 60000 }
    );

    // Mark task as assigned/dispatched in DB
    await prisma.task.update({
      where: { id: taskId },
      data: { assignee: task.assignee || 'ATLAS', status: task.status === 'pending' ? 'assigned' : task.status }
    });

    await prisma.activity.create({
      data: {
        projectId: task.projectId,
        type: 'task',
        action: 'dispatched',
        description: `Task "${task.title}" dispatched to Atlas`
      }
    });

    mcEvents.emit('task:updated', { taskId });

    return { success: true, message: 'Dispatched to Atlas' };
  } catch (error) {
    console.error('Dispatch to Atlas failed:', error.message);
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

// OpenClaw health check — cached 30s + promise coalescing to prevent stampede
let healthCache = { result: null, ts: 0 };
let healthPending = null;
fastify.get('/api/openclaw/health', async (request, reply) => {
  if (Date.now() - healthCache.ts < 30000 && healthCache.result) {
    return healthCache.result;
  }
  if (!healthPending) {
    healthPending = checkOpenClawHealth().then(isHealthy => {
      healthCache = {
        result: { openclaw: isHealthy ? 'connected' : 'disconnected', timestamp: new Date().toISOString() },
        ts: Date.now()
      };
      healthPending = null;
      return healthCache.result;
    }).catch(() => {
      healthPending = null;
      return healthCache.result || { openclaw: 'disconnected', timestamp: new Date().toISOString() };
    });
  }
  return healthPending;
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
// Cache openclaw sessions 30s + promise coalescing to prevent stampede
let sessionsCache = { result: null, ts: 0 };
let sessionsPending = null;
fastify.get('/api/openclaw/sessions', async (request, reply) => {
  if (Date.now() - sessionsCache.ts < 30000 && sessionsCache.result) {
    return sessionsCache.result;
  }
  if (!sessionsPending) {
    sessionsPending = execAsync(
      'openclaw gateway call status --json --timeout 5000',
      { timeout: 10000 }
    ).then(({ stdout }) => {
      const status = JSON.parse(stdout);
      sessionsCache = {
        result: {
          agents: status.heartbeat?.agents || [],
          sessions: status.sessions?.recent || [],
          count: status.sessions?.count || 0
        },
        ts: Date.now()
      };
      sessionsPending = null;
      return sessionsCache.result;
    }).catch(error => {
      sessionsPending = null;
      if (sessionsCache.result) return sessionsCache.result;
      return { agents: [], sessions: [], count: 0 };
    });
  }
  return sessionsPending;
});

start();
