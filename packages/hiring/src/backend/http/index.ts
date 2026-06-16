import { Hono } from 'hono';

export function buildHiringRoutes() {
  const app = new Hono();

  // NOTE: POST /v1/chat is mounted by mountHiringChatRoutes() in register.ts
  // This keeps message persistence separate from request routing.

  /**
   * GET /v1/jd/:jdId
   * Get JD details
   */
  app.get('/v1/jd/:jdId', async (c) => {
    try {
      const { jdId } = c.req.param();
      // TODO: Query database
      return c.json({
        jdId,
        position: 'Senior Backend Developer',
        clarityScore: 85,
        status: 'Ready',
      });
    } catch (error) {
      console.error('JD error:', error);
      return c.json({ error: 'Failed to fetch JD' }, 500);
    }
  });

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
   * POST /v1/shortlist/confirm
   * TA confirms final shortlist [HITL Gate]
   */
  app.post('/v1/shortlist/confirm', async (c) => {
    try {
      await c.req.json();
      // TODO: Start SLA tracking for confirmed CVs
      return c.json({
        success: true,
        message: 'Shortlist confirmed',
        trackingStarted: true,
      });
    } catch (error) {
      console.error('Confirm shortlist error:', error);
      return c.json({ error: 'Failed to confirm shortlist' }, 500);
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
        'POST /v1/shortlist/confirm',
      ],
    });
  });

  console.log('[hiring] buildHiringRoutes() called - app created with streaming support');
  return app;
}
