import { Hono } from 'hono';

export function buildHiringRoutes() {
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
