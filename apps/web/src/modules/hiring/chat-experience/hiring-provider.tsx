'use client';

import { createContext, useCallback, useContext, useState } from 'react';

export interface HiringMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'action' | 'result';
  metadata?: Record<string, unknown>;
}

export interface HiringChatState {
  messages: HiringMessage[];
  isLoading: boolean;
  currentPhase:
    | 'selection'
    | 'initial'
    | 'jd-creation'
    | 'jd-approval'
    | 'cv-screening'
    | 'confirmation'
    | 'complete';
  selectedFlow?: 'jd-draft' | 'cv-shortlist';
  selectedRequestId?: string;
  selectedJobId?: string;
  historyLoading: boolean;
}

interface HiringContextType {
  state: HiringChatState;
  actions: {
    addMessage: (message: Omit<HiringMessage, 'id' | 'timestamp'>) => void;
    setMessages: (messages: Omit<HiringMessage, 'id' | 'timestamp'>[]) => void;
    setLoading: (loading: boolean) => void;
    setPhase: (phase: HiringChatState['currentPhase']) => void;
    setSelectedFlow: (flow: 'jd-draft' | 'cv-shortlist') => void;
    setSelectedRequest: (requestId: string | undefined) => void;
    setSelectedJob: (jobId: string | undefined) => void;
    clearMessages: () => void;
  };
}

const HiringContext = createContext<HiringContextType | undefined>(undefined);

export function HiringProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HiringChatState>({
    messages: [],
    isLoading: false,
    currentPhase: 'selection',
    historyLoading: false,
  });

  const addMessage = useCallback((message: Omit<HiringMessage, 'id' | 'timestamp'>) => {
    const newMessage: HiringMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));
  }, []);

  const setMessages = useCallback((messages: Omit<HiringMessage, 'id' | 'timestamp'>[]) => {
    const newMessages: HiringMessage[] = messages.map((msg, idx) => ({
      ...msg,
      id: `msg-${idx}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    }));
    setState((prev) => ({
      ...prev,
      messages: newMessages,
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isLoading: loading }));
  }, []);

  const setPhase = useCallback((phase: HiringChatState['currentPhase']) => {
    setState((prev) => ({ ...prev, currentPhase: phase }));
  }, []);

  const setSelectedFlow = useCallback((flow: 'jd-draft' | 'cv-shortlist') => {
    setState((prev) => ({
      ...prev,
      selectedFlow: flow,
      currentPhase: 'initial',
    }));
  }, []);

  const setSelectedRequest = useCallback((requestId: string | undefined) => {
    setState((prev) => ({ ...prev, selectedRequestId: requestId }));
  }, []);

  const setSelectedJob = useCallback((jobId: string | undefined) => {
    setState((prev) => ({ ...prev, selectedJobId: jobId }));
  }, []);

  const clearMessages = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [],
      currentPhase: 'selection',
      selectedFlow: undefined,
      selectedRequestId: undefined,
      selectedJobId: undefined,
    }));
  }, []);

  const value: HiringContextType = {
    state,
    actions: {
      addMessage,
      setMessages,
      setLoading,
      setPhase,
      setSelectedFlow,
      setSelectedRequest,
      setSelectedJob,
      clearMessages,
    },
  };

  return <HiringContext.Provider value={value}>{children}</HiringContext.Provider>;
}

export function useHiringChat() {
  const context = useContext(HiringContext);
  if (!context) {
    throw new Error('useHiringChat must be used within HiringProvider');
  }
  return context;
}
