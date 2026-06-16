import type { Mastra } from '@mastra/core';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as schema from '../db/index.ts';
import { draftJd, fetchContext, scoreJd } from '../orchestration.ts';

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

  /**
   * POST /hiring/v1/threads
   * Create a new thread for a hiring request
   */
  app.post('/v1/threads', async (c) => {
    try {
      const body = await c.req.json();
      const { requestId, title } = body as Record<string, unknown>;

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      if (!requestId) {
        return c.json({ error: 'requestId required' }, 400);
      }

      const db = getDb();
      const threadId = `hiring-${crypto.randomUUID()}`;

      // Fetch request context for metadata
      const context = await fetchContext({
        requestId,
        tenantId: session.tenant_id,
      });

      // Create thread
      await db.insert(schema.hiringThreads).values({
        id: threadId,
        tenant_id: session.tenant_id,
        user_id: session.user_id,
        request_id: requestId,
        title: title || `Hiring - ${context.position}`,
        context: context as Record<string, unknown>,
        current_phase: 'initial',
        metadata: { createdVia: 'api' } as Record<string, unknown>,
      });

      return c.json({ threadId, success: true }, 201);
    } catch (error) {
      console.error('Create thread error:', error);
      return c.json({ error: 'Failed to create thread' }, 500);
    }
  });

  /**
   * GET /hiring/v1/threads
   * List threads for current user
   */
  app.get('/v1/threads', async (c) => {
    try {
      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const threads = await db
        .select()
        .from(schema.hiringThreads)
        .where(eq(schema.hiringThreads.user_id, session.user_id as any))
        .orderBy(desc(schema.hiringThreads.created_at));

      return c.json({ threads });
    } catch (error) {
      console.error('List threads error:', error);
      return c.json({ error: 'Failed to fetch threads' }, 500);
    }
  });

  /**
   * DELETE /hiring/v1/threads/:id
   * Delete thread and all messages
   */
  app.delete('/v1/threads/:id', async (c) => {
    try {
      const threadId = c.req.param('id');

      const db = getDb();

      // Delete all messages for this thread
      await db.delete(schema.hiringMessages).where(eq(schema.hiringMessages.thread_id, threadId));

      // Delete the thread itself
      await db.delete(schema.hiringThreads).where(eq(schema.hiringThreads.id, threadId));

      return c.json({ success: true, message: 'Thread deleted' });
    } catch (error) {
      console.error('Delete thread error:', error);
      return c.json({ error: 'Failed to delete thread' }, 500);
    }
  });

  /**
   * GET /hiring/v1/threads/:id
   * Get thread with message history
   */
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

  /**
   * GET /v1/requests
   * List all hiring requests for the tenant
   */
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
        })
        .from(schema.hiringRequests)
        .where(eq(schema.hiringRequests.tenant_id, session.tenant_id as any));

      return c.json({ requests });
    } catch (error) {
      console.error('Requests error:', error);
      return c.json({ error: 'Failed to fetch requests' }, 500);
    }
  });

  /**
   * POST /v1/jd/approve
   * Approve JD and update request status
   */
  app.post('/v1/jd/approve', async (c) => {
    try {
      const { requestId, jdText, clarityScore } = await c.req.json();
      console.log('📨 POST /v1/jd/approve called:', {
        requestId,
        clarityScore,
        textLength: jdText?.length,
      });

      if (!requestId || !jdText) {
        console.log('❌ Missing required fields');
        return c.json({ error: 'requestId and jdText required' }, 400);
      }

      const db = getDb();

      // Generate JD ID
      const jdId = `JD-${requestId.replace('REQ-', '')}`;

      console.log(`💾 Saving JD ${jdId}...`);

      // Save JD to database
      await db.insert(schema.hiringJobs).values({
        tenant_id: '550e8400-e29b-41d4-a716-446655440000' as any,
        jd_id: jdId,
        request_id: requestId,
        position: 'TBD', // Will be populated from request context
        seniority_level: 'Senior',
        agent_jd_draft_text: jdText,
        jd_full_text: jdText, // On approval, draft becomes final
        agent_clarity_score: clarityScore || (0 as any),
        status: 'Ready',
      });

      console.log(`✅ JD saved, updating request ${requestId} status...`);

      // Update request status to JD Approved
      const _updateResult = await db
        .update(schema.hiringRequests)
        .set({ request_status: 'JD Approved' })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log(`✅ Request ${requestId} status updated to JD Approved`);

      return c.json({
        success: true,
        message: `JD approved and request ${requestId} updated`,
        jdId,
        requestId,
      });
    } catch (error) {
      console.error('❌ Approve JD error:', error);
      return c.json({ error: 'Failed to approve JD' }, 500);
    }
  });

  /**
   * PUT /v1/requests/:requestId/status
   * Update request status
   */
  app.put('/v1/requests/:requestId/status', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const { status } = await c.req.json();

      if (!status) {
        return c.json({ error: 'Status is required' }, 400);
      }

      const db = getDb();
      console.log(`Updating request ${requestId} status to ${status}`);

      // Update in database
      const _result = await db
        .update(schema.hiringRequests)
        .set({ request_status: status })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log(`✅ Updated request ${requestId} to ${status}`);

      return c.json({
        success: true,
        message: `Request ${requestId} status updated to ${status}`,
        requestId,
        status,
      });
    } catch (error) {
      console.error('Update status error:', error);
      return c.json({ error: 'Failed to update status' }, 500);
    }
  });

  /**
   * POST /hiring/v1/chat
   * Chat endpoint - handles streaming responses and saves to thread
   */
  app.post('/v1/chat', async (c) => {
    try {
      const body = await c.req.json();
      console.log('📨 POST /v1/chat called with:', {
        threadId: body.threadId,
        phase: body.phase,
        requestId: body.requestId,
      });

      const parsed = ChatBody.safeParse(body);

      if (!parsed.success) {
        console.log('❌ Validation failed:', parsed.error);
        return c.json({ error: 'Invalid request' }, 400);
      }

      const { threadId, messages, requestId, phase } = parsed.data;
      console.log('✅ Parsed successfully, will call workflow for phase:', phase);
      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();

      // Get or create thread
      let thread = null;
      if (threadId) {
        thread = await db.query.hiringThreads.findFirst({
          where: eq(schema.hiringThreads.id, threadId),
        });
      }

      // If no thread, create one
      if (!thread) {
        const newThreadId = `hiring-${crypto.randomUUID()}`;
        const context = await fetchContext({
          requestId,
          tenantId: session.tenant_id,
        });

        await db.insert(schema.hiringThreads).values({
          id: newThreadId,
          tenant_id: session.tenant_id as any,
          user_id: session.user_id as any,
          request_id: requestId,
          title: `Hiring - ${context.position}`,
          context: context as any,
          current_phase: phase || 'initial',
          metadata: { createdVia: 'chat' } as any,
        });

        thread = { id: newThreadId } as any;
      }

      // Get last user message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || typeof lastMessage !== 'object') {
        return c.json({ error: 'Invalid message' }, 400);
      }

      const messageObj = lastMessage as Record<string, unknown>;
      const userText =
        (messageObj.parts as any[])?.[0]?.text || (messageObj as any).content || String(messageObj);

      if (!userText) {
        return c.json({ error: 'Empty message' }, 400);
      }

      // Save user message
      console.log('💾 Saving user message to thread:', thread.id);
      await db.insert(schema.hiringMessages).values({
        thread_id: thread.id,
        role: 'user',
        content: userText,
        type: 'text',
      });
      console.log('✅ User message saved');

      // Return streaming response
      return stream(c, async (writer) => {
        try {
          let assistantContent = '';

          // Handle initial phase - draft JD
          if (phase === 'initial') {
            const threadData = await db.query.hiringThreads.findFirst({
              where: eq(schema.hiringThreads.id, thread.id),
            });

            const context =
              (threadData?.context as any) ||
              (await fetchContext({
                requestId,
                tenantId: session.tenant_id,
              }));

            // Draft JD
            const jdDraft = await draftJd({
              jdId: 'JD-001',
              requestId,
              tenantId: session.tenant_id,
              position: context.position,
              teamSkillGap: context.teamSkillGap,
              keyDeliverables: context.keyDeliverables,
              salaryRange: context.salaryRange,
              seniorityLevel: 'Senior',
            });

            // Score JD
            const scored = await scoreJd({
              jdId: 'JD-001',
              tenantId: session.tenant_id,
              jdText: jdDraft.draftText,
            });

            const scoreStatus = scored.clarityScore >= 70 ? '✅' : '⚠️';

            assistantContent = `## 📋 Job Description: ${context.position}

**📌 Quick Summary**
- **Team Gap:** ${context.teamSkillGap}
- **Key Deliverables:** ${context.keyDeliverables}
- **Salary Range:** ${context.salaryRange}

---

${jdDraft.draftText}

---

## ⭐ Clarity Score: ${scoreStatus} ${scored.clarityScore}/100

<details>
<summary><strong>Scoring Breakdown (Click to expand)</strong></summary>

- Title/Position (5%): ${scored.clarityScore >= 5 ? '✓' : '✗'}
- Responsibilities (20%): ${scored.clarityScore >= 25 ? '✓' : '✗'}
- Must-Have Skills (25%): ${scored.clarityScore >= 50 ? '✓' : '✗'}
- Nice-to-Have Skills (10%): ${scored.clarityScore >= 60 ? '✓' : '✗'}
- YOE Requirement (10%): ${scored.clarityScore >= 70 ? '✓' : '✗'}
- Salary Range (10%): ${scored.clarityScore >= 80 ? '✓' : '✗'}
- English Level (5%): ${scored.clarityScore >= 85 ? '✓' : '✗'}
- Work Mode (5%): ${scored.clarityScore >= 90 ? '✓' : '✗'}
- Benefits (10%): ${scored.clarityScore >= 100 ? '✓' : '✗'}

</details>

${
  scored.clarityScore < 70
    ? `\n⚠️ **Areas to Improve:**\n${scored.flaggedGaps.map((g: string) => `- ${g}`).join('\n')}`
    : `\n✅ **JD is ready!** All sections meet quality standards.`
}`;

            // Update thread phase
            await db
              .update(schema.hiringThreads)
              .set({ current_phase: 'jd-approval' })
              .where(eq(schema.hiringThreads.id, thread.id));
          }

          // Save assistant message
          console.log('💾 Saving assistant message to thread:', thread.id);
          await db.insert(schema.hiringMessages).values({
            thread_id: thread.id,
            role: 'assistant',
            content: assistantContent,
            type: 'action',
          });
          console.log('✅ Assistant message saved');

          // Stream response
          await writer.write(
            `data: ${JSON.stringify({ type: 'complete', content: assistantContent })}\n\n`,
          );
        } catch (error) {
          console.error('Streaming error:', error);
          await writer.write(
            'data: ' +
              JSON.stringify({ type: 'error', content: 'Error during processing' }) +
              '\n\n',
          );
        }
      });
    } catch (error) {
      console.error('Chat endpoint error:', error);
      return c.json({ error: 'Internal error' }, 500);
    }
  });
}
