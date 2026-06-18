import { describe, expect, it } from 'vitest';
import * as schema from '../../src/backend/db/schema.ts';
import { HIRING_EVENTS } from '../../src/events/index.ts';
import { hiringRbac } from '../../src/rbac.ts';

describe('Hiring module loads', () => {
  it('exports schema correctly', () => {
    expect(schema.hiringSchema).toBeDefined();
    expect(schema.hiringRequests).toBeDefined();
    expect(schema.hiringJobs).toBeDefined();
    expect(schema.hiringCandidates).toBeDefined();
    expect(schema.hiringDecisions).toBeDefined();
    expect(schema.hiringInterviewPrep).toBeDefined();
  });

  it('exports events correctly', () => {
    expect(HIRING_EVENTS).toBeDefined();
    expect(HIRING_EVENTS['hiring.jd.created']).toBeDefined();
    expect(HIRING_EVENTS['hiring.candidate.screened']).toBeDefined();
  });

  it('exports RBAC manifest correctly', () => {
    expect(hiringRbac).toBeDefined();
    expect(hiringRbac.module).toBe('hiring');
    expect(hiringRbac.permissions.some((p) => p.key === 'hiring.request.create')).toBe(true);
    expect(hiringRbac.permissions.some((p) => p.key === 'hiring.jd.approve')).toBe(true);
  });
});
