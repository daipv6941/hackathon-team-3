'use client';

import { Button } from '@seta/shared-ui';
import { CheckCircle2, Circle, Zap } from 'lucide-react';
import { useState } from 'react';

interface CandidateData {
  cvId: string;
  candidateId: string;
  candidateName: string;
  currentTitle?: string;
  currentCompany?: string;
  yearsOfExperience?: number;
  cvSkills?: string;
  englishLevel?: string;
  salaryExpectation?: string;
  fitScore?: number | null;
  recommendation?: string | null;
  fitSummary?: string | null;
}

interface CandidateCardProps {
  candidate: CandidateData;
  isSelected: boolean;
  isScoring: boolean;
  onToggleSelect: (cvId: string) => void;
  onScore: (cvId: string) => Promise<void>;
}

function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-gray-100 text-gray-700';
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 75) return 'bg-blue-100 text-blue-700';
  if (score >= 60) return 'bg-yellow-100 text-yellow-700';
  if (score >= 40) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function getRecommendationText(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'Not scored';
  if (score >= 85) return 'Strong shortlist';
  if (score >= 75) return 'Shortlist';
  if (score >= 60) return 'Medium';
  if (score >= 40) return 'Low';
  return 'Reject';
}

export function CandidateCard({
  candidate,
  isSelected,
  isScoring,
  onToggleSelect,
  onScore,
}: CandidateCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleScore = async () => {
    setIsLoading(true);
    try {
      await onScore(candidate.cvId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-hairline bg-surface-1 hover:border-primary/30'
      }`}
    >
      {/* Header: Name + Selection */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-ink">{candidate.candidateName}</h3>
          {candidate.currentTitle && (
            <p className="text-sm text-ink-subtle">{candidate.currentTitle}</p>
          )}
          {candidate.currentCompany && (
            <p className="text-xs text-ink-subtle">{candidate.currentCompany}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleSelect(candidate.cvId)}
          className="ml-2 flex-shrink-0 text-primary hover:text-primary-dark"
        >
          {isSelected ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
        </button>
      </div>

      {/* Score Badge */}
      {candidate.fitScore !== null && candidate.fitScore !== undefined ? (
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`rounded-lg px-3 py-1 text-sm font-semibold ${getScoreColor(candidate.fitScore)}`}
          >
            {candidate.fitScore.toFixed(0)}/100
          </div>
          <span className="text-sm font-medium text-ink">
            {getRecommendationText(candidate.fitScore)}
          </span>
        </div>
      ) : (
        <div className="mb-4">
          <Button
            type="button"
            size="sm"
            onClick={handleScore}
            disabled={isLoading || isScoring}
            className="gap-1"
          >
            {isLoading || isScoring ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {isLoading || isScoring ? 'Scoring...' : 'Score CV'}
          </Button>
        </div>
      )}

      {/* Experience & Skills */}
      <div className="mb-3 space-y-2 text-sm">
        {candidate.yearsOfExperience && (
          <div>
            <span className="font-medium text-ink-subtle">YOE: </span>
            <span className="text-ink">{candidate.yearsOfExperience} years</span>
          </div>
        )}
        {candidate.englishLevel && (
          <div>
            <span className="font-medium text-ink-subtle">English: </span>
            <span className="text-ink">{candidate.englishLevel}</span>
          </div>
        )}
        {candidate.cvSkills && (
          <div>
            <span className="font-medium text-ink-subtle">Skills: </span>
            <span className="text-ink">{candidate.cvSkills}</span>
          </div>
        )}
      </div>

      {/* Fit Summary */}
      {candidate.fitSummary && (
        <div className="rounded bg-surface-2 p-3">
          <p className="text-xs font-medium text-ink-subtle">FIT SUMMARY</p>
          <p className="mt-1 text-sm text-ink">{candidate.fitSummary}</p>
        </div>
      )}
    </div>
  );
}
