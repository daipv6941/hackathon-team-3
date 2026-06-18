'use client';

import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useHiringChat } from './use-hiring-chat';

interface HiringRequest {
  id: string;
  requestId: string;
  positionTitle: string;
  teamName: string;
  requestStatus: string;
  urgencyLevel: string;
}

export function HiringRequestSelector() {
  const { actions } = useHiringChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const loadRequests = async () => {
      try {
        const response = await fetch('http://localhost:3000/hiring/v1/requests', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to load requests');
        const data = await response.json();

        // Filter to only show requests ready for JD workflow (New or JD Draft)
        const availableRequests = (data.requests || []).filter(
          (r: HiringRequest) => r.requestStatus === 'New' || r.requestStatus === 'JD Draft',
        );

        setRequests(availableRequests);
      } catch (error) {
        console.error('Load requests error:', error);
        setRequests([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadRequests();
  }, []);

  const handleSelectRequest = (request: HiringRequest) => {
    setSelectedId(request.id);

    // Clear old thread ID when starting NEW request workflow
    localStorage.removeItem('currentThreadId');

    actions.setSelectedRequest(request.requestId);

    // Proceed with selected request
    actions.addMessage({
      role: 'user',
      content: `Selected: ${request.requestId} — ${request.positionTitle}`,
      type: 'text',
    });

    actions.addMessage({
      role: 'assistant',
      content: `✅ Great! I'll work with **${request.requestId}**: ${request.positionTitle}\n\nTeam: ${request.teamName}\n\nLet me fetch the business context, team skill gaps, and headcount plan...`,
      type: 'action',
    });

    // Advance to initial phase to start the workflow
    actions.setPhase('initial');
  };

  const handleCreateNew = () => {
    setSelectedId('new');
    actions.addMessage({
      role: 'user',
      content: 'Create a new hiring request',
      type: 'text',
    });

    actions.addMessage({
      role: 'assistant',
      content: `📝 Perfect! I'll help you create a new hiring request.\n\nLet me ask you a few questions to set it up:\n\n**What is the position title you're hiring for?**\n(e.g., "Senior Backend Developer", "Product Manager", "Data Scientist")`,
      type: 'action',
    });

    // Mark that we're in the creation flow
    actions.setSelectedRequest('creating');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Existing requests */}
      <div>
        <p className="mb-2 text-xs font-semibold text-ink-subtle">
          AVAILABLE REQUESTS (Ready for JD)
        </p>
        <div className="grid gap-2">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-ink-subtle">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="rounded-lg border border-hairline bg-surface-1 p-4 text-center text-xs text-ink-subtle">
              No requests available. Create a new one or check the Requests page.
            </div>
          ) : (
            requests.map((request) => (
              <button
                type="button"
                key={request.id}
                onClick={() => handleSelectRequest(request)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  selectedId === request.id
                    ? 'border-primary bg-primary/5'
                    : 'border-hairline bg-surface-1 hover:border-primary hover:bg-surface-2'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-surface-2 px-2 py-1 text-xs font-semibold text-primary">
                        {request.requestId}
                      </code>
                      <span className="text-sm font-semibold">{request.positionTitle}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle">{request.teamName}</p>
                  </div>
                  {selectedId === request.id && <ChevronRight className="h-5 w-5 text-primary" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Create new */}
      <div className="border-t border-hairline pt-4">
        <p className="mb-2 text-xs font-semibold text-ink-subtle">OR CREATE NEW</p>
        <button
          type="button"
          onClick={handleCreateNew}
          className={`w-full rounded-lg border-2 border-dashed p-3 text-left transition-all ${
            selectedId === 'new'
              ? 'border-primary bg-primary/5'
              : 'border-hairline hover:border-primary hover:bg-surface-2'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Create a new hiring request</span>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Answer a few questions and I\'ll set it up for you
          </p>
        </button>
      </div>
    </div>
  );
}
