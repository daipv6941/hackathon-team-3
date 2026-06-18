# AI Hiring Assistant - Technical Implementation Guide

## Overview

The AI Hiring Assistant is a comprehensive system that helps teams:
1. **Draft & Refine Job Descriptions** - AI-generated JD with clarity scoring
2. **Screen Candidates** - Batch CV scoring against JD requirements
3. **Shortlist & Report** - Automated candidate categorization (Pass/Need More Info/Reject)
4. **Manage Candidate Pool** - Centralized, reusable candidate database

**Key Features:**
- ✅ JD Quality Scoring (100-point rubric per JD_QUALITY.md v3)
- ✅ CV Fit Scoring (100-point methodology per CV_Fit_Scoring_Guide_for_AI_Agent_v2.md)
- ✅ Shared candidate pool (not request-specific)
- ✅ Normalized database schema
- ✅ Real-time shortlist reporting
- ✅ Status workflow (New → JD Draft → JD Approved → CV Screening → Shortlist Ready → In Progress → Completed)

---

## Architecture

### Tech Stack
- **Backend:** Hono, Mastra, OpenAI API (gpt-4-turbo)
- **Frontend:** React 19, TanStack Router, shadcn/ui, Tailwind 4
- **Database:** PostgreSQL + Drizzle ORM with `pgSchema`
- **Streaming:** Server-Sent Events (SSE) via Hono

### Module Structure
```
packages/hiring/
├── src/
│   ├── backend/
│   │   ├── db/schema.ts          # Drizzle schema (8 tables)
│   │   ├── routes/chat.ts        # API endpoints (32 endpoints)
│   │   ├── orchestration.ts      # AI agent functions (scoreJd, screenCv, reviseJd)
│   │   ├── http/index.ts         # Legacy endpoints (cleanup needed)
│   │   └── agent-tools.ts        # Mastra tool definitions
│   └── drizzle/
│       └── migrations/           # SQL migrations (0005_fat_wolfsbane.sql adds status field)
│
apps/web/
├── src/
│   ├── routes/_authed/hiring/
│   │   ├── route.tsx             # Layout with sidebar menu (Chat, Requests, Candidates)
│   │   ├── chat.tsx              # JD draft & refinement UI
│   │   ├── candidates.tsx        # Candidate pool management page
│   │   └── requests/
│   │       ├── index.tsx         # Hiring requests list
│   │       └── $requestId.tsx    # Request detail + shortlist report
│   └── modules/hiring/
│       └── chat-experience/
│           ├── hiring-provider.tsx        # Context for chat state
│           ├── hiring-transcript.tsx      # Chat message rendering + handlers
│           ├── hiring-composer.tsx        # Message input + workflow trigger
│           ├── hiring-selection.tsx       # Flow selection (JD Draft vs CV Shortlist)
│           └── hiring-request-selector.tsx # Request picker
```

---

## Database Schema

### Tables (8 total, 4 core for this feature)

#### 1. **hiring.candidates** (Shared Pool)
```sql
┌─ id (UUID, PK)
├─ tenant_id (UUID)
├─ cv_id (VARCHAR UNIQUE) -- CV-001, CV-002, etc
├─ candidate_id (VARCHAR)
├─ full_name (VARCHAR)
├─ current_title (VARCHAR)
├─ current_company (VARCHAR)
├─ years_of_experience (INTEGER)
├─ cv_skills (TEXT) -- JSON or comma-separated
├─ english_level (VARCHAR) -- A1-C2
├─ salary_expectation (VARCHAR)
├─ status (VARCHAR) -- active, inactive [MIGRATION: 0005_fat_wolfsbane.sql]
├─ cv_summary_by_ta (TEXT)
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)
```

**Key:** Shared across ALL hiring requests, not request-specific.

