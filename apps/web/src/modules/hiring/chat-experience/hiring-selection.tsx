'use client';

import { FileText, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useHiringChat } from './use-hiring-chat';

export function HiringSelection() {
  const { actions } = useHiringChat();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectFlow = useCallback(
    async (flow: 'jd-draft' | 'cv-shortlist') => {
      try {
        setIsLoading(true);
        console.log('🎯 handleSelectFlow called with:', flow);

        // Call backend to create thread
        console.log('🔄 Calling POST /api/hiring/v1/threads...');
        const response = await fetch('/api/hiring/v1/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            flow,
            initialMessage:
              flow === 'jd-draft'
                ? "📋 Great! Let's create a job description."
                : "👥 Perfect! Let's screen and shortlist candidates.",
          }),
        });

        console.log('📥 Response status:', response.status, response.ok);

        if (!response.ok) {
          throw new Error(`Failed to create thread: ${response.status}`);
        }

        const data = (await response.json()) as { threadId: string };
        console.log('✅ Thread created:', data.threadId);

        // Save threadId & flow to localStorage
        localStorage.setItem('currentThreadId', data.threadId);
        localStorage.setItem('selectedFlow', flow);

        // Set flow and messages
        actions.setSelectedFlow(flow);
        actions.setPhase('selection');

        if (flow === 'jd-draft') {
          const detailedMsg = {
            role: 'assistant' as const,
            content:
              "📋 Great! Let's create a job description.\n\nI'll help you:\n1. Fetch context from your hiring request\n2. Draft the JD based on your requirements\n3. Score the clarity and completeness\n4. Get your approval\n5. Screen CVs against it\n\n**Please select a hiring request to proceed:**",
            type: 'action' as const,
          };
          actions.addMessage(detailedMsg);

          // Save detailed message to database
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId: data.threadId, ...detailedMsg }),
          }).catch((e) => console.error('Failed to save detailed message:', e));
        } else {
          const detailedMsg = {
            role: 'assistant' as const,
            content:
              "👥 Perfect! Let's screen and shortlist candidates.\n\nI'll help you:\n1. Load the approved JD\n2. Score each CV against your requirements\n3. Rank candidates by fit\n4. Generate a summary report\n5. Confirm your final shortlist\n\n**Please select a hiring request with an approved JD:**",
            type: 'action' as const,
          };
          actions.addMessage(detailedMsg);

          // Save detailed message to database
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId: data.threadId, ...detailedMsg }),
          }).catch((e) => console.error('Failed to save detailed message:', e));
        }
      } catch (error) {
        console.error('Failed to start workflow:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Failed to start workflow. Please try again.',
          type: 'text',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [actions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Welcome to Hiring Studio</h2>
        <p className="mt-2 text-ink-subtle">Choose how you want to proceed</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* JD Draft Flow */}
        <button
          type="button"
          onClick={() => handleSelectFlow('jd-draft')}
          disabled={isLoading}
          className="group rounded-lg border border-hairline bg-surface-1 p-6 transition-all hover:border-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">Create Job Description</h3>
              <p className="mt-1 text-sm text-ink-subtle">
                Draft, refine, and approve a job description, then screen CVs
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              JD Creation
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              CV Screening
            </span>
          </div>
        </button>

        {/* CV Shortlist Flow */}
        <button
          type="button"
          onClick={() => handleSelectFlow('cv-shortlist')}
          disabled={isLoading}
          className="group rounded-lg border border-hairline bg-surface-1 p-6 transition-all hover:border-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">Screen & Shortlist Candidates</h3>
              <p className="mt-1 text-sm text-ink-subtle">
                Score and rank candidates, then confirm your final shortlist
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              CV Scoring
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              Ranking
            </span>
          </div>
        </button>
      </div>

      <p className="max-w-md text-center text-xs text-ink-subtle">
        💡 Tip: You can switch flows anytime by using the Reset button in the header
      </p>
    </div>
  );
}
