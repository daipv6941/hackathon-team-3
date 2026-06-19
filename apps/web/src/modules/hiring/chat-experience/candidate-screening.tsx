'use client';

import { Button } from '@seta/shared-ui';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CandidateCard } from './candidate-card';
import { useHiringChat } from './use-hiring-chat';

interface Candidate {
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

interface CandidateScreeningProps {
  requestId: string;
  jdId?: string;
}

export function CandidateScreening({ requestId, jdId: initialJdId }: CandidateScreeningProps) {
  const { actions } = useHiringChat();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCvIds, setSelectedCvIds] = useState<Set<string>>(new Set());
  const [jdId] = useState(initialJdId || 'JD-001');
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadCandidates = async () => {
      try {
        setIsLoading(true);
        console.log('📋 Loading candidates for request:', requestId);

        const response = await fetch(`/api/hiring/v1/candidates/${requestId}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          console.warn('API returned:', response.status);
          throw new Error('Failed to load candidates');
        }

        const data = await response.json();
        console.log('✅ API response:', data);
        const candidatesList = Array.isArray(data.candidates) ? data.candidates : [];
        console.log('✅ Loaded candidates:', candidatesList.length);
        setCandidates(candidatesList);
      } catch (error) {
        console.error('Load candidates error:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Failed to load candidates. Please try again.',
          type: 'text',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadCandidates();
  }, [requestId, actions]);

  const handleToggleSelect = (cvId: string) => {
    const newSelected = new Set(selectedCvIds);
    if (newSelected.has(cvId)) {
      newSelected.delete(cvId);
    } else {
      newSelected.add(cvId);
    }
    setSelectedCvIds(newSelected);
  };

  const handleScoreCandidate = async (cvId: string) => {
    try {
      setIsScoring(true);
      console.log('📊 Scoring candidate:', cvId);

      const response = await fetch('/api/hiring/v1/candidates/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cvId,
          jdId,
          requestId,
        }),
      });

      if (!response.ok) throw new Error('Failed to score candidate');

      const result = await response.json();
      console.log('✅ Score result:', result);

      // Update candidate in local state
      setCandidates((prev) =>
        prev.map((c) =>
          c.cvId === cvId
            ? {
                ...c,
                fitScore: result.fitScore,
                recommendation: result.recommendation,
                fitSummary: result.fitSummary,
              }
            : c,
        ),
      );

      actions.addMessage({
        role: 'assistant',
        content: `✅ **${result.candidateName}** scored **${result.fitScore}/100**\n\nRecommendation: ${result.recommendation}\n\n${result.fitSummary}`,
        type: 'action',
      });
    } catch (error) {
      console.error('Score candidate error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to score candidate. Please try again.',
        type: 'text',
      });
    } finally {
      setIsScoring(false);
    }
  };

  const handleConfirmShortlist = async () => {
    if (selectedCvIds.size === 0) {
      actions.addMessage({
        role: 'assistant',
        content: '⚠️ Please select at least one candidate for the shortlist.',
        type: 'text',
      });
      return;
    }

    try {
      setIsConfirming(true);
      console.log('📋 Confirming shortlist with candidates:', Array.from(selectedCvIds));

      const response = await fetch('/api/hiring/v1/shortlist/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId,
          selectedCandidateIds: Array.from(selectedCvIds),
        }),
      });

      if (!response.ok) throw new Error('Failed to confirm shortlist');

      const result = await response.json();
      console.log('✅ Shortlist confirmed:', result);

      actions.addMessage({
        role: 'assistant',
        content: `✅ **Shortlist Confirmed!**

Confirmed **${result.shortlistedCandidates.length}** candidates:
${result.shortlistedCandidates.map((c: Record<string, unknown>) => `- ${c.candidateName} (${c.fitScore}/100, ${c.recommendation})`).join('\n')}

Request status updated to **Shortlist Ready**. Ready to proceed with interviews!`,
        type: 'action',
      });

      // Advance phase
      actions.setPhase('confirmation');
    } catch (error) {
      console.error('Confirm shortlist error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to confirm shortlist. Please try again.',
        type: 'text',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const filteredCandidates = candidates.filter(
    (c) =>
      c.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.currentCompany?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.cvSkills?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-ink-subtle">Loading candidates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Screen Candidates</h2>
          <p className="text-sm text-ink-subtle">
            {filteredCandidates.length} candidates available
          </p>
        </div>
        <div className="text-sm font-medium text-primary">{selectedCvIds.size} selected</div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
        <input
          type="text"
          placeholder="Search by name, company, or skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-hairline bg-surface-1 py-2 pl-10 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none"
        />
      </div>

      {/* Candidates Grid */}
      {filteredCandidates.length === 0 ? (
        <div className="rounded-lg border border-hairline bg-surface-1 py-12 text-center">
          <p className="text-sm text-ink-subtle">No candidates found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredCandidates.map((candidate) => (
            <CandidateCard
              key={candidate.cvId}
              candidate={candidate}
              isSelected={selectedCvIds.has(candidate.cvId)}
              isScoring={isScoring}
              onToggleSelect={handleToggleSelect}
              onScore={handleScoreCandidate}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      {filteredCandidates.length > 0 && (
        <div className="flex justify-end gap-2 border-t border-hairline pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelectedCvIds(new Set())}
            disabled={selectedCvIds.size === 0}
          >
            Clear Selection
          </Button>
          <Button
            type="button"
            onClick={handleConfirmShortlist}
            disabled={selectedCvIds.size === 0 || isConfirming}
            className="gap-1"
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isConfirming ? 'Confirming...' : `Confirm Shortlist (${selectedCvIds.size})`}
          </Button>
        </div>
      )}
    </div>
  );
}
