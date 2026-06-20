import type { Mastra } from '@mastra/core';
import { desc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as schema from '../db/index.ts';
import {
  draftJd,
  extractRequestDetails,
  fetchContext,
  reviseJdWithFeedback,
  scoreJd,
} from '../orchestration.ts';

export interface HiringRouteDeps {
  mastra: Mastra;
  pool?: Pool;
}

export interface HiringRouteEnv {
  Variables: {
    session?: {
      tenant_id: string;
      user_id: string;
    };
  };
}

const ChatBody = z.object({
  threadId: z.string().optional(),
  messages: z.array(z.unknown()),
  requestId: z.string(),
  phase: z.string().optional(),
});

export function mountHiringChatRoutes(app: Hono<HiringRouteEnv>, deps: HiringRouteDeps): void {
  const getDb = () => {
    if (!deps.pool) throw new Error('Pool not provided to hiring routes');
    return drizzle(deps.pool, { schema });
  };

  app.post('/v1/threads', async (c) => {
    try {
      const body = await c.req.json();
      const {
        requestId: reqId,
        title: threadTitle,
        flow,
        initialMessage,
      } = body as Record<string, unknown>;

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const threadId = `hiring-${crypto.randomUUID()}`;

      let context: Record<string, unknown> | null = null;
      let title = threadTitle || `Hiring - ${flow || 'New'}`;

      if (reqId && typeof reqId === 'string') {
        const fetchedContext = (await fetchContext({
          requestId: reqId,
          tenantId: session.tenant_id,
        })) as Record<string, unknown>;
        if (Object.keys(fetchedContext).length > 0) {
          context = fetchedContext;
        }
        title =
          typeof threadTitle === 'string' ? threadTitle : `Hiring - ${fetchedContext.position}`;
      }

      const metadata: Record<string, unknown> = { createdVia: 'api' };
      if (flow) metadata.flow = flow;

      const threadValues = {
        id: threadId,
        tenant_id: session.tenant_id,
        user_id: session.user_id,
        request_id: reqId ? String(reqId) : undefined,
        title,
        context: context as Record<string, unknown> | null,
        current_phase: 'selection',
        metadata: metadata as Record<string, unknown>,
      };

      await db.insert(schema.hiringThreads).values(threadValues as any);

      if (initialMessage && typeof initialMessage === 'string') {
        await db.insert(schema.hiringMessages).values({
          thread_id: threadId,
          role: 'assistant',
          content: initialMessage,
          type: 'action',
        });
      }

      console.log(`✅ Thread ${threadId} created for flow: ${flow}`);
      return c.json({ threadId, success: true }, 201);
    } catch (error) {
      console.error('Create thread error:', error);
      return c.json({ error: 'Failed to create thread' }, 500);
    }
  });

  app.post('/v1/messages', async (c) => {
    try {
      const body = await c.req.json();
      const { threadId, role, content, type, thinking_content, metadata } = body as Record<
        string,
        unknown
      >;

      if (!threadId || !role || !content) {
        return c.json({ error: 'threadId, role, and content required' }, 400);
      }

      const db = getDb();
      const messageId = crypto.randomUUID();

      await db.insert(schema.hiringMessages).values({
        id: messageId,
        thread_id: String(threadId),
        role: String(role),
        content: String(content),
        type: type ? String(type) : 'text',
        thinking_content: thinking_content ? String(thinking_content) : undefined,
        metadata: metadata as Record<string, unknown>,
      });

      console.log(`✅ Message saved to thread ${threadId}`);
      return c.json({ messageId, success: true }, 201);
    } catch (error) {
      console.error('Save message error:', error);
      return c.json({ error: 'Failed to save message' }, 500);
    }
  });

  app.get('/v1/threads', async (c) => {
    try {
      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const limit = parseInt(c.req.query('limit') || '10');
      const offset = parseInt(c.req.query('offset') || '0');

      const threads = await db
        .select()
        .from(schema.hiringThreads)
        .where(eq(schema.hiringThreads.user_id, session.user_id))
        .orderBy(desc(schema.hiringThreads.created_at))
        .limit(limit)
        .offset(offset);

      return c.json({ threads });
    } catch (error) {
      console.error('List threads error:', error);
      return c.json({ error: 'Failed to fetch threads' }, 500);
    }
  });

  app.delete('/v1/threads/:id', async (c) => {
    try {
      const threadId = c.req.param('id');

      const db = getDb();

      await db.delete(schema.hiringMessages).where(eq(schema.hiringMessages.thread_id, threadId));
      await db.delete(schema.hiringThreads).where(eq(schema.hiringThreads.id, threadId));

      return c.json({ success: true, message: 'Thread deleted' });
    } catch (error) {
      console.error('Delete thread error:', error);
      return c.json({ error: 'Failed to delete thread' }, 500);
    }
  });

  app.get('/v1/threads/:id', async (c) => {
    try {
      const threadId = c.req.param('id');

      const db = getDb();
      const thread = await db.query.hiringThreads.findFirst({
        where: eq(schema.hiringThreads.id, threadId),
      });

      if (!thread) {
        return c.json({ error: 'Thread not found' }, 404);
      }

      const messages = await db
        .select()
        .from(schema.hiringMessages)
        .where(eq(schema.hiringMessages.thread_id, threadId));

      return c.json({ thread, messages });
    } catch (error) {
      console.error('Get thread error:', error);
      return c.json({ error: 'Failed to fetch thread' }, 500);
    }
  });

  app.patch('/v1/threads/:id', async (c) => {
    try {
      const threadId = c.req.param('id');
      const body = await c.req.json();
      const { title, request_id } = body as Record<string, unknown>;

      const db = getDb();

      await db
        .update(schema.hiringThreads)
        .set({
          ...(title && { title: String(title) }),
          ...(request_id && { request_id: String(request_id) }),
        })
        .where(eq(schema.hiringThreads.id, threadId));

      return c.json({ success: true, message: 'Thread updated' });
    } catch (error) {
      console.error('Update thread error:', error);
      return c.json({ error: 'Failed to update thread' }, 500);
    }
  });

  app.get('/v1/requests', async (c) => {
    try {
      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const requests = await db
        .select({
          id: schema.hiringRequests.id,
          requestId: schema.hiringRequests.request_id,
          positionTitle: schema.hiringRequests.position_title,
          teamName: schema.hiringRequests.team_name,
          requestStatus: schema.hiringRequests.request_status,
          urgencyLevel: schema.hiringRequests.urgency_level,
          headcountRequested: schema.hiringRequests.headcount_requested,
          createdAt: schema.hiringRequests.created_at,
          jdId: schema.hiringRequests.jd_id,
          shortlistReport: schema.hiringRequests.shortlist_report,
        })
        .from(schema.hiringRequests)
        .where(eq(schema.hiringRequests.tenant_id, session.tenant_id));

      return c.json({ requests });
    } catch (error) {
      console.error('Requests error:', error);
      return c.json({ error: 'Failed to fetch requests' }, 500);
    }
  });

  app.post('/v1/chat', async (c) => {
    try {
      const body = await c.req.json();
      const { threadId, messages: requestMessages, requestId, phase } = body as Record<string, any>;

      if (!threadId || !requestId) {
        return c.json({ error: 'threadId and requestId required' }, 400);
      }

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();

      const request = await db.query.hiringRequests.findFirst({
        where: eq(schema.hiringRequests.request_id, requestId),
      });

      if (!request) {
        return c.json({ error: 'Hiring request not found' }, 404);
      }

      const context = await fetchContext({ requestId, tenantId: session.tenant_id });

      const jdId = `JD-${requestId.replace('REQ-', '')}-${Date.now().toString().slice(-6)}`;

      const jd = await draftJd({
        ...context,
        jdId,
        requestId,
        tenantId: session.tenant_id,
      });

      return stream(c, async (writer) => {
        try {
          await writer.write(
            `data: ${JSON.stringify({ type: 'complete', content: jd.draftText })}\n\n`,
          );
        } catch (error) {
          console.error('Stream error:', error);
        }
      });
    } catch (error) {
      console.error('Chat error:', error);
      return c.json({ error: 'Failed to process chat' }, 500);
    }
  });

  app.post('/v1/jd/approve', async (c) => {
    try {
      const { requestId, jdText, clarityScore } = await c.req.json();

      if (!requestId || !jdText) {
        return c.json({ error: 'requestId and jdText required' }, 400);
      }

      const db = getDb();
      const timestamp = Date.now().toString().slice(-6);
      const jdId = `JD-${requestId.replace('REQ-', '')}-${timestamp}`;

      await db.insert(schema.hiringJobs).values({
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        jd_id: jdId,
        request_id: requestId,
        position: 'TBD',
        seniority_level: 'Senior',
        agent_jd_draft_text: jdText,
        jd_full_text: jdText,
        agent_clarity_score: String(typeof clarityScore === 'number' ? clarityScore : 0),
        status: 'Ready',
      });

      await db
        .update(schema.hiringRequests)
        .set({ request_status: 'JD Approved', jd_id: jdId })
        .where(eq(schema.hiringRequests.request_id, requestId));

      return c.json({ success: true, jdId });
    } catch (error) {
      console.error('Approve JD error:', error);
      return c.json({ error: 'Failed to approve JD' }, 500);
    }
  });

  app.get('/v1/jd', async (c) => {
    try {
      const requestId = c.req.query('requestId');

      if (!requestId) {
        return c.json({ error: 'requestId required' }, 400);
      }

      const db = getDb();

      const jd = await db.query.hiringJobs.findFirst({
        where: eq(schema.hiringJobs.request_id, requestId),
      });

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      return c.json({ jd });
    } catch (error) {
      console.error('Get JD error:', error);
      return c.json({ error: 'Failed to fetch JD' }, 500);
    }
  });

  app.post('/v1/requests/extract', async (c) => {
    try {
      const { description } = await c.req.json();

      if (!description) {
        return c.json({ error: 'description required' }, 400);
      }

      const extracted = await extractRequestDetails({
        description,
        mastra: deps.mastra,
      });

      return c.json({ extracted });
    } catch (error) {
      console.error('Extract error:', error);
      return c.json({ error: 'Failed to extract details' }, 500);
    }
  });

  app.post('/v1/requests', async (c) => {
    try {
      const body = await c.req.json();

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();

      const requestId = `REQ-${Date.now().toString().slice(-5)}`;

      const result = await db
        .insert(schema.hiringRequests)
        .values({
          tenant_id: session.tenant_id,
          request_id: requestId,
          position_title: body.position_title || 'TBD',
          team_name: body.team_name,
          urgency_level: body.urgency_level || 'Medium',
          headcount_requested: parseInt(body.headcount_requested) || 1,
          business_justification: body.business_justification,
          team_skill_gap_summary: body.team_skill_gap_summary,
          key_deliverables: body.key_deliverables,
          salary_range: body.salary_range,
          work_mode: body.work_mode,
          min_yoe: body.min_yoe ? parseInt(body.min_yoe) : undefined,
          english_level_required: body.english_level_required,
          hr_owner: session.user_id,
          request_status: 'New',
        })
        .returning({ id: schema.hiringRequests.id });

      console.log(`✅ Hiring request ${requestId} created`);

      return c.json({ requestId, success: true });
    } catch (error) {
      console.error('Create request error:', error);
      return c.json({ error: 'Failed to create hiring request' }, 500);
    }
  });
}
