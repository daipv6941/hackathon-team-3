'use client';

import { Button, Input } from '@seta/shared-ui';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useHiringChat } from './use-hiring-chat';

interface Thread {
  id: string;
  title: string;
  request_id: string;
  current_phase: string;
  created_at: string;
}

export function ThreadList() {
  const { actions } = useHiringChat();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [limit] = useState(10);
  const loadedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadThreads = async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const currentOffset = loadMore ? offset + limit : 0;
      const response = await fetch(
        `/api/hiring/v1/threads?limit=${limit}&offset=${currentOffset}`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      if (!response.ok) throw new Error('Failed to load threads');
      const data = await response.json();
      const newThreads = data.threads || [];

      if (loadMore) {
        setThreads((prev) => [...prev, ...newThreads]);
        setOffset(currentOffset);
      } else {
        setThreads(newThreads);
        setOffset(0);
      }

      setHasMore(newThreads.length === limit);
    } catch (error) {
      console.error('Load threads error:', error);
    } finally {
      if (loadMore) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  // Load threads on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-based initialization pattern
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadThreads(false);
  }, []);

  // Reload threads when new thread is created
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadThreads called in event handler
  useEffect(() => {
    const handleThreadCreated = () => {
      loadThreads(false);
    };

    window.addEventListener('hiring:thread-created', handleThreadCreated);
    return () => window.removeEventListener('hiring:thread-created', handleThreadCreated);
  }, []);

  // Handle infinite scroll
  const handleScroll = () => {
    if (!scrollContainerRef.current || isLoadingMore || !hasMore) return;

    const element = scrollContainerRef.current;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;

    if (isNearBottom) {
      loadThreads(true);
    }
  };

  const handleCreateNew = () => {
    actions.clearMessages();
    localStorage.removeItem('currentThreadId');
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger thread selection

    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/hiring/v1/threads/${threadId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete thread');

      // Remove from list
      setThreads(threads.filter((t) => t.id !== threadId));

      // If this was the current thread, clear the view
      const currentThreadId = localStorage.getItem('currentThreadId');
      if (currentThreadId === threadId) {
        actions.clearMessages();
        localStorage.removeItem('currentThreadId');
      }
    } catch (error) {
      console.error('Delete thread error:', error);
      alert('Failed to delete conversation');
    }
  };

  const handleSelectThread = async (thread: Thread) => {
    try {
      const response = await fetch(`/api/hiring/v1/threads/${thread.id}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load thread');
      const data = await response.json();

      // Load thread data with metadata
      const threadData = data.thread || {};
      const metadata = (threadData.metadata as Record<string, unknown>) || {};
      const flow = metadata.flow as string | undefined;

      if (flow) {
        actions.setSelectedFlow(flow as 'jd-draft' | 'cv-shortlist');
        localStorage.setItem('selectedFlow', flow);
      }

      if (thread.request_id) {
        actions.setSelectedRequest(thread.request_id);
        localStorage.setItem('selectedRequestId', thread.request_id);
      }

      const validPhases = [
        'selection',
        'request-selection',
        'hiring-request-creation',
        'hiring-request-extracted',
        'hiring-request-confirming',
        'request-selected',
        'jd-generation',
        'jd-approval',
        'cv-screening',
        'confirmation',
        'complete',
      ] as const;
      type ValidPhase = (typeof validPhases)[number];
      const isValidPhase = (value: unknown): value is ValidPhase => {
        return typeof value === 'string' && validPhases.includes(value as ValidPhase);
      };
      const phase: ValidPhase = isValidPhase(thread.current_phase)
        ? (thread.current_phase as ValidPhase)
        : 'selection';
      actions.setPhase(phase);

      // Load messages
      interface MessageData {
        role: string;
        content: string;
        type?: string;
        thinking_content?: string;
        metadata?: Record<string, unknown>;
      }
      const messages = (data.messages || []).map((msg: MessageData) => ({
        role: msg.role,
        content: msg.content,
        type: msg.type || 'text',
        ...(msg.thinking_content && { thinkingContent: msg.thinking_content }),
        ...(msg.metadata && { metadata: msg.metadata }),
      }));

      actions.setMessages(messages);
      localStorage.setItem('currentThreadId', thread.id);
    } catch (error) {
      console.error('Load thread error:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredThreads = threads.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.request_id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentThreadId = localStorage.getItem('currentThreadId');

  return (
    <div className="flex h-full w-80 flex-col border-r border-hairline bg-surface-1">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline p-4">
        <h2 className="text-sm font-semibold text-ink">Chat</h2>
      </div>

      {/* New Button */}
      <div className="p-4 pt-3">
        <Button onClick={handleCreateNew} size="sm" className="w-full gap-2" variant="primary">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <Input
          placeholder="Search threads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="sm"
          className="text-xs"
        />
      </div>

      {/* Threads List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <div className="p-4 text-xs text-ink-subtle">Loading...</div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-subtle">
            {threads.length === 0 ? 'No threads yet' : 'No matching threads'}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 p-2">
              {filteredThreads.map((thread) => (
                <div
                  key={thread.id}
                  className={`group rounded-lg transition-colors overflow-hidden ${
                    currentThreadId === thread.id ? 'bg-surface-2' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => handleSelectThread(thread)}
                      className={`flex-1 min-w-0 flex flex-col items-start gap-1 px-3 py-2 text-left text-xs cursor-pointer ${
                        currentThreadId === thread.id ? 'text-ink' : 'text-ink-subtle'
                      }`}
                    >
                      <div className="flex w-full items-center gap-2 min-w-0">
                        <MessageSquare className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate font-medium flex-1">{thread.title}</span>
                        <span className="text-xs text-ink-subtler flex-shrink-0 whitespace-nowrap">
                          {formatDate(thread.created_at)}
                        </span>
                      </div>
                      <div className="pl-5 text-xs text-ink-subtler truncate w-full">
                        {thread.request_id} • {thread.current_phase}
                      </div>
                    </button>

                    {/* Delete button slides in from right */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteThread(thread.id, e)}
                      className="flex items-center justify-center px-2 transform translate-x-full group-hover:translate-x-0 transition-transform duration-200 ease-out text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-r cursor-pointer"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Loading indicator for infinite scroll */}
            {isLoadingMore && (
              <div className="p-4 text-center text-xs text-ink-subtle">Loading more...</div>
            )}

            {/* End of list message */}
            {!hasMore && threads.length > 0 && (
              <div className="p-4 text-center text-xs text-ink-subtler">No more conversations</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
