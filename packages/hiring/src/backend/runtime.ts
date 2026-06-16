import { Mastra } from '@mastra/core';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { PostgresStore } from '@mastra/pg';
import type { Pool } from 'pg';

export type HiringRuntimeDeps = {
  pool: Pool;
  databaseUrl: string;
  log?: { error: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
  storage?: MastraCompositeStore;
};

/**
 * Builds the store the hiring runtime uses (PostgresStore, schema `hiring`).
 * Shared between the hiring engine and per-turn Mastra for cross-instance
 * native-suspend resume.
 */
export function createHiringMastraStorage(deps: { pool: Pool }): MastraCompositeStore {
  return new PostgresStore({
    id: 'hiring-store',
    schemaName: 'hiring',
    pool: deps.pool,
  });
}

export function buildMastra(deps: HiringRuntimeDeps): Mastra {
  const storage = deps.storage ?? createHiringMastraStorage({ pool: deps.pool });
  const mastra = new Mastra({
    storage,
    logger: new ConsoleLogger({
      name: 'Hiring',
      level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
    }),
  });
  return mastra;
}
