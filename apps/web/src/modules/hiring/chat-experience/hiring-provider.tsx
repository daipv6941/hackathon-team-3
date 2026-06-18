'use client';

import { useCallback, useState } from 'react';
import {
  type HiringChatState,
  HiringContext,
  type HiringContextType,
  type HiringMessage,
} from './hiring-context';

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
