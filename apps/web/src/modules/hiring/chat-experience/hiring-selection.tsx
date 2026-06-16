'use client';

import { FileText, Users } from 'lucide-react';
import { useHiringChat } from './hiring-provider';

export function HiringSelection() {
  const { actions } = useHiringChat();

  const handleSelectFlow = (flow: 'jd-draft' | 'cv-shortlist') => {
    // Clear any old thread from previous workflow
    localStorage.removeItem('currentThreadId');

    actions.setSelectedFlow(flow);
    actions.setPhase('initial');

    if (flow === 'jd-draft') {
      actions.addMessage({
        role: 'assistant',
        content:
          "📋 Great! Let's create a job description.\n\nI'll help you:\n1. Fetch context from your hiring request\n2. Draft the JD based on your requirements\n3. Score the clarity and completeness\n4. Get your approval\n5. Screen CVs against it\n\n**Please select a hiring request to proceed:**",
        type: 'action',
      });
    } else {
      actions.addMessage({
        role: 'assistant',
        content:
          "👥 Perfect! Let's screen and shortlist candidates.\n\nI'll help you:\n1. Load the approved JD\n2. Score each CV against your requirements\n3. Rank candidates by fit\n4. Generate a summary report\n5. Confirm your final shortlist\n\n**Please select a hiring request with an approved JD:**",
        type: 'action',
      });
    }
  };

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
          className="group rounded-lg border border-hairline bg-surface-1 p-6 transition-all hover:border-primary hover:bg-surface-2"
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
          className="group rounded-lg border border-hairline bg-surface-1 p-6 transition-all hover:border-primary hover:bg-surface-2"
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
