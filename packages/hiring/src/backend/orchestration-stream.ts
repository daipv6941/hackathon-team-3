/**
 * Hiring Orchestration Stream
 *
 * Simplified version focusing on conversation management
 * Real Claude calls happen through tool invocations
 */

export interface HiringRunInput {
  userText: string;
  requestId: string;
}

export interface HiringRunCtx {
  tenantId: string;
  userId: string;
}

/**
 * Build system prompt for hiring assistant
 */
export function buildHiringSystemPrompt(requestId: string): string {
  return `You are an expert Hiring Assistant helping teams create job descriptions, score them, and screen candidates.

Your workflow:
1. **Draft JD** - Create comprehensive job descriptions with all required sections
2. **Score JD** - Evaluate clarity using professional recruiting standards
3. **Screen CVs** - Evaluate candidate fit and provide recommendations
4. **Generate Reports** - Rank candidates and provide summaries

For each request:
- Ask clarifying questions if information is missing
- Provide detailed, professional analysis
- Show your reasoning for important decisions
- Format output clearly for easy review

Context:
- Hiring Request: ${requestId}
- Always prioritize clarity and completeness
- Be thorough in evaluation`;
}

/**
 * Parse user intent to determine workflow
 */
export function parseUserIntent(userText: string): 'draft' | 'score' | 'screen' | 'unknown' {
  const text = userText.toLowerCase();

  if (text.includes('draft') || text.includes('create') || text.includes('jd')) {
    return 'draft';
  }
  if (text.includes('score') || text.includes('clarity') || text.includes('evaluate')) {
    return 'score';
  }
  if (text.includes('screen') || text.includes('cv') || text.includes('candidate')) {
    return 'screen';
  }

  return 'unknown';
}

/**
 * Format response for draft JD workflow
 */
export function formatDraftJdResponse(draft: string, score?: number): string {
  let response = `## 📋 Job Description Draft\n\n${draft}`;

  if (score) {
    const status = score >= 70 ? '✅' : '⚠️';
    response += `\n\n## Score: ${status} ${score}/100`;
  }

  response += '\n\nWould you like me to score this JD or make any revisions?';
  return response;
}

/**
 * Format response for score JD workflow
 */
export function formatScoreJdResponse(score: number, gaps: string[]): string {
  const status = score >= 70 ? '✅' : '⚠️';

  return `## ⭐ JD Clarity Score: ${status} ${score}/100

**Areas for Improvement:**
${gaps.map((g) => `- ${g}`).join('\n')}

${
  score >= 70
    ? '✅ JD is ready for posting!'
    : '⚠️ Consider addressing these gaps to improve clarity.'
}`;
}

/**
 * Format response for CV screening
 */
export function formatScreenCvResponse(
  candidateName: string,
  fitScore: number,
  recommendation: string,
  fitSummary: string,
  gaps: string,
): string {
  const statusIcon = recommendation === 'Pass' ? '✅' : recommendation === 'Reject' ? '❌' : '⚠️';

  return `## 👤 Candidate Screening: ${statusIcon}

**Candidate:** ${candidateName}
**Fit Score:** ${fitScore}/100
**Recommendation:** ${recommendation}

**Summary:** ${fitSummary}

**Gaps:** ${gaps}

Would you like to screen more candidates?`;
}
