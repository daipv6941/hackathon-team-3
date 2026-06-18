import { z } from 'zod';

// Event keys
export const HIRING_JD_CREATED = 'hiring.jd.created' as const;
export const HIRING_JD_APPROVED = 'hiring.jd.approved' as const;
export const HIRING_CANDIDATE_SCREENED = 'hiring.candidate.screened' as const;
export const HIRING_SHORTLIST_CONFIRMED = 'hiring.shortlist.confirmed' as const;
export const HIRING_DECISION_RECORDED = 'hiring.decision.recorded' as const;
export const HIRING_SLA_BREACH = 'hiring.sla.breach' as const;

// Event payloads
export const HIRING_JD_CREATED_PAYLOAD = z.object({
  jd_id: z.string(),
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  position: z.string(),
  clarity_score: z.number().min(0).max(100),
  created_by: z.string().uuid(),
});

export const HIRING_JD_APPROVED_PAYLOAD = z.object({
  jd_id: z.string(),
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  approved_by: z.string().uuid(),
});

export const HIRING_CANDIDATE_SCREENED_PAYLOAD = z.object({
  cv_id: z.string(),
  jd_id: z.string(),
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  candidate_name: z.string(),
  recommendation: z.enum(['Pass', 'Reject', 'Need More Info']),
  fit_score: z.number().min(0).max(100),
});

export const HIRING_SHORTLIST_CONFIRMED_PAYLOAD = z.object({
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  candidate_count: z.number(),
  confirmed_by: z.string().uuid(),
});

export const HIRING_DECISION_RECORDED_PAYLOAD = z.object({
  cv_id: z.string(),
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  candidate_name: z.string(),
  decision: z.enum(['Pass', 'Reject', 'Need More Info']),
  recorded_by: z.string().uuid(),
});

export const HIRING_SLA_BREACH_PAYLOAD = z.object({
  cv_id: z.string(),
  request_id: z.string(),
  tenant_id: z.string().uuid(),
  candidate_name: z.string(),
  deadline_at: z.string().datetime(),
});

// Events map
export const HIRING_EVENTS = {
  [HIRING_JD_CREATED]: HIRING_JD_CREATED_PAYLOAD,
  [HIRING_JD_APPROVED]: HIRING_JD_APPROVED_PAYLOAD,
  [HIRING_CANDIDATE_SCREENED]: HIRING_CANDIDATE_SCREENED_PAYLOAD,
  [HIRING_SHORTLIST_CONFIRMED]: HIRING_SHORTLIST_CONFIRMED_PAYLOAD,
  [HIRING_DECISION_RECORDED]: HIRING_DECISION_RECORDED_PAYLOAD,
  [HIRING_SLA_BREACH]: HIRING_SLA_BREACH_PAYLOAD,
} as const;
