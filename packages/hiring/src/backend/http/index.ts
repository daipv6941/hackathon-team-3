import { coreEvents } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { NOTIFICATION_REQUESTED, NOTIFICATION_REQUESTED_VERSION } from '@seta/notifications';
import { and, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { HIRING_SHORTLIST_OVERDUE } from '../../events/index.ts';
import * as schema from '../db/schema.ts';

export function buildHiringRoutes(pool?: Pool) {
  const app = new Hono();

  // NOTE: POST /v1/chat and GET /v1/jd are mounted by mountHiringChatRoutes() in register.ts
  // This keeps message persistence and full JD details separate from request routing.

  /**
   * GET /v1/candidates/:requestId
   * Get screened candidates for a request
   */
  app.get('/v1/candidates/:_requestId', async (c) => {
    try {
      // TODO: Query database
      return c.json([
        {
          cvId: 'CV-001',
          candidateName: 'Candidate A',
          fitScore: 88,
          recommendation: 'Pass',
          rank: 1,
        },
      ]);
    } catch (error) {
      console.error('Candidates error:', error);
      return c.json({ error: 'Failed to fetch candidates' }, 500);
    }
  });

  /**
   * POST /v1/trigger-overdue-check
   * Immediately notify all "Shortlist Ready" requests, bypassing the 48h threshold.
   * Runs inline (no job queue) so the caller sees the effect within seconds.
   */
  app.post('/v1/trigger-overdue-check', async (c) => {
    if (!pool) return c.json({ error: 'Pool not available' }, 503);
    try {
      const db = drizzle(pool, { schema });
      const overdueRequests = await db
        .select({
          request_id: schema.hiringRequests.request_id,
          tenant_id: schema.hiringRequests.tenant_id,
          hr_owner: schema.hiringRequests.hr_owner,
          position_title: schema.hiringRequests.position_title,
          updated_at: schema.hiringRequests.updated_at,
        })
        .from(schema.hiringRequests)
        .where(eq(schema.hiringRequests.request_status, 'Shortlist Ready'));

      let notified = 0;
      for (const request of overdueRequests) {
        await withEmit(undefined, async (tx) => {
          // Skip if already notified in the last 5 minutes (prevents button spam)
          const recent = await tx
            .select({ id: coreEvents.id })
            .from(coreEvents)
            .where(
              and(
                eq(coreEvents.eventType, HIRING_SHORTLIST_OVERDUE),
                eq(coreEvents.aggregateId, request.request_id),
                gt(coreEvents.occurredAt, sql`NOW() - INTERVAL '5 minutes'`),
              ),
            )
            .limit(1);

          if (recent.length > 0) return;

          const { eventId } = await emit({
            tenantId: request.tenant_id,
            aggregateType: 'hiring.request',
            aggregateId: request.request_id,
            eventType: HIRING_SHORTLIST_OVERDUE,
            eventVersion: 1,
            payload: {
              request_id: request.request_id,
              tenant_id: request.tenant_id,
              hr_owner: request.hr_owner,
              position_title: request.position_title,
              overdue_since: request.updated_at.toISOString(),
            },
          });
          await emit({
            tenantId: request.tenant_id,
            aggregateType: 'notification',
            aggregateId: eventId,
            eventType: NOTIFICATION_REQUESTED,
            eventVersion: NOTIFICATION_REQUESTED_VERSION,
            payload: {
              target_event_type: HIRING_SHORTLIST_OVERDUE,
              target_payload: {
                title: 'Shortlist pending review',
                body: `"${request.position_title}" shortlist has been ready for over 48 hours.`,
                request_id: request.request_id,
              },
              user_ids: [request.hr_owner],
              source_event_id: eventId,
            },
          });
          notified++;
        });
      }

      return c.json({ ok: true, notified });
    } catch (error) {
      console.error('Trigger overdue check error:', error);
      return c.json({ error: 'Failed to trigger notifications' }, 500);
    }
  });

  // Debug endpoint
  app.get('/v1/routes', (c) => {
    return c.json({
      status: 'ok',
      routes: [
        'POST /v1/chat (streaming)',
        'GET /v1/requests',
        'GET /v1/jd/:jdId',
        'GET /v1/candidates/:requestId',
        'POST /v1/shortlist/confirm (in routes/chat.ts)',
      ],
    });
  });

  console.log('[hiring] buildHiringRoutes() called - app created with streaming support');
  return app;
}
