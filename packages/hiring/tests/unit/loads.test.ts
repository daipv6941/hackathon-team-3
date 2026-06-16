import { describe, expect, it } from 'vitest';
import * as schema from '../../src/backend/db/schema.ts';
import { HIRING_EVENTS } from '../../src/events/index.ts';
import { HIRING_PERMISSIONS } from '../../src/rbac.ts';

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

  it('exports permissions correctly', () => {
    expect(HIRING_PERMISSIONS).toBeDefined();
    expect(HIRING_PERMISSIONS['hiring:request:create']).toBeDefined();
    expect(HIRING_PERMISSIONS['hiring:jd:approve']).toBeDefined();
  });
});
