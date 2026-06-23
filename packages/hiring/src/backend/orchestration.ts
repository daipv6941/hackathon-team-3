import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from './db/index.ts';

/**
 * HireAssist Orchestration
 *
 * Real LLM calls using configured model (OPENAI_API_KEY or ANTHROPIC_API_KEY)
 */

export interface OrchestrationContext {
  requestId: string;
  tenantId: string;
  userId: string;
  phase: 'initial' | 'jd-creation' | 'jd-approval' | 'cv-screening' | 'confirmation' | 'complete';
}

export interface JdDraft {
  jdId: string;
  position: string;
  clarityScore: number;
  flaggedGaps: string[];
  revisionCount: number;
  draftText: string;
}

export interface CvScreenResult {
  cvId: string;
  candidateName: string;
  fitScore: number;
  recommendation: 'Pass' | 'Reject' | 'Need More Info';
  fitSummary: string;
  gapSummary: string;
  suggestedQuestions: string;
  rank?: number;
}

/**
 * Tool Input Schemas
 */
export const FetchContextInputSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().uuid(),
});

export const DraftJdInputSchema = z.object({
  jdId: z.string(),
  requestId: z.string(),
  tenantId: z.string().uuid(),
  position: z.string(),
  seniorityLevel: z.enum(['Intern', 'Junior', 'Mid', 'Senior', 'Manager', 'C-level']),
  headcount: z.number().optional(),
  urgency: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  teamName: z.string().optional(),
  businessContext: z.string().optional(),
  teamSkillGap: z.string(),
  keyDeliverables: z.string(),
  salaryRange: z.string(),
  workMode: z.string().optional(),
  yoe: z.string().optional(),
  englishLevel: z.string().optional(),
  benefits: z.string().optional(),
  reportingLine: z.string().optional(),
});

export const ScoreJdInputSchema = z.object({
  jdId: z.string(),
  tenantId: z.string().uuid(),
  jdText: z.string(),
});

export const ReviseJdInputSchema = z.object({
  jdId: z.string(),
  tenantId: z.string().uuid(),
  currentDraft: z.string(),
  flaggedGaps: z.array(z.string()),
});

export const ScreenCvInputSchema = z.object({
  cvId: z.string(),
  jdId: z.string(),
  requestId: z.string(),
  tenantId: z.string().uuid(),
  candidateName: z.string(),
  cvSkills: z.string(),
  yearsOfExperience: z.number(),
  englishLevel: z.string(),
  salaryExpectation: z.string(),
  jdMustHave: z.string(),
  jdNiceToHave: z.string(),
  jdMinYoe: z.number(),
  jdFullText: z.string().optional(),
});

export const BatchScreenCandidatesInputSchema = z.object({
  jdId: z.string(),
  requestId: z.string(),
  tenantId: z.string().uuid(),
  position: z.string(),
  seniorityLevel: z.string(),
  minYoe: z.number(),
  maxYoe: z.number().optional(),
  englishLevelRequired: z.string().optional(),
  salaryRange: z.string().optional(),
  keyResponsibilities: z.string().optional(),
  candidates: z.array(
    z.object({
      cv_id: z.string(),
      candidate_id: z.string(),
      full_name: z.string(),
      cv_skills: z.string().optional(),
      years_of_experience: z.number().optional(),
      english_level: z.string().optional(),
      salary_expectation: z.string().optional(),
    }),
  ),
  jdMustHave: z.string(),
  jdNiceToHave: z.string(),
  jdFullText: z.string().optional(),
});

export const GenerateReportInputSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().uuid(),
  screenedCvs: z.array(
    z.object({
      cvId: z.string(),
      candidateName: z.string(),
      fitScore: z.number(),
      recommendation: z.string(),
    }),
  ),
});

export const StartSlaTrackerInputSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().uuid(),
  confirmedCvIds: z.array(z.string()),
  deadlineHours: z.number().default(48),
});

/**
 * Mock hiring request database
 */
const MOCK_REQUESTS: Record<
  string,
  {
    position: string;
    team: string;
    teamSkillGap: string;
    keyDeliverables: string;
    salaryRange: string;
    seniorityLevel: string;
  }
> = {
  'REQ-001': {
    position: 'Senior Backend Developer',
    team: 'Platform Team',
    teamSkillGap: 'Kafka, Redis, distributed systems',
    keyDeliverables: 'Microservices migration, system architecture',
    salaryRange: '$1500-$2500',
    seniorityLevel: 'Senior',
  },
  'REQ-002': {
    position: 'Senior Frontend Engineer',
    team: 'Product Team',
    teamSkillGap: 'React 19, TanStack Router, performance optimization',
    keyDeliverables: 'UI redesign, responsive components library',
    salaryRange: '$1200-$2000',
    seniorityLevel: 'Senior',
  },
  'REQ-006': {
    position: 'AI/ML Engineer',
    team: 'Research Team',
    teamSkillGap: 'LLM fine-tuning, RAG systems, prompt engineering',
    keyDeliverables: 'LLM integration, deployment pipeline, evaluation framework',
    salaryRange: '$1800-$2800',
    seniorityLevel: 'Senior',
  },
  'REQ-011': {
    position: 'Senior Data Engineer',
    team: 'Analytics Team',
    teamSkillGap: 'Real-time analytics, distributed SQL, data pipeline orchestration',
    keyDeliverables: 'Real-time analytics platform, data warehouse modernization',
    salaryRange: '$1600-$2400',
    seniorityLevel: 'Senior',
  },
};

/**
 * Tool implementations with real LLM calls
 */

interface FetchContextResult {
  position: string;
  teamSkillGap: string;
  keyDeliverables: string;
  salaryRange: string;
  seniorityLevel: string;
  urgency: string;
  headcount: number;
  teamName: string;
  businessContext: string;
  workMode: string;
  yoe: string;
  englishLevel: string;
  benefits: string;
  reportingLine: string;
}

