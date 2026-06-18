'use client';

import { Button, Card, Input } from '@seta/shared-ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export const Route = createFileRoute('/_authed/hiring/candidates')({
  component: CandidatesPage,
});

interface Candidate {
  id: string;
  cvId: string;
  candidateId: string;
  fullName: string;
  currentTitle?: string;
  currentCompany?: string;
  yearsOfExperience?: number;
  cvSkills?: string;
  englishLevel?: string;
  salaryExpectation?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    cvId: '',
    candidateId: '',
    fullName: '',
    currentTitle: '',
    currentCompany: '',
    yearsOfExperience: '',
    cvSkills: '',
    englishLevel: 'B2',
    salaryExpectation: '',
    status: 'active' as 'active' | 'inactive',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCandidates = useCallback(async () => {
    try {
      setIsLoading(true);
      const url =
        statusFilter === 'all'
          ? 'http://localhost:3000/hiring/v1/candidates'
          : `http://localhost:3000/hiring/v1/candidates?status=${statusFilter}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load candidates');

      const data = await response.json();
      setCandidates(data.candidates || []);
    } catch (error) {
      console.error('Load candidates error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('http://localhost:3000/hiring/v1/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cvId: formData.cvId,
          candidateId: formData.candidateId,
          fullName: formData.fullName,
          currentTitle: formData.currentTitle || undefined,
          currentCompany: formData.currentCompany || undefined,
          yearsOfExperience: formData.yearsOfExperience
            ? parseInt(formData.yearsOfExperience, 10)
            : undefined,
          cvSkills: formData.cvSkills || undefined,
          englishLevel: formData.englishLevel,
          salaryExpectation: formData.salaryExpectation || undefined,
          status: formData.status,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      // Reset form and reload
      setFormData({
        cvId: '',
        candidateId: '',
        fullName: '',
        currentTitle: '',
        currentCompany: '',
        yearsOfExperience: '',
        cvSkills: '',
        englishLevel: 'B2',
        salaryExpectation: '',
        status: 'active',
      });
      setShowForm(false);
      loadCandidates();
    } catch (error) {
      console.error('Add candidate error:', error);
      alert('Failed to add candidate');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCandidate = async (cvId: string) => {
    if (!confirm(`Delete candidate ${cvId}?`)) return;

    try {
      const response = await fetch(`http://localhost:3000/hiring/v1/candidates/${cvId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete');

      loadCandidates();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete candidate');
    }
  };

  const handleToggleStatus = async (cvId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      const response = await fetch(`http://localhost:3000/hiring/v1/candidates/${cvId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update');

      loadCandidates();
    } catch (error) {
      console.error('Toggle status error:', error);
      alert('Failed to update candidate status');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate({ to: '..' })}
            className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hiring
          </button>
          <h1 className="text-3xl font-bold">Candidates Pool</h1>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Candidate
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Add New Candidate</h2>
            <button onClick={() => setShowForm(false)} className="text-ink-subtle hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleAddCandidate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">CV ID *</label>
                <Input
                  type="text"
                  placeholder="CV-001"
                  required
                  value={formData.cvId}
                  onChange={(e) => setFormData({ ...formData, cvId: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Candidate ID *</label>
                <Input
                  type="text"
                  placeholder="CAND-001"
                  required
                  value={formData.candidateId}
                  onChange={(e) => setFormData({ ...formData, candidateId: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Full Name *</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Current Title</label>
                <Input
                  type="text"
                  placeholder="Senior Developer"
                  value={formData.currentTitle}
                  onChange={(e) => setFormData({ ...formData, currentTitle: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Current Company</label>
                <Input
                  type="text"
                  placeholder="Tech Corp"
                  value={formData.currentCompany}
                  onChange={(e) => setFormData({ ...formData, currentCompany: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Years of Experience</label>
                <Input
                  type="number"
                  placeholder="5"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">CV Skills</label>
                <Input
                  type="text"
                  placeholder="Python, JavaScript, React"
                  value={formData.cvSkills}
                  onChange={(e) => setFormData({ ...formData, cvSkills: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">English Level</label>
                <select
                  value={formData.englishLevel}
                  onChange={(e) => setFormData({ ...formData, englishLevel: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-hairline rounded-lg bg-white"
                >
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="C1">C1</option>
                  <option value="C2">C2</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Salary Expectation</label>
                <Input
                  type="text"
                  placeholder="$1500-$2500"
                  value={formData.salaryExpectation}
                  onChange={(e) => setFormData({ ...formData, salaryExpectation: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })
                  }
                  className="mt-1 w-full px-3 py-2 border border-hairline rounded-lg bg-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Candidate'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter by Status:</span>
        {(['all', 'active', 'inactive'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1 rounded text-sm transition ${
              statusFilter === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-2 text-ink hover:bg-surface-3'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Candidates List */}
      {isLoading ? (
        <Card className="p-8 text-center text-ink-subtle">Loading candidates...</Card>
      ) : candidates.length === 0 ? (
        <Card className="p-8 text-center text-ink-subtle">
          No candidates found. Click "Add Candidate" to get started!
        </Card>
      ) : (
        <div className="grid gap-4">
          {candidates.map((candidate) => (
            <Card key={candidate.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{candidate.fullName}</h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        candidate.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {candidate.status}
                    </span>
                  </div>
                  <p className="text-sm text-ink-subtle mb-3">
                    {candidate.cvId} • {candidate.candidateId}
                  </p>

                  <div className="grid gap-2 md:grid-cols-3 text-sm">
                    {candidate.currentTitle && (
                      <div>
                        <label className="font-medium text-ink-subtle">Current Title</label>
                        <p>{candidate.currentTitle}</p>
                      </div>
                    )}
                    {candidate.currentCompany && (
                      <div>
                        <label className="font-medium text-ink-subtle">Company</label>
                        <p>{candidate.currentCompany}</p>
                      </div>
                    )}
                    {candidate.yearsOfExperience !== undefined && (
                      <div>
                        <label className="font-medium text-ink-subtle">Experience</label>
                        <p>{candidate.yearsOfExperience} years</p>
                      </div>
                    )}
                    {candidate.englishLevel && (
                      <div>
                        <label className="font-medium text-ink-subtle">English</label>
                        <p>{candidate.englishLevel}</p>
                      </div>
                    )}
                    {candidate.salaryExpectation && (
                      <div>
                        <label className="font-medium text-ink-subtle">Salary</label>
                        <p>{candidate.salaryExpectation}</p>
                      </div>
                    )}
                    {candidate.cvSkills && (
                      <div className="md:col-span-3">
                        <label className="font-medium text-ink-subtle">Skills</label>
                        <p>{candidate.cvSkills}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant={candidate.status === 'active' ? 'secondary' : 'default'}
                    onClick={() => handleToggleStatus(candidate.cvId, candidate.status)}
                  >
                    {candidate.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDeleteCandidate(candidate.cvId)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
