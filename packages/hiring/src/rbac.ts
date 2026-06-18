// RBAC (Role-Based Access Control) for hiring module

export const HIRING_PERMISSIONS = {
  // Request management
  'hiring:request:create': 'Create hiring request',
  'hiring:request:read': 'View hiring request',
  'hiring:request:update': 'Edit hiring request',
  'hiring:request:approve': 'Approve hiring request',

  // JD management (TA)
  'hiring:jd:view': 'View job description',
  'hiring:jd:approve': 'Approve JD',
  'hiring:jd:edit': 'Edit JD',

  // CV screening (TA)
  'hiring:candidate:view': 'View candidate',
  'hiring:candidate:shortlist': 'Add to shortlist',
  'hiring:candidate:screen': 'Review AI screening results',
  'hiring:candidate:confirm': 'Confirm shortlist',

  // Decision & feedback (Hiring Manager)
  'hiring:decision:submit': 'Submit feedback on candidate',
  'hiring:decision:view': 'View screening results',

  // Interview prep (Recruiter)
  'hiring:interview:prepare': 'Prepare interview questions',
  'hiring:interview:score': 'Score interview',
} as const;

// Default roles → permissions mapping (can be extended via RBAC system)
export const HIRING_ROLE_PERMISSIONS = {
  // TA (Talent Acquisition) - full hiring workflow ownership
  ta: [
    'hiring:request:create',
    'hiring:request:read',
    'hiring:request:update',
    'hiring:jd:view',
    'hiring:jd:approve',
    'hiring:jd:edit',
    'hiring:candidate:view',
    'hiring:candidate:shortlist',
    'hiring:candidate:screen',
    'hiring:candidate:confirm',
    'hiring:decision:view',
  ],

  // Hiring Manager - provide feedback on candidates
  hiring_manager: [
    'hiring:request:read',
    'hiring:jd:view',
    'hiring:decision:submit',
    'hiring:decision:view',
    'hiring:candidate:view',
  ],

  // Recruiter - manage interview process
  recruiter: [
    'hiring:request:read',
    'hiring:candidate:view',
    'hiring:interview:prepare',
    'hiring:interview:score',
  ],

  // Admin - all permissions
  admin: Object.keys(HIRING_PERMISSIONS),
} as const;
