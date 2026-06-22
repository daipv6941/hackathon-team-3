'use client';

import { Button } from '@seta/shared-ui';
import { AlertCircle, CheckCircle2, MessageCircle, Search, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HiringRequestSelector } from './hiring-request-selector';
import { HiringSelection } from './hiring-selection';
import { JDScoringBreakdown } from './jd-scoring-breakdown';
import { useHiringChat } from './use-hiring-chat';

interface ScoringBreakdownMetadata {
  clarityScore?: number;
  status?: string;
  categoryScores?: Record<string, number>;
  flaggedGaps?: string[];
  requiredRevisions?: string[];
  confidence?: string;
  iterations?: number;
}

interface ScoredCandidate {
  cvId: string;
  candidateName: string;
  fitScore: number;
  recommendation: 'Pass' | 'Reject' | 'Need More Info';
  confidence: 'High' | 'Medium' | 'Low';
  fitSummary: string;
  gapSummary: string;
  categoryScores: {
    mustHaveSkills: number;
    relevantExperience: number;
    languageLevel: number;
    niceToHaveSkills: number;
  };
  matchedEvidence: string[];
  flags: string[];
  interviewQuestions: string[];
  followUpQuestions: string[];
  rejectReason: string;
  fullPrompt: string;
}

interface BatchScreeningResult {
  type: 'result';
  content: string;
  metadata: {
    reportId: string;
    requestId: string;
    jdId: string;
    position: string;
    totalCandidates: number;
    statistics: {
      passCandidates: number;
      passPercentage: number;
      needMoreInfoCandidates: number;
      needMoreInfoPercentage: number;
      rejectCandidates: number;
      rejectPercentage: number;
    };
    scoredCandidates: ScoredCandidate[];
  };
}