#### 2. **hiring.requests** (Hiring Initiative)
```sql
┌─ id (UUID, PK)
├─ tenant_id (UUID)
├─ request_id (VARCHAR UNIQUE) -- REQ-001, REQ-002, etc
├─ position_title (VARCHAR)
├─ team_name (VARCHAR)
├─ urgency_level (VARCHAR) -- Immediate, High, Medium, Low
├─ headcount_requested (INTEGER)
├─ business_justification (TEXT)
├─ team_skill_gap_summary (TEXT)
├─ key_deliverables (TEXT)
├─ requesting_manager (VARCHAR)
├─ hr_owner (UUID) -- FK to identity.user_id (no strict FK per design)
├─ approval_status (VARCHAR) -- Pending, Approved, Rejected
├─ request_status (VARCHAR) -- New, JD Draft, JD Approved, CV Screening, Shortlist Ready, etc
├─ jd_id (VARCHAR) -- References hiring.jobs.jd_id
├─ shortlist_report (JSONB) -- DEPRECATED: use shortlist_results table
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)
```

#### 3. **hiring.jobs** (Job Description)
```sql
┌─ id (UUID, PK)
├─ tenant_id (UUID)
├─ jd_id (VARCHAR UNIQUE) -- JD-{reqId}-{timestamp}
├─ request_id (VARCHAR) -- FK to requests.request_id (no strict FK)
├─ position (VARCHAR)
├─ seniority_level (VARCHAR) -- Junior, Mid, Senior
├─ min_yoe (INTEGER)
├─ max_yoe (INTEGER)
├─ must_have_skills (TEXT)
├─ nice_to_have_skills (TEXT)
├─ english_level_required (VARCHAR)
├─ work_mode (VARCHAR) -- Hybrid, Remote, On-site
├─ salary_range (VARCHAR)
├─ key_responsibilities (TEXT)
├─ jd_full_text (TEXT) -- Final approved JD (Markdown)
├─ status (VARCHAR) -- Not Started, In Draft, Ready
├─ agent_jd_draft_text (TEXT) -- Draft before TA approval
├─ agent_clarity_score (NUMERIC) -- 0-100
├─ agent_flagged_gaps (TEXT) -- JSON array
├─ agent_revision_count (INTEGER)
├─ agent_last_run_at (TIMESTAMP)
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)
```

#### 4. **hiring.shortlist_results** (Screening Results)
```sql
┌─ id (UUID, PK)
├─ tenant_id (UUID)
├─ request_id (VARCHAR) -- FK to requests.request_id
├─ jd_id (VARCHAR) -- FK to jobs.jd_id
├─ cv_id (VARCHAR) -- FK to candidates.cv_id
├─ candidate_id (VARCHAR)
├─ candidate_name (VARCHAR)
├─ fit_score (NUMERIC) -- 0-100
├─ recommendation (VARCHAR) -- Pass, Reject, Need More Info
├─ confidence (VARCHAR) -- High, Medium, Low
├─ fit_summary (TEXT)
├─ gap_summary (TEXT)
├─ category_scores (JSONB) -- { mustHaveSkills, relevantExperience, languageLevel, niceToHaveSkills }
├─ matched_evidence (JSONB)
├─ flags (JSONB)
├─ interview_questions (JSONB) -- Array for Pass
├─ follow_up_questions (JSONB) -- Array for Need More Info
├─ reject_reason (TEXT) -- For Reject
├─ screened_at (TIMESTAMP)
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)
```

**Key:** ONE row per candidate per request. Replaces json storage in requests.shortlist_report.

#### 5-8. Other tables
- `hiring.threads` - Chat conversation history
- `hiring.messages` - Chat messages
- `hiring.decisions` - HM feedback & interview tracking
- `hiring.interview_prep` - Scorecard & interview questions

---

## Backend API Endpoints

### Base: `POST /hiring/v1/chat` (Streaming)
Main chat endpoint using Mastra orchestration. Handles all AI-driven workflows.

