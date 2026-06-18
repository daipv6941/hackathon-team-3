'use client';

import { Button, Input } from '@seta/shared-ui';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useHiringChat } from './hiring-provider';

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
  const [searchQuery, setSearchQuery] = useState('');

  const loadThreads = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3000/hiring/v1/threads', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load threads');
      const data = await response.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error('Load threads error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load threads on mount
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Reload threads when new thread is created
  useEffect(() => {
    const handleThreadCreated = () => {
      loadThreads();
    };

    window.addEventListener('hiring:thread-created', handleThreadCreated);
    return () => window.removeEventListener('hiring:thread-created', handleThreadCreated);
  }, [loadThreads]);

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
      const response = await fetch(`http://localhost:3000/hiring/v1/threads/${threadId}`, {
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
      const response = await fetch(`http://localhost:3000/hiring/v1/threads/${thread.id}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load thread');
      const data = await response.json();

      // Load thread data
      actions.setSelectedRequest(thread.request_id);
      actions.setPhase(thread.current_phase as any);

      // Load messages
      interface MessageData {
        role: string;
        content: string;
        type?: string;
      }
      const messages = (data.messages || []).map((msg: MessageData) => ({
        role: msg.role,
        content: msg.content,
        type: msg.type || 'text',
      }));

      actions.setMessages(messages);
      // Store current thread ID in state (you may need to add this to provider)
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
    <div className="flex h-full flex-col border-r border-hairline bg-surface-1">
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
      <div className="min-w-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-xs text-ink-subtle">Loading...</div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-subtle">
            {threads.length === 0 ? 'No threads yet' : 'No matching threads'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className={`group rounded-lg transition-colors ${
                  currentThreadId === thread.id ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectThread(thread)}
                  className={`w-full flex flex-col items-start gap-1 px-3 py-2 text-left text-xs ${
                    currentThreadId === thread.id ? 'text-ink' : 'text-ink-subtle'
                  }`}
                >
                  <div className="flex w-full items-center gap-2">
                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate font-medium flex-1">{thread.title}</span>
                    <span className="text-xs text-ink-subtler flex-shrink-0">
                      {formatDate(thread.created_at)}
                    </span>
                  </div>
                  <div className="pl-5 text-xs text-ink-subtler">
                    {thread.request_id} • {thread.current_phase}
                  </div>
                </button>

                {/* Delete button on hover */}
                <div className="hidden group-hover:flex items-center justify-end gap-1 px-2 pb-1">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteThread(thread.id, e)}
                    className="p-1 rounded hover:bg-surface-3 text-ink-subtler hover:text-ink transition-colors"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
