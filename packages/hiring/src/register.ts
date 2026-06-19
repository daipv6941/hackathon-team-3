import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, RouteBuildDeps } from '@seta/core';
import { HIRING_AGENT_TOOLS } from './agent-tools.ts';
import * as schema from './backend/db/index.ts';
import { buildHiringRoutes } from './backend/http/index.ts';
import { mountHiringChatRoutes } from './backend/routes/chat.ts';
import { buildMastra } from './backend/runtime.ts';
import { HIRING_EVENTS } from './events/index.ts';
import { hiringRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerHiringContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'hiring',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    rbac: hiringRbac,
    events: HIRING_EVENTS,
    agentTools: HIRING_AGENT_TOOLS,
    routes: {
      mountAt: '/hiring',
      build: (deps: RouteBuildDeps) => {
        // Initialize Mastra runtime
        const mastra = buildMastra({
          pool: deps.pool,
          databaseUrl: process.env.DATABASE_URL || '',
        });

        // Build and mount Mastra-powered chat routes
        const app = buildHiringRoutes();
        // biome-ignore lint/suspicious/noExplicitAny: Hono's env generics are invariant; we cast to ensure type compatibility
        mountHiringChatRoutes(app as any, { mastra, pool: deps.pool });

        return app;
      },
    },
  });
}
