# JD Quality Scoring Guide for AI Agent

## Version 3 - Generic Procedure (Mock Data as Example Only)

### Critical change from v2

The mock workbook is an example dataset only. It must not be treated as required input or source of truth.

The scoring agent must score against the real hiring packet provided at runtime:

- Hiring request
- Business/project context
- Headcount plan
- Team gaps
- Scorecard
- JD standards
- Target AI-created JD

Sheet names such as `DS06_Hire_Request` or `DS03_JD_Template` are example aliases only.

---

# 1. Purpose

This guide instructs an AI agent how to score an AI-created Job Description (JD).

The score measures:

- Source traceability
- Correctness
- Completeness
- Hiring usability

The agent must compare the target JD against actual evidence.

If evidence is missing:

- Mark as Unknown
- Mark as Insufficient Evidence

Do not invent context.

---

# 2. Input Contract

## Required Evidence Types

| Evidence Type | Required | Description |
|--------------|----------|-------------|
| Target AI-created JD | Required | JD draft being scored |
| Hiring Request / Intake | Required | Requested role, reason for hire |
| Business / Project Context | Recommended | Product, roadmap, domain |
| Headcount / Approval Plan | Recommended | Approved title, salary, location |
| Team Skills / Gap Matrix | Recommended | Missing capabilities |
| Interview Scorecard | Recommended | Interview criteria |
| JD Standards / Benchmark | Optional | Existing JD standards |
| Legal / Compliance Rules | Optional | Forbidden wording |
| CV Shortlist | Not Required | Used for CV review only |

### Input Handling Rules

- Do not require specific mock row IDs.
- Do not require exact sheet names.
- Map real data to the evidence model.
- Normalize field names before scoring.

---

# 3. Generic Source Priority

When evidence conflicts:

| Priority | Source |
|-----------|---------|
| 1 | Hiring Request |
| 2 | Business Context |
| 3 | Headcount Plan |
| 4 | Team Gap Evidence |
| 5 | Interview Scorecard |
| 6 | JD Template / Benchmark |
| 7 | Target AI-created JD |

---

# 4. Required Procedure

## Step 1 — Build Source Map

Identify all sources received.

Mark missing sources as:

`Missing`

---

## Step 2 — Extract Evidence

Extract:

- Role title
- Seniority
- YOE
- Salary
- Work mode
- Location
- Business reason
- Deliverables
- Team gaps
- Must-have skills
- Nice-to-have skills
- Scorecard criteria
- Compliance constraints

---

## Step 3 — Normalize JD

Parse JD into:

- Title
- Summary
- Responsibilities
- Must-haves
- Nice-to-haves
- YOE
- Seniority
- Work mode
- Location
- Salary
- Interview focus

---

## Step 4 — Create Traceability Table

Status values:

- Matched
- Partially Matched
- Missing
- Contradicted
- Unsupported
- Unknown

---

## Step 5 — Apply Hard Fail Checks

Hard Fail overrides numeric score.

---

## Step 6 — Score Categories

Use rubric in Section 6.

Every deduction must reference evidence.

---

## Step 7 — Produce Revisions

Recommend:

- Additions
- Removals
- Clarifications
- Must-have ↔ Nice-to-have changes

---

## Step 8 — Report Confidence

Levels:

- High
- Medium
- Low

Low confidence ≠ low quality.

---

# 5. Missing Data & Uncertainty Rules

| Situation | Behavior |
|------------|----------|
| Target JD missing | Unable to score |
| Hiring Request missing | Provisional score only |
| Business Context missing | Partial business alignment |
| Headcount Plan missing | Unknown for salary/work mode |
| Team Gap missing | Do not assume unsupported |
| Scorecard missing | Interview alignment unknown |
| Extra must-have skills | Penalize |
| Extra nice-to-have skills | Light penalty |
| Conflicting sources | Follow source priority |
| Ambiguous evidence | Unknown |

---

# 6. JD Quality Score (100 Points)

| Category | Points |
|-----------|--------|
| Hiring Request Alignment | 20 |
| Role / Seniority / Headcount Alignment | 15 |
| Skill / Tech Stack Accuracy | 20 |
| Deliverables Coverage | 15 |
| Interview Alignment | 10 |
| Screening Usefulness | 10 |
| Bias / Compliance | 5 |
| Completeness / Structure | 5 |
| Total | 100 |

---

# 6.1 Hiring Request Alignment (20)

