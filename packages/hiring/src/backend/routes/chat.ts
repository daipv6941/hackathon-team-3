import type { Mastra } from '@mastra/core';
import type { SessionScope } from '@seta/core';
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as schema from '../db/index.ts';
import {
  draftJdStream,
  extractRequestDetails,
  fetchContext,
  reviseJd,
  scoreJdStream,
  screenCv,
  screenManyCvs,
} from '../orchestration.ts';

export interface HiringRouteDeps {
  mastra: Mastra;
  pool?: Pool;
}

export interface HiringRouteEnv {
  Variables: {
    user?: SessionScope;
  };
}

const _ChatBody = z.object({
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

      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const threadId = `hiring-${crypto.randomUUID()}`;

      let context: Record<string, unknown> | null = null;
      let title = threadTitle || `Hiring - ${flow || 'New'}`;

      if (reqId && typeof reqId === 'string') {
        const fetchedContext = await fetchContext({
          requestId: reqId,
          tenantId: session.tenant_id,
        });
        if (Object.keys(fetchedContext).length > 0) {
          context = fetchedContext as unknown as Record<string, unknown>;
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
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();
      const limit = parseInt(c.req.query('limit') || '10', 10);
      const offset = parseInt(c.req.query('offset') || '0', 10);

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
      const { title, request_id, current_phase } = body as Record<string, unknown>;

      const db = getDb();

      const updateData: Record<string, string> = {};
      if (title) updateData.title = String(title);
      if (request_id) updateData.request_id = String(request_id);
      if (current_phase) updateData.current_phase = String(current_phase);

      await db
        .update(schema.hiringThreads)
        .set(updateData as any)
        .where(eq(schema.hiringThreads.id, threadId));

      return c.json({ success: true, message: 'Thread updated' });
    } catch (error) {
      console.error('Update thread error:', error);
      return c.json({ error: 'Failed to update thread' }, 500);
    }
  });

  app.get('/v1/requests', async (c) => {
    try {
      const session = c.get('user') ?? {
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

      const session = c.get('user') ?? {
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

      const context = await fetchContext({ requestId, tenantId: session.tenant_id }, db);

      const jdId = `JD-${requestId.replace('REQ-', '')}-${Date.now().toString().slice(-6)}`;

      return stream(c, async (writer) => {
        try {
          console.log('🎬 Starting streaming JD generation and scoring...');

          // Stream 1: Draft JD with reasoning
          console.log('📝 Streaming draft JD...');
          let currentJdText = '';
          let draftPrompt = '';

          for await (const chunk of draftJdStream({
            ...(context as any),
            jdId,
            requestId,
            tenantId: session.tenant_id,
          })) {
            if (
              chunk.type === 'text' ||
              chunk.type === 'thinking-start' ||
              chunk.type === 'thinking-end'
            ) {
              // Stream thinking tokens to client
              await writer.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'complete' && chunk.data) {
              currentJdText = (chunk.data as any).draftText;
              draftPrompt = (chunk.data as any).fullPrompt;
            }
          }

          console.log('✅ Draft JD complete');

          // Auto-scoring loop: score until >= 80 or max 3 iterations
          let scoreResult: any = null;
          let iteration = 1;
          const maxIterations = 3;

          while (!scoreResult || (scoreResult.clarityScore < 80 && iteration < maxIterations)) {
            console.log(`📊 Iteration ${iteration}: Scoring...`);

            // Stream scoring with reasoning
            for await (const chunk of scoreJdStream({
              jdId,
              tenantId: session.tenant_id,
              jdText: currentJdText,
            })) {
              if (
                chunk.type === 'text' ||
                chunk.type === 'thinking-start' ||
                chunk.type === 'thinking-end'
              ) {
                // Stream thinking tokens to client
                await writer.write(`data: ${JSON.stringify(chunk)}\n\n`);
              } else if (chunk.type === 'complete' && chunk.data) {
                scoreResult = chunk.data as any;
              } else if (chunk.type === 'error') {
                console.error('Scoring error:', (chunk as any).message);
                scoreResult = {
                  clarityScore: 0,
                  status: 'Error',
                  categoryScores: {},
                  flaggedGaps: ['Scoring failed'],
                  requiredRevisions: [],
                  confidence: 'Low',
                };
              }
            }

            if (scoreResult.clarityScore < 80 && iteration < maxIterations) {
              console.log(
                `📊 Iteration ${iteration}: Score ${scoreResult.clarityScore}/100, revising...`,
              );

              const revised = await reviseJd({
                jdId,
                tenantId: session.tenant_id,
                currentDraft: currentJdText,
                flaggedGaps: scoreResult.flaggedGaps || [],
              });

              currentJdText = revised.revisedText;
              iteration++;
            } else {
              break;
            }
          }

          console.log(
            `✅ Final Score: ${scoreResult.clarityScore}/100 after ${iteration - 1} iteration(s)`,
          );

          // Prepare final messages
          const jdMessage = {
            type: 'action',
            content: currentJdText,
            metadata: {
              draftJdPrompt: draftPrompt,
            },
          };

          const scoringContent = `## 📊 Quality Assessment

**Clarity Score: ${scoreResult.clarityScore}/100** — ${scoreResult.status}

Generated in ${iteration - 1} iteration${iteration - 1 !== 1 ? 's' : ''} (${scoreResult.confidence} confidence)`;

          const scoringMessage = {
            type: 'result',
            content: scoringContent,
            metadata: {
              clarityScore: scoreResult.clarityScore,
              status: scoreResult.status,
              categoryScores: scoreResult.categoryScores,
              flaggedGaps: scoreResult.flaggedGaps,
              requiredRevisions: scoreResult.requiredRevisions,
              confidence: scoreResult.confidence,
              iterations: iteration - 1,
            },
          };

          // Stream final messages
          console.log('📤 Streaming final messages...');
          await writer.write(`data: ${JSON.stringify(jdMessage)}\n\n`);
          await writer.write(`data: ${JSON.stringify(scoringMessage)}\n\n`);
        } catch (error) {
          console.error('Stream error:', error);
          await writer.write(
            `data: ${JSON.stringify({ type: 'error', content: 'Stream processing failed' })}\n\n`,
          );
        }
      });
    } catch (error) {
      console.error('Chat error:', error);
      return c.json({ error: 'Failed to process chat' }, 500);
    }
  });

  app.post('/v1/jd/approve', async (c) => {
    try {
      const {
        requestId,
        jdText,
        clarityScore,
        categoryScores,
        flaggedGaps,
        requiredRevisions,
        confidence,
        iterations,
      } = await c.req.json();

      if (!requestId || !jdText) {
        return c.json({ error: 'requestId and jdText required' }, 400);
      }

      const db = getDb();
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };
      const timestamp = Date.now().toString().slice(-6);
      const jdId = `JD-${requestId.replace('REQ-', '')}-${timestamp}`;

      console.log('📨 POST /v1/jd/approve called:', {
        requestId,
        clarityScore,
        iterations,
      });

      // Parse JD text to extract structured fields
      const parsePosition = (text: string): string => {
        // Try both formats: **Job Title: ...** or # Job Title
        let match = text.match(/\*\*Job Title:\s*([^*\n]+)\*\*/i);
        if (!match) match = text.match(/^#+\s+([^\n]+)/m);
        return match ? match[1]!.trim() : 'TBD';
      };

      const parseMustHaveRequirements = (text: string): string => {
        // Try both markdown header styles
        let match = text.match(/\*\*Requirements:\*\*([\s\S]*?)(?=\*\*|###|$)/i);
        if (!match) match = text.match(/### Must-Have Requirements?\n([\s\S]*?)(?=###|$)/i);
        if (!match) return '';

        return match[1]!
          .split('\n')
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter((line) => line.length > 0)
          .join(', ');
      };

      const parseNiceToHave = (text: string): string => {
        // Try both markdown header styles
        let match = text.match(/\*\*Preferred Qualifications:\*\*([\s\S]*?)(?=\*\*|###|What|$)/i);
        if (!match) match = text.match(/### Nice-to-Have\n([\s\S]*?)(?=###|$)/i);
        if (!match) return '';

        return match[1]!
          .split('\n')
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter((line) => line.length > 0)
          .join(', ');
      };

      const parseYearsOfExperience = (text: string): number => {
        // Try multiple patterns
        let match = text.match(/(?:Minimum of|requires?|at least)\s+(\d+)\s+years?/i);
        if (!match) match = text.match(/Years of Experience[:\s]*(\d+)/i);
        return match ? parseInt(match[1]!, 10) : 0;
      };

      const parseEnglishLevel = (text: string): string => {
        let match = text.match(/(?:English|Fluent in English)[:\s]*\(?([A-Z]\d)/i);
        if (!match) match = text.match(/English Level[:\s]*([A-Z]\d)/i);
        return match?.[1] ?? 'B2';
      };

      const parseSalaryRange = (text: string): string => {
        const match = text.match(/\*\*Salary Range:\*\*\s*([^\n]+)/i);
        if (!match) return 'Negotiable';
        const range = match[1]?.trim();
        return !range ? 'Negotiable' : range.length > 50 ? range.substring(0, 47) + '...' : range;
      };

      const parseResponsibilities = (text: string): string => {
        // Try both header styles
        let match = text.match(/\*\*Key Responsibilities:\*\*([\s\S]*?)(?=\*\*|###|$)/i);
        if (!match) match = text.match(/### Responsibilities?\n([\s\S]*?)(?=###|$)/i);
        if (!match) return '';

        return (match[1] ?? '')
          .split('\n')
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter((line) => line.length > 0)
          .slice(0, 3) // Get top 3 responsibilities
          .join('; ');
      };

      const position = parsePosition(jdText);
      const mustHaveSkills = parseMustHaveRequirements(jdText);
      const niceToHaveSkills = parseNiceToHave(jdText);
      const minYoe = parseYearsOfExperience(jdText);
      const englishLevel = parseEnglishLevel(jdText);
      const salaryRange = parseSalaryRange(jdText);
      const keyResponsibilities = parseResponsibilities(jdText);

      console.log('📋 Parsed JD data:', {
        position,
        mustHaveSkills: mustHaveSkills.substring(0, 50) + '...',
        niceToHaveSkills: niceToHaveSkills.substring(0, 50) + '...',
        minYoe,
        englishLevel,
        salaryRange,
      });

      await db.insert(schema.hiringJobs).values({
        tenant_id: session.tenant_id,
        jd_id: jdId,
        request_id: requestId,
        position,
        seniority_level: 'Senior',
        min_yoe: minYoe,
        english_level_required: englishLevel,
        salary_range: salaryRange,
        must_have_skills: mustHaveSkills,
        nice_to_have_skills: niceToHaveSkills,
        key_responsibilities: keyResponsibilities,
        agent_jd_draft_text: jdText,
        jd_full_text: jdText,
        agent_clarity_score: String(typeof clarityScore === 'number' ? clarityScore : 0),
        status: 'Ready',
      });

      console.log(`💾 Saved JD ${jdId} with clarity score: ${clarityScore}`);

      await db
        .update(schema.hiringRequests)
        .set({
          request_status: 'JD Approved',
          jd_id: jdId,
        })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log(`✅ Request ${requestId} status updated to JD Approved with jd_id: ${jdId}`);

      return c.json({
        success: true,
        message: `JD approved and request ${requestId} updated`,
        jdId,
        requestId,
        clarityScore,
        iterations,
      });
    } catch (error) {
      console.error('❌ Approve JD error:', error);
      return c.json({ error: 'Failed to approve JD' }, 500);
    }
  });

  app.post('/v1/shortlist/screen-and-report', async (c) => {
    try {
      const { requestId, jdId } = await c.req.json();
      const db = getDb();
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      if (!requestId || !jdId) {
        return c.json({ error: 'requestId and jdId required' }, 400);
      }

      console.log('📊 Screening active candidates pool against JD:', { requestId, jdId });

      // Fetch JD requirements
      const jd = await db.query.hiringJobs.findFirst({
        where: eq(schema.hiringJobs.jd_id, jdId),
      });

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      // Fetch ACTIVE candidates only
      const activeCandidates = await db
        .select()
        .from(schema.hiringCandidates)
        .where(eq(schema.hiringCandidates.status, 'active'));

      if (activeCandidates.length === 0) {
        return c.json({ error: 'No active candidates found in pool' }, 404);
      }

      console.log(`📋 Batch screening ${activeCandidates.length} active candidates from pool`);

      // Delete existing results for this request (avoid duplicates when re-screening)
      await db
        .delete(schema.hiringShortlistResults)
        .where(eq(schema.hiringShortlistResults.request_id, requestId));
      console.log('🗑️ Deleted previous screening results for request');

      return stream(c, async (writer) => {
        try {
          console.log('🚀 Starting parallel screening (concurrency=5)...');
          const startTime = Date.now();

          // Run screenManyCvs with concurrency control
          const results = await screenManyCvs({
            jdId,
            requestId,
            tenantId: session.tenant_id,
            position: jd.position || 'Unknown Position',
            seniorityLevel: jd.seniority_level || 'Mid-Level',
            minYoe: jd.min_yoe || 0,
            maxYoe: jd.max_yoe || undefined,
            englishLevelRequired: jd.english_level_required || 'B2',
            salaryRange: jd.salary_range || 'Negotiable',
            keyResponsibilities: jd.key_responsibilities || undefined,
            candidates: activeCandidates.map((c) => ({
              cv_id: c.cv_id,
              candidate_id: c.candidate_id,
              full_name: c.full_name,
              cv_skills: c.cv_skills ?? undefined,
              years_of_experience: c.years_of_experience ?? undefined,
              english_level: c.english_level ?? undefined,
              salary_expectation: c.salary_expectation ?? undefined,
            })),
            jdMustHave: jd.must_have_skills || '',
            jdNiceToHave: jd.nice_to_have_skills || '',
            jdFullText: jd.jd_full_text || undefined,
          });

          const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(
            `✅ Screening complete in ${elapsedSeconds}s: ${results.length} candidates evaluated`,
          );

          const screeningResults: Array<{
            cvId: string;
            candidateName: string;
            currentTitle?: string;
            currentCompany?: string;
            yearsOfExperience?: number;
            englishLevel?: string;
            cvSkills?: string;
            fitScore: number;
            recommendation: string;
            fitSummary: string;
            gapSummary: string;
            categoryScores: Record<string, number>;
            matchedEvidence: string[];
            flags: string[];
            interviewQuestions: string[];
            followUpQuestions: string[];
            rejectReason: string | null;
            confidence: string;
            fullPrompt: string;
          }> = [];

          // Save all screening results to database
          for (const result of results) {
            try {
              const candidateData = activeCandidates.find((c) => c.cv_id === result.cvId);
              await db.insert(schema.hiringShortlistResults).values({
                tenant_id: session.tenant_id,
                request_id: requestId,
                jd_id: jdId,
                cv_id: result.cvId,
                candidate_id: candidateData?.candidate_id || result.cvId,
                candidate_name: result.candidateName,
                fit_score: String(result.fitScore),
                recommendation: String(result.recommendation),
                confidence: result.confidence || 'Medium',
                fit_summary: result.fitSummary as unknown as string,
                gap_summary: result.gapSummary as unknown as string,
                category_scores: result.categoryScores as unknown as Record<string, unknown>,
                matched_evidence: result.matchedEvidence as unknown as Record<string, unknown>,
                flags: result.flags as unknown as Record<string, unknown>,
                interview_questions: result.interviewQuestions as unknown as Record<
                  string,
                  unknown
                >,
                follow_up_questions: result.followUpQuestions as unknown as Record<string, unknown>,
                reject_reason: result.rejectReason as unknown as string,
              } as any);

              screeningResults.push({
                cvId: result.cvId,
                candidateName: result.candidateName,
                currentTitle: candidateData?.current_title || undefined,
                currentCompany: candidateData?.current_company || undefined,
                yearsOfExperience: candidateData?.years_of_experience || undefined,
                englishLevel: candidateData?.english_level || undefined,
                cvSkills: candidateData?.cv_skills || undefined,
                fitScore: result.fitScore || 0,
                recommendation: result.recommendation || 'Need More Info',
                fitSummary: result.fitSummary || '',
                gapSummary: result.gapSummary || '',
                categoryScores: result.categoryScores || {},
                matchedEvidence: result.matchedEvidence || [],
                flags: result.flags || [],
                interviewQuestions: result.interviewQuestions || [],
                followUpQuestions: result.followUpQuestions || [],
                rejectReason: result.rejectReason || null,
                confidence: result.confidence || 'Medium',
                fullPrompt: result.fullPrompt || '',
              });
            } catch (saveError) {
              console.error(`Failed to save result for ${result.candidateName}:`, saveError);
            }
          }

          // Sort by fit score descending
          const sorted = screeningResults.sort((a, b) => b.fitScore - a.fitScore);

          // Categorize candidates
          const passCandidates = sorted.filter((c) => c.recommendation === 'Pass');
          const needMoreInfoCandidates = sorted.filter(
            (c) => c.recommendation === 'Need More Info',
          );
          const rejectCandidates = sorted.filter((c) => c.recommendation === 'Reject');

          // Calculate percentages
          const total = activeCandidates.length || 1;
          const passPercentage = Math.round((passCandidates.length / total) * 100);
          const needMoreInfoPercentage = Math.round((needMoreInfoCandidates.length / total) * 100);
          const rejectPercentage = Math.round((rejectCandidates.length / total) * 100);

          // Stream final report
          const reportMessage = {
            type: 'result',
            content: `## 📋 Screening Report (${elapsedSeconds}s)

**Total Candidates Evaluated:** ${total}
- ✅ Pass: ${passCandidates.length} (${passPercentage}%)
- ⚠️ Need More Info: ${needMoreInfoCandidates.length} (${needMoreInfoPercentage}%)
- ❌ Reject: ${rejectCandidates.length} (${rejectPercentage}%)`,
            metadata: {
              reportId: `report-${Date.now()}`,
              requestId,
              jdId,
              position: jd.position,
              totalCandidates: total,
              statistics: {
                passCandidates: passCandidates.length,
                passPercentage,
                needMoreInfoCandidates: needMoreInfoCandidates.length,
                needMoreInfoPercentage,
                rejectCandidates: rejectCandidates.length,
                rejectPercentage,
              },
              scoredCandidates: sorted,
            },
          };

          await writer.write(`data: ${JSON.stringify(reportMessage)}\n\n`);
        } catch (error) {
          console.error('Screening error:', error);
          await writer.write(
            `data: ${JSON.stringify({ type: 'error', content: 'Screening failed: ' + String(error) })}\n\n`,
          );
        }
      });
    } catch (error) {
      console.error('Screen and report error:', error);
      return c.json({ error: 'Failed to screen candidates' }, 500);
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
      });

      return c.json({ extracted });
    } catch (error) {
      console.error('❌ Extract error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return c.json({ error: `Failed to extract details: ${String(error)}` }, 500);
    }
  });

  app.post('/v1/requests', async (c) => {
    try {
      const body = await c.req.json();

      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();

      const requestId = `REQ-${Date.now().toString().slice(-5)}`;

      const _result = await db
        .insert(schema.hiringRequests)
        .values({
          tenant_id: session.tenant_id,
          request_id: requestId,
          position_title: body.position_title || 'TBD',
          team_name: body.team_name,
          team_description: body.team_description,
          seniority_level: body.seniority_level,
          urgency_level: body.urgency_level || 'Medium',
          headcount_requested: parseInt(body.headcount_requested, 10) || 1,
          business_justification: body.business_justification,
          team_skill_gap_summary: body.team_skill_gap_summary,
          key_deliverables: body.key_deliverables,
          responsibilities: Array.isArray(body.responsibilities)
            ? body.responsibilities
            : undefined,
          salary_range: body.salary_range,
          work_mode: body.work_mode,
          min_yoe: (() => {
            if (!body.min_yoe) return undefined;
            const minYoeStr = String(body.min_yoe).trim().toLowerCase();
            // Handle common non-numeric inputs
            if (
              minYoeStr.includes('no need') ||
              minYoeStr === 'none' ||
              minYoeStr === 'n/a' ||
              minYoeStr === ''
            ) {
              return undefined; // Set to NULL in database
            }
            // Try to parse as number
            const parsed = parseInt(minYoeStr, 10);
            return Number.isNaN(parsed) ? undefined : parsed;
          })(),
          max_yoe: (() => {
            if (!body.max_yoe) return undefined;
            const maxYoeStr = String(body.max_yoe).trim().toLowerCase();
            // Handle common non-numeric inputs
            if (
              maxYoeStr.includes('no need') ||
              maxYoeStr === 'none' ||
              maxYoeStr === 'n/a' ||
              maxYoeStr === ''
            ) {
              return undefined; // Set to NULL in database
            }
            // Try to parse as number
            const parsed = parseInt(maxYoeStr, 10);
            return Number.isNaN(parsed) ? undefined : parsed;
          })(),
          english_level_required: body.english_level_required,
          preferred_tech_stack: Array.isArray(body.preferred_tech_stack)
            ? body.preferred_tech_stack
            : undefined,
          required_skills: Array.isArray(body.required_skills) ? body.required_skills : undefined,
          nice_to_have_skills: Array.isArray(body.nice_to_have_skills)
            ? body.nice_to_have_skills
            : undefined,
          onboarding_timeline: body.onboarding_timeline,
          benefits: body.benefits,
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

  app.post('/v1/jd/revise', async (c) => {
    try {
      const { currentJdText, userFeedback, position, teamSkillGap, keyDeliverables } =
        await c.req.json();

      console.log('📨 POST /v1/jd/revise called');

      if (!currentJdText || !userFeedback) {
        return c.json({ error: 'currentJdText and userFeedback required' }, 400);
      }

      console.log('🔄 Revising JD based on user feedback...');

      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };
      const result = await reviseJd({
        currentDraft: String(currentJdText),
        flaggedGaps: [],
        jdId: 'temp',
        tenantId: session.tenant_id,
      });

      console.log('✅ JD revised successfully');

      return c.json({
        success: true,
        revisedJdText: result.revisedText,
        fullPrompt: result.fullPrompt,
      });
    } catch (error) {
      console.error('❌ Revise JD error:', error);
      return c.json({ error: 'Failed to revise JD' }, 500);
    }
  });

  app.post('/v1/jd/generate', async (c) => {
    try {
      const { requestId, threadId } = await c.req.json();

      if (!requestId) {
        return c.json({ error: 'requestId required' }, 400);
      }

      const session = c.get('user') ?? {
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

      const context = await fetchContext({ requestId, tenantId: session.tenant_id }, db);
      const jdId = `JD-${requestId.replace('REQ-', '')}-${Date.now().toString().slice(-6)}`;

      console.log('🎬 Starting JD generation for request:', requestId);

      return stream(c, async (writer) => {
        try {
          let currentJdText = '';
          let draftPrompt = '';

          console.log('📝 Streaming draft JD...');
          for await (const chunk of draftJdStream({
            ...(context as any),
            jdId,
            requestId,
            tenantId: session.tenant_id,
          })) {
            if (
              chunk.type === 'text' ||
              chunk.type === 'thinking-start' ||
              chunk.type === 'thinking-end'
            ) {
              await writer.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'complete' && chunk.data) {
              currentJdText = (chunk.data as any).draftText;
              draftPrompt = (chunk.data as any).fullPrompt;
            }
          }

          console.log('✅ Draft JD complete');

          // Auto-scoring loop: score until >= 80 or max 3 iterations
          let scoreResult: any = null;
          let iteration = 1;
          const maxIterations = 3;

          while (!scoreResult || (scoreResult.clarityScore < 80 && iteration < maxIterations)) {
            console.log(`📊 Iteration ${iteration}: Scoring...`);

            // Stream scoring with reasoning
            for await (const chunk of scoreJdStream({
              jdId,
              tenantId: session.tenant_id,
              jdText: currentJdText,
            })) {
              if (
                chunk.type === 'text' ||
                chunk.type === 'thinking-start' ||
                chunk.type === 'thinking-end'
              ) {
                // Stream thinking tokens to client
                await writer.write(`data: ${JSON.stringify(chunk)}\n\n`);
              } else if (chunk.type === 'complete' && chunk.data) {
                scoreResult = chunk.data as any;
              } else if (chunk.type === 'error') {
                console.error('Scoring error:', (chunk as any).message);
                scoreResult = {
                  clarityScore: 0,
                  status: 'Error',
                  categoryScores: {},
                  flaggedGaps: ['Scoring failed'],
                  requiredRevisions: [],
                  confidence: 'Low',
                };
              }
            }

            if (scoreResult.clarityScore < 80 && iteration < maxIterations) {
              console.log(
                `📊 Iteration ${iteration}: Score ${scoreResult.clarityScore}/100, revising...`,
              );

              const revised = await reviseJd({
                jdId,
                tenantId: session.tenant_id,
                currentDraft: currentJdText,
                flaggedGaps: scoreResult.flaggedGaps || [],
              });

              currentJdText = revised.revisedText;
              iteration++;
            } else {
              break;
            }
          }

          console.log(
            `✅ Final Score: ${scoreResult.clarityScore}/100 after ${iteration - 1} iteration(s)`,
          );

          // Prepare final messages
          const jdMessage = {
            type: 'action',
            content: currentJdText,
            metadata: {
              draftJdPrompt: draftPrompt,
            },
          };

          const scoringContent = `## 📊 Quality Assessment

**Clarity Score: ${scoreResult.clarityScore}/100** — ${scoreResult.status}

Generated in ${iteration - 1} iteration${iteration - 1 !== 1 ? 's' : ''} (${scoreResult.confidence} confidence)`;

          const scoringMessage = {
            type: 'result',
            content: scoringContent,
            metadata: {
              clarityScore: scoreResult.clarityScore,
              status: scoreResult.status,
              categoryScores: scoreResult.categoryScores,
              flaggedGaps: scoreResult.flaggedGaps,
              requiredRevisions: scoreResult.requiredRevisions,
              confidence: scoreResult.confidence,
              iterations: iteration - 1,
            },
          };

          // Stream final messages
          console.log('📤 Streaming final messages...');
          await writer.write(`data: ${JSON.stringify(jdMessage)}\n\n`);
          await writer.write(`data: ${JSON.stringify(scoringMessage)}\n\n`);
        } catch (error) {
          console.error('Stream error:', error);
          await writer.write(
            `data: ${JSON.stringify({ type: 'error', content: 'Stream processing failed' })}\n\n`,
          );
        }
      });
    } catch (error) {
      console.error('❌ Generate JD error:', error);
      return c.json({ error: 'Failed to generate JD' }, 500);
    }
  });

  app.put('/v1/requests/:requestId/status', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const { status } = await c.req.json();

      if (!status) {
        return c.json({ error: 'Status is required' }, 400);
      }

      const db = getDb();
      console.log(`Updating request ${requestId} status to ${status}`);

      await db
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

  app.get('/v1/jd/:jdId', async (c) => {
    try {
      const jdId = c.req.param('jdId');
      const db = getDb();

      const results = await db
        .select({
          jdId: schema.hiringJobs.jd_id,
          requestId: schema.hiringJobs.request_id,
          position: schema.hiringJobs.position,
          seniorityLevel: schema.hiringJobs.seniority_level,
          minYoe: schema.hiringJobs.min_yoe,
          maxYoe: schema.hiringJobs.max_yoe,
          mustHaveSkills: schema.hiringJobs.must_have_skills,
          niceToHaveSkills: schema.hiringJobs.nice_to_have_skills,
          englishLevelRequired: schema.hiringJobs.english_level_required,
          workMode: schema.hiringJobs.work_mode,
          salaryRange: schema.hiringJobs.salary_range,
          keyResponsibilities: schema.hiringJobs.key_responsibilities,
          jdFullText: schema.hiringJobs.jd_full_text,
          status: schema.hiringJobs.status,
          agentClarityScore: schema.hiringJobs.agent_clarity_score,
          createdAt: schema.hiringJobs.created_at,
        })
        .from(schema.hiringJobs)
        .where(eq(schema.hiringJobs.jd_id, jdId));

      const jd = results[0] || null;

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      console.log('📄 GET /v1/jd/:jdId response:', { jdId, foundFields: Object.keys(jd) });
      return c.json(jd);
    } catch (error) {
      console.error('Get JD error:', error);
      return c.json({ error: 'Failed to fetch JD' }, 500);
    }
  });

  app.get('/v1/candidates/:requestId', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const db = getDb();

      const allCandidates = await db
        .select({
          cvId: schema.hiringCandidates.cv_id,
          candidateId: schema.hiringCandidates.candidate_id,
          candidateName: schema.hiringCandidates.full_name,
          currentTitle: schema.hiringCandidates.current_title,
          currentCompany: schema.hiringCandidates.current_company,
          yearsOfExperience: schema.hiringCandidates.years_of_experience,
          cvSkills: schema.hiringCandidates.cv_skills,
          englishLevel: schema.hiringCandidates.english_level,
          salaryExpectation: schema.hiringCandidates.salary_expectation,
        })
        .from(schema.hiringCandidates);

      const shortlistResults = await db
        .select({
          cvId: schema.hiringShortlistResults.cv_id,
          fitScore: schema.hiringShortlistResults.fit_score,
          recommendation: schema.hiringShortlistResults.recommendation,
          fitSummary: schema.hiringShortlistResults.fit_summary,
        })
        .from(schema.hiringShortlistResults)
        .where(eq(schema.hiringShortlistResults.request_id, requestId));

      const candidates = allCandidates.map((c) => {
        const result = shortlistResults.find((r) => r.cvId === c.cvId);
        return {
          ...c,
          fitScore: result?.fitScore || null,
          recommendation: result?.recommendation || null,
          fitSummary: result?.fitSummary || null,
        };
      });

      return c.json({ candidates, total: candidates.length });
    } catch (error) {
      console.error('Get candidates error:', error);
      return c.json({ error: 'Failed to fetch candidates' }, 500);
    }
  });

  app.post('/v1/candidates/score', async (c) => {
    try {
      const { cvId, jdId, requestId } = await c.req.json();
      const db = getDb();
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      if (!cvId || !jdId || !requestId) {
        return c.json({ error: 'cvId, jdId, and requestId required' }, 400);
      }

      const candidate = await db.query.hiringCandidates.findFirst({
        where: eq(schema.hiringCandidates.cv_id, cvId),
      });

      if (!candidate) {
        return c.json({ error: 'Candidate not found' }, 404);
      }

      const jd = await db.query.hiringJobs.findFirst({
        where: eq(schema.hiringJobs.jd_id, jdId),
      });

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      const scoreResult = await screenCv({
        cvId,
        jdId,
        requestId,
        tenantId: session.tenant_id,
        candidateName: candidate.full_name,
        cvSkills: candidate.cv_skills || '',
        yearsOfExperience: candidate.years_of_experience || 0,
        englishLevel: candidate.english_level || 'B2',
        salaryExpectation: candidate.salary_expectation || 'Negotiable',
        jdMustHave: jd.must_have_skills || '',
        jdNiceToHave: jd.nice_to_have_skills || '',
        jdMinYoe: jd.min_yoe || 0,
      });

      await db.insert(schema.hiringShortlistResults).values({
        tenant_id: session.tenant_id,
        request_id: requestId,
        jd_id: jdId,
        cv_id: cvId,
        candidate_id: candidate.candidate_id,
        candidate_name: candidate.full_name,
        fit_score: String(scoreResult.fitScore),
        recommendation: String(scoreResult.recommendation),
        confidence: scoreResult.confidence as unknown as string,
        fit_summary: scoreResult.fitSummary as unknown as string,
        gap_summary: scoreResult.gapSummary as unknown as string,
        category_scores: scoreResult.categoryScores as unknown as Record<string, unknown>,
        matched_evidence: scoreResult.matchedEvidence as unknown as Record<string, unknown>,
        flags: scoreResult.flags as unknown as Record<string, unknown>,
        interview_questions: scoreResult.interviewQuestions as unknown as Record<string, unknown>,
        follow_up_questions: scoreResult.followUpQuestions as unknown as Record<string, unknown>,
        reject_reason: scoreResult.rejectReason as unknown as string,
      });

      return c.json({
        success: true,
        cvId,
        candidateName: candidate.full_name,
        fitScore: scoreResult.fitScore,
        recommendation: scoreResult.recommendation,
        fitSummary: scoreResult.fitSummary,
        categoryScores: scoreResult.categoryScores,
        flags: scoreResult.flags,
        suggestedQuestions: scoreResult.suggestedQuestions,
        fullPrompt: scoreResult.fullPrompt,
      });
    } catch (error) {
      console.error('Score candidate error:', error);
      return c.json({ error: 'Failed to score candidate' }, 500);
    }
  });

  app.post('/v1/shortlist/confirm', async (c) => {
    try {
      const body = await c.req.json();
      const { requestId, selectedCandidateIds } = body;
      const db = getDb();

      if (!requestId) {
        return c.json({ error: 'requestId required' }, 400);
      }

      const candidateIds = Array.isArray(selectedCandidateIds) ? selectedCandidateIds : [];

      console.log('📋 Confirming shortlist for request:', {
        requestId,
        candidateCount: candidateIds.length,
      });

      await db
        .update(schema.hiringRequests)
        .set({ request_status: 'Shortlist Ready' })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log('✅ Request status updated to "Shortlist Ready"');

      let shortlistedCandidates: Array<{
        cvId: string;
        candidateName: string;
        fitScore: string;
        recommendation: string;
      }> = [];
      if (candidateIds.length > 0) {
        shortlistedCandidates = await db
          .select({
            cvId: schema.hiringShortlistResults.cv_id,
            candidateName: schema.hiringShortlistResults.candidate_name,
            fitScore: schema.hiringShortlistResults.fit_score,
            recommendation: schema.hiringShortlistResults.recommendation,
          })
          .from(schema.hiringShortlistResults)
          .where(inArray(schema.hiringShortlistResults.cv_id, candidateIds));
      }

      return c.json({
        success: true,
        message: `Shortlist confirmed with ${shortlistedCandidates.length} candidates`,
        requestId,
        requestStatus: 'Shortlist Ready',
        shortlistedCandidates,
      });
    } catch (error) {
      console.error('Confirm shortlist error:', error);
      return c.json({ error: 'Failed to confirm shortlist' }, 500);
    }
  });

  app.get('/v1/shortlist/results/:requestId', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const db = getDb();

      const results = await db
        .select()
        .from(schema.hiringShortlistResults)
        .where(eq(schema.hiringShortlistResults.request_id, requestId))
        .orderBy(desc(schema.hiringShortlistResults.fit_score));

      if (results.length === 0) {
        return c.json({
          requestId,
          results: [],
          summary: 'No shortlist results found',
        });
      }

      const passCandidates = results.filter((r) => r.recommendation === 'Pass');
      const needMoreInfo = results.filter((r) => r.recommendation === 'Need More Info');
      const rejected = results.filter((r) => r.recommendation === 'Reject');

      const total = results.length || 1;

      return c.json({
        success: true,
        requestId,
        totalCandidates: results.length,
        statistics: {
          totalCandidates: total,
          passCandidates: passCandidates.length,
          passPercentage: Math.round((passCandidates.length / total) * 100),
          needMoreInfoCandidates: needMoreInfo.length,
          needMoreInfoPercentage: Math.round((needMoreInfo.length / total) * 100),
          rejectCandidates: rejected.length,
          rejectPercentage: Math.round((rejected.length / total) * 100),
        },
        results,
        passCandidatesList: passCandidates.map((r) => ({
          candidateName: r.candidate_name,
          fitScore: r.fit_score,
          fitSummary: r.fit_summary,
          interviewQuestions: r.interview_questions,
          categoryScores: r.category_scores,
        })),
        needMoreInfoList: needMoreInfo.map((r) => ({
          candidateName: r.candidate_name,
          fitScore: r.fit_score,
          fitSummary: r.fit_summary,
          followUpQuestions: r.follow_up_questions,
          categoryScores: r.category_scores,
        })),
        rejectCandidatesList: rejected.map((r) => ({
          candidateName: r.candidate_name,
          fitScore: r.fit_score,
          rejectReason: r.reject_reason,
        })),
      });
    } catch (error) {
      console.error('Get shortlist results error:', error);
      return c.json({ error: 'Failed to fetch shortlist results' }, 500);
    }
  });

  app.get('/v1/candidates', async (c) => {
    try {
      const db = getDb();
      const status = c.req.query('status');
      const name = c.req.query('name');
      const skill = c.req.query('skill');
      const limit = parseInt(c.req.query('limit') || '20', 10);
      const offset = parseInt(c.req.query('offset') || '0', 10);

      // Build filter conditions array
      const whereConditions = [];

      if (status && ['active', 'inactive'].includes(status)) {
        whereConditions.push(eq(schema.hiringCandidates.status, status));
      }

      if (name) {
        whereConditions.push(ilike(schema.hiringCandidates.full_name, `%${name}%`));
      }

      if (skill) {
        whereConditions.push(ilike(schema.hiringCandidates.cv_skills, `%${skill}%`));
      }

      // Get candidates
      let candidatesBaseQuery = db.select().from(schema.hiringCandidates);
      let countBaseQuery = db.select({ count: count() }).from(schema.hiringCandidates);

      if (whereConditions.length > 0) {
        const whereClause =
          whereConditions.length === 1 ? whereConditions[0] : and(...(whereConditions as any));
        candidatesBaseQuery = candidatesBaseQuery.where(whereClause) as any;
        countBaseQuery = countBaseQuery.where(whereClause) as any;
      }

      const candidates = await (candidatesBaseQuery as any)
        .orderBy(desc(schema.hiringCandidates.created_at))
        .limit(limit)
        .offset(offset);

      // Get total count
      const countResult = await countBaseQuery;
      const totalCount = (countResult[0]?.count as number) || 0;

      return c.json({
        success: true,
        totalCandidates: totalCount,
        limit,
        offset,
        candidates: candidates.map((c: any) => ({
          id: c.id,
          cvId: c.cv_id,
          candidateId: c.candidate_id,
          fullName: c.full_name,
          currentTitle: c.current_title,
          currentCompany: c.current_company,
          yearsOfExperience: c.years_of_experience,
          cvSkills: c.cv_skills,
          englishLevel: c.english_level,
          salaryExpectation: c.salary_expectation,
          status: c.status,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
      });
    } catch (error) {
      console.error('Fetch candidates error:', error);
      return c.json({ error: 'Failed to fetch candidates' }, 500);
    }
  });

  app.post('/v1/candidates', async (c) => {
    try {
      const db = getDb();
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };
      const body = (await c.req.json()) as Record<string, unknown>;

      const cvId = body.cvId as string | undefined;
      const candidateId = body.candidateId as string | undefined;
      const fullName = body.fullName as string | undefined;
      const currentTitle = body.currentTitle as string | undefined;
      const currentCompany = body.currentCompany as string | undefined;
      const yearsOfExperience = body.yearsOfExperience as number | undefined;
      const cvSkills = body.cvSkills as string | undefined;
      const englishLevel = body.englishLevel as string | undefined;
      const salaryExpectation = body.salaryExpectation as string | undefined;
      const cvSummaryByTA = body.cvSummaryByTA as string | undefined;
      const status = (body.status as string | undefined) || 'active';

      if (!cvId || !candidateId || !fullName) {
        return c.json({ error: 'cvId, candidateId, fullName required' }, 400);
      }

      const existing = await db.query.hiringCandidates.findFirst({
        where: eq(schema.hiringCandidates.cv_id, cvId),
      });

      if (existing) {
        return c.json({ error: 'Candidate with this cvId already exists' }, 409);
      }

      const newCandidate = await db
        .insert(schema.hiringCandidates)
        .values({
          tenant_id: session.tenant_id,
          cv_id: cvId,
          candidate_id: candidateId,
          full_name: fullName,
          current_title: currentTitle,
          current_company: currentCompany,
          years_of_experience: yearsOfExperience,
          cv_skills: cvSkills,
          english_level: englishLevel || 'B2',
          salary_expectation: salaryExpectation,
          cv_summary_by_ta: cvSummaryByTA,
          status,
        })
        .returning();

      if (!newCandidate || newCandidate.length === 0) {
        return c.json({ error: 'Failed to create candidate' }, 500);
      }

      const candidate = newCandidate[0];
      if (!candidate) {
        return c.json({ error: 'Failed to retrieve created candidate' }, 500);
      }
      console.log('✅ Candidate added:', candidate.cv_id);

      return c.json({
        success: true,
        candidate: {
          id: candidate.id,
          cvId: candidate.cv_id,
          candidateId: candidate.candidate_id,
          fullName: candidate.full_name,
          status: candidate.status,
          createdAt: candidate.created_at,
        },
      });
    } catch (error) {
      console.error('Add candidate error:', error);
      return c.json({ error: 'Failed to add candidate' }, 500);
    }
  });

  app.post('/v1/candidates/seed/test-data', async (c) => {
    try {
      const db = getDb();
      const session = c.get('user') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };
      const skills = [
        'React,TypeScript,Node.js',
        'Python,Django,PostgreSQL',
        'Java,Spring Boot,Microservices',
        'Vue.js,JavaScript,CSS',
        'Go,Docker,Kubernetes',
        'C++,System Design',
        'Ruby,Rails,MongoDB',
        'Rust,WebAssembly',
        'PHP,Laravel,MySQL',
        'Scala,Spark,Big Data',
      ];

      const companies = [
        'Google',
        'Facebook',
        'Amazon',
        'Microsoft',
        'Apple',
        'Netflix',
        'Tesla',
        'Airbnb',
        'Uber',
        'Stripe',
      ];

      const titles = [
        'Senior Software Engineer',
        'Full Stack Developer',
        'Frontend Engineer',
        'Backend Engineer',
        'DevOps Engineer',
        'Data Engineer',
        'ML Engineer',
        'Solutions Architect',
      ];

      const englishLevels = ['B1', 'B2', 'C1', 'C2'];
      const salaryRanges = ['$50k-$70k', '$70k-$90k', '$90k-$120k', '$120k-$150k', '$150k+'];

      // Create 20 test candidates
      const candidates = [];
      for (let i = 1; i <= 20; i++) {
        candidates.push({
          tenant_id: session.tenant_id,
          cv_id: `CV_${String(i).padStart(3, '0')}`,
          candidate_id: `CAND_${String(i).padStart(3, '0')}`,
          full_name: `Candidate ${i}`,
          current_title: titles[i % titles.length],
          current_company: companies[i % companies.length],
          years_of_experience: 2 + (i % 8),
          cv_skills: skills[i % skills.length],
          english_level: englishLevels[i % englishLevels.length],
          salary_expectation: salaryRanges[i % salaryRanges.length],
          status: i % 5 === 0 ? 'inactive' : 'active',
        });
      }

      await db
        .insert(schema.hiringCandidates)
        .values(candidates as any)
        .onConflictDoNothing();

      return c.json({
        success: true,
        message: 'Seeded 20 test candidates',
        candidates: candidates.length,
      });
    } catch (error) {
      console.error('Seed error:', error);
      return c.json({ error: 'Failed to seed candidates' }, 500);
    }
  });

  app.put('/v1/candidates/:cvId', async (c) => {
    try {
      const db = getDb();
      const cvId = c.req.param('cvId');
      const body = (await c.req.json()) as Record<string, unknown>;

      const status = body.status as string | undefined;
      const currentTitle = body.currentTitle as string | undefined;
      const currentCompany = body.currentCompany as string | undefined;
      const englishLevel = body.englishLevel as string | undefined;
      const salaryExpectation = body.salaryExpectation as string | undefined;

      type UpdateData = Record<string, string | Date>;
      const updates: UpdateData = {};
      if (status) updates.status = status;
      if (currentTitle) updates.current_title = currentTitle;
      if (currentCompany) updates.current_company = currentCompany;
      if (englishLevel) updates.english_level = englishLevel;
      if (salaryExpectation) updates.salary_expectation = salaryExpectation;
      updates.updated_at = new Date();

      if (Object.keys(updates).length === 1 && updates.updated_at) {
        return c.json({ error: 'No updates provided' }, 400);
      }

      const updated = await db
        .update(schema.hiringCandidates)
        .set(updates)
        .where(eq(schema.hiringCandidates.cv_id, cvId))
        .returning();

      if (!updated || updated.length === 0) {
        return c.json({ error: 'Candidate not found' }, 404);
      }

      const candidate = updated[0];
      if (!candidate) {
        return c.json({ error: 'Failed to retrieve updated candidate' }, 404);
      }
      console.log('✅ Candidate updated:', cvId);

      return c.json({
        success: true,
        candidate: {
          id: candidate.id,
          cvId: candidate.cv_id,
          status: candidate.status,
          updatedAt: candidate.updated_at,
        },
      });
    } catch (error) {
      console.error('Update candidate error:', error);
      return c.json({ error: 'Failed to update candidate' }, 500);
    }
  });

  app.delete('/v1/candidates/:cvId', async (c) => {
    try {
      const db = getDb();
      const cvId = c.req.param('cvId');

      const deleted = await db
        .delete(schema.hiringCandidates)
        .where(eq(schema.hiringCandidates.cv_id, cvId))
        .returning();

      if (deleted.length === 0) {
        return c.json({ error: 'Candidate not found' }, 404);
      }

      console.log('✅ Candidate deleted:', cvId);

      return c.json({
        success: true,
        message: `Candidate ${cvId} deleted`,
      });
    } catch (error) {
      console.error('Delete candidate error:', error);
      return c.json({ error: 'Failed to delete candidate' }, 500);
    }
  });
}