**Request:**
```json
{
  "threadId": "hiring-<uuid>",
  "messages": [ { "role": "user", "content": "..." } ],
  "requestId": "REQ-001",
  "phase": "initial" // optional
}
```

**Response:** Server-Sent Events (SSE) stream
```
data: { "type": "thinking", "content": "..." }
data: { "type": "tool-call", "toolName": "...", ... }
data: { "type": "complete", "content": "Final response" }
```

---

### JD Management

#### POST `/v1/jd/approve`
Approve JD & update request status to "JD Approved"

**Request:**
```json
{
  "requestId": "REQ-001",
  "jdText": "## Senior Backend Developer...",
  "clarityScore": 78
}
```

**Response:**
```json
{
  "success": true,
  "jdId": "JD-001-233768"
}
```

**Internals:**
- Generates unique `jdId` = `JD-${requestId.replace('REQ-', '')}-${timestamp}`
- Inserts into `hiring.jobs` table
- Updates `hiring.requests.jd_id` and `request_status = 'JD Approved'`

#### GET `/v1/jd/:jdId`
Fetch full JD details

**Response:**
```json
{
  "jdId": "JD-001-233768",
  "position": "Senior Backend Developer",
  "seniorityLevel": "Senior",
  "minYoe": 5,
  "maxYoe": 10,
  "mustHaveSkills": "Python, PostgreSQL, REST APIs",
  "niceToHaveSkills": "Kubernetes, Redis, Spark",
  "englishLevelRequired": "B2",
  "workMode": "Hybrid",
  "salaryRange": "$120K-$150K",
  "keyResponsibilities": "...",
  "jdFullText": "## Full JD Markdown",
  "status": "Ready",
  "agentClarityScore": 78,
  "createdAt": "2026-06-18T..."
}
```

---

### Candidate Screening

#### POST `/v1/shortlist/screen-and-report`
Batch screen ALL candidates in pool against JD

**Request:**
```json
{
  "requestId": "REQ-001",
  "jdId": "JD-001-233768"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "REQ-001",
  "position": "Senior Backend Developer",
  "totalCandidates": 7,
  "statistics": {
    "passCandidates": 2,
    "passPercentage": 29,
    "needMoreInfoCandidates": 3,
    "needMoreInfoPercentage": 43,
    "rejectCandidates": 2,
    "rejectPercentage": 29
  },
  "passCandidatesList": [
    {
      "candidateName": "John Doe",
      "fitScore": 85,
      "fitSummary": "Strong match with 8 yrs Python experience",
      "interviewQuestions": [ "Q1", "Q2", "Q3" ],
      "categoryScores": { "mustHaveSkills": 50, ... }
    }
  ],
  "needMoreInfoList": [ ... ],
  "rejectCandidatesList": [ ... ]
}
```

**Flow:**
1. Delete existing screening results for `request_id`
2. Query ALL candidates from shared pool
3. Call `screenCv()` for each candidate
4. Insert all results into `shortlist_results` table
5. Return categorized response

#### POST `/v1/shortlist/confirm`
Finalize shortlist & update request status to "Shortlist Ready"

**Request:**
```json
{
  "requestId": "REQ-001",
  "selectedCandidateIds": [] // Can be empty; all screened candidates are "selected"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shortlist confirmed with 2 candidates",
  "requestId": "REQ-001",
  "requestStatus": "Shortlist Ready"
}
```

#### GET `/v1/shortlist/results/:requestId`
Fetch screening results for a request

**Response:**
```json
{
  "requestId": "REQ-001",
  "results": [ ... ], // Full shortlist_results rows
  "statistics": { ... },
  "passCandidatesList": [ ... ],
  "needMoreInfoList": [ ... ],
  "rejectCandidatesList": [ ... ]
}
```

---

### Candidate Pool Management

#### GET `/v1/candidates?status=active`
List candidates with optional status filter

