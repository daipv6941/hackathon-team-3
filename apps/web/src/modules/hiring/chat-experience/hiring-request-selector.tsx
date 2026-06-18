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
  const { state, actions } = useHiringChat();
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

        // Filter based on selected flow
        let availableRequests: HiringRequest[];
        if (state.selectedFlow === 'cv-shortlist') {
          // For CV screening flow: show requests with JD Approved or CV Screening status
          availableRequests = (data.requests || []).filter(
            (r: HiringRequest) =>
              r.requestStatus === 'JD Approved' || r.requestStatus === 'CV Screening',
          );
        } else {
          // For JD draft flow: show New or JD Draft requests
          availableRequests = (data.requests || []).filter(
            (r: HiringRequest) => r.requestStatus === 'New' || r.requestStatus === 'JD Draft',
          );
        }

        setRequests(availableRequests);
      } catch (error) {
        console.error('Load requests error:', error);
        setRequests([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadRequests();
  }, [state.selectedFlow]);

  const handleSelectRequest = async (request: HiringRequest) => {
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

    // Check if this is CV screening flow
    if (state.selectedFlow === 'cv-shortlist') {
      // For CV screening: load the saved JD and show it
      actions.addMessage({
        role: 'assistant',
        content: `✅ Great! I'll screen candidates for **${request.requestId}**: ${request.positionTitle}\n\nLoading the approved JD...`,
        type: 'action',
      });

      actions.setPhase('jd-approval');
      actions.setLoading(true);

      try {
        // Fetch the JD from database
        const jdResponse = await fetch(
          `http://localhost:3000/hiring/v1/jd?requestId=${request.requestId}`,
          {
            method: 'GET',
            credentials: 'include',
          },
        );

        if (!jdResponse.ok) {
          throw new Error('Failed to fetch JD');
        }

        const jdData = await jdResponse.json();
        if (!jdData.jd) {
          throw new Error('No JD found for this request');
        }

        const jdId = jdData.jd.jdId;
        actions.setSelectedJob(jdId);

        // Display the saved JD with the approval format
        const jdContent = jdData.jd.jdFullText || '';
        actions.addMessage({
          role: 'assistant',
          content: `✅ **JD Approved & Saved!**

Your JD has been approved and saved to the system. The hiring request is now in **JD Approved** status.

**Next steps:**
1. Review the approved JD
2. Start screening CVs from your candidate pool
3. Move to shortlist finalization

Ready to screen candidates?

---

${jdContent}`,
          type: 'action',
        });
      } catch (error) {
        console.error('Screening error:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Failed to load JD. Please try again.',
          type: 'text',
        });
      } finally {
        actions.setLoading(false);
      }
    } else {
      // For JD draft: show normal flow
      actions.addMessage({
        role: 'assistant',
        content: `✅ Great! I'll work with **${request.requestId}**: ${request.positionTitle}\n\nTeam: ${request.teamName}\n\nLet me fetch the business context, team skill gaps, and headcount plan...`,
        type: 'action',
      });

      // Advance to initial phase to start the workflow
      actions.setPhase('initial');
    }
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
      content: `📝 Perfect! I'll help you create a new hiring request.\n\nPlease describe the hiring request in detail. Tell me about:\n- The position and team\n- Why you're hiring\n- Key responsibilities and deliverables\n- Team skill gaps\n- Seniority level\n- Salary range\n- Headcount and urgency\n\nThe more details you provide, the better I can extract the information!\n\n**Go ahead, describe your hiring need:**`,
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
          {state.selectedFlow === 'cv-shortlist'
            ? 'AVAILABLE REQUESTS (With Approved JD)'
            : 'AVAILABLE REQUESTS (Ready for JD)'}
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
