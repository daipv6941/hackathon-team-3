import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const hiringSchema = pgSchema('hiring');

// Hiring requests - anchor table for each hiring initiative
export const hiringRequests = hiringSchema.table('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  request_id: varchar('request_id', { length: 50 }).notNull().unique(), // REQ-001, REQ-002, etc
  position_title: varchar('position_title', { length: 255 }).notNull(),
  team_name: varchar('team_name', { length: 100 }),
  urgency_level: varchar('urgency_level', { length: 20 }).notNull(), // Immediate, High, Medium, Low
  headcount_requested: integer('headcount_requested').notNull().default(1),
  business_justification: text('business_justification'),
  team_skill_gap_summary: text('team_skill_gap_summary'),
  key_deliverables: text('key_deliverables'),
  requesting_manager: varchar('requesting_manager', { length: 255 }),
  hr_owner: uuid('hr_owner').notNull(), // Identity.user_id of TA
  approval_status: varchar('approval_status', { length: 20 }).notNull().default('Pending'), // Pending, Approved, Rejected
  request_status: varchar('request_status', { length: 30 }).notNull().default('Not Started'), // Not Started, JD Draft, Shortlisting, Completed
  jd_id: varchar('jd_id', { length: 50 }), // Reference to approved JD
  shortlist_report: jsonb('shortlist_report'), // Complete shortlist report with scores, questions, reasons
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Job descriptions - one per hiring request
export const hiringJobs = hiringSchema.table('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  jd_id: varchar('jd_id', { length: 50 }).notNull().unique(), // JD-BE-SR-001, etc
  request_id: varchar('request_id', { length: 50 }).notNull(), // FK to hiringRequests.request_id (no strict FK, but logical)
  position: varchar('position', { length: 100 }).notNull(),
  seniority_level: varchar('seniority_level', { length: 10 }).notNull(), // Junior, Mid, Senior
  min_yoe: integer('min_yoe'),
  max_yoe: integer('max_yoe'),
  must_have_skills: text('must_have_skills'),
  nice_to_have_skills: text('nice_to_have_skills'),
  english_level_required: varchar('english_level_required', { length: 5 }), // A1, A2, B1, B2, C1, C2
  work_mode: varchar('work_mode', { length: 20 }), // Hybrid, Remote, On-site
  salary_range: varchar('salary_range', { length: 50 }),
  key_responsibilities: text('key_responsibilities'),

  // JD content & metadata
  jd_full_text: text('jd_full_text'), // Final approved JD (Markdown)
  status: varchar('status', { length: 20 }).notNull().default('Not Started'), // Not Started, In Draft, Ready

  // [AGENT OUTPUT] fields - populated by agent
  agent_jd_draft_text: text('agent_jd_draft_text'), // Draft before TA approval
  agent_clarity_score: numeric('agent_clarity_score', { precision: 5, scale: 2 }), // 0-100
  agent_flagged_gaps: text('agent_flagged_gaps'), // JSON array of gap descriptions
  agent_revision_count: integer('agent_revision_count').default(0), // Max 2
  agent_last_run_at: timestamp('agent_last_run_at', { withTimezone: true }),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Candidate pool - shared across all hiring requests
export const hiringCandidates = hiringSchema.table('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  cv_id: varchar('cv_id', { length: 50 }).notNull().unique(), // CV-001, CV-002, etc
  candidate_id: varchar('candidate_id', { length: 50 }).notNull(),
  full_name: varchar('full_name', { length: 100 }).notNull(),
  current_title: varchar('current_title', { length: 100 }),
  current_company: varchar('current_company', { length: 100 }),
  past_companies: text('past_companies'), // JSON or comma-separated
  years_of_experience: integer('years_of_experience'),
  cv_skills: text('cv_skills'), // Comma-separated or JSON
  english_level: varchar('english_level', { length: 5 }), // A1-C2
  salary_expectation: varchar('salary_expectation', { length: 50 }), // "$1500-$2500"
  cv_summary_by_ta: text('cv_summary_by_ta'), // TA's notes on CV
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, inactive

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Shortlist results - stores screening results of candidates for specific requests
export const hiringShortlistResults = hiringSchema.table('shortlist_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  request_id: varchar('request_id', { length: 50 }).notNull(), // FK to requests
  jd_id: varchar('jd_id', { length: 50 }).notNull(), // FK to jobs
  cv_id: varchar('cv_id', { length: 50 }).notNull(), // FK to candidates
  candidate_id: varchar('candidate_id', { length: 50 }).notNull(),
  candidate_name: varchar('candidate_name', { length: 100 }).notNull(),

  // Screening results
  fit_score: numeric('fit_score', { precision: 5, scale: 2 }).notNull(), // 0-100
  recommendation: varchar('recommendation', { length: 20 }).notNull(), // Pass, Reject, Need More Info
  confidence: varchar('confidence', { length: 10 }), // High, Medium, Low
  fit_summary: text('fit_summary'),
  gap_summary: text('gap_summary'),

  // Detailed scoring
  category_scores: jsonb('category_scores'), // { mustHaveSkills, relevantExperience, languageLevel, niceToHaveSkills }
  matched_evidence: jsonb('matched_evidence'), // Array
  flags: jsonb('flags'), // Array

  // Questions based on recommendation
  interview_questions: jsonb('interview_questions'), // Array - for Pass candidates
  follow_up_questions: jsonb('follow_up_questions'), // Array - for Need More Info candidates
  reject_reason: text('reject_reason'), // For Reject candidates

  screened_at: timestamp('screened_at', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// HM decisions & interview prep
export const hiringDecisions = hiringSchema.table('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  cv_id: varchar('cv_id', { length: 50 }).notNull(),
  jd_id: varchar('jd_id', { length: 50 }).notNull(),
  request_id: varchar('request_id', { length: 50 }).notNull(),
  candidate_id: varchar('candidate_id', { length: 50 }).notNull(),
  candidate_name: varchar('candidate_name', { length: 100 }).notNull(),

  // HM decision & feedback
  hiring_manager: uuid('hiring_manager'), // Identity.user_id
  hm_decision: varchar('hm_decision', { length: 20 }), // Pass, Reject, Need More Info
  hm_feedback: text('hm_feedback'),
  feedback_submitted_at: timestamp('feedback_submitted_at', { withTimezone: true }),
  feedback_deadline: timestamp('feedback_deadline', { withTimezone: true }), // 48h from submission to TA
  sla_breach: boolean('sla_breach').default(false),

  // Interview tracking
  interview_stage: varchar('interview_stage', { length: 50 }), // Screened, Phone, Technical, Onsite, Offer, Rejected
  interview_date: timestamp('interview_date', { withTimezone: true }),
  interview_notes: text('interview_notes'),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Interview prep & scorecard
export const hiringInterviewPrep = hiringSchema.table('interview_prep', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  cv_id: varchar('cv_id', { length: 50 }).notNull(),
  jd_id: varchar('jd_id', { length: 50 }).notNull(),
  request_id: varchar('request_id', { length: 50 }).notNull(),

  // Scorecard reference
  scorecard_id: varchar('scorecard_id', { length: 50 }), // SC-BE-SR-001, etc
  interview_stage: varchar('interview_stage', { length: 50 }), // System Design, Technical Test, etc

  // Questions & scoring
  suggested_questions: text('suggested_questions'), // JSON array of Q/A objects
  evaluation_criteria: jsonb('evaluation_criteria'), // { "criterion": "weight", ... }

  // Results
  score: numeric('score', { precision: 5, scale: 2 }), // 0-100
  interviewer_feedback: text('interviewer_feedback'),
  pass_fail: varchar('pass_fail', { length: 10 }), // Pass, Fail, TBD

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chat threads for hiring conversations
export const hiringThreads = hiringSchema.table('threads', {
  id: varchar('id', { length: 100 }).primaryKey(), // hiring-<uuid>
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(), // Identity.user_id of TA
  request_id: varchar('request_id', { length: 50 }).notNull(), // Which hiring request this thread is for
  title: varchar('title', { length: 255 }), // e.g., "Senior Data Engineer - REQ-011"
  context: jsonb('context'), // { position, teamSkillGap, keyDeliverables, salaryRange }
  current_phase: varchar('current_phase', { length: 30 }).default('initial'), // initial, jd-creation, jd-approval, cv-screening, confirmation, complete
  metadata: jsonb('metadata'), // Additional state/flags
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chat messages in threads
export const hiringMessages = hiringSchema.table('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: varchar('thread_id', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // user, assistant
  content: text('content').notNull(),
  type: varchar('type', { length: 30 }), // text, action, error, thinking
  thinking_content: text('thinking_content'), // Extended thinking blocks
  metadata: jsonb('metadata'), // Additional data per message
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
