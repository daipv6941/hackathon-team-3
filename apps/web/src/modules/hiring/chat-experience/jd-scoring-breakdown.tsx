'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface CategoryScore {
  hiringAlignment?: number;
  roleAlignment?: number;
  skillAccuracy?: number;
  deliverables?: number;
  interviewAlignment?: number;
  screeningUsefulness?: number;
  biasCompliance?: number;
  completeness?: number;
}

interface JDScoringBreakdownProps {
  clarityScore: number;
  status: string;
  categoryScores: CategoryScore;
  flaggedGaps: string[];
  requiredRevisions: string[];
  confidence: string;
  iterations: number;
}

export function JDScoringBreakdown({
  clarityScore,
  status,
  categoryScores,
  flaggedGaps,
  requiredRevisions,
  confidence,
  iterations,
}: JDScoringBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'Ready':
        return 'bg-success/10 text-success border-success/30';
      case 'Minor Revision':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'Needs Revision':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'Weak':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      default:
        return 'bg-surface-2 text-ink border-hairline';
    }
  };

  const getScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'text-success';
    if (percentage >= 70) return 'text-warning';
    return 'text-red-500';
  };

  const categoryLabels: Record<keyof CategoryScore, { label: string; max: number }> = {
    hiringAlignment: { label: 'Hiring Alignment', max: 20 },
    roleAlignment: { label: 'Role Alignment', max: 15 },
    skillAccuracy: { label: 'Skill Accuracy', max: 20 },
    deliverables: { label: 'Deliverables', max: 15 },
    interviewAlignment: { label: 'Interview Alignment', max: 10 },
    screeningUsefulness: { label: 'Screening Usefulness', max: 10 },
    biasCompliance: { label: 'Bias/Compliance', max: 5 },
    completeness: { label: 'Completeness', max: 5 },
  };

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-surface-2 p-4 text-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-2 hover:opacity-75"
      >
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold">{clarityScore}/100</div>
          <div className="flex flex-col gap-1">
            <div
              className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getStatusColor(status)}`}
            >
              {status}
            </div>
            <div className="text-xs text-ink-subtle">
              {iterations} iteration{iterations !== 1 ? 's' : ''} • {confidence} confidence
            </div>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-hairline pt-4">
          {/* Category Scores */}
          <div>
            <h4 className="mb-3 font-semibold text-ink">Category Breakdown</h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(categoryLabels).map(([key, { label, max }]) => {
                const score = categoryScores[key as keyof CategoryScore] ?? 0;
                return (
                  <div key={key} className="rounded bg-surface-1 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-subtle">{label}</span>
                      <span className={`font-semibold ${getScoreColor(score, max)}`}>
                        {score}/{max}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-surface-2">
                      <div
                        className={`h-full rounded transition-all ${
                          (score / max) * 100 >= 80
                            ? 'bg-success'
                            : (score / max) * 100 >= 70
                              ? 'bg-warning'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${(score / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Flagged Gaps */}
          {flaggedGaps && flaggedGaps.length > 0 && (
            <div>
              <h4 className="mb-2 font-semibold text-ink">Flagged Gaps</h4>
              <ul className="space-y-1 text-xs text-ink-subtle">
                {flaggedGaps.map((gap) => (
                  <li key={gap} className="flex gap-2">
                    <span className="flex-shrink-0">⚠️</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Required Revisions */}
          {requiredRevisions && requiredRevisions.length > 0 && (
            <div>
              <h4 className="mb-2 font-semibold text-ink">Required Revisions</h4>
              <ul className="space-y-1 text-xs text-ink-subtle">
                {requiredRevisions.map((revision) => (
                  <li key={revision} className="flex gap-2">
                    <span className="flex-shrink-0">📝</span>
                    <span>{revision}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
