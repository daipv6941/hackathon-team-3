import { getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.ts';

let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

export function hiringDb(): NodePgDatabase<typeof schema> {
  const pool = getPool('worker');
  if (!cached || cached.pool !== pool) {
    cached = { pool, db: drizzle(pool, { schema }) };
  }
  return cached.db;
}

export function resetHiringDb(): void {
  cached = null;
}