**Response:**
```json
{
  "success": true,
  "totalCandidates": 7,
  "candidates": [
    {
      "id": "uuid",
      "cvId": "CV-001",
      "candidateId": "CAND-001",
      "fullName": "Alice",
      "currentTitle": "Senior Developer",
      "currentCompany": "Tech Corp",
      "yearsOfExperience": 5,
      "cvSkills": "Python, JavaScript, React",
      "englishLevel": "B2",
      "salaryExpectation": "$1500-$2500",
      "status": "active",
      "createdAt": "2026-06-18T..."
    }
  ]
}
```

#### POST `/v1/candidates`
Add new candidate to pool

**Request:**
```json
{
  "cvId": "CV-008",
  "candidateId": "CAND-008",
  "fullName": "Bob Smith",
  "currentTitle": "Senior Architect",
  "currentCompany": "StartupXYZ",
  "yearsOfExperience": 8,
  "cvSkills": "Python, Kubernetes, AWS",
  "englishLevel": "C1",
  "salaryExpectation": "$2000-$3000",
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "candidate": {
    "id": "uuid",
    "cvId": "CV-008",
    "candidateId": "CAND-008",
    "fullName": "Bob Smith",
    "status": "active",
    "createdAt": "2026-06-18T..."
  }
}
```

#### PUT `/v1/candidates/:cvId`
Update candidate (status, title, etc)

**Request:**
```json
{
  "status": "inactive",
  "currentTitle": "Principal Architect"
}
```

#### DELETE `/v1/candidates/:cvId`
Delete candidate from pool

---

## Frontend Pages

### `/hiring` (Layout with Sidebar Menu)
```
┌─────────────────────────────────────────────┐
│ [Hiring Studio]                             │
│ • Chat       ← JD Draft & Refinement        │
│ • Requests   ← Hiring requests list         │
│ • Candidates ← Candidate pool mgmt          │
└─────────────────────────────────────────────┘
         Outlet (current page content)
```

**File:** `apps/web/src/routes/_authed/hiring/route.tsx`

---

### `/hiring/chat`
**JD Draft & Refinement Workflow**

1. **Selection:** Choose flow (JD Draft vs CV Shortlist)
2. **Request Selection:** Pick hiring request
3. **JD Creation:** AI generates JD with clarity score
4. **Approval:** User approves & saves JD
5. **Screening:** Batch score candidates
6. **Confirmation:** Finalize shortlist

**Components:**
- `hiring-selection.tsx` - Flow picker
- `hiring-request-selector.tsx` - Request dropdown
- `hiring-transcript.tsx` - Chat messages + action buttons
- `hiring-provider.tsx` - Context for chat state

---

### `/hiring/requests`
**Hiring Requests List**

Shows all requests with status badges:
- New, JD Draft, JD Approved, CV Screening, **Shortlist Ready**, In Progress, Completed

**File:** `apps/web/src/routes/_authed/hiring/requests/index.tsx`

**Stats Dashboard:**
- Total Requests
- Ready to Start (New + JD Draft)
- In Progress (CV Screening + Shortlist Ready)
- Completed

---

### `/hiring/requests/:requestId`
**Request Detail Page**

**Sections:**
1. **Current Status** - Status badge + change dropdown
2. **Details** - Team, headcount, urgency, created date
3. **Approved JD** - Full JD display (if JD Approved status)
4. **Shortlist Report** - Pass/Need More Info/Reject candidates (if Shortlist Ready)
5. **Workflow Progress** - Visual timeline of statuses

**File:** `apps/web/src/routes/_authed/hiring/requests/$requestId.tsx`

---

### `/hiring/candidates`
**Candidate Pool Management**

**Features:**
- 📋 List all candidates with filter (All / Active / Inactive)
- ➕ Add new candidate form (10 fields)
- 🔄 Toggle active/inactive status
- 🗑️ Delete candidate
- 📊 Display: Name, title, company, skills, salary, english level

