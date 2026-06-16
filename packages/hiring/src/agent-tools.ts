import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import {
  DraftJdInputSchema,
  draftJd,
  FetchContextInputSchema,
  fetchContext,
  GenerateReportInputSchema,
  generateReport,
  ReviseJdInputSchema,
  reviseJd,
  ScoreJdInputSchema,
  ScreenCvInputSchema,
  StartSlaTrackerInputSchema,
  scoreJd,
  screenCv,
  startSlaTracker,
} from './backend/orchestration.ts';

export const fetchContextTool = defineAgentTool({
  id: 'hiring_fetchContext',
  name: 'Fetch Hiring Context',
  description: 'Get hiring request details including position, team gaps, deliverables, and salary',
  input: FetchContextInputSchema,
  output: z.object({
    position: z.string(),
    teamSkillGap: z.string(),
    keyDeliverables: z.string(),
    salaryRange: z.string(),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return fetchContext(input);
  },
});

export const draftJdTool = defineAgentTool({
  id: 'hiring_draftJd',
  name: 'Draft Job Description',
  description: 'Create a comprehensive, professional job description based on hiring context',
  input: DraftJdInputSchema,
  output: z.object({
    draftText: z.string(),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return draftJd(input);
  },
});

export const scoreJdTool = defineAgentTool({
  id: 'hiring_scoreJd',
  name: 'Score JD Clarity',
  description:
    'Evaluate JD completeness and clarity using 9-section rubric: Title, Responsibilities, Must-Have Skills, Nice-to-Have, YOE, Salary, English, Work Mode, Benefits',
  input: ScoreJdInputSchema,
  output: z.object({
    clarityScore: z.number().min(0).max(100),
    flaggedGaps: z.array(z.string()),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return scoreJd(input);
  },
});

export const reviseJdTool = defineAgentTool({
  id: 'hiring_reviseJd',
  name: 'Revise Job Description',
  description: 'Improve JD to address flagged gaps and increase clarity score',
  input: ReviseJdInputSchema,
  output: z.object({
    revisedText: z.string(),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return reviseJd(input);
  },
});

export const screenCvTool = defineAgentTool({
  id: 'hiring_screenCv',
  name: 'Screen Candidate CV',
  description:
    'Evaluate candidate fit against JD requirements. Returns fit score (0-100), recommendation, and suggested interview questions',
  input: ScreenCvInputSchema,
  output: z.object({
    fitScore: z.number().min(0).max(100),
    recommendation: z.enum(['Pass', 'Reject', 'Need More Info']),
    fitSummary: z.string(),
    gapSummary: z.string(),
    suggestedQuestions: z.string(),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    const result = await screenCv(input);
    return {
      ...result,
      recommendation: result.recommendation as 'Pass' | 'Reject' | 'Need More Info',
    };
  },
});

export const generateReportTool = defineAgentTool({
  id: 'hiring_generateReport',
  name: 'Generate Candidate Report',
  description: 'Rank screened candidates by fit score and generate summary report',
  input: GenerateReportInputSchema,
  output: z.object({
    rankedCandidates: z.array(
      z.object({
        cvId: z.string(),
        candidateName: z.string(),
        fitScore: z.number(),
        recommendation: z.string(),
        rank: z.number(),
      }),
    ),
    topCandidates: z.array(
      z.object({
        cvId: z.string(),
        candidateName: z.string(),
        fitScore: z.number(),
        recommendation: z.string(),
        rank: z.number(),
      }),
    ),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return generateReport(input);
  },
});

export const startSlaTrackerTool = defineAgentTool({
  id: 'hiring_startSlaTracker',
  name: 'Start SLA Tracking',
  description: 'Create feedback deadline tracking for confirmed candidates (default 48h deadline)',
  input: StartSlaTrackerInputSchema,
  output: z.object({
    trackingIds: z.array(z.string()),
    deadline: z.string(),
  }),
  rbac: undefined,
  execute: async (input, _ctx) => {
    return startSlaTracker(input);
  },
});

/**
 * All hiring tools for registration with Agent
 */
export const HIRING_AGENT_TOOLS = [
  fetchContextTool,
  draftJdTool,
  scoreJdTool,
  reviseJdTool,
  screenCvTool,
  generateReportTool,
  startSlaTrackerTool,
];
