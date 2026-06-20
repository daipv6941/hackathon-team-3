'use client';

import { Button } from '@seta/shared-ui';
import { AlertCircle, CheckCircle2, MessageCircle, Search, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HiringRequestSelector } from './hiring-request-selector';
import { HiringSelection } from './hiring-selection';
import { useHiringChat } from './use-hiring-chat';

export function HiringTranscript() {
  const { state } = useHiringChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

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

      // Extract JD content and clarity score from the message
      const jdContent = message.content || '';
      const clarityMatch = jdContent.match(/Clarity Score:.*?(\d+)\/100/);
      const clarityScore = clarityMatch?.[1] ? parseInt(clarityMatch[1], 10) : 0;

      console.log('📤 Approving JD for request:', {
        requestId: state.selectedRequestId,
        clarityScore,
        contentLength: jdContent.length,
      });

      // Call API to save JD and update request status
      const response = await fetch('/api/hiring/v1/jd/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
          jdText: jdContent,
          clarityScore,
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

      // Save jdId to state for screening
      actions.setSelectedJob(data.jdId);

      // Add confirmation message
      actions.addMessage({
        role: 'assistant',
        content: `✅ **JD Approved & Saved!**

Your JD has been approved and saved to the system. The hiring request is now in **JD Approved** status.

**Next steps:**
1. Review the approved JD
2. Start screening CVs from your candidate pool
3. Move to shortlist finalization

Ready to screen candidates?`,
        type: 'action',
      });

      // Advance to next phase
      actions.setPhase('jd-approval');
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
        }),
      });

      if (!response.ok) throw new Error('Failed to screen candidates');

      const result = await response.json();
      console.log('✅ Screening complete:', result);

      // Build detailed report with statistics
      interface CandidateResult {
        candidateName: string;
        fitScore: number;
        fitSummary: string;
        interviewQuestions?: string[];
        followUpQuestions?: string[];
        rejectReason?: string;
      }

      const stats = result.statistics || {};
      const reportHtml = `
## 📊 Shortlist Report

**Position:** ${result.position}
**Total Candidates:** ${stats.totalCandidates || result.totalCandidates}

### 📈 Summary by Recommendation

- **✅ PASS (${stats.passPercentage || 0}%)**: ${stats.passCandidates || 0} candidates
- **⚠️ NEED MORE INFO (${stats.needMoreInfoPercentage || 0}%)**: ${stats.needMoreInfoCandidates || 0} candidates
- **❌ REJECT (${stats.rejectPercentage || 0}%)**: ${stats.rejectCandidates || 0} candidates

${
  (result.passCandidatesList || []).length > 0
    ? `### ✅ PASS Candidates (Ready for Interview)

${(result.passCandidatesList as CandidateResult[])
  .map(
    (c) => `
**${c.candidateName}** - Score: ${c.fitScore}/100
- Summary: ${c.fitSummary}
- Interview Questions:
${(c.interviewQuestions || []).map((q) => `  - ${q}`).join('\n')}
`,
  )
  .join('\n')}
`
    : ''
}

${
  (result.needMoreInfoList || []).length > 0
    ? `### ⚠️ NEED MORE INFO Candidates (Requires Follow-up)

${(result.needMoreInfoList as CandidateResult[])
  .map(
    (c) => `
**${c.candidateName}** - Score: ${c.fitScore}/100
- Summary: ${c.fitSummary}
- Follow-up Questions:
${(c.followUpQuestions || []).map((q) => `  - ${q}`).join('\n')}
`,
  )
  .join('\n')}
`
    : ''
}

${
  (result.rejectCandidatesList || []).length > 0
    ? `### ❌ REJECT Candidates

${(result.rejectCandidatesList as CandidateResult[])
  .map((c) => `- **${c.candidateName}** (${c.fitScore}/100): ${c.rejectReason}`)
  .join('\n')}
`
    : ''
}

${result.summary}`;

      actions.addMessage({
        role: 'assistant',
        content: reportHtml,
        type: 'action',
      });

      actions.setPhase('confirmation');
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
              ? 'bg-primary text-primary-foreground rounded-br-none'
              : 'bg-surface-2 text-ink rounded-bl-none'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {/* Show action buttons for JD approval or other actions */}
        {!isUser && showActions && message.type === 'action' && (
          <>
            {/* JD Approval buttons - show after scoring */}
            {(state.currentPhase === 'initial' || state.currentPhase === 'jd-approval') &&
              message.content.includes('Clarity Score') && (
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

                        actions.addMessage({
                          role: 'assistant',
                          content: `✅ **Shortlist Confirmed!**\n\nRequest status updated to **${data.requestStatus}**.`,
                          type: 'action',
                        });

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
