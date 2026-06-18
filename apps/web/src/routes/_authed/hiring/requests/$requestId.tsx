'use client';

import { Button, Card } from '@seta/shared-ui';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Edit2, RotateCw, Zap } from 'lucide-react';
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
  jdId?: string;
  shortlistResults?: any;
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
  const [jd, setJd] = useState<any>(null);
  const [shortlistResults, setShortlistResults] = useState<any>(null);

  const loadJd = useCallback(async (jdId: string) => {
    try {
      if (!jdId) {
        console.warn('No jdId provided');
        return;
      }

      const response = await fetch(`http://localhost:3000/hiring/v1/jd/${jdId}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const jdData = await response.json();
        setJd(jdData);
      }
    } catch (error) {
      console.error('Load JD error:', error);
    }
  }, []);

  const loadShortlistResults = useCallback(async (rId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/hiring/v1/shortlist/results/${rId}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setShortlistResults(data);
      }
    } catch (error) {
      console.error('Load shortlist results error:', error);
    }
  }, []);

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
        // Load JD if approved and jdId exists
        if (
          found.jdId &&
          (found.requestStatus === 'JD Approved' ||
            found.requestStatus === 'CV Screening' ||
            found.requestStatus === 'Shortlist Ready')
        ) {
          loadJd(found.jdId);
        }
        // Load shortlist results if screening or ready
        if (found.requestStatus === 'CV Screening' || found.requestStatus === 'Shortlist Ready') {
          loadShortlistResults(found.requestId);
        }
      } else {
        console.warn('Request not found:', requestId);
      }
    } catch (error) {
      console.error('Load request error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [requestId, loadJd, loadShortlistResults]);

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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => loadRequest()}
            disabled={isLoading}
            className="gap-2"
          >
            <RotateCw className="h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
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

          {jd && (
            <Card className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Approved Job Description</h2>
                  <p className="text-xs text-ink-subtle mt-1">ID: {jd.jdId}</p>
                </div>
                {jd.agentClarityScore && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {Math.round(jd.agentClarityScore)}
                    </div>
                    <p className="text-xs text-ink-subtle">Clarity Score</p>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-4">
                {jd.position && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">Position</label>
                    <p className="mt-1 text-sm font-medium">{jd.position}</p>
                  </div>
                )}
                {jd.seniorityLevel && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">Seniority Level</label>
                    <p className="mt-1 text-sm">{jd.seniorityLevel}</p>
                  </div>
                )}
                {jd.minYoe !== null || jd.maxYoe !== null ? (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">
                      Years of Experience
                    </label>
                    <p className="mt-1 text-sm">
                      {jd.minYoe && jd.maxYoe
                        ? `${jd.minYoe} - ${jd.maxYoe} years`
                        : jd.minYoe
                          ? `${jd.minYoe}+ years`
                          : jd.maxYoe
                            ? `Up to ${jd.maxYoe} years`
                            : 'Not specified'}
                    </p>
                  </div>
                ) : null}
                {jd.mustHaveSkills && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">Must-Have Skills</label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{jd.mustHaveSkills}</p>
                  </div>
                )}
                {jd.niceToHaveSkills && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">
                      Nice-to-Have Skills
                    </label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{jd.niceToHaveSkills}</p>
                  </div>
                )}
                {jd.englishLevelRequired && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">
                      English Level Required
                    </label>
                    <p className="mt-1 text-sm">{jd.englishLevelRequired}</p>
                  </div>
                )}
                {jd.workMode && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">Work Mode</label>
                    <p className="mt-1 text-sm">{jd.workMode}</p>
                  </div>
                )}
                {jd.salaryRange && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">Salary Range</label>
                    <p className="mt-1 text-sm">{jd.salaryRange}</p>
                  </div>
                )}
                {jd.keyResponsibilities && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">
                      Key Responsibilities
                    </label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{jd.keyResponsibilities}</p>
                  </div>
                )}
                {jd.jdFullText && (
                  <div>
                    <label className="text-sm font-medium text-ink-subtle">
                      Full Job Description
                    </label>
                    <div className="mt-2 max-h-96 overflow-y-auto rounded border border-hairline bg-surface-1 p-4 text-sm leading-relaxed text-ink prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap">{jd.jdFullText}</div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {shortlistResults && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Shortlist Report</h2>

              {shortlistResults.statistics && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-green-50 p-3">
                    <div className="text-sm font-medium text-green-700">Pass</div>
                    <div className="mt-1 text-2xl font-bold text-green-900">
                      {shortlistResults.statistics.passCandidates}
                    </div>
                    <div className="text-xs text-green-600">
                      {shortlistResults.statistics.passPercentage}%
                    </div>
                  </div>

                  <div className="rounded-lg bg-yellow-50 p-3">
                    <div className="text-sm font-medium text-yellow-700">Need More Info</div>
                    <div className="mt-1 text-2xl font-bold text-yellow-900">
                      {shortlistResults.statistics.needMoreInfoCandidates}
                    </div>
                    <div className="text-xs text-yellow-600">
                      {shortlistResults.statistics.needMoreInfoPercentage}%
                    </div>
                  </div>

                  <div className="rounded-lg bg-red-50 p-3">
                    <div className="text-sm font-medium text-red-700">Reject</div>
                    <div className="mt-1 text-2xl font-bold text-red-900">
                      {shortlistResults.statistics.rejectCandidates}
                    </div>
                    <div className="text-xs text-red-600">
                      {shortlistResults.statistics.rejectPercentage}%
                    </div>
                  </div>
                </div>
              )}

              {(shortlistResults.passCandidatesList || []).length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-green-700">✅ Pass Candidates</h3>
                  <div className="mt-3 space-y-3">
                    {shortlistResults.passCandidatesList.map((c: any, idx: number) => (
                      <div key={idx} className="rounded border border-green-200 bg-green-50 p-3">
                        <div className="flex justify-between">
                          <span className="font-medium">{c.candidateName}</span>
                          <span className="text-sm font-bold text-green-700">{c.fitScore}/100</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-subtle">{c.fitSummary}</p>
                        {c.interviewQuestions && c.interviewQuestions.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-green-700">
                              Interview Questions:
                            </p>
                            <ul className="mt-1 space-y-1">
                              {c.interviewQuestions.slice(0, 3).map((q: string, i: number) => (
                                <li key={i} className="text-xs text-ink">
                                  • {q}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(shortlistResults.needMoreInfoList || []).length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-yellow-700">⚠️ Need More Info</h3>
                  <div className="mt-3 space-y-3">
                    {shortlistResults.needMoreInfoList.map((c: any, idx: number) => (
                      <div key={idx} className="rounded border border-yellow-200 bg-yellow-50 p-3">
                        <div className="flex justify-between">
                          <span className="font-medium">{c.candidateName}</span>
                          <span className="text-sm font-bold text-yellow-700">
                            {c.fitScore}/100
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-subtle">{c.fitSummary}</p>
                        {c.followUpQuestions && c.followUpQuestions.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-yellow-700">
                              Follow-up Questions:
                            </p>
                            <ul className="mt-1 space-y-1">
                              {c.followUpQuestions.slice(0, 3).map((q: string, i: number) => (
                                <li key={i} className="text-xs text-ink">
                                  • {q}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(shortlistResults.rejectCandidatesList || []).length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-red-700">❌ Reject Candidates</h3>
                  <div className="mt-3 space-y-2">
                    {shortlistResults.rejectCandidatesList.map((c: any, idx: number) => (
                      <div key={idx} className="rounded border border-red-200 bg-red-50 p-3">
                        <div className="flex justify-between">
                          <span className="font-medium text-red-900">{c.candidateName}</span>
                          <span className="text-xs font-bold text-red-700">{c.fitScore}/100</span>
                        </div>
                        <p className="mt-1 text-xs text-red-700">{c.rejectReason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
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
                {
                  status: 'Shortlist Ready',
                  done: ['Shortlist Ready', 'In Progress', 'Completed'].includes(
                    request.requestStatus,
                  ),
                },
                {
                  status: 'In Progress',
                  done: ['In Progress', 'Completed'].includes(request.requestStatus),
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
