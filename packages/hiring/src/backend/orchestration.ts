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
    maxTokens: 2000,
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

  const prompt = `You are an expert Recruiter evaluating job descriptions.

SCORING RUBRIC (100 points total):
- Title/Position (5%): Clear, specific job title at top
- Responsibilities (20%): 5+ concrete, measurable responsibilities
- Must-Have Skills (25%): Specific technical skills with proficiency
- Nice-to-Have Skills (10%): Optional but differentiating skills
- YOE Requirement (10%): Clear years of experience stated
- Salary Range (10%): Transparent, specific salary band
- English Level (5%): Specified English proficiency level
- Work Mode (5%): Remote/Hybrid/On-site clearly stated
- Benefits (10%): Compensation details and perks

Analyze this JD and score it.

Return ONLY valid JSON (no markdown, no extra text):
{"clarityScore": <0-100 number>, "flaggedGaps": ["gap1", "gap2"]}

JD TEXT:
${input.jdText}`;

  const result = await generateText({
    model,
    prompt,
    temperature: 0.5,
    maxTokens: 800,
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
      flaggedGaps: Array.isArray(parsed.flaggedGaps) ? parsed.flaggedGaps : [],
    };
  } catch (error) {
    console.error('Failed to parse score response:', error, result.text);
    return {
      clarityScore: 70,
      flaggedGaps: ['Please review JD content'],
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
    maxTokens: 2000,
  });

  return {
    revisedText: result.text,
  };
}

/**
 * Screen CV using Claude/OpenAI
 */
export async function screenCv(input: z.infer<typeof ScreenCvInputSchema>) {
  console.log('screenCv:', input);

  const model = openai('gpt-4-turbo');

  const prompt = `You are an expert Recruiter screening candidates.

JOB REQUIREMENTS:
- Position: ${input.jdId}
- Must-Have Skills: ${input.jdMustHave}
- Nice-to-Have: ${input.jdNiceToHave}
- Min YOE: ${input.jdMinYoe} years
- Salary Budget: Flexible based on fit

CANDIDATE:
- Name: ${input.candidateName}
- Skills: ${input.cvSkills}
- Years of Experience: ${input.yearsOfExperience}
- English Level: ${input.englishLevel}
- Salary Expectation: ${input.salaryExpectation}

Evaluate fit. Return ONLY valid JSON (no markdown):
{
  "fitScore": <0-100>,
  "recommendation": "<Pass|Reject|Need More Info>",
  "fitSummary": "<1-2 sentences on fit>",
  "gapSummary": "<specific missing skills>",
  "suggestedQuestions": "<2-3 questions to ask>"
}`;

  const result = await generateText({
    model,
    prompt,
    temperature: 0.5,
    maxTokens: 800,
  });

  try {
    const cleanedText = result.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);
    return {
      fitScore: Math.min(100, Math.max(0, parsed.fitScore || 0)),
      recommendation: ['Pass', 'Reject', 'Need More Info'].includes(parsed.recommendation)
        ? parsed.recommendation
        : 'Need More Info',
      fitSummary: parsed.fitSummary || 'Review CV for fit',
      gapSummary: parsed.gapSummary || 'Unable to assess',
      suggestedQuestions: parsed.suggestedQuestions || 'Ask about relevant experience',
    };
  } catch (error) {
    console.error('Failed to parse CV screen response:', error, result.text);
    return {
      fitScore: 50,
      recommendation: 'Need More Info',
      fitSummary: 'Review CV for fit',
      gapSummary: 'Unable to fully assess',
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
export async function startSlaTracker(input: z.infer<typeof StartSlaTrackerInputSchema>) {
  console.log('startSlaTracker:', input);

  const deadline = new Date();
  deadline.setHours(deadline.getHours() + input.deadlineHours);

  return {
    trackingIds: input.confirmedCvIds.map((cvId) => `tracking-${cvId}`),
    deadline: deadline.toISOString(),
  };
}
