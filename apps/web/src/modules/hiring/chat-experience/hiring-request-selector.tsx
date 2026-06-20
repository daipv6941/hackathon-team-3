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
        const response = await fetch('/api/hiring/v1/requests', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to load requests');
        const data = await response.json();

        let availableRequests: HiringRequest[];
        if (state.selectedFlow === 'cv-shortlist') {
          availableRequests = (data.requests || []).filter(
            (r: HiringRequest) =>
              r.requestStatus === 'JD Approved' || r.requestStatus === 'CV Screening',
          );
        } else {
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
    const threadId = localStorage.getItem('currentThreadId');

    actions.setSelectedRequest(request.requestId);

    const userMessage = {
      role: 'user' as const,
      content: `Selected: ${request.requestId} — ${request.positionTitle}`,
      type: 'text' as const,
    };
    actions.addMessage(userMessage);

    if (threadId) {
      await fetch('/api/hiring/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId, ...userMessage }),
      }).catch((e) => console.error('Failed to save user message:', e));
    }

    const selectedFlow =
      (localStorage.getItem('selectedFlow') as 'jd-draft' | 'cv-shortlist') || 'jd-draft';
    actions.setSelectedFlow(selectedFlow);

    if (selectedFlow === 'cv-shortlist') {
      const assistantMsg = {
        role: 'assistant' as const,
        content: `✅ Great! I'll screen candidates for **${request.requestId}**: ${request.positionTitle}\n\nLoading the approved JD...`,
        type: 'action' as const,
      };
      actions.addMessage(assistantMsg);

      if (threadId) {
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId, ...assistantMsg }),
        }).catch((e) => console.error('Failed to save assistant message:', e));
      }

      actions.setPhase('jd-approval');
    } else {
      const assistantMsg = {
        role: 'assistant' as const,
        content: `✅ Great! I'll work with **${request.requestId}**: ${request.positionTitle}\n\nTeam: ${request.teamName}\n\nGenerating job description...`,
        type: 'action' as const,
      };
      actions.addMessage(assistantMsg);

      if (threadId) {
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId, ...assistantMsg }),
        }).catch((e) => console.error('Failed to save assistant message:', e));
      }

      actions.setPhase('initial');
    }

    // Update thread title, request info, and phase
    if (threadId) {
      const nextPhase = selectedFlow === 'cv-shortlist' ? 'jd-approval' : 'initial';
      await fetch(`/api/hiring/v1/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `${request.positionTitle} — ${request.requestId}`,
          request_id: request.requestId,
          current_phase: nextPhase,
        }),
      }).catch((e) => console.error('Failed to update thread:', e));
    }

    if (selectedFlow === 'cv-shortlist') {
      actions.setLoading(true);

      try {
        const jdResponse = await fetch(`/api/hiring/v1/jd?requestId=${request.requestId}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!jdResponse.ok) {
          throw new Error('Failed to fetch JD');
        }

        const jdData = await jdResponse.json();
        if (!jdData.jd) {
          throw new Error('No JD found for this request');
        }

        const jdId = jdData.jd.jdId;
        actions.setSelectedJob(jdId);

        const jdContent = jdData.jd.jdFullText || '';
        const jdMsg = {
          role: 'assistant' as const,
          content: `✅ **JD Approved & Saved!**

Your JD has been approved and saved to the system.

**Next steps:**
1. Review the approved JD
2. Start screening CVs from your candidate pool
3. Move to shortlist finalization

Ready to screen candidates?

---

${jdContent}`,
          type: 'action' as const,
        };
        actions.addMessage(jdMsg);

        if (threadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId, ...jdMsg }),
          }).catch((e) => console.error('Failed to save JD message:', e));
        }
      } catch (error) {
        console.error('Screening error:', error);
        const errorMsg = {
          role: 'assistant' as const,
          content: '❌ Failed to load JD. Please try again.',
          type: 'text' as const,
        };
        actions.addMessage(errorMsg);

        if (threadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId, ...errorMsg }),
          }).catch((e) => console.error('Failed to save error message:', e));
        }
      } finally {
        actions.setLoading(false);
      }
    }
  };

  const handleCreateNew = async () => {
    setSelectedId('new');
    const threadId = localStorage.getItem('currentThreadId');

    const userMsg = {
      role: 'user' as const,
      content: 'Create a new hiring request',
      type: 'text' as const,
    };
    actions.addMessage(userMsg);

    if (threadId) {
      await fetch('/api/hiring/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId, ...userMsg }),
      }).catch((e) => console.error('Failed to save message:', e));
    }

    const assistantMsg = {
      role: 'assistant' as const,
      content: `📝 Perfect! I'll help you create a new hiring request.\n\nPlease describe the hiring request in detail. Tell me about:\n- The position and team\n- Why you're hiring\n- Key responsibilities and deliverables\n- Team skill gaps\n- Seniority level\n- Salary range\n- Headcount and urgency\n\nThe more details you provide, the better I can extract the information!\n\n**Go ahead, describe your hiring need:**`,
      type: 'action' as const,
    };
    actions.addMessage(assistantMsg);

    if (threadId) {
      await fetch('/api/hiring/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId, ...assistantMsg }),
      }).catch((e) => console.error('Failed to save message:', e));
    }

    actions.setSelectedRequest('creating');
  };

  const _handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/hiring/v1/threads/${threadId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete thread');

      setRequests(requests.filter((t) => t.id !== threadId));

      const currentThreadId = localStorage.getItem('currentThreadId');
      if (currentThreadId === threadId) {
        actions.clearMessages();
        localStorage.removeItem('currentThreadId');
      }
    } catch (error) {
      console.error('Delete request error:', error);
      alert('Failed to delete request');
    }
  };

  const handleSelectId = (id: string) => {
    setSelectedId(id);
  };

  return (
    <div className="flex flex-col gap-4">
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
                onClick={() => {
                  handleSelectRequest(request);
                  handleSelectId(request.id);
                }}
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
            Answer a few questions and I'll set it up for you
          </p>
        </button>
      </div>
    </div>
  );
}
