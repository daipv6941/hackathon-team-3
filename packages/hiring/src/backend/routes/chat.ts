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

  /**
   * POST /hiring/v1/threads
   * Create a new thread for a hiring request
   */
  app.post('/v1/threads', async (c) => {
    try {
      const body = await c.req.json();
      const { requestId: reqId, title: threadTitle } = body as Record<string, unknown>;

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      if (!reqId || typeof reqId !== 'string') {
        return c.json({ error: 'requestId required' }, 400);
      }

      const db = getDb();
      const threadId = `hiring-${crypto.randomUUID()}`;

      // Fetch request context for metadata
      const context = await fetchContext({
        requestId: reqId,
        tenantId: session.tenant_id,
      });

      // Create thread
      await db.insert(schema.hiringThreads).values({
        id: threadId,
        tenant_id: session.tenant_id,
        user_id: session.user_id,
        request_id: reqId,
        title: typeof threadTitle === 'string' ? threadTitle : `Hiring - ${context.position}`,
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
        .where(eq(schema.hiringThreads.user_id, session.user_id))
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

      // Generate unique JD ID
      const timestamp = Date.now().toString().slice(-6);
      const jdId = `JD-${requestId.replace('REQ-', '')}-${timestamp}`;

      console.log(`💾 Saving JD ${jdId}...`);

      // Save JD to database
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

      console.log(`✅ JD saved, updating request ${requestId} status...`);

      // Update request status to JD Approved and store jd_id
      await db
        .update(schema.hiringRequests)
        .set({ request_status: 'JD Approved', jd_id: jdId })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log(`✅ Request ${requestId} status updated to JD Approved with jd_id: ${jdId}`);

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
   * POST /v1/jd/revise
   * Revise JD based on user feedback
   */
  app.post('/v1/jd/revise', async (c) => {
    try {
      const { currentJdText, userFeedback, position, teamSkillGap, keyDeliverables } =
        await c.req.json();

      console.log('📨 POST /v1/jd/revise called');

      if (!currentJdText || !userFeedback) {
        return c.json({ error: 'currentJdText and userFeedback required' }, 400);
      }

      console.log('🔄 Revising JD based on user feedback...');

      // Call orchestration function to revise JD
      const result = await reviseJdWithFeedback({
        currentJdText: String(currentJdText),
        userFeedback: String(userFeedback),
        position: String(position || 'Unknown Position'),
        teamSkillGap: String(teamSkillGap || ''),
        keyDeliverables: String(keyDeliverables || ''),
      });

      console.log('✅ JD revised successfully');

      return c.json({
        success: true,
        revisedJdText: result.revisedText,
      });
    } catch (error) {
      console.error('❌ Revise JD error:', error);
      return c.json({ error: 'Failed to revise JD' }, 500);
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

  /**
   * GET /v1/jd/:jdId
   * Get JD details by ID
   */
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

  /**
   * GET /v1/jd
   * Get JD by requestId query parameter
   */
  app.get('/v1/jd', async (c) => {
    try {
      const requestId = c.req.query('requestId');

      if (!requestId) {
        return c.json({ error: 'requestId query parameter is required' }, 400);
      }

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
        .where(eq(schema.hiringJobs.request_id, String(requestId)))
        .orderBy(desc(schema.hiringJobs.created_at))
        .limit(1);

      const jd = results[0] || null;

      if (!jd) {
        return c.json({ error: 'No JD found for this request' }, 404);
      }

      console.log('📄 GET /v1/jd (by requestId) response:', { requestId, jdId: jd.jdId });
      return c.json({ jd });
    } catch (error) {
      console.error('Get JD by requestId error:', error);
      return c.json({ error: 'Failed to fetch JD' }, 500);
    }
  });

  /**
   * GET /v1/candidates/:requestId
   * Get candidates for a hiring request
   */
  app.get('/v1/candidates/:requestId', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const db = getDb();

      // Get all candidates from pool
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

      // Get screening results for this specific request
      const shortlistResults = await db
        .select({
          cvId: schema.hiringShortlistResults.cv_id,
          fitScore: schema.hiringShortlistResults.fit_score,
          recommendation: schema.hiringShortlistResults.recommendation,
          fitSummary: schema.hiringShortlistResults.fit_summary,
        })
        .from(schema.hiringShortlistResults)
        .where(eq(schema.hiringShortlistResults.request_id, requestId));

      // Merge screening results with candidate pool
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

  /**
   * POST /v1/candidates/score
   * Score a single candidate against a JD
   */
  app.post('/v1/candidates/score', async (c) => {
    try {
      const { cvId, jdId, requestId } = await c.req.json();
      const db = getDb();

      if (!cvId || !jdId || !requestId) {
        return c.json({ error: 'cvId, jdId, and requestId required' }, 400);
      }

      // Fetch candidate
      const candidate = await db.query.hiringCandidates.findFirst({
        where: eq(schema.hiringCandidates.cv_id, cvId),
      });

      if (!candidate) {
        return c.json({ error: 'Candidate not found' }, 404);
      }

      // Fetch JD
      const jd = await db.query.hiringJobs.findFirst({
        where: eq(schema.hiringJobs.jd_id, jdId),
      });

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      // Score candidate
      const { screenCv } = await import('../orchestration.ts');
      const scoreResult = await screenCv({
        cvId,
        jdId,
        requestId,
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        candidateName: candidate.full_name,
        cvSkills: candidate.cv_skills || '',
        yearsOfExperience: candidate.years_of_experience || 0,
        englishLevel: candidate.english_level || 'B2',
        salaryExpectation: candidate.salary_expectation || 'Negotiable',
        jdMustHave: jd.must_have_skills || '',
        jdNiceToHave: jd.nice_to_have_skills || '',
        jdMinYoe: jd.min_yoe || 0,
      });

      // Save score to shortlist_results table
      await db.insert(schema.hiringShortlistResults).values({
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
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
      });
    } catch (error) {
      console.error('Score candidate error:', error);
      return c.json({ error: 'Failed to score candidate' }, 500);
    }
  });

  /**
   * POST /v1/shortlist/screen-and-report
   * Screen all candidates in pool against JD and generate shortlist report
   */
  app.post('/v1/shortlist/screen-and-report', async (c) => {
    try {
      const { requestId, jdId } = await c.req.json();
      const db = getDb();

      if (!requestId || !jdId) {
        return c.json({ error: 'requestId and jdId required' }, 400);
      }

      console.log('📊 Screening all candidates pool against JD:', { requestId, jdId });

      // Fetch JD requirements
      const jd = await db.query.hiringJobs.findFirst({
        where: eq(schema.hiringJobs.jd_id, jdId),
      });

      if (!jd) {
        return c.json({ error: 'JD not found' }, 404);
      }

      // Fetch ALL candidates from pool (no request filter)
      const allCandidates = await db.select().from(schema.hiringCandidates);

      if (allCandidates.length === 0) {
        return c.json({ error: 'No candidates found in pool' }, 404);
      }

      console.log(`📋 Screening ${allCandidates.length} candidates from pool`);

      // Delete existing results for this request (avoid duplicates when re-screening)
      await db
        .delete(schema.hiringShortlistResults)
        .where(eq(schema.hiringShortlistResults.request_id, requestId));
      console.log('🗑️ Deleted previous screening results for request');

      // Score each candidate
      const { screenCv } = await import('../orchestration.ts');
      const scoredCandidates = [];

      for (const candidate of allCandidates) {
        try {
          const scoreResult = await screenCv({
            cvId: candidate.cv_id,
            jdId,
            requestId,
            tenantId: '550e8400-e29b-41d4-a716-446655440000',
            candidateName: candidate.full_name,
            cvSkills: candidate.cv_skills || '',
            yearsOfExperience: candidate.years_of_experience || 0,
            englishLevel: candidate.english_level || 'B2',
            salaryExpectation: candidate.salary_expectation || 'Negotiable',
            jdMustHave: jd.must_have_skills || '',
            jdNiceToHave: jd.nice_to_have_skills || '',
            jdMinYoe: jd.min_yoe || 0,
          });

          // Save screening result to shortlist_results table
          await db.insert(schema.hiringShortlistResults).values({
            tenant_id: '550e8400-e29b-41d4-a716-446655440000',
            request_id: requestId,
            jd_id: jdId,
            cv_id: candidate.cv_id,
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
            interview_questions: scoreResult.interviewQuestions as unknown as Record<
              string,
              unknown
            >,
            follow_up_questions: scoreResult.followUpQuestions as unknown as Record<
              string,
              unknown
            >,
            reject_reason: scoreResult.rejectReason as unknown as string,
          });

          scoredCandidates.push({
            cvId: candidate.cv_id,
            candidateName: candidate.full_name,
            fitScore: scoreResult.fitScore,
            recommendation: scoreResult.recommendation,
            fitSummary: scoreResult.fitSummary,
            interviewQuestions: scoreResult.interviewQuestions || [],
            followUpQuestions: scoreResult.followUpQuestions || [],
            rejectReason: scoreResult.rejectReason,
            categoryScores: scoreResult.categoryScores,
            confidence: scoreResult.confidence,
            flags: scoreResult.flags,
          });
        } catch (error) {
          console.error(`Failed to score ${candidate.full_name}:`, error);
          scoredCandidates.push({
            cvId: candidate.cv_id,
            candidateName: candidate.full_name,
            fitScore: 0,
            recommendation: 'Error',
            fitSummary: 'Failed to score',
            interviewQuestions: [],
            followUpQuestions: [],
            rejectReason: 'Scoring error',
            categoryScores: {
              mustHaveSkills: 0,
              relevantExperience: 0,
              languageLevel: 0,
              niceToHaveSkills: 0,
            },
            confidence: 'Low',
            flags: [],
          });
        }
      }

      // Sort by fit score descending
      const sorted = scoredCandidates.sort((a, b) => b.fitScore - a.fitScore);

      // Categorize candidates
      const passCandidates = sorted.filter((c) => c.recommendation === 'Pass');
      const needMoreInfoCandidates = sorted.filter((c) => c.recommendation === 'Need More Info');
      const rejectCandidates = sorted.filter((c) => c.recommendation === 'Reject');

      // Calculate percentages
      const total = allCandidates.length || 1;
      const passPercentage = Math.round((passCandidates.length / total) * 100);
      const needMoreInfoPercentage = Math.round((needMoreInfoCandidates.length / total) * 100);
      const rejectPercentage = Math.round((rejectCandidates.length / total) * 100);

      return c.json({
        success: true,
        reportId: `report-${Date.now()}`,
        requestId,
        jdId,
        position: jd.position,
        totalCandidates: allCandidates.length,
        scoredCandidates: sorted,
        statistics: {
          totalCandidates: total,
          passCandidates: passCandidates.length,
          passPercentage,
          needMoreInfoCandidates: needMoreInfoCandidates.length,
          needMoreInfoPercentage,
          rejectCandidates: rejectCandidates.length,
          rejectPercentage,
        },
        passCandidatesList: passCandidates.map((c) => ({
          candidateName: c.candidateName,
          fitScore: c.fitScore,
          fitSummary: c.fitSummary,
          interviewQuestions: c.interviewQuestions,
          categoryScores: c.categoryScores,
        })),
        needMoreInfoList: needMoreInfoCandidates.map((c) => ({
          candidateName: c.candidateName,
          fitScore: c.fitScore,
          fitSummary: c.fitSummary,
          followUpQuestions: c.followUpQuestions,
          categoryScores: c.categoryScores,
        })),
        rejectCandidatesList: rejectCandidates.map((c) => ({
          candidateName: c.candidateName,
          fitScore: c.fitScore,
          rejectReason: c.rejectReason,
        })),
        summary: `Evaluated ${total} candidates. **${passCandidates.length} (${passPercentage}%)** pass, **${needMoreInfoCandidates.length} (${needMoreInfoPercentage}%)** need more info, **${rejectCandidates.length} (${rejectPercentage}%)** rejected.`,
      });
    } catch (error) {
      console.error('Screen and report error:', error);
      return c.json({ error: 'Failed to screen candidates' }, 500);
    }
  });

  /**
   * POST /v1/shortlist/confirm
   * Confirm final shortlist and update request status
   */
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

      // Update request status to 'Shortlist Ready'
      // (Report data is already persisted in shortlist_results table)
      const updateResult = await db
        .update(schema.hiringRequests)
        .set({ request_status: 'Shortlist Ready' })
        .where(eq(schema.hiringRequests.request_id, requestId));

      console.log('✅ Request status updated to "Shortlist Ready":', updateResult);

      // Get shortlisted candidates from screening results if IDs provided
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

  /**
   * GET /v1/shortlist/results/:requestId
   * Get shortlist screening results for a request
   */
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

      // Categorize results
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
      type ThreadType = { id: string };
      let thread: ThreadType | null = null;
      if (threadId) {
        const foundThread = await db.query.hiringThreads.findFirst({
          where: eq(schema.hiringThreads.id, threadId),
        });
        if (foundThread) {
          thread = foundThread;
        }
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
          tenant_id: session.tenant_id,
          user_id: session.user_id,
          request_id: requestId,
          title: `Hiring - ${context.position}`,
          context: context as unknown as Record<string, unknown>,
          current_phase: phase || 'initial',
          metadata: { createdVia: 'chat' } as unknown as Record<string, unknown>,
        });

        thread = { id: newThreadId };
      }

      // Get last user message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || typeof lastMessage !== 'object') {
        return c.json({ error: 'Invalid message' }, 400);
      }

      const messageObj = lastMessage as Record<string, unknown>;
      const parts = messageObj.parts as unknown[];
      const userText =
        ((parts?.[0] as Record<string, unknown>)?.text as string | undefined) ||
        ((messageObj as Record<string, unknown>).content as string | undefined) ||
        String(messageObj);

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
              (threadData?.context as unknown as Record<string, unknown>) ||
              (await fetchContext({
                requestId,
                tenantId: session.tenant_id,
              }));

            // Draft JD
            const jdDraft = await draftJd({
              jdId: 'JD-001',
              requestId,
              tenantId: session.tenant_id,
              position: context.position as string,
              teamSkillGap: context.teamSkillGap as string,
              keyDeliverables: context.keyDeliverables as string,
              salaryRange: context.salaryRange as string,
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
    ? `\n⚠️ **Areas to Improve:**\n${(scored.flaggedGaps as unknown as string[]).map((g) => `- ${g}`).join('\n')}`
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

  /**
   * GET /v1/candidates
   * Get all candidates with optional status filter
   */
  app.get('/v1/candidates', async (c) => {
    try {
      const db = getDb();
      const status = c.req.query('status'); // active, inactive, or undefined for all

      let candidates: Record<string, unknown>[];
      if (status && ['active', 'inactive'].includes(status)) {
        candidates = await db
          .select()
          .from(schema.hiringCandidates)
          .where(eq(schema.hiringCandidates.status, status))
          .orderBy(desc(schema.hiringCandidates.created_at));
      } else {
        candidates = await db
          .select()
          .from(schema.hiringCandidates)
          .orderBy(desc(schema.hiringCandidates.created_at));
      }

      return c.json({
        success: true,
        totalCandidates: candidates.length,
        candidates: candidates.map((c) => ({
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

  /**
   * POST /v1/candidates
   * Add a new candidate
   */
  app.post('/v1/candidates', async (c) => {
    try {
      const db = getDb();
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

      // Check if CV already exists
      const existing = await db.query.hiringCandidates.findFirst({
        where: eq(schema.hiringCandidates.cv_id, cvId),
      });

      if (existing) {
        return c.json({ error: 'Candidate with this cvId already exists' }, 409);
      }

      const newCandidate = await db
        .insert(schema.hiringCandidates)
        .values({
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
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

  /**
   * PUT /v1/candidates/:cvId
   * Update candidate status or details
   */
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

  /**
   * DELETE /v1/candidates/:cvId
   * Delete a candidate
   */
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

  /**
   * POST /v1/requests/extract
   * Extract hiring request details from user description
   */
  app.post('/v1/requests/extract', async (c) => {
    try {
      const body = await c.req.json();
      const { description } = body as Record<string, unknown>;

      if (!description || typeof description !== 'string') {
        return c.json({ error: 'Description is required' }, 400);
      }

      console.log('📝 Extracting hiring request details from description...');
      const extracted = await extractRequestDetails({ description });

      console.log('✅ Extraction complete:', extracted);

      return c.json({
        success: true,
        extracted,
      });
    } catch (error) {
      console.error('❌ Extraction error:', error);
      return c.json({ error: 'Failed to extract hiring request details' }, 500);
    }
  });

  /**
   * POST /v1/requests
   * Create a new hiring request
   */
  app.post('/v1/requests', async (c) => {
    try {
      const body = await c.req.json();
      const {
        position_title,
        team_name,
        urgency_level,
        headcount_requested,
        business_justification,
        team_skill_gap_summary,
        key_deliverables,
        requesting_manager,
      } = body as Record<string, unknown>;

      // Validate required fields
      if (!position_title || !team_name || !key_deliverables) {
        return c.json(
          { error: 'position_title, team_name, and key_deliverables are required' },
          400,
        );
      }

      const session = c.get('session') ?? {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const db = getDb();

      // Generate unique request ID
      const timestamp = Date.now().toString().slice(-6);
      const requestId = `REQ-${timestamp}`;

      console.log(`💾 Creating hiring request ${requestId}...`);

      // Insert into database
      await db.insert(schema.hiringRequests).values({
        tenant_id: session.tenant_id as string,
        request_id: requestId,
        position_title: String(position_title),
        team_name: String(team_name),
        urgency_level: String(urgency_level || 'Medium'),
        headcount_requested: Number(headcount_requested) || 1,
        business_justification: String(business_justification || ''),
        team_skill_gap_summary: String(team_skill_gap_summary || ''),
        key_deliverables: String(key_deliverables),
        requesting_manager: String(requesting_manager || ''),
        hr_owner: session.user_id as string,
        approval_status: 'Pending',
        request_status: 'Not Started',
      });

      console.log(`✅ Hiring request ${requestId} created successfully`);

      return c.json({
        success: true,
        message: `Hiring request ${requestId} created`,
        requestId,
      });
    } catch (error) {
      console.error('❌ Create request error:', error);
      return c.json({ error: 'Failed to create hiring request' }, 500);
    }
  });
}
