/**
 * Agents API Routes
 */

export default async function agentsRoutes(fastify, options) {
  
  // Get all agents
  fastify.get('/', async (request, reply) => {
    try {
      const agents = await fastify.prisma.agent.findMany({
        orderBy: { updatedAt: 'desc' }
      });
      return agents;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Get single agent
  fastify.get('/:agentId', async (request, reply) => {
    try {
      const { agentId } = request.params;
      
      // Check if it's a UUID or a name
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({
          where: { id: agentId },
          include: {
            activities: { orderBy: { createdAt: 'desc' }, take: 20 }
          }
        });
      } catch {
        // If UUID format fails, try finding by name
        agent = await fastify.prisma.agent.findFirst({
          where: { name: { contains: agentId } },
          include: {
            activities: { orderBy: { createdAt: 'desc' }, take: 20 }
          }
        });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      return agent;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Create agent
  fastify.post('/', async (request, reply) => {
    try {
      const { 
        name, 
        role, 
        capabilities, 
        model 
      } = request.body;
      
      // Check if agent with this name exists
      const existing = await fastify.prisma.agent.findUnique({
        where: { name }
      });
      
      if (existing) {
        reply.code(409);
        return { error: 'Agent with this name already exists' };
      }
      
      const agent = await fastify.prisma.agent.create({
        data: {
          name,
          role: role || 'general',
          capabilities: capabilities ? JSON.stringify(capabilities) : null,
          model,
          status: 'idle'
        }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          agentId: agent.id,
          type: 'agent',
          action: 'created',
          description: `New agent added: ${name}`
        }
      });
      
      return agent;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Update agent
  fastify.put('/:agentId', async (request, reply) => {
    try {
      const { agentId } = request.params;
      const { 
        name, 
        role, 
        status, 
        currentTaskId,
        currentTaskTitle,
        capabilities,
        model,
        totalTasksCompleted,
        totalErrors
      } = request.body;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      const oldStatus = agent.status;
      
      const updated = await fastify.prisma.agent.update({
        where: { id: agent.id },
        data: {
          ...(name && { name }),
          ...(role && { role }),
          ...(status !== undefined && { status }),
          ...(currentTaskId !== undefined && { currentTaskId }),
          ...(currentTaskTitle !== undefined && { currentTaskTitle }),
          ...(capabilities && { capabilities: JSON.stringify(capabilities) }),
          ...(model !== undefined && { model }),
          ...(totalTasksCompleted !== undefined && { totalTasksCompleted }),
          ...(totalErrors !== undefined && { totalErrors })
        }
      });
      
      // Add activity if status changed
      if (status && status !== oldStatus) {
        await fastify.prisma.activity.create({
          data: {
            agentId: agent.id,
            type: 'agent',
            action: status,
            description: `Agent ${agent.name} is now ${status}`
          }
        });
      }
      
      return updated;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Update agent status
  fastify.patch('/:agentId/status', async (request, reply) => {
    try {
      const { agentId } = request.params;
      const { status, currentTaskId, currentTaskTitle } = request.body;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      const oldStatus = agent.status;
      
      const updated = await fastify.prisma.agent.update({
        where: { id: agent.id },
        data: {
          status,
          ...(currentTaskId !== undefined && { currentTaskId }),
          ...(currentTaskTitle !== undefined && { currentTaskTitle })
        }
      });
      
      // Add activity
      if (status && status !== oldStatus) {
        await fastify.prisma.activity.create({
          data: {
            agentId: agent.id,
            type: 'agent',
            action: status,
            description: `Agent ${agent.name} is now ${status}`
          }
        });
      }
      
      return updated;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Delete agent
  fastify.delete('/:agentId', async (request, reply) => {
    try {
      const { agentId } = request.params;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      await fastify.prisma.agent.delete({
        where: { id: agent.id }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Log agent activity
  fastify.post('/:agentId/activity', async (request, reply) => {
    try {
      const { agentId } = request.params;
      const { action, details } = request.body;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      // Parse existing activity
      const activity = agent.agentActivity ? JSON.parse(agent.agentActivity) : {
        currentAction: '',
        logs: [],
        issues: []
      };
      
      activity.logs.push({
        timestamp: new Date().toISOString(),
        action,
        details
      });
      activity.currentAction = action;
      
      await fastify.prisma.agent.update({
        where: { id: agent.id },
        data: {
          agentActivity: JSON.stringify(activity),
          updatedAt: new Date()
        }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Log agent issue
  fastify.post('/:agentId/issues', async (request, reply) => {
    try {
      const { agentId } = request.params;
      const { issue, resolution } = request.body;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      // Parse existing activity
      const activity = agent.agentActivity ? JSON.parse(agent.agentActivity) : {
        currentAction: '',
        logs: [],
        issues: []
      };
      
      activity.issues.push({
        timestamp: new Date().toISOString(),
        issue,
        resolution: resolution || '',
        resolved: false
      });
      
      await fastify.prisma.agent.update({
        where: { id: agent.id },
        data: {
          agentActivity: JSON.stringify(activity),
          totalErrors: agent.totalErrors + 1,
          updatedAt: new Date()
        }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          agentId: agent.id,
          type: 'agent',
          action: 'error',
          description: `${agent.name} encountered issue: ${issue}`
        }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Resolve agent issue
  fastify.post('/:agentId/issues/:issueIndex/resolve', async (request, reply) => {
    try {
      const { agentId, issueIndex } = request.params;
      const { resolution } = request.body;
      
      // Get existing agent
      let agent;
      try {
        agent = await fastify.prisma.agent.findUnique({ where: { id: agentId } });
      } catch {
        agent = await fastify.prisma.agent.findFirst({ where: { name: { contains: agentId } } });
      }
      
      if (!agent) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      
      // Parse existing activity
      const activity = agent.agentActivity ? JSON.parse(agent.agentActivity) : {
        currentAction: '',
        logs: [],
        issues: []
      };
      
      if (activity.issues[issueIndex]) {
        activity.issues[issueIndex].resolution = resolution;
        activity.issues[issueIndex].resolved = true;
        activity.issues[issueIndex].resolvedAt = new Date().toISOString();
        
        await fastify.prisma.agent.update({
          where: { id: agent.id },
          data: {
            agentActivity: JSON.stringify(activity),
            updatedAt: new Date()
          }
        });
      }
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
}
