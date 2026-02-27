/**
 * Mission Control Dashboard - Database Seed Script
 * Populates the database with demo data matching data.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create agents
  const codeWright = await prisma.agent.create({
    data: {
      name: 'CodeWright',
      role: 'coding',
      status: 'idle',
      capabilities: JSON.stringify(['full-stack', 'debugging', 'refactoring']),
      model: 'MiniMax-M2.1',
      agentActivity: JSON.stringify({
        currentAction: '',
        logs: [],
        issues: [{ timestamp: new Date().toISOString(), issue: 'API rate limit exceeded', resolution: '', resolved: false }]
      })
    }
  });

  const researcher = await prisma.agent.create({
    data: {
      name: 'Researcher',
      role: 'research',
      status: 'idle',
      capabilities: JSON.stringify(['web-search', 'analysis', 'documentation']),
      model: 'MiniMax-M2.1'
    }
  });

  const qaTester = await prisma.agent.create({
    data: {
      name: 'QA Tester',
      role: 'qa',
      status: 'idle',
      capabilities: JSON.stringify(['testing', 'bug-detection', 'validation']),
      model: 'MiniMax-M2.1'
    }
  });

  const atlas = await prisma.agent.create({
    data: {
      name: 'ATLAS',
      role: 'coordinator',
      status: 'active',
      capabilities: JSON.stringify(['coordination', 'task-assignment', 'monitoring']),
      model: 'MiniMax-M2.1'
    }
  });

  console.log('✅ Created agents');

  // Create Cost Monitor Project
  const costMonitor = await prisma.project.create({
    data: {
      name: 'Cost Monitor',
      description: 'Track and optimize AI agent operational costs',
      problemStatement: 'Current AI agent operations lack visibility into resource consumption and costs.',
      solution: 'Build a comprehensive cost monitoring dashboard with real-time tracking and alerts.',
      plan: JSON.stringify(['Research dashboard UX patterns', 'Design data model for cost tracking', 'Build dashboard UI components', 'Create cost aggregation service', 'Integrate with OpenClaw APIs']),
      status: 'in_progress',
      progress: 40,
      startDate: '2026-02-01',
      targetEndDate: '2026-03-01',
      owner: 'ATLAS'
    }
  });

  // Add notes to Cost Monitor
  await prisma.note.createMany({
    data: [
      {
        projectId: costMonitor.id,
        author: 'ATLAS',
        authorRole: 'agent',
        content: 'Initial project kickoff - prioritizing cost visibility across all agents.',
        noteType: 'summary'
      },
      {
        projectId: costMonitor.id,
        author: 'Researcher',
        authorRole: 'agent',
        content: 'Completed initial research on dashboard UX patterns. Found some great examples to reference.',
        noteType: 'progress'
      }
    ]
  });

  // Add messages to Cost Monitor
  await prisma.message.createMany({
    data: [
      {
        projectId: costMonitor.id,
        author: 'CodeWright',
        authorRole: 'agent',
        content: "I've encountered an issue with the API rate limits. We need to implement caching or batching to avoid hitting limits. Any ideas?",
        messageType: 'issue'
      },
      {
        projectId: costMonitor.id,
        author: 'Researcher',
        authorRole: 'agent',
        content: 'I found that OpenClaw exposes cost data through the session status endpoint. We can poll that every minute and aggregate locally.',
        messageType: 'idea'
      },
      {
        projectId: costMonitor.id,
        author: 'ATLAS',
        authorRole: 'agent',
        content: "Great find! Let's implement that approach. CodeWright - can you create a cost aggregation service based on Researcher's findings?",
        messageType: 'note'
      }
    ]
  });

  // Create tasks for Cost Monitor
  const task1 = await prisma.task.create({
    data: {
      projectId: costMonitor.id,
      title: 'Research dashboard UX patterns',
      description: 'Analyze best practices for mission control dashboards',
      status: 'done',
      priority: 'high',
      assignee: 'Researcher'
    }
  });

  const task2 = await prisma.task.create({
    data: {
      projectId: costMonitor.id,
      title: 'Design data model for cost tracking',
      description: 'Create JSON schema for cost data',
      status: 'done',
      priority: 'high',
      assignee: 'ATLAS'
    }
  });

  const task3 = await prisma.task.create({
    data: {
      projectId: costMonitor.id,
      title: 'Build dashboard UI components',
      description: 'Create HTML/CSS/JS for the dashboard',
      status: 'in_progress',
      priority: 'high',
      assignee: 'CodeWright'
    }
  });

  const task4 = await prisma.task.create({
    data: {
      projectId: costMonitor.id,
      title: 'Create cost aggregation service',
      description: 'Backend service to collect cost data from agents',
      status: 'pending',
      priority: 'medium',
      assignee: 'CodeWright'
    }
  });

  const task5 = await prisma.task.create({
    data: {
      projectId: costMonitor.id,
      title: 'Integrate with OpenClaw APIs',
      description: 'Connect to OpenClaw cost tracking endpoints',
      status: 'pending',
      priority: 'medium'
    }
  });

  console.log('✅ Created Cost Monitor project with tasks');

  // Create Atlas Dashboard Project
  const atlasDashboard = await prisma.project.create({
    data: {
      name: 'Atlas Dashboard',
      description: 'Mission control interface for managing AI operations',
      problemStatement: 'Need a centralized dashboard to monitor all AI agents, their tasks, and system health.',
      solution: 'Build a comprehensive dashboard with project tracking, agent monitoring, and real-time updates.',
      plan: JSON.stringify(['Design dashboard wireframes', 'Implement frontend UI', 'Add real-time updates', 'Integrate with OpenClaw', 'Add agent coordination features']),
      status: 'in_progress',
      progress: 75,
      startDate: '2026-01-15',
      targetEndDate: '2026-03-15',
      owner: 'ATLAS'
    }
  });

  // Create tasks for Atlas Dashboard
  await prisma.task.createMany({
    data: [
      {
        projectId: atlasDashboard.id,
        title: 'Design dashboard wireframes',
        description: 'Create low-fidelity mockups of the dashboard interface',
        status: 'done',
        priority: 'high',
        assignee: 'ATLAS'
      },
      {
        projectId: atlasDashboard.id,
        title: 'Implement frontend UI',
        description: 'Build the HTML/CSS/JS frontend with all components',
        status: 'in_progress',
        priority: 'high',
        assignee: 'CodeWright'
      },
      {
        projectId: atlasDashboard.id,
        title: 'Add real-time updates',
        description: 'Implement WebSocket connections for live data',
        status: 'pending',
        priority: 'medium',
        assignee: 'CodeWright'
      },
      {
        projectId: atlasDashboard.id,
        title: 'Integrate with OpenClaw',
        description: 'Connect dashboard to OpenClaw for agent management',
        status: 'pending',
        priority: 'high'
      },
      {
        projectId: atlasDashboard.id,
        title: 'Add agent coordination features',
        description: 'Enable task assignment and progress tracking',
        status: 'pending',
        priority: 'medium'
      }
    ]
  });

  console.log('✅ Created Atlas Dashboard project');

  // Create OpenClaw Integration Project
  const openClawIntegration = await prisma.project.create({
    data: {
      name: 'OpenClaw Integration',
      description: 'Connect agent system with OpenClaw infrastructure',
      problemStatement: 'Agents need to communicate with OpenClaw for task execution and status updates.',
      solution: 'Create integration layer with WebSocket connections and REST API wrappers.',
      plan: JSON.stringify(['Design communication protocol', 'Implement WebSocket handler', 'Create API wrapper library', 'Add authentication', 'Test full integration']),
      status: 'not_started',
      progress: 0,
      startDate: '2026-03-01',
      targetEndDate: '2026-04-01',
      owner: 'ATLAS'
    }
  });

  // Create tasks for OpenClaw Integration
  await prisma.task.createMany({
    data: [
      {
        projectId: openClawIntegration.id,
        title: 'Design communication protocol',
        description: 'Define message formats and event types for agent↔OpenClaw communication',
        status: 'pending',
        priority: 'high'
      },
      {
        projectId: openClawIntegration.id,
        title: 'Implement WebSocket handler',
        description: 'Build WebSocket server for real-time agent communication',
        status: 'pending',
        priority: 'high'
      },
      {
        projectId: openClawIntegration.id,
        title: 'Create API wrapper library',
        description: 'Develop TypeScript/JS library for OpenClaw API access',
        status: 'pending',
        priority: 'medium'
      },
      {
        projectId: openClawIntegration.id,
        title: 'Add authentication',
        description: 'Implement JWT-based authentication for agents',
        status: 'pending',
        priority: 'high'
      },
      {
        projectId: openClawIntegration.id,
        title: 'Test full integration',
        description: 'End-to-end testing of agent communication',
        status: 'pending',
        priority: 'high'
      }
    ]
  });

  console.log('✅ Created OpenClaw Integration project');

  // Create some activities
  await prisma.activity.createMany({
    data: [
      {
        projectId: costMonitor.id,
        type: 'project',
        action: 'created',
        description: 'Created project: Cost Monitor'
      },
      {
        projectId: atlasDashboard.id,
        type: 'project',
        action: 'created',
        description: 'Created project: Atlas Dashboard'
      },
      {
        projectId: openClawIntegration.id,
        type: 'project',
        action: 'created',
        description: 'Created project: OpenClaw Integration'
      },
      {
        agentId: codeWright.id,
        type: 'agent',
        action: 'created',
        description: 'New agent added: CodeWright'
      },
      {
        agentId: researcher.id,
        type: 'agent',
        action: 'created',
        description: 'New agent added: Researcher'
      },
      {
        agentId: qaTester.id,
        type: 'agent',
        action: 'created',
        description: 'New agent added: QA Tester'
      },
      {
        agentId: atlas.id,
        type: 'agent',
        action: 'created',
        description: 'New agent added: ATLAS'
      },
      {
        projectId: costMonitor.id,
        type: 'task',
        action: 'created',
        description: 'Created task: Research dashboard UX patterns'
      },
      {
        projectId: costMonitor.id,
        type: 'task',
        action: 'created',
        description: 'Created task: Design data model for cost tracking'
      },
      {
        projectId: costMonitor.id,
        type: 'task',
        action: 'created',
        description: 'Created task: Build dashboard UI components'
      },
      {
        projectId: costMonitor.id,
        type: 'task',
        action: 'assigned',
        description: 'ATLAS assigned "Build dashboard UI components" to CodeWright'
      },
      {
        agentId: codeWright.id,
        type: 'agent',
        action: 'error',
        description: 'CodeWright encountered issue: API rate limit exceeded'
      }
    ]
  });

  console.log('✅ Created activities');
  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
