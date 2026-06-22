'use client';

import { Button, Input } from '@seta/shared-ui';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HiringChatState } from './hiring-context';
import { useHiringChat } from './use-hiring-chat';

export function HiringComposer() {
  const { state, actions } = useHiringChat();
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoadingExistingThread, setIsLoadingExistingThread] = useState(false);
  const triggeredThreadsRef = useRef<Set<string>>(new Set());
  const loadedFlowRef = useRef<string | null>(null);
  const prevThreadIdRef = useRef<string | null>(null);
  const [extractionPhase, setExtractionPhase] = useState<
    'initial-prompt' | 'extracting' | 'collected-summary' | 'completed'
  >('initial-prompt');
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>({});

  const saveHiringRequest = useCallback(
    async (data: Record<string, unknown>) => {
      try {
        // Set phase to confirming while saving
        actions.setPhase('hiring-request-confirming');
        console.log('💾 Saving hiring request...');
        const response = await fetch('/api/hiring/v1/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            position_title: data.position_title,
            team_name: data.team_name,
            urgency_level: data.urgency_level,
            headcount_requested: data.headcount_requested,
            business_justification: data.business_justification,
            team_skill_gap_summary: data.team_skill_gap_summary,
            key_deliverables: data.key_deliverables,
            salary_range: data.salary_range,
            seniority_level: data.seniority_level,
            min_yoe: data.min_yoe,
            max_yoe: data.max_yoe,
            required_skills: data.required_skills,
            nice_to_have_skills: data.nice_to_have_skills,
            preferred_tech_stack: data.preferred_tech_stack,
            team_description: data.team_description,
            onboarding_timeline: data.onboarding_timeline,
            responsibilities: data.responsibilities,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save hiring request');
        }

        const result = (await response.json()) as { requestId?: string };
        const requestId = result.requestId;

        console.log(`✅ Hiring request ${requestId} saved successfully`);

        const successMsg = {
          role: 'assistant' as const,
          content: `✅ Perfect! I've saved your hiring request **${requestId}**.\n\nWould you like me to start creating the job description now?`,
          type: 'action' as const,
          metadata: { startJdCreation: true },
        };

        actions.addMessage(successMsg);

        // Get thread ID once for reuse
        const currentThreadId = localStorage.getItem('currentThreadId');

        // Save message to database
        if (currentThreadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId: currentThreadId, ...successMsg }),
          }).catch((e) => console.error('Failed to save success message:', e));
        }

        if (requestId) {
          actions.setSelectedRequest(requestId);
          // Persist to localStorage for recovery on page reload
          localStorage.setItem('selectedRequestId', requestId);
        }

        // Move to request-selected phase after successful save
        actions.setPhase('request-selected');

        // Update thread with new phase and title
        if (currentThreadId) {
          const positionTitle = String(data.position_title) || 'Hiring Request';
          await fetch(`/api/hiring/v1/threads/${currentThreadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              current_phase: 'request-selected',
              request_id: requestId,
              title: `${positionTitle} — ${requestId}`,
            }),
          }).catch((e) => console.error('Failed to update thread:', e));
        }

        setExtractionPhase('initial-prompt');
        setExtractedData({});
      } catch (error) {
        console.error('❌ Save error:', error);
        const errorMsg = {
          role: 'assistant' as const,
          content: '❌ Failed to save the hiring request. Please try again.',
          type: 'text' as const,
        };
        actions.addMessage(errorMsg);

        // Save error message to database
        const errorThreadId = localStorage.getItem('currentThreadId');
        if (errorThreadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId: errorThreadId, ...errorMsg }),
          }).catch((e) => console.error('Failed to save error message:', e));
        }

        // Reset phase on error
        actions.setPhase('hiring-request-extracted');
      }

      actions.setLoading(false);
    },
    [actions],
  );

  useEffect(() => {
    const handleConfirm = () => {
      console.log('✅ User confirmed hiring request via button');
      saveHiringRequest(extractedData);
    };

    const handleChange = () => {
      console.log('🔄 User wants to change hiring request details');
      setExtractionPhase('initial-prompt');
      setExtractedData({});
      actions.addMessage({
        role: 'assistant',
        content:
          "No problem! Please describe your hiring request again, and I'll extract the details.",
        type: 'action',
      });
    };

    window.addEventListener('confirm-hiring-request', handleConfirm as EventListener);
    window.addEventListener('change-hiring-request', handleChange as EventListener);

    return () => {
      window.removeEventListener('confirm-hiring-request', handleConfirm as EventListener);
      window.removeEventListener('change-hiring-request', handleChange as EventListener);
    };
  }, [saveHiringRequest, extractedData, actions]);

  // Load thread from localStorage (on mount and when flow changes)
  useLayoutEffect(() => {
    if (loadedFlowRef.current === state.selectedFlow) {
      return;
    }
    loadedFlowRef.current = state.selectedFlow || null;

    const savedThreadId = localStorage.getItem('currentThreadId');
    if (!savedThreadId || savedThreadId === prevThreadIdRef.current) return;

    prevThreadIdRef.current = savedThreadId;

    if (savedThreadId.startsWith('hiring-')) {
      console.log('📂 Using pre-created thread from request selection:', savedThreadId);
      queueMicrotask(() => setThreadId(savedThreadId));
    } else {
      console.log('📂 Loading previously saved thread:', savedThreadId);
      queueMicrotask(() => {
        setIsLoadingExistingThread(true);
        setThreadId(savedThreadId);
      });
    }
  }, [state.selectedFlow]);

  // biome-ignore lint: logging effect to debug thread initialization
  useEffect(() => {
    console.log('📋 useEffect check:', {
      threadId,
      isLoadingExistingThread,
      currentPhase: state.currentPhase,
      alreadyTriggered: triggeredThreadsRef.current.has(threadId || ''),
      messageCount: state.messages.length,
    });

    // Note: triggerInitialPhaseWorkflow is no longer needed with new phase structure
    // Extraction and workflow triggering is now handled manually via handleCreateRequestFlow
    // and via "Start Creating JD" button click handlers
  }, [threadId, isLoadingExistingThread, state.currentPhase]);

  const handleCreateRequestFlow = async (userInput: string) => {
    if (extractionPhase === 'initial-prompt') {
      try {
        setExtractionPhase('extracting');
        console.log('🔍 Extracting hiring request details...');

        const response = await fetch('/api/hiring/v1/requests/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ description: userInput }),
        });

        if (!response.ok) {
          throw new Error('Failed to extract details');
        }

        const data = (await response.json()) as { extracted: Record<string, unknown> };
        setExtractedData(data.extracted);

        const extracted = data.extracted as Record<string, unknown> & { missing_fields?: string[] };
        const missingFields = extracted.missing_fields || [];

        // Move to extracted phase after extraction
        actions.setPhase('hiring-request-extracted');

        // Update thread phase in database
        const currentThreadId = threadId || localStorage.getItem('currentThreadId');
        if (currentThreadId) {
          await fetch(`/api/hiring/v1/threads/${currentThreadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              current_phase: 'hiring-request-extracted',
            }),
          }).catch((e) => console.error('Failed to update thread phase:', e));
        }

        if (missingFields.length === 0) {
          setExtractionPhase('collected-summary');
          await showExtractedSummary(extracted);
        } else {
          setExtractionPhase('collected-summary');
          await showMissingFieldsPrompt(missingFields);
        }
      } catch (error) {
        console.error('Extraction error:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Failed to extract hiring details. Please try again.',
          type: 'text',
        });
        setExtractionPhase('initial-prompt');
      }
      actions.setLoading(false);
      return;
    }

    if (extractionPhase === 'collected-summary') {
      const missingField = (
        extractedData as Record<string, unknown> & { missing_fields?: string[] }
      ).missing_fields?.[0];
      if (missingField) {
        setExtractedData({
          ...extractedData,
          [missingField]: userInput,
          missing_fields: (
            extractedData as Record<string, unknown> & { missing_fields?: string[] }
          ).missing_fields?.slice(1),
        });

        const updated = {
          ...extractedData,
          [missingField]: userInput,
          missing_fields: (
            extractedData as Record<string, unknown> & { missing_fields?: string[] }
          ).missing_fields?.slice(1),
        };

        const remainingMissing = (
          updated as Record<string, unknown> & { missing_fields?: string[] }
        ).missing_fields;
        if (remainingMissing && remainingMissing.length > 0) {
          await showMissingFieldsPrompt(remainingMissing);
        } else {
          await showExtractedSummary(updated);
        }
      }
      actions.setLoading(false);
      return;
    }
  };

  const showMissingFieldsPrompt = async (missingFields: string[]) => {
    const nextField = missingFields[0];
    if (!nextField) return;

    const fieldLabels: Record<string, string> = {
      position_title: 'What is the position title?',
      team_name: 'Which team is this for?',
      team_description: 'Can you describe the team and what they do?',
      seniority_level: 'What seniority level? (Junior/Mid/Senior/Manager)',
      min_yoe: 'How many years of experience minimum? (e.g., 5)',
      headcount_requested: 'How many positions to fill?',
      salary_range: 'What is the salary range?',
      urgency_level: 'What is the urgency? (Low/Medium/High/Critical)',
      onboarding_timeline: 'When do you need them onboarded? (e.g., 4-6 weeks)',
      team_skill_gap_summary: 'What are the team skill gaps you want to fill?',
      key_deliverables: 'What are the key deliverables for this role?',
      business_justification: 'What is the business justification for this hire?',
      preferred_tech_stack: 'What technologies/stack do you prefer? (e.g., React, Node.js, AWS)',
      required_skills: 'What are the required skills?',
      nice_to_have_skills: 'What are nice-to-have skills?',
    };

    const label = fieldLabels[nextField] || `Tell me about ${nextField}:`;

    const assistantMsg = {
      role: 'assistant' as const,
      content: `I need a bit more information to complete your hiring request.\n\n**${label}**`,
      type: 'action' as const,
    };

    actions.addMessage(assistantMsg);

    // Save to database
    const savedThreadId = localStorage.getItem('currentThreadId');
    if (savedThreadId) {
      await fetch('/api/hiring/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: savedThreadId, ...assistantMsg }),
      }).catch((e) => console.error('Failed to save missing field prompt:', e));
    }
  };

  const showExtractedSummary = async (data: Record<string, unknown>) => {
    const responsibilities = Array.isArray(data.responsibilities)
      ? data.responsibilities.map((r) => `- ${r}`).join('\n')
      : data.key_deliverables || 'TBD';

    const techStack = Array.isArray(data.preferred_tech_stack)
      ? data.preferred_tech_stack.join(', ')
      : 'Not specified';

    const requiredSkills = Array.isArray(data.required_skills)
      ? data.required_skills.join(', ')
      : 'Not specified';

    const niceToHaveSkills = Array.isArray(data.nice_to_have_skills)
      ? data.nice_to_have_skills.join(', ')
      : 'Not specified';

    const yoeInfo =
      data.min_yoe || data.max_yoe
        ? `${data.min_yoe || '0'}${data.max_yoe ? `-${data.max_yoe}` : '+'} years`
        : 'Not specified';

    const summary = `
📋 HIRING_REQUEST_SUMMARY

**Position:** ${String(data.position_title) || 'TBD'}
**Team:** ${String(data.team_name) || 'TBD'}
**Headcount:** ${data.headcount_requested || 1}
**Seniority Level:** ${data.seniority_level || 'TBD'}
**Years of Experience:** ${yoeInfo}
**Urgency:** ${data.urgency_level || 'Medium'}
**Onboarding Timeline:** ${String(data.onboarding_timeline) || 'ASAP'}
**Salary Range:** ${data.salary_range || 'TBD'}

**Team Description:**
${String(data.team_description) || 'Not provided'}

**Responsibilities:**
${responsibilities}

**Required Skills:**
${requiredSkills}

**Nice-to-Have Skills:**
${niceToHaveSkills}

**Preferred Tech Stack:**
${techStack}

**Team Skill Gaps:**
${String(data.team_skill_gap_summary) || 'TBD'}

**Business Justification:**
${String(data.business_justification) || 'TBD'}
    `.trim();

    const summaryMsg = {
      role: 'assistant' as const,
      content: summary,
      type: 'action' as const,
    };

    actions.addMessage(summaryMsg);

    // Save summary message to database
    const savedThreadId = localStorage.getItem('currentThreadId');
    if (savedThreadId) {
      await fetch('/api/hiring/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: savedThreadId, ...summaryMsg }),
      }).catch((e) => console.error('Failed to save summary message:', e));
    }

    setExtractionPhase('completed');
  };

  const handleSend = async () => {
    if (!input.trim() || state.isLoading) return;

    actions.addMessage({
      role: 'user',
      content: input,
      type: 'text',
    });

    const userInput = input;
    setInput('');
    actions.setLoading(true);

    try {
      if (state.selectedRequestId === 'creating') {
        // Save user message to database during hiring request extraction
        const savedThreadId = localStorage.getItem('currentThreadId');
        if (savedThreadId) {
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              threadId: savedThreadId,
              role: 'user',
              content: userInput,
              type: 'text',
            }),
          }).catch((e) => console.error('Failed to save user message:', e));
        }

        if (extractionPhase === 'completed') {
          const userResponse = userInput.toLowerCase().trim();
          if (userResponse.includes('confirm') || userResponse === 'yes') {
            await saveHiringRequest(extractedData as Record<string, unknown>);
            return;
          } else if (userResponse.includes('change') || userResponse === 'no') {
            setExtractionPhase('initial-prompt');
            setExtractedData({});
            const assistantMsg = {
              role: 'assistant' as const,
              content:
                "No problem! Please describe your hiring request again, and I'll extract the details.",
              type: 'action' as const,
            };
            actions.addMessage(assistantMsg);

            // Save assistant message to database
            if (savedThreadId) {
              await fetch('/api/hiring/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ threadId: savedThreadId, ...assistantMsg }),
              }).catch((e) => console.error('Failed to save assistant message:', e));
            }

            actions.setLoading(false);
            return;
          }
        }

        await handleCreateRequestFlow(userInput);
        return;
      }

      const response = await fetch('/api/hiring/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          threadId,
          messages: [{ content: userInput }],
          requestId: state.selectedRequestId || 'REQ-001',
          phase: state.currentPhase,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', { status: response.status, body: errorText });
        throw new Error(`Chat failed: ${response.status} ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'complete') {
                assistantContent = data.content;
              }
            } catch (e) {
              console.error('Failed to parse SSE:', e);
            }
          }
        }
      }

      if (assistantContent) {
        actions.addMessage({
          role: 'assistant',
          content: assistantContent,
          type: 'action',
        });
      }

      const phaseSequence = ['jd-approval', 'cv-screening', 'confirmation', 'complete'] as const;
      const currentIndex = phaseSequence.indexOf(
        state.currentPhase as (typeof phaseSequence)[number],
      );
      const nextPhase = currentIndex >= 0 ? phaseSequence[currentIndex + 1] : undefined;
      if (nextPhase) {
        actions.setPhase(nextPhase as HiringChatState['currentPhase']);
      }
    } catch (error) {
      console.error('Chat error:', error);
      actions.addMessage({
        role: 'assistant',
        content: `❌ Error: ${String(error)}`,
        type: 'text',
      });
    } finally {
      actions.setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-hairline p-4">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your message..."
          disabled={state.isLoading}
          className="text-sm"
        />
        <Button onClick={handleSend} disabled={state.isLoading} size="sm" variant="primary">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
