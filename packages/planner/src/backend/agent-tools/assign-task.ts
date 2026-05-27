import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';

export const plannerAssignTaskTool = defineAgentTool({
  id: 'planner_assignTask',
  name: 'Assign Task',
  description:
    'Add one user as an additional assignee without affecting existing assignees. ' +
    'Use only when the user explicitly wants to ADD a collaborator alongside current owners. ' +
    'When the user says "assign to X" or "reassign to X", use planner_setAssignees instead.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
    assigneeUserId: z.string().uuid().describe('The user ID to assign to the task'),
  }),
  output: z.object({
    assignment: z.object({
      taskId: z.string(),
      assigneeUserId: z.string(),
    }),
  }),
  rbac: 'planner.task.assign',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    await assignTask({
      task_id: input.taskId,
      user_id: input.assigneeUserId,
      session,
    });

    return {
      assignment: {
        taskId: input.taskId,
        assigneeUserId: input.assigneeUserId,
      },
    };
  },
});