**File:** `apps/web/src/routes/_authed/hiring/candidates.tsx`

---

## AI Functions (Backend Orchestration)

### `scoreJd(input)` → JD Quality Score
**File:** `packages/hiring/src/backend/orchestration.ts:236`

**Input:**
```typescript
{
  jdText: string // Full JD markdown
}
```

**Output:**
```typescript
{
  clarityScore: number,           // 0-100
  status: string,                 // Ready, Minor Revision, Needs Revision, Weak, Fail
  hardFail: boolean,
  hardFailReason: string | null,
  categoryScores: {
    hiringAlignment: number,      // 0-20
    roleAlignment: number,        // 0-15
    skillAccuracy: number,        // 0-20
    deliverables: number,         // 0-15
    interviewAlignment: number,   // 0-10
    screeningUsefulness: number,  // 0-10
    biasCompliance: number,       // 0-5
    completeness: number          // 0-5
  },
  flaggedGaps: string[],
  requiredRevisions: string[],
  confidence: string              // High, Medium, Low
}
```

**Scoring:** 100-point rubric per [JD_QUALITY.md](../JD_QUALITY.md) v3
- Hiring Request Alignment (20)
- Role/Seniority/Headcount Alignment (15)
- Skill/Tech Stack Accuracy (20)
- Deliverables & Responsibilities (15)
- Interview Scorecard Alignment (10)
- Screening Usefulness (10)
- Bias/Compliance (5)
- Completeness & Structure (5)

---

### `screenCv(input)` → CV Fit Score
**File:** `packages/hiring/src/backend/orchestration.ts:328`

**Input:**
```typescript
{
  cvId: string,
  jdId: string,
  requestId: string,
  tenantId: string,
  candidateName: string,
  cvSkills: string,
  yearsOfExperience: number,
  englishLevel: string,
  salaryExpectation: string,
  jdMustHave: string,
  jdNiceToHave: string,
  jdMinYoe: number
}
```

**Output:**
```typescript
{
  fitScore: number,               // 0-100
  recommendation: string,         // Pass, Reject, Need More Info
  confidence: string,             // High, Medium, Low
  fitSummary: string,
  gapSummary: string,
  categoryScores: {
    mustHaveSkills: number,       // 0-50
    relevantExperience: number,   // 0-20
    languageLevel: number,        // 0-15
    niceToHaveSkills: number      // 0-15
  },
  matchedEvidence: string[],
  flags: string[],
  interviewQuestions: string[],   // For Pass candidates
  followUpQuestions: string[],    // For Need More Info
  rejectReason: string            // For Reject candidates
}
```

**Scoring:** 100-point methodology per [CV_Fit_Scoring_Guide_for_AI_Agent_v2.md](../CV_Fit_Scoring_Guide_for_AI_Agent_v2.md)
- Must-Have Skills Match (50)
- Relevant Experience & Seniority (20)
- Required Language Level (15)
- Nice-to-Have Skills Match (15)

---

### `reviseJd(input)` → Revised JD
**File:** `packages/hiring/src/backend/orchestration.ts:291`

Takes flagged gaps and returns improved JD.

---

## Local Development

### Setup
```bash
# Install dependencies
pnpm install

# Set up database
pnpm db:up          # Start PostgreSQL docker
pnpm db:migrate     # Apply all migrations (including 0005_fat_wolfsbane.sql)
pnpm db:seed        # Load seed data (optional)

# Set env vars
export OPENAI_API_KEY="sk-..."
```

### Run Dev Server
```bash
pnpm dev
```

