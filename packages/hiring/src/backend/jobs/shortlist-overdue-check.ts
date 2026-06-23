import { coreEvents } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { requestNotification } from '@seta/notifications';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { TaskList } from 'graphile-worker';
import { HIRING_SHORTLIST_OVERDUE } from '../../events/index.ts';
import { hiringDb } from '../db/client.ts';
import { hiringRequests } from '../db/schema.ts';

export const hiringJobs: TaskList = {
  'hiring.shortlist_overdue_check': async () => {
    const db = hiringDb();

    const overdueRequests = await db
      .select({
        request_id: hiringRequests.request_id,
        tenant_id: hiringRequests.tenant_id,
        hr_owner: hiringRequests.hr_owner,
        position_title: hiringRequests.position_title,
        updated_at: hiringRequests.updated_at,
      })
      .from(hiringRequests)
      .where(
        and(
          eq(hiringRequests.request_status, 'Shortlist Ready'),
          lt(hiringRequests.updated_at, sql`NOW() - INTERVAL '48 hours'`),
        ),
      );

    for (const request of overdueRequests) {
      await withEmit(undefined, async (tx) => {
        // Deduplicate: only emit once per request
        const existing = await tx
          .select({ id: coreEvents.id })
          .from(coreEvents)
          .where(
            and(
              eq(coreEvents.eventType, HIRING_SHORTLIST_OVERDUE),
              eq(coreEvents.aggregateId, request.request_id),
            ),
          )
          .limit(1);

        if (existing.length > 0) return;

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

        await requestNotification({
          tenant_id: request.tenant_id,
          event_type: HIRING_SHORTLIST_OVERDUE,
          user_ids: [request.hr_owner],
          source_event_id: eventId,
          payload: {
            title: 'Shortlist pending review',
            body: `"${request.position_title}" shortlist has been ready for over 48 hours.`,
            request_id: request.request_id,
          },
        });
      });
    }
  },
};
