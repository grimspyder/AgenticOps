/**
 * Projects API Routes
 */

export default async function projectsRoutes(fastify, options) {
  
  // Get all projects
  fastify.get('/', async (request, reply) => {
    try {
      const projects = await fastify.prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          tasks: true,
          notes: true,
          messages: true
        }
      });
      return projects;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Get single project
  fastify.get('/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          tasks: true,
          notes: { orderBy: { createdAt: 'desc' } },
          messages: { orderBy: { createdAt: 'desc' } },
          activities: { orderBy: { createdAt: 'desc' }, take: 20 }
        }
      });
      
      if (!project) {
        reply.code(404);
        return { error: 'Project not found' };
      }
      
      return project;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Create project
  fastify.post('/', async (request, reply) => {
    try {
      const { 
        name, 
        description, 
        problemStatement, 
        solution, 
        plan, 
        status,
        startDate, 
        targetEndDate, 
        owner 
      } = request.body;
      
      const project = await fastify.prisma.project.create({
        data: {
          name,
          description,
          problemStatement,
          solution,
          plan: plan ? JSON.stringify(plan) : null,
          status: status || 'not_started',
          startDate,
          targetEndDate,
          owner
        }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          projectId: project.id,
          type: 'project',
          action: 'created',
          description: `Created project: ${name}`
        }
      });
      
      return project;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Update project
  fastify.put('/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { 
        name, 
        description, 
        problemStatement, 
        solution, 
        plan, 
        status, 
        progress,
        startDate, 
        targetEndDate, 
        owner 
      } = request.body;
      
      const project = await fastify.prisma.project.update({
        where: { id: projectId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(problemStatement !== undefined && { problemStatement }),
          ...(solution !== undefined && { solution }),
          ...(plan && { plan: JSON.stringify(plan) }),
          ...(status && { status }),
          ...(progress !== undefined && { progress }),
          ...(startDate && { startDate }),
          ...(targetEndDate !== undefined && { targetEndDate }),
          ...(owner !== undefined && { owner })
        }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          projectId: project.id,
          type: 'project',
          action: 'updated',
          description: `Updated project: ${name || project.name}`
        }
      });
      
      return project;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Delete project
  fastify.delete('/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId }
      });
      
      if (!project) {
        reply.code(404);
        return { error: 'Project not found' };
      }
      
      await fastify.prisma.project.delete({
        where: { id: projectId }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          type: 'project',
          action: 'deleted',
          description: `Deleted project: ${project.name}`
        }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Get project tasks
  fastify.get('/:projectId/tasks', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const tasks = await fastify.prisma.task.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' }
      });
      return tasks;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Recalculate project progress
  fastify.post('/:projectId/recalculate-progress', async (request, reply) => {
    try {
      const { projectId } = request.params;
      
      const tasks = await fastify.prisma.task.findMany({
        where: { projectId }
      });
      
      if (tasks.length === 0) {
        await fastify.prisma.project.update({
          where: { id: projectId },
          data: { progress: 0 }
        });
        return { progress: 0 };
      }
      
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      const progress = Math.round((completedTasks / tasks.length) * 100);
      
      await fastify.prisma.project.update({
        where: { id: projectId },
        data: { progress }
      });
      
      return { progress };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
}