Starts:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### Test Locally
```bash
# Create test request (or use seeded REQ-001)
POST http://localhost:3000/hiring/v1/requests

# Draft JD via chat
POST http://localhost:3000/hiring/v1/chat
  { "threadId": "hiring-uuid", "requestId": "REQ-001", "messages": [...] }

# Approve JD
POST http://localhost:3000/hiring/v1/jd/approve
  { "requestId": "REQ-001", "jdText": "...", "clarityScore": 78 }

# Screen candidates
POST http://localhost:3000/hiring/v1/shortlist/screen-and-report
  { "requestId": "REQ-001", "jdId": "JD-001-..." }

# Confirm shortlist
POST http://localhost:3000/hiring/v1/shortlist/confirm
  { "requestId": "REQ-001", "selectedCandidateIds": [] }

# Add candidate
POST http://localhost:3000/hiring/v1/candidates
  { "cvId": "CV-008", "candidateId": "CAND-008", "fullName": "Bob", ... }
```

---

## Deployment

### Prerequisites
- Forked repo with GitHub Actions enabled
- AWS ECR credentials + EC2 instance (see [DEPLOY.md](../hackathon/DEPLOY.md))

### Deploy
1. **Merge branch:**
   ```bash
   git checkout main
   git pull
   git merge jd-create
   git push origin main
   ```

2. **Trigger workflow:**
   - GitHub → Actions → "Hackathon — Release" → Run workflow
   - Migrations run automatically (0005_fat_wolfsbane.sql)

3. **Seed demo data (first time only):**
   - GitHub → Actions → "Hackathon — DB Reset & Seed" → Run workflow
   - Login: `admin@hackathon.com` / `ChangeMe@2026`

4. **Access:**
   ```
   https://<APP_DOMAIN>/hiring
   ```

---

## Future Improvements / TODOs

### Short-term
- [ ] Seed hiring candidates + requests in seed script (not manual)
- [ ] Interview feedback loop (HM decision → update candidate status)
- [ ] Bulk candidate import (CSV upload)
- [ ] Search/filter candidates by skills, salary, experience
- [ ] Email notifications on shortlist completion
- [ ] Export shortlist as PDF report

### Medium-term
- [ ] Interview scheduling integration
- [ ] Offer letter generation
- [ ] Background check integration
- [ ] Candidate feedback survey
- [ ] Analytics dashboard (hiring funnel, time-to-hire, etc)
- [ ] Multi-language JD support

### Long-term
- [ ] Video interview screening
- [ ] Skill assessment tests
- [ ] Candidate matching with internal mobility pool
- [ ] Interview panel collaboration
- [ ] Offer approval workflow

---

## Troubleshooting

### "JD not found" error
**Cause:** Frontend using hardcoded JD ID instead of approved one.
**Fix:** Ensure `jdId` is saved to context after JD approval (line 124 in hiring-transcript.tsx).

### Shortlist report not loading
**Cause:** Request status not updated to "Shortlist Ready".
**Fix:** Verify POST `/v1/shortlist/confirm` updates `request_status` column.

### Infinite loop in chat
**Cause:** useEffect dependencies including recreated functions.
**Fix:** Ensure stable dependencies (useCallback + proper deps array).

### Migration not applied
**Cause:** `pnpm db:migrate` not run after pulling new migration.
**Fix:** Run `pnpm db:migrate` to apply 0005_fat_wolfsbane.sql.

---

## References

- [CV Fit Scoring Guide v2](../CV_Fit_Scoring_Guide_for_AI_Agent_v2.md) - 100-point CV scoring methodology
- [JD Quality Guide v3](../JD_QUALITY.md) - 100-point JD quality rubric
- [Deployment Guide](../hackathon/DEPLOY.md) - How to deploy to AWS
- [Architecture Doc](./architecture.md) - System design overview
- [RBAC Doc](./rbac.md) - Access control model

---

## Contact & Support

For questions on extending this feature:
1. Check [HIRING_ASSISTANT_IMPLEMENTATION.md](./HIRING_ASSISTANT_IMPLEMENTATION.md) (this file)
2. Review commit `6594d77` in git history
3. Check branch `jd-create` for latest code
4. Use Claude Code with this guide to continue development
