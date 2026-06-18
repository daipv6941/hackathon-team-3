'use client';

import { Button, Input } from '@seta/shared-ui';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHiringChat } from './hiring-provider';

const FORM_FIELDS = [
  'position_title',
  'team_name',
  'seniority_level',
  'headcount',
  'salary_range',
  'team_skill_gap_summary',
  'key_deliverables',
  'business_justification',
] as const;

type FormField = (typeof FORM_FIELDS)[number];
type NewRequestData = Record<FormField, string>;

export function HiringComposer() {
  const { state, actions } = useHiringChat();
  const [input, setInput] = useState('');
  const [newRequestData, setNewRequestData] = useState<Partial<NewRequestData>>({});
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoadingExistingThread, setIsLoadingExistingThread] = useState(false);
  const triggeredThreadsRef = useRef<Set<string>>(new Set());

  const triggerInitialPhaseWorkflow = useCallback(
    async (tid: string, requestData?: Partial<NewRequestData>) => {
      actions.setLoading(true);
      console.log('🎬 triggerInitialPhaseWorkflow called with:', {
        tid,
        selectedRequestId: state.selectedRequestId,
      });

      try {
        console.log('📡 Calling POST /hiring/v1/chat...');
        const response = await fetch('http://localhost:3000/hiring/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            threadId: tid,
            messages: [{ content: 'Start JD creation' }],
            requestId: state.selectedRequestId,
            phase: 'initial',
            // Pass new request data if this is a newly created request
            ...(requestData && Object.keys(requestData).length > 0 && { newRequest: requestData }),
          }),
        });

        if (!response.ok) {
          console.error('❌ API returned error:', response.status);
          throw new Error('Failed to start workflow');
        }

        console.log('✅ API call successful, reading stream...');

        // Handle streaming SSE response
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        const thinkingBlocks: string[] = [];
        let completedContent = '';

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

                if (data.type === 'thinking') {
                  thinkingBlocks.push(data.content);
                } else if (data.type === 'complete') {
                  completedContent = data.content;
                }
              } catch (e) {
                console.error('Failed to parse SSE:', e);
              }
            }
          }
        }

        // Show final JD with score + action buttons
        if (completedContent) {
          actions.addMessage({
            role: 'assistant',
            content: completedContent,
            type: 'action',
          });
          // Don't auto-advance phase - let user approve/polish/revise first
        }
      } catch (error) {
        console.error('Workflow error:', error);
        actions.addMessage({
          role: 'assistant',
          content: '❌ Error starting JD creation. Please try again.',
          type: 'text',
        });
      } finally {
        actions.setLoading(false);
      }
    },
    [state.selectedRequestId, actions],
  );

  const createThread = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3000/hiring/v1/threads', {
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

      // Reload threads list in sidebar (broadcast event)
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

  // Create thread only when STARTING a new conversation (not loading existing)
  useEffect(() => {
    console.log('🔍 Thread creation check:', {
      currentPhase: state.currentPhase,
      selectedRequestId: state.selectedRequestId,
      threadId,
      isLoadingExistingThread,
      shouldCreate:
        state.currentPhase === 'initial' &&
        state.selectedRequestId &&
        state.selectedRequestId !== 'creating' &&
        !threadId &&
        !isLoadingExistingThread,
    });

    if (
      state.currentPhase === 'initial' &&
      state.selectedRequestId &&
      state.selectedRequestId !== 'creating' &&
      !threadId &&
      !isLoadingExistingThread // Only create if NOT loading an existing thread
    ) {
      console.log('✅ Creating thread for request:', state.selectedRequestId);
      createThread();
    }
  }, [
    state.selectedRequestId,
    state.currentPhase,
    isLoadingExistingThread,
    createThread,
    threadId,
  ]);

  // Reset thread when request changes (starting new workflow)
  useEffect(() => {
    if (state.selectedRequestId && state.selectedRequestId !== 'creating') {
      console.log('🔄 Request changed, resetting thread:', state.selectedRequestId);
      setThreadId(null);
      setIsLoadingExistingThread(false);
    }
  }, [state.selectedRequestId]);

  // Auto-trigger API call ONLY after CREATING a new thread (not loading existing)
  useEffect(() => {
    if (
      threadId &&
      !isLoadingExistingThread &&
      state.currentPhase === 'initial' &&
      !triggeredThreadsRef.current.has(threadId)
    ) {
      // Only trigger if we just created a new thread (not loading existing one) and haven't already
      console.log('🚀 Triggering workflow for thread:', threadId);
      triggeredThreadsRef.current.add(threadId);
      triggerInitialPhaseWorkflow(threadId, newRequestData);
    }
  }, [
    threadId,
    isLoadingExistingThread,
    state.currentPhase,
    newRequestData,
    triggerInitialPhaseWorkflow,
  ]);

  // Check if we're loading an existing thread (from sidebar click)
  useEffect(() => {
    const savedThreadId = localStorage.getItem('currentThreadId');
    if (savedThreadId && savedThreadId !== threadId && !isLoadingExistingThread) {
      // We're loading an existing thread from sidebar
      setIsLoadingExistingThread(true);
      setThreadId(savedThreadId);
    }
  }, [threadId, isLoadingExistingThread]);

  const handleCreateRequestFlow = (userInput: string) => {
    const currentField = FORM_FIELDS[currentFieldIndex];
    if (!currentField) return;

    // Store the answer
    const updated = { ...newRequestData, [currentField]: userInput };
    setNewRequestData(updated);

    // Show next question or finish
    if (currentFieldIndex < FORM_FIELDS.length - 1) {
      const nextField = FORM_FIELDS[currentFieldIndex + 1];
      const fieldLabels: Record<FormField, string> = {
        position_title: 'What is the position title?',
        team_name: 'Which team is this for?',
        seniority_level: 'What seniority level? (Junior/Mid/Senior)',
        headcount: 'How many positions to fill?',
        salary_range: 'What is the salary range? (e.g., $1500-$2500)',
        team_skill_gap_summary: 'What are the team skill gaps?',
        key_deliverables: 'What are the key deliverables for this role?',
        business_justification: 'What is the business justification for this hire?',
      };

      const nextLabel = nextField ? fieldLabels[nextField] : 'Next step...';

      actions.addMessage({
        role: 'assistant',
        content: `✅ Got it: ${userInput}\n\n**${nextLabel}**`,
        type: 'action',
      });

      setCurrentFieldIndex(currentFieldIndex + 1);
    } else {
      // All fields collected - create request
      const newRequestId = `REQ-${String(Math.random()).slice(2, 6)}`;
      const positionTitle = updated.position_title || 'New Position';
      const teamName = updated.team_name || 'Engineering';
      const seniority = updated.seniority_level || 'Mid';
      const headcount = updated.headcount || '1';
      const salary = updated.salary_range || 'Competitive';

      actions.addMessage({
        role: 'assistant',
        content: `✅ Perfect! I've created **${newRequestId}** with all the details.\n\n📋 **${positionTitle}** for **${teamName}**\n- Seniority: ${seniority}\n- Headcount: ${headcount}\n- Salary: ${salary}\n\nNow let me fetch business context and start the JD creation process...`,
        type: 'action',
      });

      // Set the new request as selected and proceed
      actions.setSelectedRequest(newRequestId);
      setCurrentFieldIndex(0);
      setNewRequestData({});
      actions.setPhase('initial');
    }

    actions.setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || state.isLoading) return;

    // Add user message
    actions.addMessage({
      role: 'user',
      content: input,
      type: 'text',
    });

    const userInput = input;
    setInput('');
    actions.setLoading(true);

    try {
      // Check if user is creating a new hiring request
      if (state.selectedRequestId === 'creating') {
        // Handle conversational form for new request creation
        handleCreateRequestFlow(userInput);
        return;
      }

      // Call real backend API with thread context
      const response = await fetch('http://localhost:3000/hiring/v1/chat', {
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

      // Handle streaming SSE response
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

      // Auto-advance phase
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
        content: 'Sorry, there was an error. Please try again.',
        type: 'text',
      });
    } finally {
      actions.setLoading(false);
    }
  };

  return (
    <div className="border-t border-hairline bg-surface-0 p-4">
      <div className="flex gap-2">
        <Input
          placeholder={
            state.isLoading ? 'Waiting for response...' : 'Message the hiring assistant...'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={state.isLoading}
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || state.isLoading}
          size="sm"
          className="gap-2"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        💡 Tip: The assistant will guide you through each step of the hiring process. You can ask
        questions or provide clarifications anytime.
      </p>
    </div>
  );
}