export async function fetchContext(
  input: z.infer<typeof FetchContextInputSchema>,
  db?: any,
): Promise<FetchContextResult> {
  console.log('fetchContext:', input);

  // Try to get from database if provided
  if (db) {
    try {
      const request = await db.query.hiringRequests.findFirst({
        where: eq(schema.hiringRequests.request_id, input.requestId),
      });

      if (!request) {
        throw new Error(`Hiring request not found: ${input.requestId}`);
      }

      return {
        position: request.position_title,
        teamSkillGap: request.team_skill_gap_summary || '',
        keyDeliverables: request.key_deliverables || '',
        salaryRange: request.salary_range || '',
        seniorityLevel: request.seniority_level || '',
        urgency: request.urgency_level || '',
        headcount: request.headcount_requested || 0,
        teamName: request.team_name || '',
        businessContext: request.business_justification || '',
        workMode: request.work_mode || '',
        yoe: request.min_yoe?.toString() || '',
        englishLevel: request.english_level_required || '',
        benefits: request.benefits || '',
        reportingLine: '',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error fetching from database:', error);
      throw new Error(`Failed to fetch hiring request: ${input.requestId}`);
    }
  }

  // Fallback to MOCK_REQUESTS only for testing
  const request = MOCK_REQUESTS[input.requestId];
  if (!request) {
    throw new Error(`Hiring request not found: ${input.requestId}`);
  }

  return {
    position: request.position,
    teamSkillGap: request.teamSkillGap,
    keyDeliverables: request.keyDeliverables,
    salaryRange: request.salaryRange,
    seniorityLevel: request.seniorityLevel || '',
    urgency: '',
    headcount: 0,
    teamName: request.team || '',
    businessContext: '',
    workMode: '',
    yoe: '',
    englishLevel: '',
    benefits: '',
    reportingLine: '',
  };
}

/**
 * Draft JD using Claude/OpenAI
 */
export async function draftJd(input: z.infer<typeof DraftJdInputSchema>) {
  console.log('draftJd:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Technical Recruiter. Generate a professional, screening-ready Job Description.
Your output will be evaluated against 8 criteria: Hiring Alignment, Role/Seniority, Skill Accuracy, Deliverables+Metrics, Interview Alignment, Screening Usefulness, Bias/Compliance, Completeness.

=========================
INPUT DATA
=========================
POSITION:          ${input.position}
SENIORITY:         ${input.seniorityLevel}
HEADCOUNT:         ${input.headcount}
URGENCY:           ${input.urgency}
TEAM_NAME:         ${input.teamName}
BUSINESS_CONTEXT:  ${input.businessContext}
TEAM_SKILL_GAP:    ${input.teamSkillGap}
KEY_DELIVERABLES:  ${input.keyDeliverables}
SALARY_RANGE:      ${input.salaryRange}
WORK_MODE:         ${input.workMode}
YOE:               ${input.yoe}
ENGLISH_LEVEL:     ${input.englishLevel}
BENEFITS:          ${input.benefits}
REPORTING_LINE:    ${input.reportingLine}

=========================
HARD RULES (violation = JD rejected)
=========================
1. NO FABRICATION. Use ONLY data from INPUT. NEVER invent YOE numbers, English levels, salary details, or benefits.
2. MISSING DATA → PLACEHOLDER. If a field is empty, write: "[HR to specify: <field_name>]"
3. PRESERVE ENUMS. Keep URGENCY and SENIORITY exactly as provided. No rephrasing (Critical stays Critical, not Immediate).
4. GENERIC BENEFITS BAN. Only list benefits from input.BENEFITS. If empty, write "[Per company policy — HR to specify]"
5. TRACEABLE MUST-HAVES. Every must-have skill must originate from TEAM_SKILL_GAP or KEY_DELIVERABLES.
6. NO BIAS. Exclude age, gender, family status, religion, appearance, and subjective personality filters ("driven", "young", "energetic").

=========================
OUTPUT FORMAT (Follow SETA Template)
=========================
## ${input.position} – SETA International

### About the Role
[2-3 sentences connecting role to BUSINESS_CONTEXT and URGENCY.
If URGENCY=High/Critical, emphasize scale/impact/timeline pressure.
If URGENCY=Medium/Low, focus on strategic importance.
No clichés. Focus on tangible business impact.]

### Responsibilities
[5-7 action-oriented bullets. Each tied to 1+ deliverable from KEY_DELIVERABLES.
Adjust language by seniority:
- Intern/Junior: execute under guidance, support, learn
- Mid: independent execution, design, mentoring juniors
- Senior: ownership of domain, architecture, process improvement, strategic contributions
- Manager+: strategy, roadmap, hiring, team health, organizational impact
NO generic filler ("support the team", "other duties", "collaborate")]

### Must-Have Requirements
[List ONLY from TEAM_SKILL_GAP or inferred from KEY_DELIVERABLES.
Format:
- Skill/Experience: [years/proficiency if from INPUT, else be specific]
- Technology/Tool: [specific version/variant if relevant]
- Soft skill: [specific context, not vague]
Include inline years/levels from INPUT only - NEVER fabricate.
Example: "3+ years hands-on ML engineering (production, not Kaggle-only)"]

### Nice-to-Have
[4-5 valuable but optional skills. Explain WHY valuable.
Example: "LLM fine-tuning: LoRA, QLoRA — accelerates model customization"]

### Requirements
- **Years of Experience**: ${input.yoe}
- **English Level**: ${input.englishLevel}
- **Work Mode**: ${input.workMode}

### Offer
- **Salary**: ${input.salaryRange}${input.workMode ? `\n- **Work Mode**: ${input.workMode}` : ''}
${
  input.benefits
    ? `- **Benefits**:\n${input.benefits
        .split('\n')
        .map((b) => `  - ${b}`)
        .join('\n')}`
    : ''
}

=========================
QUALITY CHECKLIST (internal validation — do NOT output):
=========================
Before returning the JD, verify:
✓ Every YOE number comes from INPUT.yoe (or is "[HR to specify]")
✓ Every English level comes from INPUT.englishLevel (or is "[HR to specify]")
✓ Every must-have skill traceable to TEAM_SKILL_GAP or KEY_DELIVERABLES
✓ Success Metrics quantifiable (%, count, timeline)
✓ No generic filler ("support", "other duties", repeated phrases)
✓ No bias language (age, gender, personality adjectives)
✓ URGENCY/SENIORITY use exact enum values from INPUT
✓ Screening Guide complete (rules, criteria, evidence, checklist)

OUTPUT ONLY: Complete JD in Markdown format. Do not include this checklist or any meta-commentary.`;

  process.stderr.write(
    `\n📋 DRAFTJD PROMPT (first 1000 chars):\n${prompt.substring(0, 1000)}\n...\n\n`,
  );

  const result = await generateText({
    model,
    prompt,
    temperature: 0.5,
  });

  return {
    draftText: result.text,
    fullPrompt: prompt,
  };
}

/**
 * Stream JD draft with reasoning tokens
 */
export async function* draftJdStream(input: z.infer<typeof DraftJdInputSchema>) {
  console.log('draftJdStream:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are a Recruiting Manager tasked with creating a Professional Job Description.

HIRING CONTEXT:
- Position: ${input.position}
- Seniority Level: ${input.seniorityLevel}
- Headcount: ${input.headcount || ''}
- Urgency: ${input.urgency || ''}
- Team: ${input.teamName || ''}
- Business Context: ${input.businessContext || ''}

KEY CONTEXT:
- Team Skill Gap: ${input.teamSkillGap}
- Key Deliverables: ${input.keyDeliverables}

REQUIREMENTS:
- Salary Range: ${input.salaryRange}
- Work Mode: ${input.workMode || ''}
- Years of Experience: ${input.yoe || ''}
- English Level: ${input.englishLevel || ''}

Generate a professional, screening-ready Job Description for this role.`;

  const stream = streamText({
    model,
    prompt,
    temperature: 0.5,
  });

  let fullText = '';

  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text;
      yield { type: 'text', content: chunk.text };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'thinking-start', content: '' };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'thinking-end', content: '' };
    }
  }

  // Yield complete with full text
  yield {
    type: 'complete',
    content: 'text',
    data: {
      draftText: fullText,
      fullPrompt: prompt,
    },
  };
}

