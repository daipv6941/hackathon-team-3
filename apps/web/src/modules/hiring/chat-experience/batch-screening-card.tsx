'use client';

interface ScoredCandidate {
  cvId: string;
  candidateName: string;
  currentTitle?: string;
  currentCompany?: string;
  yearsOfExperience?: number;
  cvSkills?: string;
  englishLevel?: string;
  fitScore: number;
  recommendation: string;
  fitSummary: string;
  confidence: string;
  followUpQuestions?: string[];
  flags?: string[];
}

interface BatchScreeningCardProps {
  statistics: {
    passCandidates: number;
    passPercentage: number;
    needMoreInfoCandidates: number;
    needMoreInfoPercentage: number;
    rejectCandidates: number;
    rejectPercentage: number;
  };
  scoredCandidates: ScoredCandidate[];
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 75) return 'bg-blue-100 text-blue-700';
  if (score >= 60) return 'bg-yellow-100 text-yellow-700';
  if (score >= 40) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function CandidateCard({
  candidate,
  borderColor,
}: {
  candidate: ScoredCandidate;
  borderColor: string;
}) {
  return (
    <div className={`rounded border ${borderColor} p-3`}>
      <div className="flex justify-between">
        <span className="font-medium text-ink">{candidate.candidateName}</span>
        <span className={`text-sm font-bold ${getScoreColor(candidate.fitScore).split(' ')[1]}`}>
          {candidate.fitScore.toFixed(2)}/100
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-subtle">{candidate.fitSummary}</p>
      {candidate.followUpQuestions && candidate.followUpQuestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-subtle">Follow-up Questions:</p>
          <ul className="mt-1 space-y-1">
            {candidate.followUpQuestions.map((q) => (
              <li key={q} className="text-xs text-ink">
                • {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BatchScreeningCard({ statistics, scoredCandidates }: BatchScreeningCardProps) {
  const passCandidates = scoredCandidates.filter(
    (c) =>
      c.recommendation.includes('Pass') ||
      c.recommendation.includes('Strong shortlist') ||
      c.recommendation.includes('Shortlist'),
  );
  const needMoreInfoCandidates = scoredCandidates.filter(
    (c) =>
      c.recommendation.includes('Need More Info') ||
      c.recommendation.includes('Medium') ||
      c.recommendation.includes('Low'),
  );
  const rejectCandidates = scoredCandidates.filter((c) => c.recommendation.includes('Reject'));

  return (
    <div className="bg-surface-1 border border-hairline text-ink shadow-none rounded-md p-6">
      <h2 className="text-lg font-semibold">Shortlist Report</h2>

      {/* Summary Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-green-50 p-3">
          <div className="text-sm font-medium text-green-700">Pass</div>
          <div className="mt-1 text-2xl font-bold text-green-900">{statistics.passCandidates}</div>
          <div className="text-xs text-green-600">{statistics.passPercentage}%</div>
        </div>
        <div className="rounded-lg bg-yellow-50 p-3">
          <div className="text-sm font-medium text-yellow-700">Need More Info</div>
          <div className="mt-1 text-2xl font-bold text-yellow-900">
            {statistics.needMoreInfoCandidates}
          </div>
          <div className="text-xs text-yellow-600">{statistics.needMoreInfoPercentage}%</div>
        </div>
        <div className="rounded-lg bg-red-50 p-3">
          <div className="text-sm font-medium text-red-700">Reject</div>
          <div className="mt-1 text-2xl font-bold text-red-900">{statistics.rejectCandidates}</div>
          <div className="text-xs text-red-600">{statistics.rejectPercentage}%</div>
        </div>
      </div>

      {/* Pass Section */}
      {passCandidates.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-green-700">✅ Ready for Interview</h3>
          <div className="mt-3 space-y-3">
            {passCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.cvId}
                candidate={candidate}
                borderColor="border-green-200 bg-green-50"
              />
            ))}
          </div>
        </div>
      )}

      {/* Need More Info Section */}
      {needMoreInfoCandidates.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-yellow-700">⚠️ Need More Info</h3>
          <div className="mt-3 space-y-3">
            {needMoreInfoCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.cvId}
                candidate={candidate}
                borderColor="border-yellow-200 bg-yellow-50"
              />
            ))}
          </div>
        </div>
      )}

      {/* Reject Section */}
      {rejectCandidates.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-red-700">❌ Reject Candidates</h3>
          <div className="mt-3 space-y-2">
            {rejectCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.cvId}
                candidate={candidate}
                borderColor="border-red-200 bg-red-50"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
