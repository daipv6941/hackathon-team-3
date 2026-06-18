'use client';

import { FileText, Users } from 'lucide-react';
import { useHiringChat } from './hiring-provider';

export type WorkflowType = 'jd-creation' | 'cv-screening';

export interface WorkflowOption {
  id: WorkflowType;
  title: string;
  description: string;
  icon: React.ReactNode;
  steps: string[];
}

const WORKFLOWS: WorkflowOption[] = [
  {
    id: 'jd-creation',
    title: 'Create Job Description',
    description: 'Draft, refine, and approve a job description, then screen CVs',
    icon: <FileText className="h-8 w-8" />,
    steps: ['JD Creation', 'CV Screening'],
  },
  {
    id: 'cv-screening',
    title: 'Screen & Shortlist Candidates',
    description: 'Score and rank candidates, then confirm your final shortlist',
    icon: <Users className="h-8 w-8" />,
    steps: ['CV Scoring', 'Ranking'],
  },
];

export function WorkflowSelector() {
  const { actions } = useHiringChat();

  const handleSelectWorkflow = (workflow: WorkflowOption) => {
    actions.setSelectedFlow(workflow.id as 'jd-draft' | 'cv-shortlist');
    actions.setPhase('initial');
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-ink">Welcome to Hiring Studio</h1>
        <p className="mt-2 text-ink-subtle">Choose how you want to proceed</p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 md:grid-cols-2">
        {WORKFLOWS.map((workflow) => (
          <button
            type="button"
            key={workflow.id}
            onClick={() => handleSelectWorkflow(workflow)}
            className="rounded-lg border border-hairline bg-surface-1 p-6 text-left transition-all hover:border-primary hover:bg-surface-2"
          >
            <div className="flex items-center gap-3 text-primary mb-4">
              {workflow.icon}
              <h2 className="text-lg font-semibold text-ink">{workflow.title}</h2>
            </div>

            <p className="text-sm text-ink-subtle mb-4">{workflow.description}</p>

            <div className="flex gap-2 flex-wrap">
              {workflow.steps.map((step) => (
                <span
                  key={step}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {step}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-ink-subtler">
        💡 Tip: You can switch flows anytime by using the Reset button in the header
      </p>
    </div>
  );
}
