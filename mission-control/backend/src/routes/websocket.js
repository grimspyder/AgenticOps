/**
 * Mission Control Dashboard - WebSocket Handler
 * Real-time agent↔dashboard communication
 */
import { mcEvents } from '../events.js';

// Track connected clients
const clients = new Map(); // ws -> { type, agentId, name }

// Broadcast to all connected clients
function broadcast(eventType, data) {
  const message = JSON.stringify({ type: eventType, payload: data, timestamp: new Date().toISOString() });

  for (const [ws, info] of clients) {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    } catch (err) {
      console.error('Broadcast error:', err);
    }
  }
}

// Send to specific agent
function sendToAgent(agentId, eventType, data) {
  const message = JSON.stringify({ type: eventType, payload: data, timestamp: new Date().toISOString() });

  for (const [ws, info] of clients) {
    if (info.agentId === agentId && ws.readyState === 1) {
      ws.send(message);
      return true;
    }
  }
  return false;
}

// Handle incoming WebSocket messages
async function handleMessage(ws, data, prisma) {
  try {
    const message = JSON.parse(data);
    const { type, payload } = message;

    switch (type) {
      case 'agent:register':
        // Agent registers itself
        clients.set(ws, {
          type: 'agent',
          agentId: payload.agentId,
          name: payload.name,
          capabilities: payload.capabilities || [],
          connectedAt: new Date().toISOString()
        });

        console.log(`Agent registered: ${payload.name} (${payload.agentId})`);

        // Update agent status in database
        try {
          await prisma.agent.update({
            where: { id: payload.agentId },
            data: { status: 'active' }
          });
        } catch (e) {
          // Agent might not exist in DB yet, create it
          await prisma.agent.upsert({
            where: { id: payload.agentId },
            update: { status: 'active' },
            create: {
              id: payload.agentId,
              name: payload.name,
              status: 'active',
              capabilities: JSON.stringify(payload.capabilities || [])
            }
          });
        }

        // Broadcast agent connection
        broadcast('agent:connected', {
          agentId: payload.agentId,
          name: payload.name,
          capabilities: payload.capabilities
        });

        // Send current tasks to agent
        const assignedTasks = await prisma.task.findMany({
          where: { assignee: payload.agentId, status: { not: 'done' } },
          include: { project: true }
        });
        sendToAgent(payload.agentId, 'agent:tasks', assignedTasks);
        break;

      case 'agent:status':
        // Agent reports status
        clients.set(ws, {
          ...clients.get(ws),
          status: payload.status,
          currentTaskId: payload.currentTaskId,
          progress: payload.progress
        });

        // Update in database
        await prisma.agent.update({
          where: { id: payload.agentId },
          data: {
            status: payload.status,
            currentTaskId: payload.currentTaskId
          }
        });

        broadcast('agent:status:update', payload);
        break;

      case 'agent:progress': {
        // Agent reports task progress
        const { taskId, progress, message: progressMessage, logs } = payload;

        // Update task in database
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (task) {
          let newStatus = task.status;
          if (progress >= 100) {
            newStatus = 'done';
          } else if (progress > 0) {
            newStatus = 'in_progress';
          }

          await prisma.task.update({
            where: { id: taskId },
            data: { status: newStatus, progress }
          });

          // Add activity
          await prisma.activity.create({
            data: {
              projectId: task.projectId,
              type: 'task',
              action: 'progress',
              description: `Agent reported ${progress}% progress: ${progressMessage}`
            }
          });
        }

        broadcast('task:progress:update', payload);
        break;
      }

      case 'agent:complete': {
        // Agent completes a task
        const { taskId: completeTaskId, result } = payload;

        const completedTask = await prisma.task.findUnique({
          where: { id: completeTaskId },
          include: { project: true }
        });

        if (completedTask) {
          await prisma.task.update({
            where: { id: completeTaskId },
            data: { status: 'done', progress: 100, completedAt: new Date() }
          });

          await prisma.activity.create({
            data: {
              projectId: completedTask.projectId,
              type: 'task',
              action: 'completed',
              description: `Task "${completedTask.title}" completed`
            }
          });
        }

        broadcast('task:completed', { taskId: completeTaskId, result });
        break;
      }

      case 'dashboard:subscribe': {
        // Dashboard client subscribes to events
        clients.set(ws, {
          type: 'dashboard',
          subscriptions: payload.subscriptions || ['*']
        });

        // Send current state
        const state = {
          agents: await prisma.agent.findMany(),
          tasks: await prisma.task.findMany({ where: { status: { not: 'done' } } }),
          activities: await prisma.activity.findMany({ take: 50, orderBy: { createdAt: 'desc' } })
        };
        ws.send(JSON.stringify({ type: 'dashboard:state', payload: state, timestamp: new Date().toISOString() }));
        break;
      }

      default:
        console.log('Unknown message type:', type);
    }
  } catch (err) {
    console.error('WebSocket message error:', err);
  }
}

// Handle client disconnect
async function handleDisconnect(ws, prisma) {
  const info = clients.get(ws);

  if (info && info.type === 'agent') {
    console.log(`Agent disconnected: ${info.name} (${info.agentId})`);

    // Update agent status in database
    try {
      await prisma.agent.update({
        where: { id: info.agentId },
        data: { status: 'offline' }
      });
    } catch (e) {
      // Ignore
    }

    broadcast('agent:disconnected', {
      agentId: info.agentId,
      name: info.name
    });
  }

  clients.delete(ws);
}

export default async function websocketRoutes(fastify, options) {
  const prisma = fastify.prisma;

  // Subscribe to REST-triggered events and broadcast to WebSocket clients
  mcEvents.on('task:updated', (data) => broadcast('task:updated', data));
  mcEvents.on('agent:updated', (data) => broadcast('agent:updated', data));
  mcEvents.on('comms:message:user', (data) => broadcast('comms:message:user', data));
  mcEvents.on('comms:atlas:response', (data) => broadcast('comms:atlas:response', data));
  mcEvents.on('message:new', (data) => broadcast('message:new', data));
  mcEvents.on('note:new', (data) => broadcast('note:new', data));

  // WebSocket endpoint
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket;
    console.log('WebSocket client connected');

    // Handle incoming messages
    socket.on('message', async (data) => {
      await handleMessage(socket, data.toString(), prisma);
    });

    // Handle close
    socket.on('close', async () => {
      await handleDisconnect(socket, prisma);
    });

    // Handle errors
    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    // Send welcome message
    socket.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to Mission Control WebSocket',
      timestamp: new Date().toISOString()
    }));
  });

  // REST endpoint to manually broadcast (for testing)
  fastify.post('/ws/broadcast', async (req, reply) => {
    const { event, data } = req.body;
    broadcast(event, data);
    return { success: true, clients: clients.size };
  });

  // Get connected clients (debug)
  fastify.get('/ws/clients', async () => {
    const clientList = [];
    for (const [ws, info] of clients) {
      clientList.push({
        type: info.type,
        agentId: info.agentId,
        name: info.name,
        connectedAt: info.connectedAt
      });
    }
    return { clients: clientList, count: clientList.length };
  });
}