/**
 * Score JD using Claude/OpenAI
 */
export async function scoreJd(input: z.infer<typeof ScoreJdInputSchema>) {
  console.log('scoreJd:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Recruiter evaluating Job Descriptions using the JD Quality Scoring Guide v3.

SCORING FRAMEWORK (100 points total across 8 categories):

## REQUIRED CATEGORIES & POINTS:

1. **Hiring Request Alignment (20 points)**
   - Role Purpose Alignment (4 pts): Does JD reflect the stated hiring need?
   - Business Context Reflection (4 pts): Does JD show understanding of business goals?
   - Urgency Alignment (3 pts): Does JD reflect stated urgency level?
   - Team Gap Addressed (4 pts): Does JD address the specific team skill gaps?
   - Domain Relevance (3 pts): Is content domain-appropriate?
   - No Wrong Scope Expansion (2 pts): Are responsibilities in scope for this role?

2. **Role / Seniority / Headcount Alignment (15 points)**
   - Title Alignment (3 pts): Is title clear and specific?
   - Seniority Alignment (3 pts): Does seniority level match approval?
   - YOE Calibration (3 pts): Are YOE expectations realistic for seniority?
   - Responsibility Alignment (2 pts): Do responsibilities match seniority level?
   - Salary/Location Alignment (2 pts): Are comp and location specified?
   - Headcount Constraints (2 pts): Does JD respect headcount limits?

3. **Skill / Tech Stack Accuracy (20 points)**
   - Core Stack Correct (5 pts): Are core technologies accurately described?
   - Functional Skills Correct (4 pts): Are non-technical skills appropriate?
   - Team Gap Skills Included (4 pts): Does JD include must-have gap-filling skills?
   - Must-have vs Nice-to-have Separation (3 pts): Clear prioritization?
   - No Unsupported Must-have (3 pts): Are all must-haves justified by evidence?
   - Language Requirement Justified (1 pt): Is language level job-related?

4. **Deliverables & Responsibilities (15 points)**
   - Key Deliverables Covered (6 pts): Are main deliverables explicit?
   - Success Metrics Mentioned (3 pts): Are outcomes measurable?
   - Collaboration Interfaces (2 pts): Are team dependencies clear?
   - Ownership Level (2 pts): Is accountability defined?
   - Avoid Filler Responsibilities (2 pts): No generic/boilerplate text?

5. **Interview Scorecard Alignment (10 points)**
   - Top Weighted Criteria Included (4 pts): Are most-important evaluation criteria in JD?
   - Interview Focus Explicit (3 pts): Is screening methodology clear?
   - JD Consistent With Screening (2 pts): Do requirements match scorecard?
   - No Criterion Conflict (1 pt): No contradictions between JD and scorecard?

6. **Screening Usefulness (10 points)**
   - Measurable Requirements (3 pts): Can requirements be objectively verified?
   - Clear Screen-out Rules (2 pts): What disqualifies a candidate?
   - Prioritization Clarity (2 pts): Which requirements are must-have vs nice-to-have?
   - Expected Evidence Clarity (2 pts): What evidence do candidates need to provide?
   - Checklist-ready Structure (1 pt): Can a recruiter easily create a screening checklist?

7. **Bias / Compliance (5 points)**
   - No Protected Attributes (2 pts): No age/family/gender/religion references?
   - Communication Requirement Job-related (1 pt): Is English/language requirement job-critical?
   - No Subjective Personality Filters (1 pt): No unfair personality requirements?
   - Requirements Job-related (1 pt): All requirements tied to job function?

8. **Completeness & Structure (5 points)**
   - Required Sections Present (2 pts): Has all standard sections?
   - Readability (1 pt): Is JD clear and well-formatted?
   - Internal Consistency (1 pt): No contradictions within JD?
   - No Duplication (1 pt): Requirements not repeated?

## HARD FAIL RULES (Override numeric score):

Return score <60 ("Fail") if ANY of these occur:
- Wrong role family entirely
- Wrong seniority level (e.g., Mid vs Senior)
- No must-have requirements defined
- Unsupported mandatory skills (not in hiring request/context)
- Critical deliverables omitted
- Discriminatory or biased language
- Contradicts approved headcount/compensation constraints
- Unusable for screening (too vague/generic)

## SCORING PROCESS:

1. For EACH sub-check, assign points (0 to max)
2. Show your reasoning for each category
3. Flag any hard fails
4. Sum all categories for final score
5. Assign status based on thresholds:
   - 90-100: Ready
   - 80-89: Minor Revision
   - 70-79: Needs Revision
   - 60-69: Weak
   - <60: Fail

Return ONLY valid JSON (no markdown, no code blocks):
{
  "clarityScore": <0-100 number>,
  "status": "<Ready|Minor Revision|Needs Revision|Weak|Fail>",
  "hardFail": <boolean>,
  "hardFailReason": "<reason if hardFail=true, null otherwise>",
  "categoryScores": {
    "hiringAlignment": <0-20>,
    "roleAlignment": <0-15>,
    "skillAccuracy": <0-20>,
    "deliverables": <0-15>,
    "interviewAlignment": <0-10>,
    "screeningUsefulness": <0-10>,
    "biasCompliance": <0-5>,
    "completeness": <0-5>
  },
  "flaggedGaps": ["gap1", "gap2", "..."],
  "requiredRevisions": ["revision1", "revision2", "..."],
  "confidence": "<High|Medium|Low>"
}

JD TEXT TO SCORE:
${input.jdText}`;

  console.log('📋 scoreJd finalPrompt:', prompt);

  const result = await generateText({
    model,
    prompt,
    temperature: 0,
  });

  try {
    // Clean up any markdown formatting if present
    const cleanedText = result.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);
    return {
      clarityScore: Math.min(100, Math.max(0, parsed.clarityScore || 0)),
      status: parsed.status || 'Needs Revision',
      hardFail: parsed.hardFail || false,
      hardFailReason: parsed.hardFailReason || null,
      categoryScores: parsed.categoryScores || {},
      flaggedGaps: Array.isArray(parsed.flaggedGaps) ? parsed.flaggedGaps : [],
      requiredRevisions: Array.isArray(parsed.requiredRevisions) ? parsed.requiredRevisions : [],
      confidence: parsed.confidence || 'Medium',
      fullPrompt: prompt,
    };
  } catch (error) {
    console.error('Failed to parse score response:', error, result.text);
    return {
      clarityScore: 0,
      status: 'Fail',
      hardFail: true,
      hardFailReason: 'Unable to evaluate JD due to parsing error',
      categoryScores: {},
      flaggedGaps: ['JD evaluation failed - please review and resubmit'],
      requiredRevisions: ['Unable to parse scoring - please reformat JD'],
      confidence: 'Low',
      fullPrompt: prompt,
    };
  }
}

/**
 * Stream score JD with reasoning tokens and collect full response
 */
export async function* scoreJdStream(input: z.infer<typeof ScoreJdInputSchema>) {
  console.log('scoreJdStream:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Recruiter evaluating Job Descriptions using the JD Quality Scoring Guide v3.

SCORING FRAMEWORK (100 points total across 8 categories):

## REQUIRED CATEGORIES & POINTS:

1. **Hiring Request Alignment (20 points)**
   - Role Purpose Alignment (4 pts): Does JD reflect the stated hiring need?
   - Business Context Reflection (4 pts): Does JD show understanding of business goals?
   - Urgency Alignment (3 pts): Does JD reflect stated urgency level?
   - Internal Role Positioning (3 pts): Does JD position role well within team structure?
   - Compensation Clarity (3 pts): Are compensation expectations clearly outlined?

2. **Role Clarity & Seniority Alignment (15 points)**
   - Clear Seniority Level (5 pts): Is seniority level unmistakable?
   - Role Definition (5 pts): Is the core purpose of the role explicitly clear?
   - Team Integration (5 pts): Is the role's place in team hierarchy clear?

3. **Skill Accuracy (20 points)**
   - Must-Have Skills Definition (7 pts): Are required skills specific and testable?
   - Nice-to-Have Skills (5 pts): Are optional enhancements realistic?
   - Technical Depth (5 pts): Is technical level appropriate for seniority?
   - Outdated/Contradictory Skills (3 pts): No conflicting or obsolete requirements?

4. **Key Deliverables & Metrics (15 points)**
   - Measurable Outcomes (7 pts): Are deliverables quantifiable?
   - Realistic Scope (5 pts): Can deliverables be achieved in standard tenure?
   - Impact Focus (3 pts): Do deliverables show business value?

5. **Interview Preparation Usefulness (10 points)**
   - Interview Question Suitability (5 pts): Can interviewers generate quality questions?
   - Red Flags Definition (3 pts): Are deal-breakers defined?
   - Culture Fit Clarity (2 pts): Are team values/working style conveyed?

6. **Screening Usefulness (10 points)**
   - CV Screening Clarity (5 pts): Can recruiters screen candidates efficiently?
   - Filter Criteria (3 pts): Are screening criteria unambiguous?
   - Keyword Optimization (2 pts): Keywords present for ATS search?

7. **Bias & Compliance (5 points)**
   - No Age/Gender Bias (3 pts): Is language neutral and professional?
   - Legal Compliance (2 pts): No discriminatory requirements?

8. **Completeness (5 points)**
   - Full Section Coverage (3 pts): All standard sections present?
   - Formatting & Clarity (2 pts): Professional presentation?

RESPOND ONLY WITH VALID JSON (no markdown, no code blocks):
{
  "clarityScore": <0-100>,
  "status": "<Ready|Minor Revision|Needs Revision|Weak>",
  "hardFail": <boolean>,
  "hardFailReason": <null or string>,
  "categoryScores": {
    "hiringAlignment": <0-20>,
    "roleAlignment": <0-15>,
    "skillAccuracy": <0-20>,
    "deliverables": <0-15>,
    "interviewAlignment": <0-10>,
    "screeningUsefulness": <0-10>,
    "biasCompliance": <0-5>,
    "completeness": <0-5>
  },
  "flaggedGaps": ["gap1", "gap2", "..."],
  "requiredRevisions": ["revision1", "revision2", "..."],
  "confidence": "<High|Medium|Low>"
}

JD TEXT TO SCORE:
${input.jdText}`;

  console.log('📋 scoreJdStream finalPrompt:', prompt);

  const stream = streamText({
    model,
    prompt,
    temperature: 0,
  });

  let fullText = '';

  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text;
      yield { type: 'text', content: chunk.text };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'thinking-start', content: '' };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'thinking-end', content: '' };
    }
  }

  // Parse the collected text
  try {
    const cleanedText = fullText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);
    yield {
      type: 'complete',
      content: 'parsed',
      data: {
        clarityScore: Math.min(100, Math.max(0, parsed.clarityScore || 0)),
        status: parsed.status || 'Needs Revision',
        hardFail: parsed.hardFail || false,
        hardFailReason: parsed.hardFailReason || null,
        categoryScores: parsed.categoryScores || {},
        flaggedGaps: Array.isArray(parsed.flaggedGaps) ? parsed.flaggedGaps : [],
        requiredRevisions: Array.isArray(parsed.requiredRevisions) ? parsed.requiredRevisions : [],
        confidence: parsed.confidence || 'Medium',
        fullPrompt: prompt,
      },
    };
  } catch (error) {
    console.error('Failed to parse score response:', error, fullText);
    yield {
      type: 'error',
      content: 'parse-error',
      message: 'Unable to parse scoring result',
    };
  }
}

