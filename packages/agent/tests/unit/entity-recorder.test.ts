import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetMutexesForTests, recordEntityExposure } from '../../src/backend/entity-recorder.ts';
import {
  EMPTY_WORKING_MEMORY,
  serializeWorkingMemory,
  type WorkingMemory,
} from '../../src/backend/working-memory-schema.ts';

function buildCtx(initial: WorkingMemory | null) {
  let stored: string | null = initial ? serializeWorkingMemory(initial) : null;
  const memory = {
    getWorkingMemory: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 0)); // force task-queue yield → interleaves callers
      return stored;
    }),
    updateWorkingMemory: vi.fn(async ({ workingMemory }: { workingMemory: string }) => {
      await new Promise((r) => setTimeout(r, 0)); // yield so both reads land before either write
      stored = workingMemory;
    }),
  };
  return {
    ctx: {
      agent: { threadId: 't-1', resourceId: 'r-1' },
      requestContext: {
        get: (k: string) =>
          k === '__seta_agent_memory__' ? { memory, memoryConfig: {} } : undefined,
      },
    } as never,
    memory,
    read: () => (stored ? (JSON.parse(stored) as WorkingMemory) : null),
  };
}

const T1 = { taskId: '00000000-0000-4000-8000-000000000001', title: 'A' };
const T2 = { taskId: '00000000-0000-4000-8000-000000000002', title: 'B' };

describe('recordEntityExposure', () => {
  beforeEach(() => {
    __resetMutexesForTests();
  });

  it('seeds recentTasks on empty memory', async () => {
    const { ctx, read } = buildCtx(null);
    await recordEntityExposure(ctx, { recentTasks: [T1] });
    expect(read()?.entities.recentTasks).toMatchObject([{ taskId: T1.taskId, title: 'A' }]);
  });

  it('merges-by-taskId, refreshes lastSeenAt, sorts desc, keeps unique', async () => {
    const { ctx, read } = buildCtx({
      ...EMPTY_WORKING_MEMORY,
      entities: {
        ...EMPTY_WORKING_MEMORY.entities,
        recentTasks: [
          { taskId: T1.taskId, title: 'A-old', lastSeenAt: '2020-01-01T00:00:00.000Z' },
        ],
      },
    });
    await recordEntityExposure(ctx, { recentTasks: [T2, T1] });
    const tasks = read()?.entities.recentTasks ?? [];
    expect(tasks.map((t) => t.taskId)).toEqual([T2.taskId, T1.taskId]);
    expect(tasks[1].title).toBe('A'); // title refreshed
  });

  it('truncates to 10 most recent', async () => {
    const { ctx, read } = buildCtx(null);
    const batch = Array.from({ length: 12 }, (_, i) => ({
      taskId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `T${i}`,
    }));
    await recordEntityExposure(ctx, { recentTasks: batch });
    expect(read()?.entities.recentTasks).toHaveLength(10);
  });

  it('patches scalar entity fields without touching recentTasks', async () => {
    const { ctx, read } = buildCtx({
      ...EMPTY_WORKING_MEMORY,
      entities: {
        ...EMPTY_WORKING_MEMORY.entities,
        recentTasks: [{ ...T1, lastSeenAt: '2020-01-01T00:00:00.000Z' }],
      },
    });
    await recordEntityExposure(ctx, { lastDiscussedTaskId: T1.taskId });
    const e = read()?.entities;
    expect(e?.lastDiscussedTaskId).toBe(T1.taskId);
    expect(e?.recentTasks).toHaveLength(1);
  });

  it('preserves userContext when patching entities', async () => {
    const { ctx, read } = buildCtx({
      ...EMPTY_WORKING_MEMORY,
      userContext: { ...EMPTY_WORKING_MEMORY.userContext, timezone: 'Asia/Ho_Chi_Minh' },
    });
    await recordEntityExposure(ctx, { recentTasks: [T1] });
    expect(read()?.userContext.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('is a no-op when RC_AGENT_MEMORY is absent', async () => {
    const ctx = {
      agent: { threadId: 't-1', resourceId: 'r-1' },
      requestContext: { get: () => undefined },
    } as never;
    await expect(recordEntityExposure(ctx, { recentTasks: [T1] })).resolves.toBeUndefined();
  });

  it('serializes concurrent writes per resource (no lost updates)', async () => {
    const { ctx, read } = buildCtx(null);
    await Promise.all([
      recordEntityExposure(ctx, { recentTasks: [T1] }),
      recordEntityExposure(ctx, { recentTasks: [T2] }),
    ]);
    const ids = (read()?.entities.recentTasks ?? []).map((t) => t.taskId).sort();
    expect(ids).toEqual([T1.taskId, T2.taskId].sort());
  });
});
