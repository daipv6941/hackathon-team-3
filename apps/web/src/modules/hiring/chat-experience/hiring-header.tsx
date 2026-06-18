'use client';

import { Button } from '@seta/shared-ui';
import { Menu, Plus, RotateCcw } from 'lucide-react';
import { useHiringChat } from './use-hiring-chat';

export interface HiringHeaderProps {
  onOpenMobileNav?: () => void;
}

export function HiringHeader({ onOpenMobileNav }: HiringHeaderProps) {
  const { state, actions } = useHiringChat();

  return (
    <div className="flex h-14 items-center justify-between border-b border-hairline bg-surface-0 px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onOpenMobileNav} className="lg:hidden">
          <Menu className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-sm font-medium">
            {state.currentPhase === 'selection' && 'Select Your Workflow'}
            {state.currentPhase === 'initial' && 'Start Hiring'}
            {state.currentPhase === 'jd-creation' && 'Creating Job Description'}
            {state.currentPhase === 'jd-approval' && 'Review & Approve JD'}
            {state.currentPhase === 'cv-screening' && 'Screening Candidates'}
            {state.currentPhase === 'confirmation' && 'Confirm Shortlist'}
            {state.currentPhase === 'complete' && 'Hiring Complete'}
          </div>
          <div className="mt-1 h-1 w-32 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${
                  (([
                    'selection',
                    'initial',
                    'jd-creation',
                    'jd-approval',
                    'cv-screening',
                    'confirmation',
                    'complete',
                  ].indexOf(state.currentPhase) +
                    1) /
                    7) *
                  100
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.clearMessages()}
          title="Start new hiring request"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.clearMessages()}
          title="Reset chat"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