/**
 * Revise JD using Claude/OpenAI
 */
export async function reviseJd(input: z.infer<typeof ReviseJdInputSchema>) {
  console.log('reviseJd:', input);

  const model = openai('gpt-4-turbo');

  const gaps = input.flaggedGaps.join('\n- ');
  const prompt = `You are an expert Recruiter. Improve this job description to address the flagged gaps.

GAPS TO ADDRESS:
- ${gaps}

CURRENT JD:
${input.currentDraft}

TASK:
1. Address each flagged gap specifically
2. Maintain professional tone and structure
3. Keep all good content from original
4. Make improvements targeted and specific

Return the revised JD with all sections complete.`;

  console.log('📋 reviseJd finalPrompt:', prompt);

  const result = await generateText({
    model,
    prompt,
    temperature: 0.6,
  });

  return {
    revisedText: result.text,
    fullPrompt: prompt,
  };
}

/**
 * Screen CV using CV Fit Scoring Guide v2
 * Implements 100-point scoring methodology with detailed breakdowns
 */
export async function screenCv(input: z.infer<typeof ScreenCvInputSchema>) {
  console.log('screenCv:', input);

  const model = openai('gpt-4-turbo');

  // Use full JD text if available, otherwise fall back to parsed fields
  const jdContext = input.jdFullText
    ? `APPROVED JD (FULL TEXT):
${input.jdFullText}`
    : `APPROVED JD (PARSED):
- Position: ${input.jdId}
- Must-Have Skills (50 points): ${input.jdMustHave}
- Nice-to-Have Skills (15 points): ${input.jdNiceToHave}
- Min YOE: ${input.jdMinYoe} years`;

  const prompt = `You are a CV Fit Scoring Agent. Score this candidate using the official CV Fit Scoring Guide v2.

${jdContext}

CANDIDATE PROFILE:
- Name: ${input.candidateName}
- Skills: ${input.cvSkills}
- Total YOE: ${input.yearsOfExperience} years
- English Level: ${input.englishLevel}
- Salary Expectation: ${input.salaryExpectation}

SCORING BREAKDOWN (100 points total):

1. MUST-HAVE SKILLS MATCH (50 points)
   - Match each candidate skill to JD must-haves
   - Strong Match = 100% credit, Partial Match = 50% credit, No Match = 0%
   - Divide 50 points equally among must-have skills
   - Return score/50

2. RELEVANT EXPERIENCE & SENIORITY (20 points)
   - Total Professional YOE (5 pts): meets/exceeds = 5, slightly below = 3, clearly below = 1
   - Role-Relevant YOE (8 pts): assess if prior roles match this job family
   - Key-Skill YOE (5 pts): experience with specific skills in right context
   - Ownership Evidence (2 pts): leadership, mentorship, architecture, incident handling
   - Return score/20

3. REQUIRED LANGUAGE LEVEL MATCH (15 points)
   - Exceeds requirement = 15
   - Meets requirement = 12
   - Slightly below = 6
   - Clearly below = 0
   - Return score/15

4. NICE-TO-HAVE SKILLS MATCH (15 points)
   - Same methodology as must-haves
   - Divide 15 points equally among nice-to-have skills
   - Return score/15

RECOMMENDATION THRESHOLDS:
- 85-100: Strong shortlist
- 75-84: Shortlist
- 60-74: Medium / HM Review
- 40-59: Low / Need More Information
- <40: Reject / Not Suitable

Return ONLY valid JSON (no markdown, no code blocks):
{
  "final_cv_fit_score": <0-100 number>,
  "recommendation": "<Strong shortlist|Shortlist|Medium|Low|Reject>",
  "confidence": "<High|Medium|Low>",
  "category_scores": {
    "must_have_skills_match": <0-50>,
    "relevant_experience_seniority_match": <0-20>,
    "required_language_level_match": <0-15>,
    "nice_to_have_skills_match": <0-15>
  },
  "matched_evidence": [<list of strong matches>],
  "missing_or_unclear_evidence": [<list of gaps>],
  "flags": [<any flags like seniority mismatch, language gap, etc>],
  "questions_for_recruiter": [<2-3 clarification questions for TA>],
  "interview_questions": [<3-5 key interview questions if PASS (score >= 75)>],
  "follow_up_questions": [<3-5 follow-up questions to gather more info if NEED MORE INFO (40-74)>],
  "reject_reason": "<clear reason why candidate is rejected, if REJECT (score < 40)>",
  "final_decision_reason": "<1-2 sentences>"
}`;

  console.log('📋 screenCv finalPrompt:', prompt);

  const result = await generateText({
    model,
    prompt,
    temperature: 0,
  });

  try {
    const cleanedText = result.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    const fitScore = Math.min(100, Math.max(0, parsed.final_cv_fit_score || 0));
    const mustHaveSkillsScore = Math.min(
      50,
      Math.max(0, parsed.category_scores?.must_have_skills_match || 0),
    );
    const relevantExpScore = Math.min(
      20,
      Math.max(0, parsed.category_scores?.relevant_experience_seniority_match || 0),
    );
    const languageLevelScore = Math.min(
      15,
      Math.max(0, parsed.category_scores?.required_language_level_match || 0),
    );
    const niceToHaveScore = Math.min(
      15,
      Math.max(0, parsed.category_scores?.nice_to_have_skills_match || 0),
    );

    const getRecommendation = (
      score: number,
      mustHaveScore: number,
    ): 'Pass' | 'Reject' | 'Need More Info' => {
      // Hard gate: if truly zero must-have skill match, force Reject
      // But keep the actual fitScore and reason from model for transparency
      if (mustHaveScore === 0) return 'Reject';

      if (score >= 75) return 'Pass';
      if (score < 40) return 'Reject';
      return 'Need More Info';
    };

    const recommendation = getRecommendation(fitScore, mustHaveSkillsScore);

    return {
      fitScore, // Keep actual score from model, don't override
      recommendation,
      confidence: parsed.confidence || 'Medium',
      categoryScores: {
        mustHaveSkills: mustHaveSkillsScore,
        relevantExperience: relevantExpScore,
        languageLevel: languageLevelScore,
        niceToHaveSkills: niceToHaveScore,
      },
      fitSummary: parsed.final_decision_reason || 'Review CV for fit',
      matchedEvidence: parsed.matched_evidence || [],
      gapSummary: parsed.missing_or_unclear_evidence?.join('; ') || 'Unable to assess',
      flags: parsed.flags || [],
      suggestedQuestions:
        parsed.questions_for_recruiter?.join('; ') || 'Ask about relevant experience',
      interviewQuestions: recommendation === 'Pass' ? parsed.interview_questions || [] : [],
      followUpQuestions:
        recommendation === 'Need More Info' ? parsed.follow_up_questions || [] : [],
      rejectReason:
        recommendation === 'Reject'
          ? parsed.reject_reason || 'Does not meet job requirements'
          : null,
      fullPrompt: prompt,
    };
  } catch (error) {
    console.error('Failed to parse CV screen response:', error, result.text);
    return {
      fitScore: 50,
      recommendation: 'Need More Info',
      confidence: 'Low',
      categoryScores: {
        mustHaveSkills: 0,
        relevantExperience: 0,
        languageLevel: 0,
        niceToHaveSkills: 0,
      },
      fitSummary: 'Review CV for fit',
      matchedEvidence: [],
      gapSummary: 'Unable to fully assess',
      flags: ['Parsing error - manual review recommended'],
      suggestedQuestions: 'Ask about relevant experience',
      fullPrompt: prompt,
    };
  }
}

