'use client';

import { Button, Card } from '@seta/shared-ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export const Route = createFileRoute('/_authed/hiring/requests/')({
  component: RequestsPage,
});

interface HiringRequest {
  id: string;
  requestId: string;
  positionTitle: string;
  teamName: string;
  requestStatus: string;
  urgencyLevel: string;
  headcountRequested: number;
  createdAt: string;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    New: 'bg-gray-50 text-gray-700 border border-gray-200',
    'JD Draft': 'bg-blue-50 text-blue-700 border border-blue-200',
    'JD Approved': 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    'CV Screening': 'bg-purple-50 text-purple-700 border border-purple-200',
    'Shortlist Ready': 'bg-orange-50 text-orange-700 border border-orange-200',
    'In Progress': 'bg-cyan-50 text-cyan-700 border border-cyan-200',
    'On Hold': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    Completed: 'bg-green-50 text-green-700 border border-green-200',
    Closed: 'bg-red-50 text-red-700 border border-red-200',
  };
  return colors[status] || 'bg-gray-50 text-gray-700 border border-gray-200';
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'Completed':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'Pending Approval':
      return <AlertCircle className="h-4 w-4" />;
    case 'On Hold':
      return <Clock className="h-4 w-4" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
}

function getUrgencyColor(level: string) {
  const colors: Record<string, string> = {
    High: 'bg-red-100 text-red-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    Low: 'bg-green-100 text-green-700',
  };
  return colors[level] || 'bg-gray-100 text-gray-700';
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function RequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3000/hiring/v1/requests', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load requests');
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Load requests error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hiring Requests</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            View and manage all hiring requests for your team
          </p>
        </div>
        <Button variant="primary" size="md">
          New Request
        </Button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-ink-subtle">Total Requests</div>
          <div className="mt-2 text-2xl font-bold">{requests.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-ink-subtle">Ready to Start</div>
          <div className="mt-2 text-2xl font-bold">
            {
              requests.filter((r) => r.requestStatus === 'New' || r.requestStatus === 'JD Draft')
                .length
            }
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-ink-subtle">In Progress</div>
          <div className="mt-2 text-2xl font-bold">
            {
              requests.filter(
                (r) => r.requestStatus === 'CV Screening' || r.requestStatus === 'Shortlist Ready',
              ).length
            }
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-ink-subtle">Completed</div>
          <div className="mt-2 text-2xl font-bold">
            {requests.filter((r) => r.requestStatus === 'Completed').length}
          </div>
        </Card>
      </div>

      {/* Requests Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-ink-subtle">Loading requests...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-subtle">
            No hiring requests yet. Start by creating a new one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-surface-1">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Request ID</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Position</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Team</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Urgency</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Created</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-surface-1">
                    <td className="px-6 py-4 text-sm font-medium text-ink">{request.requestId}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-medium text-ink">{request.positionTitle}</div>
                        <div className="text-xs text-ink-subtle">
                          {request.headcountRequested} headcount
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-subtle">{request.teamName}</td>
                    <td className="px-6 py-4">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(request.requestStatus)}`}
                      >
                        {getStatusIcon(request.requestStatus)}
                        {request.requestStatus}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getUrgencyColor(request.urgencyLevel)}`}
                      >
                        {request.urgencyLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-subtle">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => navigate({ to: `./${request.requestId}` })}
                        className="flex items-center gap-1 rounded px-3 py-1 text-sm text-primary hover:bg-primary/10"
                      >
                        View
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