| Sub-check | Points |
|------------|--------|
| Role Purpose Alignment | 4 |
| Business Context Reflection | 4 |
| Urgency Alignment | 3 |
| Team Gap Addressed | 4 |
| Domain Relevance | 3 |
| No Wrong Scope Expansion | 2 |

---

# 6.2 Role / Seniority / Headcount Alignment (15)

| Sub-check | Points |
|------------|--------|
| Title Alignment | 3 |
| Seniority Alignment | 3 |
| YOE Calibration | 3 |
| Responsibility Alignment | 2 |
| Salary/Location Alignment | 2 |
| Headcount Constraints | 2 |

---

# 6.3 Skill / Tech Stack Accuracy (20)

| Sub-check | Points |
|------------|--------|
| Core Stack Correct | 5 |
| Functional Skills Correct | 4 |
| Team Gap Skills Included | 4 |
| Must-have vs Nice-to-have Separation | 3 |
| No Unsupported Must-have | 3 |
| Language Requirement Justified | 1 |

---

# 6.4 Deliverables & Responsibilities (15)

| Sub-check | Points |
|------------|--------|
| Key Deliverables Covered | 6 |
| Success Metrics Mentioned | 3 |
| Collaboration Interfaces | 2 |
| Ownership Level | 2 |
| Avoid Filler Responsibilities | 2 |

---

# 6.5 Interview Scorecard Alignment (10)

| Sub-check | Points |
|------------|--------|
| Top Weighted Criteria Included | 4 |
| Interview Focus Explicit | 3 |
| JD Consistent With Screening | 2 |
| No Criterion Conflict | 1 |

---

# 6.6 Screening Usefulness (10)

| Sub-check | Points |
|------------|--------|
| Measurable Requirements | 3 |
| Clear Screen-out Rules | 2 |
| Prioritization Clarity | 2 |
| Expected Evidence Clarity | 2 |
| Checklist-ready Structure | 1 |

---

# 6.7 Bias / Compliance (5)

| Sub-check | Points |
|------------|--------|
| No Protected Attributes | 2 |
| Communication Requirement Job-related | 1 |
| No Subjective Personality Filters | 1 |
| Requirements Job-related | 1 |

---

# 6.8 Completeness & Structure (5)

| Sub-check | Points |
|------------|--------|
| Required Sections Present | 2 |
| Readability | 1 |
| Internal Consistency | 1 |
| No Duplication | 1 |

---

# 7. Hard Fail Rules

Triggers:

- Wrong role family
- Wrong seniority
- No must-have requirements
- Unsupported mandatory skills
- Critical deliverables omitted
- Discriminatory wording
- Contradicted approved constraints
- Unusable for screening

---

# 8. Status Thresholds

| Score | Status |
|---------|---------|
| 90–100 | Ready |
| 80–89 | Minor Revision |
| 70–79 | Needs Revision |
| 60–69 | Weak |
| <60 | Fail |

Hard Fail overrides score.

---

# 9. Required Output Format

## JD Quality Score Report

- Target JD Identifier
- Hiring Request Identifier
- Position
- Seniority
- Final Score
- Status
- Hard Fail
- Hard Fail Reason
- Confidence

### Source Map

- Target JD
- Hiring Request
- Business Context
- Headcount Plan
- Team Skills/Gaps
- Interview Scorecard
- JD Standards

### Category Scores

(8 categories)

### Traceability Findings

- Matched
- Partially Matched
- Missing
- Unsupported
- Contradicted
- Unknown

### Required Revisions

### Open Questions

---

# 10. Traceability Table Template

| Source Requirement | Source Evidence | JD Evidence | Match Status | Impact | Revision |
|-------------------|----------------|-------------|--------------|---------|----------|

Allowed statuses:

- Matched
- Partially Matched
- Missing
- Contradicted
- Unsupported
- Unknown

---

# 11. Generic Examples

## Example A — Unsupported Must-have Skill

Evidence:
- Python
- FastAPI
- PostgreSQL

JD adds:
- Kubernetes
- AWS

Result:
- Deduct Skill Accuracy
- Possible Hard Fail

---

## Example B — Mock Workbook Mapping

Mock sheets are examples only.

Real data may come from:

- Jira
- ATS
- HRIS
- PDFs
- Databases

---

## Example C — Mid Role Written as Senior

Approved:
Mid Mobile Developer

JD:
Senior React Native Developer

Result:
Hard Fail unless approval allows it.

---

# 12. Copy-Paste Prompt

(Use full prompt section from source document)

---

# 13. Optional JSON Output Schema

(Keep JSON schema exactly as provided in source document)