/**
 * Screen Multiple CVs in Parallel with Concurrency Control
 * Uses 1:1 screenCv calls with concurrency limit to avoid rate limits
 * If one CV fails, others continue (no cascade failure)
 */
export async function screenManyCvs(input: z.infer<typeof BatchScreenCandidatesInputSchema>) {
  const { runWithConcurrency } = await import('./utils/concurrency.ts');

  const SCREEN_CONCURRENCY = 5; // Tune based on OpenAI rate limits

  // Validate & filter candidate pool - skip invalid candidates
  const validCandidates = input.candidates.filter((c) => {
    const isValid =
      c.full_name &&
      c.full_name.trim().length > 0 &&
      c.cv_skills &&
      c.cv_skills.trim() !== 'N/A' &&
      c.years_of_experience !== undefined &&
      c.years_of_experience > 0;

    if (!isValid) {
      console.warn(`⚠️ Skipping invalid candidate: ${c.cv_id} (${c.full_name || 'unnamed'})`);
    }
    return isValid;
  });

  console.log('📊 screenManyCvs starting:', {
    totalReceived: input.candidates.length,
    validCandidates: validCandidates.length,
    skipped: input.candidates.length - validCandidates.length,
    concurrency: SCREEN_CONCURRENCY,
  });

  const results = await runWithConcurrency(
    validCandidates,
    SCREEN_CONCURRENCY,
    async (candidate) => {
      try {
        const screenResult = await screenCv({
          cvId: candidate.cv_id,
          jdId: input.jdId,
          requestId: input.requestId,
          tenantId: input.tenantId,
          jdMustHave: input.jdMustHave,
          jdNiceToHave: input.jdNiceToHave,
          jdMinYoe: input.minYoe,
          jdFullText: input.jdFullText,
          candidateName: candidate.full_name,
          cvSkills: candidate.cv_skills ?? 'N/A',
          yearsOfExperience: candidate.years_of_experience ?? 0,
          englishLevel: candidate.english_level ?? 'B2',
          salaryExpectation: candidate.salary_expectation ?? 'Negotiable',
        });

        return {
          cvId: candidate.cv_id,
          candidateName: candidate.full_name,
          ok: true as const,
          ...screenResult,
        };
      } catch (error) {
        console.error(`❌ screenCv failed for ${candidate.cv_id}:`, error);
        return {
          cvId: candidate.cv_id,
          candidateName: candidate.full_name,
          ok: false as const,
          fitScore: 50,
          recommendation: 'Need More Info' as const,
          confidence: 'Low' as const,
          categoryScores: {
            mustHaveSkills: 0,
            relevantExperience: 0,
            languageLevel: 0,
            niceToHaveSkills: 0,
          },
          fitSummary: 'Screening failed - manual review required',
          matchedEvidence: [],
          gapSummary: 'Unable to assess',
          flags: ['Screening error - manual review recommended'],
          suggestedQuestions: 'Ask about relevant experience',
          interviewQuestions: [],
          followUpQuestions: [],
          rejectReason: null,
          fullPrompt: '',
        };
      }
    },
  );

  console.log('✅ screenManyCvs completed:', {
    total: results.length,
    successful: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });

  return results;
}