export function HiringTranscript() {
  const { state } = useHiringChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [state.messages]);

  // Only show workflow selector if no flow is selected yet
  if (state.currentPhase === 'selection' && !state.selectedFlow) {
    return <HiringSelection />;
  }

  if (state.messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="rounded-lg bg-surface-2 p-6">
          <MessageCircle className="mx-auto h-12 w-12 text-ink-subtle" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Hiring Studio</h2>
          <p className="text-sm text-ink-subtle">
            {state.selectedFlow === 'jd-draft'
              ? 'Ready to create and refine your job description'
              : 'Ready to screen and shortlist candidates'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {state.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Show request selector if flow selected but no request chosen */}
      {state.selectedFlow && !state.selectedRequestId && state.messages.length > 0 && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <HiringRequestSelector />
        </div>
      )}

      {state.isLoading && (
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink-subtle">Analyzing...</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: ReturnType<typeof useHiringChat>['state']['messages'][number];
}) {
  const { state, actions } = useHiringChat();
  const isUser = message.role === 'user';
  const [showActions, setShowActions] = useState(true);
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const showFeedbackInput =
    (message.metadata as Record<string, unknown> | undefined)?.showFeedbackInput === true;

  const handleApprove = async () => {
    try {
      actions.addMessage({
        role: 'user',
        content: '✅ Approved - ready for posting',
        type: 'text',
      });

      // Extract JD content (from action message)
      const jdContent = message.content || '';

      // Find the result message (scoring breakdown) to get clarity score
      const resultMessage = state.messages.find((msg) => msg.type === 'result');
      const resultMetadata = (resultMessage?.metadata as Record<string, unknown> | undefined) || {};

      console.log('🔍 Message structure:', {
        currentMessageType: message.type,
        currentMessageHasMetadata: !!message.metadata,
        foundResultMessage: !!resultMessage,
        resultMetadata: JSON.stringify(resultMetadata),
      });

      // Get clarity score from result message metadata
      let clarityScore: number | undefined;

      if (typeof resultMetadata.clarityScore === 'number') {
        clarityScore = resultMetadata.clarityScore;
      } else if (resultMetadata.clarityScore) {
        clarityScore = parseInt(String(resultMetadata.clarityScore), 10);
      }

      // Fallback: try to extract from content if result message not found
      if (!clarityScore) {
        const clarityMatch = jdContent.match(/Clarity Score:.*?(\d+)\/100/);
        clarityScore = clarityMatch?.[1] ? parseInt(clarityMatch[1], 10) : 0;
      }

      console.log('📤 Approving JD for request:', {
        requestId: state.selectedRequestId,
        clarityScore,
        contentLength: jdContent.length,
        hasResultMessage: !!resultMessage,
        resultMetadataKeys: Object.keys(resultMetadata),
      });

      // Call API to save JD and update request status with full scoring metadata
      const response = await fetch('/api/hiring/v1/jd/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
          jdText: jdContent,
          clarityScore,
          categoryScores: resultMetadata.categoryScores,
          flaggedGaps: resultMetadata.flaggedGaps,
          requiredRevisions: resultMetadata.requiredRevisions,
          confidence: resultMetadata.confidence,
          iterations: resultMetadata.iterations,
          status: resultMetadata.status,
        }),
      });

      console.log('📥 API Response status:', response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ API Error:', error);
        throw new Error('Failed to approve JD');
      }

      const data = await response.json();
      console.log('✅ JD approved successfully:', data);

      // Save jdId to state and localStorage for screening
      actions.setSelectedJob(data.jdId);
      localStorage.setItem('selectedJobId', data.jdId);

      // Add confirmation message
      const approvalMsg = {
        role: 'assistant' as const,
        content: `✅ **JD Approved & Saved!**

Your JD has been approved and saved to the system. The hiring request is now in **JD Approved** status.

**Next steps:**
1. Review the approved JD
2. Start screening CVs from your candidate pool
3. Move to shortlist finalization

Ready to screen candidates?`,
        type: 'action' as const,
      };
      actions.addMessage(approvalMsg);

      // Save approval message to database
      const threadId = state.currentThreadId || localStorage.getItem('currentThreadId');
      if (threadId) {
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId, ...approvalMsg }),
        }).catch((e) => console.error('Failed to save approval message:', e));
      }

      // Stay in jd-approval phase (screening button will appear in this phase)
      actions.setPhase('jd-approval');

      // Update thread phase
      if (threadId) {
        await fetch(`/api/hiring/v1/threads/${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            current_phase: 'jd-approval',
          }),
        }).catch((e) => console.error('Failed to update thread:', e));
      }

      setShowActions(false);
    } catch (error) {
      console.error('Approve error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to approve JD. Please try again.',
        type: 'text',
      });
    }
  };

  const handleScreenAndShortlist = async () => {
    try {
      actions.setLoading(true);
      actions.setPhase('cv-screening');
      console.log('📊 Starting batch screening for request:', state.selectedRequestId);

      if (!state.selectedJobId) {
        throw new Error('No JD selected. Please approve a JD first.');
      }

      const response = await fetch('/api/hiring/v1/shortlist/screen-and-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
          jdId: state.selectedJobId, // Use approved JD ID
          threadId: state.currentThreadId, // Include thread ID for message tracking
        }),
      });

      if (!response.ok) throw new Error('Failed to screen candidates');

      // Stream response from batch screening
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let reportData: BatchScreeningResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as BatchScreeningResult;
              // Only collect result messages from batch screening
              if (data.type === 'result' && data.metadata) {
                reportData = data;
              }
            } catch (e) {
              console.error('Failed to parse screening stream:', e);
            }
          }
        }
      }

      if (!reportData?.metadata) {
        throw new Error('No screening results returned');
      }

      const result = reportData.metadata;
      console.log('✅ Screening complete:', result);

      const stats = result.statistics || {};
      const candidates = result.scoredCandidates || [];

      // Categorize candidates
      const passCandidates = candidates.filter((c: ScoredCandidate) => c.recommendation === 'Pass');
      const needMoreInfoCandidates = candidates.filter(
        (c: ScoredCandidate) => c.recommendation === 'Need More Info',
      );
      const rejectCandidates = candidates.filter(
        (c: ScoredCandidate) => c.recommendation === 'Reject',
      );

      const reportHtml = `
## 📊 Shortlist Report

**Position:** ${result.position || 'TBD'}
**Total Candidates Screened:** ${result.totalCandidates}

### 📈 Summary by Recommendation

- **✅ PASS (${stats.passPercentage || 0}%)**: ${stats.passCandidates || 0} candidates ready for interview
- **⚠️ NEED MORE INFO (${stats.needMoreInfoPercentage || 0}%)**: ${stats.needMoreInfoCandidates || 0} candidates need clarification
- **❌ REJECT (${stats.rejectPercentage || 0}%)**: ${stats.rejectCandidates || 0} candidates not suitable

${
  passCandidates.length > 0
    ? `### ✅ PASS Candidates (Ready for Interview)

${passCandidates
  .map(
    (c: ScoredCandidate) => `
**${c.candidateName}** - Score: **${c.fitScore}/100** (Confidence: ${c.confidence})

**Category Scores:**
- Must-Have Skills: ${c.categoryScores.mustHaveSkills}/50
- Relevant Experience: ${c.categoryScores.relevantExperience}/20
- Language Level: ${c.categoryScores.languageLevel}/15
- Nice-to-Have Skills: ${c.categoryScores.niceToHaveSkills}/15

**Fit Summary:** ${c.fitSummary}

${c.matchedEvidence.length > 0 ? `**Matched Evidence:** ${c.matchedEvidence.join(', ')}\n` : ''}

${c.flags.length > 0 ? `**Flags:** ${c.flags.join(', ')}\n` : ''}

**Interview Questions:**
${(c.interviewQuestions || []).map((q: string) => `- ${q}`).join('\n')}
`,
  )
  .join('\n')}
`
    : ''
}

${
  needMoreInfoCandidates.length > 0
    ? `### ⚠️ NEED MORE INFO Candidates (Requires Follow-up)

${needMoreInfoCandidates
  .map(
    (c: ScoredCandidate) => `
**${c.candidateName}** - Score: **${c.fitScore}/100** (Confidence: ${c.confidence})

**Category Scores:**
- Must-Have Skills: ${c.categoryScores.mustHaveSkills}/50
- Relevant Experience: ${c.categoryScores.relevantExperience}/20
- Language Level: ${c.categoryScores.languageLevel}/15
- Nice-to-Have Skills: ${c.categoryScores.niceToHaveSkills}/15

**Fit Summary:** ${c.fitSummary}

**Gaps:** ${c.gapSummary}

${c.flags.length > 0 ? `**Flags:** ${c.flags.join(', ')}\n` : ''}

**Follow-up Questions:**
${(c.followUpQuestions || []).map((q: string) => `- ${q}`).join('\n')}
`,
  )
  .join('\n')}
`
    : ''
}

${
  rejectCandidates.length > 0
    ? `### ❌ REJECT Candidates

${rejectCandidates
  .map(
    (c: ScoredCandidate) => `
**${c.candidateName}** - Score: **${c.fitScore}/100**

**Category Scores:**
- Must-Have Skills: ${c.categoryScores.mustHaveSkills}/50
- Relevant Experience: ${c.categoryScores.relevantExperience}/20
- Language Level: ${c.categoryScores.languageLevel}/15
- Nice-to-Have Skills: ${c.categoryScores.niceToHaveSkills}/15

**Reason:** ${c.rejectReason}
`,
  )
  .join('\n')}
`
    : ''
}`;

      const reportMsg = {
        role: 'assistant' as const,
        content: reportHtml,
        type: 'action' as const,
        metadata: result,
      };
      actions.addMessage(reportMsg);

      // Save report message to database
      const threadId = state.currentThreadId || localStorage.getItem('currentThreadId');
      if (threadId) {
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId, ...reportMsg }),
        }).catch((e) => console.error('Failed to save report message:', e));
      }

      actions.setPhase('confirmation');

      // Update thread phase
      if (threadId) {
        await fetch(`/api/hiring/v1/threads/${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            current_phase: 'confirmation',
          }),
        }).catch((e) => console.error('Failed to update thread:', e));
      }

      setShowActions(false);
    } catch (error) {
      console.error('Screen and shortlist error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to screen candidates. Please try again.',
        type: 'text',
      });
    } finally {
      actions.setLoading(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackInput.trim()) return;

    try {
      setIsSubmittingFeedback(true);
      const jdContent =
        (message.metadata as Record<string, unknown> | undefined)?.jdContent || message.content;

      actions.addMessage({
        role: 'user',
        content: `Feedback: ${feedbackInput}`,
        type: 'text',
      });

      console.log('📤 Submitting feedback for JD revision...');

      const response = await fetch('/api/hiring/v1/jd/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentJdText: String(jdContent),
          userFeedback: feedbackInput,
          position: state.selectedRequestId || 'Unknown',
          teamSkillGap: 'Based on feedback',
          keyDeliverables: 'Based on feedback',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to revise JD');
      }

      const result = await response.json();
      console.log('✅ JD revised successfully');

      actions.addMessage({
        role: 'assistant',
        content: result.revisedJdText,
        type: 'action',
      });

      setFeedbackInput('');
    } catch (error) {
      console.error('❌ Feedback submission error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to revise JD. Please try again.',
        type: 'text',
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleConfirmHiringRequest = async () => {
    try {
      actions.setLoading(true);
      actions.addMessage({
        role: 'user',
        content: '✅ Confirmed - save this hiring request',
        type: 'text',
      });

      // The actual saving happens through the composer's button action
      // This just triggers the confirmation
      const event = new CustomEvent('confirm-hiring-request');
      window.dispatchEvent(event);
    } finally {
      actions.setLoading(false);
    }
  };

  const handleChangeHiringRequest = () => {
    actions.addMessage({
      role: 'user',
      content: '❌ I want to change some details',
      type: 'text',
    });

    const event = new CustomEvent('change-hiring-request');
    window.dispatchEvent(event);
  };

  const handleStartJobDescription = async () => {
    try {
      actions.setLoading(true);
      actions.setPhase('jd-generation');
      console.log('📝 Starting JD creation for request:', state.selectedRequestId);

      if (!state.selectedRequestId) {
        throw new Error('No hiring request selected');
      }

      const response = await fetch('/api/hiring/v1/jd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
          threadId: state.currentThreadId,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to generate JD: ${error}`);
      }

      // Stream the JD generation response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let jdContent = '';
      let scoringMetadata: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              // Handle thinking tokens - just stream to output
              if (
                data.type === 'text' ||
                data.type === 'thinking-start' ||
                data.type === 'thinking-end'
              ) {
                // These are streaming tokens, can be logged or ignored
                if (
                  data.type === 'text' &&
                  data.type !== 'thinking-start' &&
                  data.type !== 'thinking-end'
                ) {
                  // Only capture final JD text content, not thinking text
                  if (data.content && !data.content.includes('##')) {
                    jdContent = data.content;
                  }
                }
              }
              // Handle action message (JD content)
              else if (data.type === 'action') {
                jdContent = data.content;
              }
              // Handle result message (scoring breakdown)
              else if (data.type === 'result') {
                scoringMetadata = data.metadata || {};
              }
            } catch (e) {
              console.error('Failed to parse stream:', e);
            }
          }
        }
      }

      if (!jdContent) {
        throw new Error('No JD content generated');
      }

      console.log('✅ JD generated successfully with score:', scoringMetadata.clarityScore);

      const threadId = state.currentThreadId || localStorage.getItem('currentThreadId');

      // Add JD to messages with approval flag
      const jdMsg = {
        role: 'assistant' as const,
        content: jdContent,
        type: 'action' as const,
        metadata: { requiresApproval: true },
      };
      actions.addMessage(jdMsg);

      // Save JD message to database
      if (threadId) {
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId, ...jdMsg }),
        }).catch((e) => console.error('Failed to save JD message:', e));
      }

      // Add scoring breakdown if available
      if (scoringMetadata.clarityScore !== undefined) {
        const scoringContent = `## 📊 Quality Assessment

**Clarity Score: ${scoringMetadata.clarityScore}/100** — ${scoringMetadata.status || 'Good'}

Generated in ${scoringMetadata.iterations || 0} iteration${(scoringMetadata.iterations || 0) !== 1 ? 's' : ''} (${scoringMetadata.confidence || 'Medium'} confidence)`;

        const scoringMsg = {
          role: 'assistant' as const,
          content: scoringContent,
          type: 'result' as const,
          metadata: scoringMetadata,
        };

        actions.addMessage(scoringMsg);

        // Save scoring message to database
        if (threadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId, ...scoringMsg }),
          }).catch((e) => console.error('Failed to save scoring message:', e));
        }
      }

      // Move to jd-approval phase
      actions.setPhase('jd-approval');

      // Update thread phase
      if (threadId) {
        await fetch(`/api/hiring/v1/threads/${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            current_phase: 'jd-approval',
          }),
        }).catch((e) => console.error('Failed to update thread:', e));
      }

      setShowActions(false);
    } catch (error) {
      console.error('❌ JD generation error:', error);
      actions.addMessage({
        role: 'assistant',
        content: `❌ Failed to generate job description: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'text',
      });
      // Reset phase on error
      actions.setPhase('request-selected');
    } finally {
      actions.setLoading(false);
    }
  };

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
          {message.type === 'result' ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : message.type === 'action' ? (
            <AlertCircle className="h-4 w-4 text-primary" />
          ) : (
            <MessageCircle className="h-4 w-4 text-primary" />
          )}
        </div>
      )}

      <div className={isUser ? 'max-w-md' : 'flex-1 max-w-2xl'}>
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            isUser
              ? 'bg-primary text-white rounded-br-none'
              : 'bg-surface-2 text-ink rounded-bl-none'
          }`}
        >
          <div className="whitespace-pre-wrap">
            {(message.metadata as Record<string, unknown> | undefined)?.requestPath ? (
              <>
                {message.content}
                <a
                  href={(message.metadata as Record<string, unknown>).requestPath as string}
                  className="ml-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Click here →
                </a>
              </>
            ) : (
              (message.content as unknown as string)
            )}
          </div>
        </div>

        {/* Show scoring breakdown for 'result' type messages with clarityScore */}
        {!isUser &&
        message.type === 'result' &&
        (message.metadata as ScoringBreakdownMetadata | undefined)?.clarityScore ? (
          <JDScoringBreakdown
            clarityScore={(message.metadata as ScoringBreakdownMetadata).clarityScore || 0}
            status={(message.metadata as ScoringBreakdownMetadata).status || 'Needs Revision'}
            categoryScores={(message.metadata as ScoringBreakdownMetadata).categoryScores || {}}
            flaggedGaps={(message.metadata as ScoringBreakdownMetadata).flaggedGaps || []}
            requiredRevisions={
              (message.metadata as ScoringBreakdownMetadata).requiredRevisions || []
            }
            confidence={(message.metadata as ScoringBreakdownMetadata).confidence || 'Medium'}
            iterations={(message.metadata as ScoringBreakdownMetadata).iterations || 0}
          />
        ) : null}

        {/* Show action buttons for JD approval or other actions */}
        {!isUser && showActions && message.type === 'action' && (
          <>
            {/* JD Approval buttons - show for JD drafts with requiresApproval flag */}
            {(state.currentPhase === 'initial' || state.currentPhase === 'jd-approval') &&
              (message.metadata as Record<string, unknown> | undefined)?.requiresApproval && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={handleApprove} className="gap-1">
                    <ThumbsUp className="h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      actions.addMessage({
                        role: 'assistant',
                        content: 'Please share your feedback to improve this JD:',
                        type: 'action',
                        metadata: { showFeedbackInput: true, jdContent: message.content },
                      });
                      setShowActions(false);
                    }}
                    className="gap-1"
                  >
                    💬 Feedback
                  </Button>
                </div>
              )}

            {/* Hiring request summary confirmation */}
            {state.selectedRequestId === 'creating' &&
              message.content.includes('HIRING_REQUEST_SUMMARY') && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleConfirmHiringRequest}
                    disabled={state.isLoading}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleChangeHiringRequest}
                    disabled={state.isLoading}
                    className="gap-1"
                  >
                    Change Details
                  </Button>
                </div>
              )}

            {/* Shortlist action - show after JD approved */}
            {state.currentPhase === 'jd-approval' &&
              message.content.includes('JD Approved & Saved') && (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={handleScreenAndShortlist}
                    disabled={state.isLoading}
                    className="gap-1"
                  >
                    <Search className="h-3 w-3" />
                    {state.isLoading ? 'Screening...' : 'Screen & Shortlist Candidates'}
                  </Button>
                </div>
              )}

            {/* Shortlist confirmation buttons */}
            {state.currentPhase === 'confirmation' &&
              message.content.includes('Shortlist Report') && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      try {
                        console.log(
                          '🔵 Confirm button clicked for request:',
                          state.selectedRequestId,
                        );

                        actions.addMessage({
                          role: 'user',
                          content: '✅ Approved - finalizing shortlist',
                          type: 'text',
                        });

                        console.log('📤 Calling /v1/shortlist/confirm...');
                        const response = await fetch('/api/hiring/v1/shortlist/confirm', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            requestId: state.selectedRequestId,
                            selectedCandidateIds: [],
                          }),
                        });

                        console.log('📥 Response status:', response.status, response.statusText);

                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('❌ API error response:', errorText);
                          throw new Error(`Failed to confirm shortlist: ${response.statusText}`);
                        }

                        const data = await response.json();
                        console.log('✅ Confirm response:', data);

                        const requestId = state.selectedRequestId;
                        const confirmMsg = {
                          role: 'assistant' as const,
                          content: `✅ **Shortlist Confirmed!**\n\nRequest status updated to **${data.requestStatus}**.\n\n📋 View hiring request: /hiring/requests/${requestId}`,
                          type: 'action' as const,
                          metadata: { requestId, requestPath: `/hiring/requests/${requestId}` },
                        };
                        actions.addMessage(confirmMsg);

                        // Save confirmation message to database
                        const threadId =
                          state.currentThreadId || localStorage.getItem('currentThreadId');
                        if (threadId) {
                          const saveResponse = await fetch('/api/hiring/v1/messages', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ threadId, ...confirmMsg }),
                          });
                          if (!saveResponse.ok) {
                            console.error(
                              '❌ Failed to save confirm message:',
                              await saveResponse.text(),
                            );
                          } else {
                            console.log('✅ Confirm message saved');
                          }

                          // Update thread phase to complete
                          const phaseResponse = await fetch(`/api/hiring/v1/threads/${threadId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                              current_phase: 'complete',
                            }),
                          });
                          if (!phaseResponse.ok) {
                            console.error(
                              '❌ Failed to update thread phase:',
                              await phaseResponse.text(),
                            );
                          } else {
                            console.log('✅ Thread phase updated to complete');
                          }
                        }

                        actions.setPhase('complete');
                        setShowActions(false);
                      } catch (error) {
                        console.error('Confirm error:', error);
                        actions.addMessage({
                          role: 'assistant',
                          content: `❌ Failed to confirm: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          type: 'text',
                        });
                      }
                    }}
                    className="gap-1"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Confirm Shortlist
                  </Button>
                </div>
              )}

            {/* Start JD creation */}
            {(message.metadata as Record<string, unknown> | undefined)?.startJdCreation && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    actions.addMessage({
                      role: 'user',
                      content: 'Yes, start creating the job description',
                      type: 'text',
                    });
                    setShowActions(false);
                    handleStartJobDescription();
                  }}
                  className="gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Yes, Start Creating JD
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    actions.addMessage({
                      role: 'user',
                      content: 'No, skip for now',
                      type: 'text',
                    });
                    setShowActions(false);
                  }}
                  className="gap-1"
                >
                  Skip For Now
                </Button>
              </div>
            )}
          </>
        )}

        {/* Feedback input for JD revision */}
        {showFeedbackInput && !isUser && (
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="text"
              placeholder="e.g., Make it more engaging, Simplify the language, Add more details..."
              value={feedbackInput}
              onChange={(e) => setFeedbackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSubmittingFeedback) {
                  handleFeedbackSubmit();
                }
              }}
              disabled={isSubmittingFeedback}
              className="rounded-lg border border-hairline bg-surface-0 px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleFeedbackSubmit}
                disabled={isSubmittingFeedback || !feedbackInput.trim()}
                className="gap-1"
              >
                {isSubmittingFeedback ? 'Revising...' : 'Submit Feedback'}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-1 text-xs text-ink-subtle">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}
