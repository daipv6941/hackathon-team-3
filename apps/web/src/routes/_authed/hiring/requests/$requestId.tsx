'use client';

import { Card } from '@seta/shared-ui';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Edit2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export const Route = createFileRoute('/_authed/hiring/requests/$requestId')({
  component: RequestDetailPage,
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
  businessJustification?: string;
  teamSkillGap?: string;
  keyDeliverables?: string;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  New: ['JD Draft', 'Closed'],
  'JD Draft': ['JD Approved', 'On Hold', 'Closed'],
  'JD Approved': ['CV Screening', 'On Hold', 'Closed'],
  'CV Screening': ['Shortlist Ready', 'On Hold', 'Closed'],
  'Shortlist Ready': ['In Progress', 'On Hold', 'Closed'],
  'In Progress': ['Completed', 'On Hold', 'Closed'],
  'On Hold': ['New', 'JD Draft', 'CV Screening', 'In Progress', 'Closed'],
  Completed: [],
  Closed: ['New', 'On Hold'],
};

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
      return <CheckCircle2 className="h-5 w-5" />;
    case 'Pending Approval':
      return <AlertCircle className="h-5 w-5" />;
    case 'On Hold':
      return <Clock className="h-5 w-5" />;
    default:
      return <Zap className="h-5 w-5" />;
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function RequestDetailPage() {
  const { requestId } = useParams({ from: '/_authed/hiring/requests/$requestId' });
  const navigate = useNavigate();
  const [request, setRequest] = useState<HiringRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('Loading request:', requestId);
      const response = await fetch('http://localhost:3000/hiring/v1/requests', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load requests');
      const data = await response.json();

      const found = (data.requests || []).find((r: HiringRequest) => r.requestId === requestId);
      console.log('Found request:', found);
      if (found) {
        setRequest(found);
        setSelectedStatus(found.requestStatus);
      } else {
        console.warn('Request not found:', requestId);
      }
    } catch (error) {
      console.error('Load request error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const handleStatusChange = async (newStatus: string) => {
    if (!request) return;

    try {
      setIsUpdating(true);
      console.log(`Updating request ${request.requestId} status to ${newStatus}`);

      const response = await fetch(
        `http://localhost:3000/hiring/v1/requests/${request.requestId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ status: newStatus }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      const data = await response.json();
      console.log('Status updated:', data);

      // Update local state after successful API call
      setRequest({ ...request, requestStatus: newStatus });
      setSelectedStatus(newStatus);
      setShowStatusMenu(false);
    } catch (error) {
      console.error('Update status error:', error);
      alert('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-sm text-ink-subtle">Loading...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-4 p-6">
        <button
          type="button"
          onClick={() => navigate({ to: '..' })}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Requests
        </button>
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-subtle">Request not found</p>
        </Card>
      </div>
    );
  }

  const availableTransitions = STATUS_TRANSITIONS[request.requestStatus] || [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <button
          type="button"
          onClick={() => navigate({ to: '..' })}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Requests
        </button>

        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{request.positionTitle}</h1>
            <p className="mt-2 text-sm text-ink-subtle">{request.requestId}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-subtle">Current Status</h2>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${getStatusColor(request.requestStatus)}`}
                  >
                    {getStatusIcon(request.requestStatus)}
                    {request.requestStatus}
                  </div>
                </div>
              </div>

              {availableTransitions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm font-medium hover:bg-surface-2"
                    disabled={isUpdating}
                  >
                    <Edit2 className="h-4 w-4" />
                    Change Status
                  </button>

                  {showStatusMenu && (
                    <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-hairline bg-white shadow-lg">
                      {availableTransitions.map((status) => (
                        <button
                          type="button"
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className={`block w-full px-4 py-2 text-left text-sm hover:bg-surface-1 first:rounded-t-lg last:rounded-b-lg ${
                            selectedStatus === status ? 'bg-primary/10 text-primary' : ''
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Details</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-ink-subtle">Team</label>
                <p className="mt-1 text-sm">{request.teamName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-ink-subtle">Headcount</label>
                  <p className="mt-1 text-sm">{request.headcountRequested}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-ink-subtle">Urgency</label>
                  <p className="mt-1 text-sm">{request.urgencyLevel}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-subtle">Created</label>
                <p className="mt-1 text-sm">{formatDate(request.createdAt)}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Workflow Progress</h3>
            <div className="mt-4 space-y-3 text-xs">
              {[
                {
                  status: 'New',
                  done: [
                    'New',
                    'JD Draft',
                    'JD Approved',
                    'CV Screening',
                    'Shortlist Ready',
                    'In Progress',
                    'Completed',
                  ].includes(request.requestStatus),
                },
                {
                  status: 'JD Draft',
                  done: [
                    'JD Draft',
                    'JD Approved',
                    'CV Screening',
                    'Shortlist Ready',
                    'In Progress',
                    'Completed',
                  ].includes(request.requestStatus),
                },
                {
                  status: 'JD Approved',
                  done: [
                    'JD Approved',
                    'CV Screening',
                    'Shortlist Ready',
                    'In Progress',
                    'Completed',
                  ].includes(request.requestStatus),
                },
                {
                  status: 'CV Screening',
                  done: ['CV Screening', 'Shortlist Ready', 'In Progress', 'Completed'].includes(
                    request.requestStatus,
                  ),
                },
                { status: 'Completed', done: request.requestStatus === 'Completed' },
                { status: 'Closed', done: request.requestStatus === 'Closed' },
              ].map((step) => (
                <div key={step.status} className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${step.done ? 'bg-green-600' : 'bg-gray-300'}`}
                  />
                  <span className={step.done ? 'text-ink' : 'text-ink-subtle'}>{step.status}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