/**
 * Generate Report
 */
export async function generateReport(input: z.infer<typeof GenerateReportInputSchema>) {
  console.log('generateReport:', input);

  const ranked = input.screenedCvs
    .sort((a, b) => b.fitScore - a.fitScore)
    .map((cv, idx) => ({ ...cv, rank: idx + 1 }));

  return {
    rankedCandidates: ranked,
    topCandidates: ranked.slice(0, 3),
  };
}

/**
 * Start SLA Tracker
 */
/**
 * Screen and shortlist candidates - batch score all candidates
 */
export async function screenAndShortlist(input: z.infer<typeof ScreenCvInputSchema>) {
  console.log('screenAndShortlist: batch scoring', {
    requestId: input.requestId,
    jdId: input.jdId,
  });

  // In real scenario, this would score all candidates
  // For now, return a sample shortlist report
  const candidates = [
    {
      cvId: 'CV-012',
      candidateName: 'Candidate L',
      fitScore: 95,
      recommendation: 'Strong shortlist',
      matchedEvidence: [
        '6 years production DE experience with Tiki',
        'Full GCP stack (BigQuery, Dataflow, Composer)',
        'Real-time pipeline ownership (50GB/day)',
        'Kafka production experience',
      ],
    },
    {
      cvId: 'CV-015',
      candidateName: 'Candidate O',
      fitScore: 78,
      recommendation: 'Shortlist',
      matchedEvidence: [
        '4 years DE experience with strong streaming background',
        'Spark + Airflow + Kafka + BigQuery',
        'VNG Cloud infrastructure experience',
      ],
    },
    {
      cvId: 'CV-013',
      candidateName: 'Candidate M',
      fitScore: 65,
      recommendation: 'Medium',
      matchedEvidence: ['3 years Airflow + BigQuery experience', 'Growing Python skills'],
    },
    {
      cvId: 'CV-014',
      candidateName: 'Candidate N',
      fitScore: 32,
      recommendation: 'Reject',
      matchedEvidence: ['BI/Analytics background, not data engineering'],
    },
  ];

  return {
    reportId: `report-${Date.now()}`,
    position: 'Senior Data Engineer',
    totalCandidates: candidates.length,
    scoredCandidates: candidates,
    recommendedShortlist: candidates
      .filter((c) => c.fitScore >= 65)
      .sort((a, b) => b.fitScore - a.fitScore),
    summary: `Evaluated ${candidates.length} candidates. Recommended **${candidates.filter((c) => c.fitScore >= 75).length} strong candidates** for shortlist.`,
  };
}

