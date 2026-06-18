import { type Statement, toManifest } from '@seta/shared-rbac';

export const hiringStatement = {
  'hiring.request': ['create', 'read', 'update', 'approve'],
  'hiring.jd': ['view', 'edit', 'approve'],
  'hiring.candidate': ['view', 'shortlist', 'screen', 'confirm'],
  'hiring.decision': ['submit', 'view'],
  'hiring.interview': ['prepare', 'score'],
} as const satisfies Statement;

const roleStatements = {
  'hiring.ta': {
    'hiring.request': ['create', 'read', 'update'],
    'hiring.jd': ['view', 'edit', 'approve'],
    'hiring.candidate': ['view', 'shortlist', 'screen', 'confirm'],
    'hiring.decision': ['view'],
  },
  'hiring.hiring_manager': {
    'hiring.request': ['read'],
    'hiring.jd': ['view'],
    'hiring.candidate': ['view'],
    'hiring.decision': ['submit', 'view'],
  },
  'hiring.recruiter': {
    'hiring.request': ['read'],
    'hiring.candidate': ['view'],
    'hiring.interview': ['prepare', 'score'],
  },
} as const satisfies Record<string, Statement>;

const roleDescriptions = {
  'hiring.ta': 'TA (Talent Acquisition) - full hiring workflow ownership',
  'hiring.hiring_manager': 'Hiring Manager - provide feedback on candidates',
  'hiring.recruiter': 'Recruiter - manage interview process',
} as const;

export const hiringRbac = toManifest('hiring', hiringStatement, roleStatements, roleDescriptions);
