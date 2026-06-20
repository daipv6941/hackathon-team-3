'use client';

import { Button, Input } from '@seta/shared-ui';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHiringChat } from './use-hiring-chat';

type NewRequestData = Record<string, string>;

export function HiringComposer() {
  const { state, actions } = useHiringChat();
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoadingExistingThread, setIsLoadingExistingThread] = useState(false);
  const triggeredThreadsRef = useRef<Set<string>>(new Set());
  const prevPhaseRef = useRef<string | null>(null);
  const loadedFlowRef = useRef<string | null>(null);
  const prevThreadIdRef = useRef<string | null>(null);
  const [extractionPhase, setExtractionPhase] = useState<
    'initial-prompt' | 'extracting' | 'collected-summary' | 'completed'
  >('initial-prompt');
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>({});

  const triggerInitialPhaseWorkflow = useCallback(
    async (tid: string, requestData?: Partial<NewRequestData>) => {
      console.log('🎬 triggerInitialPhaseWorkflow called with:', {
        tid,
        selectedRequestId: state.selectedRequestId,
      });
      actions.setLoading(true);

      try {
        console.log('📡 Calling POST /api/hiring/v1/chat...');
        const response = await fetch('/api/hiring/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            threadId: tid,
            messages: [{ content: 'Start JD creation' }],
            requestId: state.selectedRequestId,
            phase: 'initial',
            ...(requestData && Object.keys(requestData).length > 0 && { newRequest: requestData }),
          }),
        });

        if (!response.ok) {
          console.error('❌ API returned error:', response.status);
          throw new Error('Failed to start workflow');
        }

        console.log('✅ API call successful, reading stream...');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        const messages: Array<{
          role: string;
          content: string;
          type: string;
          metadata?: Record<string, unknown>;
        }> = [];

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
                console.log('📨 Received message:', {
                  type: data.type,
                  hasContent: !!data.content,
                });

                // Collect messages from stream (action: JD, result: scoring)
                if (data.type === 'action' || data.type === 'result') {
                  messages.push({
                    role: 'assistant',
                    content: data.content,
                    type: data.type,
                    metadata: data.metadata,
                  });
                }
              } catch (e) {
                console.error('Failed to parse SSE:', e);
              }
            }
          }
        }

        // Add both messages to state and save to database
        for (const msg of messages) {
          console.log(`✅ Adding ${msg.type} message to state`);
          actions.addMessage(
            msg as {
              role: 'user' | 'assistant';
              content: string;
              type?: 'text' | 'action' | 'result';
              metadata?: Record<string, unknown>;
            },
          );

          // Save message to database
          await fetch('/api/hiring/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threadId: tid, ...msg }),
          }).catch((e) => console.error(`Failed to save ${msg.type} message:`, e));
        }
      } catch (error) {
        console.error('Workflow error:', error);
        const errorMessage = {
          role: 'assistant' as const,
          content: '❌ Error starting JD creation. Please try again.',
          type: 'text' as const,
        };
        actions.addMessage(errorMessage);

        // Save error message to database
        await fetch('/api/hiring/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ threadId: tid, ...errorMessage }),
        }).catch((e) => console.error('Failed to save error message:', e));
      } finally {
        actions.setLoading(false);
      }
    },
    [state.selectedRequestId, actions],
  );

  const createThread = useCallback(async () => {
    try {
      const response = await fetch('/api/hiring/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create thread');
      const data = await response.json();
      setThreadId(data.threadId);

      window.dispatchEvent(new Event('hiring:thread-created'));
    } catch (error) {
      console.error('Create thread error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to create conversation thread. Please try again.',
        type: 'text',
      });
    }
  }, [state.selectedRequestId, actions]);

  const saveHiringRequest = useCallback(
    async (data: Record<string, unknown>) => {
      try {
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
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save hiring request');
        }

        const result = (await response.json()) as { requestId?: string };
        const requestId = result.requestId;

        console.log(`✅ Hiring request ${requestId} saved successfully`);

        actions.addMessage({
          role: 'assistant',
          content: `✅ Perfect! I've saved your hiring request **${requestId}**.\n\nWould you like me to start creating the job description now?`,
          type: 'action',
        });

        if (requestId) {
          actions.setSelectedRequest(requestId);
        }

        setExtractionPhase('initial-prompt');
        setExtractedData({});
      } catch (error) {
        console.error('❌ Save error:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Failed to save the hiring request. Please try again.',
          type: 'text',
        });
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

  useEffect(() => {
    if (
      state.currentPhase === 'initial' &&
      state.selectedRequestId &&
      state.selectedRequestId !== 'creating' &&
      !threadId &&
      !isLoadingExistingThread
    ) {
      console.log('✅ Creating thread for request:', state.selectedRequestId);
      queueMicrotask(() => createThread());
    }
  }, [
    state.currentPhase,
    state.selectedRequestId,
    threadId,
    isLoadingExistingThread,
    createThread,
  ]);

  useEffect(() => {
    if (
      state.selectedRequestId &&
      state.selectedRequestId !== 'creating' &&
      state.currentPhase !== 'initial' &&
      prevPhaseRef.current === 'initial'
    ) {
      console.log('🔄 Request changed, resetting thread:', state.selectedRequestId);
      setThreadId(null);
      setIsLoadingExistingThread(false);
    }
    prevPhaseRef.current = state.currentPhase;
  }, [state.selectedRequestId, state.currentPhase]);

  useEffect(() => {
    console.log('📋 useEffect check:', {
      threadId,
      isLoadingExistingThread,
      currentPhase: state.currentPhase,
      alreadyTriggered: triggeredThreadsRef.current.has(threadId || ''),
      messageCount: state.messages.length,
    });

    // Only trigger workflow for NEW threads (created in this session)
    // Don't retrigger for existing threads loaded from database
    if (
      threadId &&
      !isLoadingExistingThread &&
      state.currentPhase === 'initial' &&
      !triggeredThreadsRef.current.has(threadId) &&
      state.messages.length > 0 && // Has at least initial messages
      !state.messages.some((m) => m.content.includes('## ')) // No JD exists yet
    ) {
      console.log('🚀 Triggering workflow for thread:', threadId);
      triggeredThreadsRef.current.add(threadId);
      triggerInitialPhaseWorkflow(threadId, extractedData as Record<string, string>);
    }
  }, [
    threadId,
    isLoadingExistingThread,
    state.currentPhase,
    extractedData,
    triggerInitialPhaseWorkflow,
    state.messages,
  ]);

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

        if (missingFields.length === 0) {
          setExtractionPhase('collected-summary');
          showExtractedSummary(extracted);
        } else {
          setExtractionPhase('collected-summary');
          showMissingFieldsPrompt(missingFields);
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
          showMissingFieldsPrompt(remainingMissing);
        } else {
          showExtractedSummary(updated);
        }
      }
      actions.setLoading(false);
      return;
    }
  };

  const showMissingFieldsPrompt = (missingFields: string[]) => {
    const nextField = missingFields[0];
    if (!nextField) return;

    const fieldLabels: Record<string, string> = {
      position_title: 'What is the position title?',
      team_name: 'Which team is this for?',
      seniority_level: 'What seniority level? (Junior/Mid/Senior)',
      headcount_requested: 'How many positions to fill?',
      salary_range: 'What is the salary range? (e.g., $1500-$2500)',
      team_skill_gap_summary: 'What are the team skill gaps?',
      key_deliverables: 'What are the key deliverables for this role?',
      business_justification: 'What is the business justification for this hire?',
    };

    const label = fieldLabels[nextField] || `Tell me about ${nextField}:`;

    actions.addMessage({
      role: 'assistant',
      content: `I need a bit more information to complete your hiring request.\n\n**${label}**`,
      type: 'action',
    });
  };

  const showExtractedSummary = (data: Record<string, unknown>) => {
    const summary = `
📋 HIRING_REQUEST_SUMMARY

**Position:** ${String(data.position_title) || 'TBD'}
**Team:** ${String(data.team_name) || 'TBD'}
**Headcount:** ${data.headcount_requested || 1}
**Seniority Level:** ${data.seniority_level || 'TBD'}
**Urgency:** ${data.urgency_level || 'Medium'}
**Salary Range:** ${data.salary_range || 'TBD'}

**Key Deliverables:**
${data.key_deliverables || 'TBD'}

**Business Justification:**
${data.business_justification || 'TBD'}

**Team Skill Gaps:**
${data.team_skill_gap_summary || 'TBD'}
    `.trim();

    actions.addMessage({
      role: 'assistant',
      content: summary,
      type: 'action',
    });

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
        if (extractionPhase === 'completed') {
          const userResponse = userInput.toLowerCase().trim();
          if (userResponse.includes('confirm') || userResponse === 'yes') {
            await saveHiringRequest(extractedData as Record<string, unknown>);
            return;
          } else if (userResponse.includes('change') || userResponse === 'no') {
            setExtractionPhase('initial-prompt');
            setExtractedData({});
            actions.addMessage({
              role: 'assistant',
              content:
                "No problem! Please describe your hiring request again, and I'll extract the details.",
              type: 'action',
            });
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

      const phaseSequence = [
        'initial',
        'jd-creation',
        'jd-approval',
        'cv-screening',
        'confirmation',
        'complete',
      ];
      const currentIndex = phaseSequence.indexOf(state.currentPhase);
      if (currentIndex < phaseSequence.length - 1) {
        actions.setPhase(
          phaseSequence[currentIndex + 1] as
            | 'initial'
            | 'jd-creation'
            | 'jd-approval'
            | 'cv-screening'
            | 'confirmation'
            | 'complete',
        );
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
