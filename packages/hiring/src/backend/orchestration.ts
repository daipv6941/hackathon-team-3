import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

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
  teamSkillGap: z.string(),
  keyDeliverables: z.string(),
  salaryRange: z.string(),
  seniorityLevel: z.string(),
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

export async function fetchContext(input: z.infer<typeof FetchContextInputSchema>) {
  console.log('fetchContext:', input);

  const request = MOCK_REQUESTS[input.requestId];

  if (!request) {
    return {
      position: 'Engineering Role',
      teamSkillGap: 'Technical skills TBD',
      keyDeliverables: 'TBD',
      salaryRange: 'Competitive',
    };
  }

  return {
    position: request.position,
    teamSkillGap: request.teamSkillGap,
    keyDeliverables: request.keyDeliverables,
    salaryRange: request.salaryRange,
  };
}

/**
 * Draft JD using Claude/OpenAI
 */
export async function draftJd(input: z.infer<typeof DraftJdInputSchema>) {
  console.log('draftJd:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Technical Recruiter. Create a professional, comprehensive job description.

POSITION: ${input.position}
SENIORITY LEVEL: ${input.seniorityLevel}
TEAM SKILL GAPS: ${input.teamSkillGap}
KEY DELIVERABLES: ${input.keyDeliverables}
SALARY RANGE: ${input.salaryRange}

Create a complete JD with these sections:

# ${input.position}

## About the Role
[2-3 sentences about role importance and impact]

## Responsibilities
[5-7 concrete, action-oriented bullets with specific examples]

## Must-Have Skills
[Specific technical skills with proficiency levels or years required]

## Nice-to-Have Skills
[4-5 optional but valuable skills]

## Requirements
- **Years of Experience**: [specific number] years
- **English Level**: [B2/C1/C2 with description]
- **Work Mode**: [Remote/Hybrid/On-site with details]

## Compensation & Benefits
- **Salary Range**: ${input.salaryRange}/month
- [3-4 specific benefits like insurance, learning budget, etc.]

Make it professional, specific, and attractive to senior candidates.`;

  const result = await generateText({
    model,
    prompt,
    temperature: 0.7,
  });

  return {
    draftText: result.text,
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

  const result = await generateText({
    model,
    prompt,
    temperature: 0.5,
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

  const result = await generateText({
    model,
    prompt,
    temperature: 0.6,
  });

  return {
    revisedText: result.text,
  };
}

/**
 * Screen CV using CV Fit Scoring Guide v2
 * Implements 100-point scoring methodology with detailed breakdowns
 */
export async function screenCv(input: z.infer<typeof ScreenCvInputSchema>) {
  console.log('screenCv:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are a CV Fit Scoring Agent. Score this candidate using the official CV Fit Scoring Guide v2.

APPROVED JD:
- Position: ${input.jdId}
- Must-Have Skills (50 points): ${input.jdMustHave}
- Nice-to-Have Skills (15 points): ${input.jdNiceToHave}
- Min YOE: ${input.jdMinYoe} years

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

  const result = await generateText({
    model,
    prompt,
    temperature: 0.5,
  });

  try {
    const cleanedText = result.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    const fitScore = Math.min(100, Math.max(0, parsed.final_cv_fit_score || 0));
    const getRecommendation = (score: number): 'Pass' | 'Reject' | 'Need More Info' => {
      if (score >= 75) return 'Pass';
      if (score < 40) return 'Reject';
      return 'Need More Info';
    };

    const recommendation = getRecommendation(fitScore);

    return {
      fitScore,
      recommendation,
      confidence: parsed.confidence || 'Medium',
      categoryScores: {
        mustHaveSkills: parsed.category_scores?.must_have_skills_match || 0,
        relevantExperience: parsed.category_scores?.relevant_experience_seniority_match || 0,
        languageLevel: parsed.category_scores?.required_language_level_match || 0,
        niceToHaveSkills: parsed.category_scores?.nice_to_have_skills_match || 0,
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
    };
  }
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
  missing_fields: string[];
}

export async function extractRequestDetails(
  input: z.infer<typeof ExtractRequestInputSchema>,
): Promise<ExtractedRequestDetails> {
  console.log('extractRequestDetails: Processing user description');

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert HR recruiter. Extract hiring request information from the following description.

USER DESCRIPTION:
${input.description}

Extract the following information if present. Return a JSON object with these fields (use null for missing fields):
{
  "position_title": "The job position/title",
  "team_name": "The team or department",
  "urgency_level": "One of: Immediate, High, Medium, Low (default: Medium)",
  "headcount_requested": "Number of positions (default: 1)",
  "business_justification": "Why this hire is needed",
  "team_skill_gap_summary": "What skills the team is missing",
  "key_deliverables": "Key responsibilities and deliverables",
  "salary_range": "Expected salary range",
  "seniority_level": "One of: Junior, Mid, Senior"
}

Return ONLY the JSON object, no other text.`;

  const result = await generateText({
    model,
    prompt,
    temperature: 0.3,
  });

  let extracted: Partial<ExtractedRequestDetails> = {};
  try {
    const parsed = JSON.parse(result.text);
    extracted = {
      position_title: parsed.position_title || undefined,
      team_name: parsed.team_name || undefined,
      urgency_level: parsed.urgency_level || undefined,
      headcount_requested: parsed.headcount_requested || undefined,
      business_justification: parsed.business_justification || undefined,
      team_skill_gap_summary: parsed.team_skill_gap_summary || undefined,
      key_deliverables: parsed.key_deliverables || undefined,
      salary_range: parsed.salary_range || undefined,
      seniority_level: parsed.seniority_level || undefined,
    };
  } catch (e) {
    console.error('Failed to parse LLM response:', e);
  }

  // Identify missing required fields
  const required = ['position_title', 'team_name', 'key_deliverables'];
  const missing_fields = required.filter(
    (field) => !extracted[field as keyof ExtractedRequestDetails],
  );

  return {
    ...extracted,
    missing_fields,
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

  const result = await generateText({
    model,
    prompt,
    temperature: 0.7,
  });

  return {
    revisedText: result.text,
  };
}
