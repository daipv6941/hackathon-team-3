import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { setAssignees } from '../domain/set-assignees.ts';

export const plannerSetAssigneesTool = defineAgentTool({
  id: 'planner_setAssignees',
  name: 'Set Task Assignees',
  description:
    'Replace the complete assignee list for a task. ' +
    'Use when the user says "assign to X" (meaning X should be the sole or primary assignee) ' +
    'or "assign to X and Y" (replacing whoever is currently assigned). ' +
    'Prefer this over planner_assignTask whenever the intent is to set who owns the task, ' +
    'not just to add a collaborator alongside existing assignees.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
    assigneeUserIds: z
      .array(z.string().uuid())
      .min(1)
      .describe('Complete list of user IDs that should be assigned after this operation'),
  }),
  output: z.object({
    taskId: z.string(),
    assigneeUserIds: z.array(z.string()),
  }),
  rbac: 'planner.task.assign',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    await setAssignees({
      task_id: input.taskId,
      user_ids: input.assigneeUserIds,
      session,
    });

    return {
      taskId: input.taskId,
      assigneeUserIds: input.assigneeUserIds,
    };
  },
});
