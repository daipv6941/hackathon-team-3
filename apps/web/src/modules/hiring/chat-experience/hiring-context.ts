'use client';

import { createContext } from 'react';

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
    | 'request-selection'
    | 'hiring-request-creation'
    | 'hiring-request-extracted'
    | 'hiring-request-confirming'
    | 'request-selected'
    | 'jd-generation'
    | 'jd-approval'
    | 'cv-screening'
    | 'confirmation'
    | 'complete';
  selectedFlow?: 'jd-draft' | 'cv-shortlist';
  selectedRequestId?: string;
  selectedJobId?: string;
  currentThreadId?: string;
  historyLoading: boolean;
}

export interface HiringContextType {
  state: HiringChatState;
  actions: {
    addMessage: (message: Omit<HiringMessage, 'id' | 'timestamp'>) => void;
    setMessages: (messages: Omit<HiringMessage, 'id' | 'timestamp'>[]) => void;
    setLoading: (loading: boolean) => void;
    setPhase: (phase: HiringChatState['currentPhase']) => void;
    setSelectedFlow: (flow: 'jd-draft' | 'cv-shortlist') => void;
    setSelectedRequest: (requestId: string | undefined) => void;
    setSelectedJob: (jobId: string | undefined) => void;
    setCurrentThread: (threadId: string | undefined) => void;
    clearMessages: () => void;
  };
}

export const HiringContext = createContext<HiringContextType | undefined>(undefined);
