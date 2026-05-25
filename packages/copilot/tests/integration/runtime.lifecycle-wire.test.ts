import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { buildMastra } from '../../src/backend/runtime.ts';
import { withCopilotTestDb } from '../helpers.ts';

// Build a requestContext.toJSON()-shaped payload from the codebase convention:
// `actor: { user_id }` + `tenant_id`. Goes through a real RequestContext so the
// test locks in the actual wire format that Mastra's execution engine emits.
function rcPayload(args: { tenantId: string; startedBy: string }): Record<string, unknown> {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: args.startedBy });
  rc.set('tenant_id', args.tenantId);
  return rc.toJSON();
}

describe('lifecycle hook wiring', () => {
  it('publishing workflow.start on the global pubsub writes a workflow_runs row', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();

      const runId = randomUUID();
      const tenantId = randomUUID();
      const startedBy = randomUUID();

      await mastra.pubsub.publish('workflows', {
        type: 'workflow.start',
        runId,
        data: {
          workflowId: 'copilot.test.noop',
          runId,
          requestContext: rcPayload({ tenantId, startedBy }),
          prevResult: { status: 'success', output: { taskTitle: 'demo' } },
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      const r = await pool.query(
        `SELECT workflow_id, tenant_id, started_by, started_via, status FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0]!.workflow_id).toBe('copilot.test.noop');
      expect(r.rows[0]!.tenant_id).toBe(tenantId);
      expect(r.rows[0]!.started_by).toBe(startedBy);
      expect(r.rows[0]!.started_via).toBe('event');
      expect(r.rows[0]!.status).toBe('running');
    });
  });

  it('publishing workflow.end on workflows-finish marks the run completed', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();

      const runId = randomUUID();
      const tenantId = randomUUID();
      const startedBy = randomUUID();

      await mastra.pubsub.publish('workflows', {
        type: 'workflow.start',
        runId,
        data: {
          workflowId: 'copilot.test.noop',
          runId,
          requestContext: rcPayload({ tenantId, startedBy }),
          prevResult: { status: 'success', output: {} },
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      await mastra.pubsub.publish('workflows-finish', {
        type: 'workflow.end',
        runId,
        data: {
          workflowId: 'copilot.test.noop',
          runId,
          durationMs: 123,
          state: { result: { output: { ok: true } } },
        },
      });
      await new Promise((r) => setTimeout(r, 100));

      const r = await pool.query(
        `SELECT status, duration_ms FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.status).toBe('success');
      expect(r.rows[0]!.duration_ms).toBe(123);
    });
  });

  it('ignores workflow.step.* events on the workflows topic', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      const runId = randomUUID();
      await mastra.pubsub.publish('workflows', {
        type: 'workflow.step.run',
        runId,
        data: { workflowId: 'copilot.x' },
      });
      await new Promise((r) => setTimeout(r, 50));
      const r = await pool.query(
        `SELECT count(*)::int AS n FROM copilot.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.n).toBe(0);
    });
  });
});
