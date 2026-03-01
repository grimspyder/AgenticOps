/**
 * Tasks API Routes
 */

export default async function tasksRoutes(fastify, options) {
  
  // Get all tasks
  fastify.get('/tasks', async (request, reply) => {
    try {
      const tasks = await fastify.prisma.task.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: true }
      });
      return tasks;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Get single task
  fastify.get('/tasks/:taskId', async (request, reply) => {
    try {
      const { taskId } = request.params;
      const task = await fastify.prisma.task.findUnique({
        where: { id: taskId },
        include: { 
          project: true,
          assignments: true
        }
      });
      
      if (!task) {
        reply.code(404);
        return { error: 'Task not found' };
      }
      
      return task;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Create task (for a specific project)
  fastify.post('/projects/:projectId/tasks', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { 
        title, 
        description, 
        status, 
        priority, 
        assignee, 
        dueDate,
        dependencies,
        subTasks
      } = request.body;
      
      const task = await fastify.prisma.task.create({
        data: {
          projectId,
          title,
          description,
          status: status || 'pending',
          priority: priority || 'medium',
          assignee,
          dueDate,
          dependencies: dependencies ? JSON.stringify(dependencies) : null,
          subTasks: subTasks ? JSON.stringify(subTasks) : null
        }
      });
      
      // Add activity
      await fastify.prisma.activity.create({
        data: {
          projectId,
          type: 'task',
          action: 'created',
          description: `Created task: ${title}`
        }
      });
      
      // Recalculate project progress
      const tasks = await fastify.prisma.task.findMany({ where: { projectId } });
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      const progress = Math.round((completedTasks / tasks.length) * 100);
      
      await fastify.prisma.project.update({
        where: { id: projectId },
        data: { progress }
      });
      
      return task;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Update task
  fastify.put('/tasks/:taskId', async (request, reply) => {
    try {
      const { taskId } = request.params;
      const { 
        title, 
        description, 
        status, 
        priority, 
        assignee,
        assignedBy,
        dueDate,
        dependencies,
        subTasks,
        currentAction
      } = request.body;
      
      const existingTask = await fastify.prisma.task.findUnique({
        where: { id: taskId }
      });
      
      const task = await fastify.prisma.task.update({
        where: { id: taskId },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(status && { status }),
          ...(priority && { priority }),
          ...(assignee !== undefined && { assignee }),
          ...(assignedBy !== undefined && { assignedBy }),
          ...(dueDate !== undefined && { dueDate }),
          ...(dependencies && { dependencies: JSON.stringify(dependencies) }),
          ...(subTasks && { subTasks: JSON.stringify(subTasks) }),
          ...(currentAction !== undefined && { currentAction })
        }
      });
      
      // Add activity if status changed
      if (status && status !== existingTask.status) {
        await fastify.prisma.activity.create({
          data: {
            projectId: existingTask.projectId,
            type: 'task',
            action: status,
            description: `Task "${task.title}" marked as ${status}`
          }
        });
        
        // Recalculate project progress and auto-update status
        const tasks = await fastify.prisma.task.findMany({
          where: { projectId: existingTask.projectId }
        });
        const doneTasks = tasks.filter(t => ['done', 'completed'].includes(t.status));
        const progress = Math.round((doneTasks.length / tasks.length) * 100);

        // Auto-derive project status from task completion
        // (don't override manually-set on_hold or blocked)
        const currentProject = await fastify.prisma.project.findUnique({
          where: { id: existingTask.projectId }
        });
        const manualStatuses = ['blocked', 'on_hold'];
        let autoStatus = null;
        if (!manualStatuses.includes(currentProject.status)) {
          if (doneTasks.length === 0) {
            autoStatus = 'not_started';
          } else if (doneTasks.length === tasks.length) {
            autoStatus = 'completed';
          } else {
            autoStatus = 'in_progress';
          }
        }

        await fastify.prisma.project.update({
          where: { id: existingTask.projectId },
          data: { progress, ...(autoStatus && { status: autoStatus }) }
        });
      }
      
      return task;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Delete task
  fastify.delete('/tasks/:taskId', async (request, reply) => {
    try {
      const { taskId } = request.params;
      
      const task = await fastify.prisma.task.findUnique({
        where: { id: taskId }
      });
      
      if (!task) {
        reply.code(404);
        return { error: 'Task not found' };
      }
      
      const projectId = task.projectId;
      
      await fastify.prisma.task.delete({
        where: { id: taskId }
      });
      
      // Recalculate project progress
      const tasks = await fastify.prisma.task.findMany({ where: { projectId } });
      if (tasks.length > 0) {
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const progress = Math.round((completedTasks / tasks.length) * 100);
        
        await fastify.prisma.project.update({
          where: { id: projectId },
          data: { progress }
        });
      } else {
        await fastify.prisma.project.update({
          where: { id: projectId },
          data: { progress: 0 }
        });
      }
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Log agent activity on task
  fastify.post('/tasks/:taskId/activity', async (request, reply) => {
    try {
      const { taskId } = request.params;
      const { action, details } = request.body;
      
      const task = await fastify.prisma.task.findUnique({
        where: { id: taskId }
      });
      
      if (!task) {
        reply.code(404);
        return { error: 'Task not found' };
      }
      
      // Parse existing logs
      const logs = task.agentLogs ? JSON.parse(task.agentLogs) : [];
      logs.push({
        timestamp: new Date().toISOString(),
        action,
        details
      });
      
      await fastify.prisma.task.update({
        where: { id: taskId },
        data: {
          agentLogs: JSON.stringify(logs),
          currentAction: action
        }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
  
  // Add issue to task
  fastify.post('/tasks/:taskId/issues', async (request, reply) => {
    try {
      const { taskId } = request.params;
      const { issue, resolution } = request.body;
      
      const task = await fastify.prisma.task.findUnique({
        where: { id: taskId }
      });
      
      if (!task) {
        reply.code(404);
        return { error: 'Task not found' };
      }
      
      // Parse existing issues
      const issues = task.agentIssues ? JSON.parse(task.agentIssues) : [];
      issues.push({
        timestamp: new Date().toISOString(),
        issue,
        resolution: resolution || '',
        resolved: false
      });
      
      await fastify.prisma.task.update({
        where: { id: taskId },
        data: {
          agentIssues: JSON.stringify(issues)
        }
      });
      
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
}