export async function startSlaTracker(input: z.infer<typeof StartSlaTrackerInputSchema>) {
  console.log('startSlaTracker:', input);

  const deadline = new Date();
  deadline.setHours(deadline.getHours() + input.deadlineHours);

  return {
    trackingIds: input.confirmedCvIds.map((cvId) => `tracking-${cvId}`),
    deadline: deadline.toISOString(),
  };
}

/**
 * Extract hiring request details from user description using LLM
 */
export const ExtractRequestInputSchema = z.object({
  description: z.string(),
});

export interface ExtractedRequestDetails {
  position_title?: string;
  team_name?: string;
  urgency_level?: string;
  headcount_requested?: number;
  business_justification?: string;
  team_skill_gap_summary?: string;
  key_deliverables?: string;
  salary_range?: string;
  seniority_level?: string;
  min_yoe?: number;
  max_yoe?: number;
  team_description?: string;
  preferred_tech_stack?: string[];
  required_skills?: string[];
  nice_to_have_skills?: string[];
  onboarding_timeline?: string;
  responsibilities?: string[];
  work_mode?: string;
  english_level_required?: string;
  benefits?: string;
  missing_fields: string[];
  fullPrompt: string;
}

export async function extractRequestDetails(
  input: z.infer<typeof ExtractRequestInputSchema>,
): Promise<ExtractedRequestDetails> {
  console.log('extractRequestDetails: Processing user description');

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert HR recruiter. Extract hiring request information from the following description and return ONLY valid JSON.

USER DESCRIPTION:
${input.description}

Extract these fields and return a valid JSON object. Use null for any missing fields:

{
  "position_title": "job title",
  "team_name": "team or department name",
  "team_description": "what the team does",
  "seniority_level": "one of: Intern, Junior, Mid, Senior, Manager, C-level",
  "min_yoe": "minimum years experience as integer (e.g. 3 for '3+ years')",
  "max_yoe": "maximum years experience as integer or null",
  "urgency_level": "one of: Low, Medium, High, Critical",
  "headcount_requested": "number of positions needed",
  "salary_range": "salary range string",
  "work_mode": "one of: Remote, Hybrid, On-site",
  "english_level_required": "one of: A1, A2, B1, B2, C1, C2",
  "onboarding_timeline": "timeline string like '4-6 weeks' or 'ASAP'",
  "business_justification": "why this hire is needed",
  "team_skill_gap_summary": "skills the team lacks",
  "key_deliverables": "main responsibilities as string",
  "responsibilities": ["list", "of", "individual", "responsibilities"],
  "preferred_tech_stack": ["PHP", "React", "MySQL"],
  "required_skills": ["must-have", "skills"],
  "nice_to_have_skills": ["nice-to-have", "skills"],
  "benefits": "benefits offered or null"
}

ENUM VALUES ONLY:
- Seniority: Intern, Junior, Mid, Senior, Manager, C-level
- Urgency: Low, Medium, High, Critical
- YOE: convert "3-5 years" to min_yoe: 3, max_yoe: 5; "5+ years" to min_yoe: 5, max_yoe: null

Return ONLY valid JSON, no markdown, no extra text.`;

  console.log('📋 extractRequestDetails finalPrompt:', prompt);

  const result = await generateText({
    model,
    prompt,
    temperature: 0.3,
  });

  console.log('📝 LLM raw response:', result.text);

  let extracted: Partial<ExtractedRequestDetails> = {};
  try {
    const parsed = JSON.parse(result.text);
    extracted = {
      position_title: parsed.position_title || undefined,
      team_name: parsed.team_name || undefined,
      team_description: parsed.team_description || undefined,
      urgency_level: parsed.urgency_level || undefined,
      headcount_requested: parsed.headcount_requested || undefined,
      business_justification: parsed.business_justification || undefined,
      team_skill_gap_summary: parsed.team_skill_gap_summary || undefined,
      key_deliverables: parsed.key_deliverables || undefined,
      responsibilities: Array.isArray(parsed.responsibilities)
        ? parsed.responsibilities.filter((r: unknown): r is string => typeof r === 'string')
        : undefined,
      salary_range: parsed.salary_range || undefined,
      seniority_level: parsed.seniority_level || undefined,
      min_yoe: parsed.min_yoe ? parseInt(String(parsed.min_yoe), 10) : undefined,
      max_yoe: parsed.max_yoe ? parseInt(String(parsed.max_yoe), 10) : undefined,
      preferred_tech_stack: Array.isArray(parsed.preferred_tech_stack)
        ? parsed.preferred_tech_stack.filter((t: unknown): t is string => typeof t === 'string')
        : undefined,
      required_skills: Array.isArray(parsed.required_skills)
        ? parsed.required_skills.filter((s: unknown): s is string => typeof s === 'string')
        : undefined,
      nice_to_have_skills: Array.isArray(parsed.nice_to_have_skills)
        ? parsed.nice_to_have_skills.filter((s: unknown): s is string => typeof s === 'string')
        : undefined,
      onboarding_timeline: parsed.onboarding_timeline || undefined,
      work_mode: parsed.work_mode || undefined,
      english_level_required: parsed.english_level_required || undefined,
      benefits: parsed.benefits || undefined,
    };
    console.log('✅ Extracted details:', extracted);
  } catch (e) {
    console.error('❌ Failed to parse LLM response:', e);
    console.error('Response text was:', result.text);
  }

  // Identify missing required and important fields
  // REQUIRED (must have): position_title, team_name, key_deliverables
  // HIGH importance (should ask): urgency_level, seniority_level, min_yoe
  // MEDIUM importance (should ask): salary_range, headcount_requested, work_mode, english_level_required, responsibilities, team_skill_gap_summary, business_justification
  // LOW importance (should ask): required_skills, nice_to_have_skills (optional)
  const required = ['position_title', 'team_name', 'key_deliverables'];
  const highImportance = ['urgency_level', 'seniority_level', 'min_yoe'];
  const mediumImportance = [
    'salary_range',
    'headcount_requested',
    'work_mode',
    'english_level_required',
    'responsibilities',
    'team_skill_gap_summary',
    'business_justification',
  ];
  const lowImportance = ['required_skills', 'nice_to_have_skills'];

  const missing_fields = [
    ...required.filter((field) => !extracted[field as keyof ExtractedRequestDetails]),
    ...highImportance.filter((field) => !extracted[field as keyof ExtractedRequestDetails]),
    ...mediumImportance.filter((field) => !extracted[field as keyof ExtractedRequestDetails]),
    ...lowImportance.filter((field) => !extracted[field as keyof ExtractedRequestDetails]),
  ];

  return {
    ...extracted,
    missing_fields,
    fullPrompt: prompt,
  };
}

/**
 * Revise JD based on user feedback
 */
export const ReviseJdWithFeedbackInputSchema = z.object({
  currentJdText: z.string(),
  userFeedback: z.string(),
  position: z.string(),
  teamSkillGap: z.string(),
  keyDeliverables: z.string(),
});

export async function reviseJdWithFeedback(input: z.infer<typeof ReviseJdWithFeedbackInputSchema>) {
  console.log('reviseJdWithFeedback: Revising JD based on user feedback');

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Technical Recruiter. You are revising a job description based on user feedback.

CURRENT JD:
${input.currentJdText}

USER FEEDBACK:
${input.userFeedback}

CONTEXT:
- Position: ${input.position}
- Team Skill Gaps: ${input.teamSkillGap}
- Key Deliverables: ${input.keyDeliverables}

Please revise the JD to address the user's feedback while maintaining professional standards and clarity. Keep the same structure and sections, but improve based on the feedback provided.

Return the complete revised JD in markdown format.`;

  console.log('📋 reviseJdWithFeedback finalPrompt:', prompt);

  const result = await generateText({
    model,
    prompt,
    temperature: 0.7,
  });

  return {
    revisedText: result.text,
    fullPrompt: prompt,
  };
}

/**
 * Batch screen all candidates against JD in one call with streaming
 */
export async function* batchScreenCandidatesStream(
  input: z.infer<typeof BatchScreenCandidatesInputSchema>,
) {
  console.log('batchScreenCandidatesStream:', {
    jdId: input.jdId,
    candidateCount: input.candidates.length,
  });

  const model = openai('gpt-4-turbo');

  const candidatesText = input.candidates
    .map(
      (c) =>
        `- ${c.full_name} (${c.cv_id}): ${c.cv_skills || 'N/A'}, ${c.years_of_experience || 0}yoe, English ${c.english_level || 'B2'}, Salary: ${c.salary_expectation || 'Negotiable'}`,
    )
    .join('\n');

  const prompt = `You are an expert recruiter using the CV Fit Scoring Guide v2. Screen these ${input.candidates.length} candidates against the approved JD using the official scoring methodology.

APPROVED JD:
**Position:** ${input.position} (${input.seniorityLevel})
**Experience:** ${input.minYoe}${input.maxYoe ? `-${input.maxYoe}` : '+'} years
**English Level Required:** ${input.englishLevelRequired || 'B2+'}
**Salary Range:** ${input.salaryRange || 'Negotiable'}

JD REQUIREMENTS:
- Must-Have Skills (50 points): ${input.jdMustHave}
- Nice-to-Have Skills (15 points): ${input.jdNiceToHave}
${input.keyResponsibilities ? `- Key Responsibilities: ${input.keyResponsibilities}` : ''}

CANDIDATES:
${candidatesText}

For EACH candidate, score using this EXACT methodology:

SCORING BREAKDOWN (100 points total):

1. MUST-HAVE SKILLS MATCH (50 points)
   - Match each candidate skill to JD must-haves
   - Strong Match = 100% credit, Partial Match = 50% credit, No Match = 0%
   - Divide 50 points equally among must-have skills
   - Return score/50

2. RELEVANT EXPERIENCE & SENIORITY (20 points)
   - Total Professional YOE (5 pts): meets/exceeds max = 5, meets min = 4, slightly below = 2, clearly below = 0
   - Role-Relevant YOE (8 pts): assess if prior roles match ${input.position} job family
   - Key-Skill YOE (5 pts): experience with must-have skills in right context
   - Ownership Evidence (2 pts): leadership, mentorship, architecture responsibilities
   - Return score/20

3. REQUIRED LANGUAGE LEVEL MATCH (15 points)
   - Required: ${input.englishLevelRequired || 'B2'}
   - Exceeds requirement = 15, Meets = 12, Slightly below = 6, Clearly below = 0
   - Return score/15

4. NICE-TO-HAVE SKILLS MATCH (15 points)
   - Same methodology as must-haves
   - Divide 15 points equally among nice-to-have skills
   - Return score/15

RECOMMENDATION THRESHOLDS:
- 85-100: Strong shortlist (Pass)
- 75-84: Shortlist (Pass)
- 60-74: Medium / HM Review (Need More Info)
- 40-59: Low / Need More Information (Need More Info)
- <40: Reject / Not Suitable (Reject)

Return ONLY valid JSON array (no markdown, no code blocks):
[
  {
    "cvId": "CV-XXX",
    "candidateName": "Full Name",
    "fitScore": <0-100 number>,
    "recommendation": "<Pass|Reject|Need More Info>",
    "confidence": "<High|Medium|Low>",
    "categoryScores": {
      "mustHaveSkills": <0-50>,
      "relevantExperience": <0-20>,
      "languageLevel": <0-15>,
      "niceToHaveSkills": <0-15>
    },
    "fitSummary": "<1-2 sentence final decision reason>",
    "matchedEvidence": [<strong matching points>],
    "gapSummary": "<key gaps if any, or 'Strong candidate - no major gaps'>",
    "flags": [<any concerns like seniority mismatch, language gap, etc>],
    "interviewQuestions": [<3-5 key technical/behavioral questions if Pass>],
    "followUpQuestions": [<3-5 clarification questions if Need More Info>],
    "rejectReason": "<clear reason why rejected if Reject>"
  },
  ...
]`;

  console.log('📋 batchScreenCandidatesStream prompt:', prompt.substring(0, 200) + '...');

  const stream = streamText({
    model,
    prompt,
    temperature: 0,
  });

  let fullText = '';

  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text;
      yield { type: 'text', content: chunk.text };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'thinking-start', content: '' };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'thinking-end', content: '' };
    }
  }

  // Parse the collected text
  try {
    const cleanedText = fullText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);
    yield {
      type: 'complete',
      content: 'parsed',
      data: {
        results: Array.isArray(parsed) ? parsed : [parsed],
        fullPrompt: prompt,
      },
    };
  } catch (error) {
    console.error('Failed to parse batch screening response:', error, fullText);
    yield {
      type: 'error',
      content: 'parse-error',
      message: 'Unable to parse screening result',
    };
  }
}
