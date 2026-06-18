# CV Fit Scoring Guide for AI Agent v2

**Official candidate scoring after AI-created JD approval**

## Purpose

This guide tells another AI agent how to score CVs after a JD has already passed JD quality scoring and has been approved by HM/HR.

The mock workbook structure is treated as the expected real-data structure. Mock rows are examples only.

---

# 1. Core Pipeline Rule

The CV scoring agent must only produce official CV fit scores after the linked JD is approved.

```text
AI creates JD
→ JD is scored
→ HM/HR approves JD
→ Approved JD becomes scoring contract
→ CVs are scored against approved JD
```

| JD Status                               | Official CV Scoring                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Approved                                | Allowed. Continue scoring.                                                      |
| Draft / In Draft                        | Blocked. Return blocked status.                                                 |
| Ready                                   | Blocked unless business explicitly defines Ready as approved. Default: blocked. |
| Needs Revision / Rejected / Not Started | Blocked. Do not score officially.                                               |

### Blocking Output

```text
Status: Blocked
Reason: Official CV scoring cannot run because the linked JD is not Approved.
```

---

# 2. Context Gathering and Field Join Rules

Before scoring, the agent must build the complete context bundle.

Do not score from candidate data alone.

## Data Relationships

| From                                  | To                                            | Purpose                                           |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| DS-09_Job_Descriptions.jd_code        | DS-07_Screening_Criteria.jd_id                | Find scoring criteria for the approved JD         |
| DS-07_Screening_Criteria.criteria_id  | DS-07b_Screening_Criteria_Skill.criteria_code | Find structured must-have and nice-to-have skills |
| DS-06_Candidate_Database.candidate_id | DS-06b_Candidate_Skills.candidate_code        | Find normalized candidate skills                  |
| DS-06_Candidate_Database.candidate_id | DS-10_Candidate_Fit_View.candidate_code       | Optional helper for must-have overlap             |
| DS-07_Screening_Criteria.criteria_id  | DS-10_Candidate_Fit_View.criteria_code        | Optional helper for candidate-vs-criteria overlap |

## Context Bundle

### Approved JD

**Source:** DS-09_Job_Descriptions

Fields:

* jd_code
* position
* jd_status
* seniority_level
* required language
* work_mode
* salary range
* must_have_skills
* nice_to_have_skills
* key_responsibilities
* jd_full_text

### Screening Criteria

**Source:** DS-07_Screening_Criteria

Fields:

* criteria_id
* jd_id
* position
* min_yoe
* max_yoe
* seniority_required
* required language
* weights
* salary_budget_max
* guardrail_notes

### Structured Criteria Skills

**Source:** DS-07b_Screening_Criteria_Skill

Fields:

* criteria_code
* skill_code
* skill_name
* skill_type

### Candidate Profile

**Source:** DS-06_Candidate_Database

Fields:

* candidate_id
* applied_position
* current_title
* YOE
* seniority_level
* domain_experience
* notable_projects
* salary_expectation
* language level
* status
* pipeline_stage
* rejection_reason

### Candidate Skills

**Source:** DS-06b_Candidate_Skills

Fields:

* candidate_code
* skill_code
* skill_name
* category_name

### Optional Fit Helper

**Source:** DS-10_Candidate_Fit_View

Fields:

* candidate_code
* criteria_code
* must_have_overlap
* must_have_total

### Missing Link Handling

If a required link is missing:

```text
Flag: Missing criteria link.
DS-07_Screening_Criteria.jd_id does not match the approved JD code.
```

---

# 3. CV Fit Score v2 — 100 Points

| Category                              | Weight  | Main Evidence                                               |
| ------------------------------------- | ------- | ----------------------------------------------------------- |
| Must-have skills match                | 50      | Approved JD + DS-07/DS-07b vs DS-06b candidate skills       |
| Relevant experience / seniority match | 20      | Role-relevant experience, key-skill YOE, ownership evidence |
| Required language level match         | 15      | JD language requirement vs candidate language evidence      |
| Nice-to-have skills match             | 15      | Nice-to-have skills vs candidate skills                     |
| **Total**                             | **100** | Final fit score before flags                                |

If custom screening weights exist, use them.

Otherwise use the default weights above.

---

# 4. Must-have Skills Match (50 Points)

Primary matching source:

```text
DS-07b_Screening_Criteria_Skill.skill_code
vs
DS-06b_Candidate_Skills.skill_code
```

If there are **N** must-have skills:

```text
Each skill = 50 / N points
```

## Match Types

| Match Type    | Credit |
| ------------- | ------ |
| Strong Match  | 100%   |
| Partial Match | 50%    |
| No Evidence   | 0%     |

## Examples

| Requirement      | Strong Match                                     | Partial Match                | No Match           |
| ---------------- | ------------------------------------------------ | ---------------------------- | ------------------ |
| Python backend   | Python + FastAPI/Django/Flask production backend | Python scripts only          | Java/Node only     |
| PostgreSQL / SQL | PostgreSQL, query optimization                   | MySQL/SQL Server only        | No SQL             |
| REST API         | Production REST API implementation               | Backend work but API unclear | No API evidence    |
| Microservices    | Ownership or migration experience                | Some distributed integration | Monolith-only work |

---

# 5. Relevant Experience / Seniority Match (20 Points)

Total years of experience alone must not determine role fit.

## Breakdown

| Sub-category                   | Points |
| ------------------------------ | ------ |
| Total professional YOE         | 5      |
| Role-relevant YOE              | 8      |
| Key-skill YOE                  | 5      |
| Ownership / seniority evidence | 2      |
| **Total**                      | **20** |

---

## 5.1 Total Professional YOE (5)

| Evidence                   | Score |
| -------------------------- | ----- |
| Meets or exceeds threshold | 5     |
| Slightly below             | 3     |
| Clearly below              | 1     |
| No evidence                | 0     |

---

## 5.2 Role-Relevant YOE (8)

### Backend Developer

| Full Credit       | Partial Credit                         | Low Credit                 |
| ----------------- | -------------------------------------- | -------------------------- |
| Backend developer | DevOps/Data/Frontend with backend work | QA or unrelated experience |

### QA Automation Engineer

| Full Credit   | Partial Credit                        | Low Credit             |
| ------------- | ------------------------------------- | ---------------------- |
| QA Automation | Manual QA transitioning to automation | No automation evidence |

### Data Engineer

| Full Credit       | Partial Credit   | Low Credit                     |
| ----------------- | ---------------- | ------------------------------ |
| ETL/Data Pipeline | Backend adjacent | No data engineering experience |

---

## 5.3 Key-Skill YOE (5)

Key-skill YOE must be measured within the proper role context.

| JD Context    | Candidate Evidence           | Interpretation |
| ------------- | ---------------------------- | -------------- |
| Java Backend  | Spring Boot backend services | Strong         |
| Java Backend  | Selenium automation only     | Weak           |
| QA Automation | Java + Selenium              | Strong         |
| QA Automation | Backend only                 | Partial        |

---

## 5.4 Ownership / Seniority Evidence (2)

| JD Level | Strong Evidence                                       |
| -------- | ----------------------------------------------------- |
| Senior   | Architecture, ownership, mentoring, incident handling |
| Middle   | Independent feature delivery                          |
| Junior   | Learning ability, supervised delivery                 |

---

# 6. Required Language Level Match (15 Points)

Language is not always English.

Examples:

* English
* Japanese
* Korean
* Vietnamese
* German
* French
* Others

## Scoring

| Candidate Evidence  | Score                      |
| ------------------- | -------------------------- |
| Exceeds requirement | 15                         |
| Meets requirement   | 12                         |
| Slightly below      | 6                          |
| Clearly below       | 0                          |
| No evidence         | 0 or Need More Information |

### Example

```text
JD requires Japanese N2

Candidate N1 → 15/15
Candidate N3 → 6/15
No Japanese evidence → 0/15
```

---

# 7. Nice-to-have Skills Match (15 Points)

Primary matching source:

```text
DS-07b skill_type = nice_to_have
vs
DS-06b candidate skills
```

If there are N nice-to-have skills:

```text
Each skill = 15 / N points
```

Scoring:

* Strong Match → 100%
* Partial Match → 50%
* No Evidence → 0%

---

# 8. Flags and Guardrails

Flags are separate from score.

| Flag                           | Meaning                    |
| ------------------------------ | -------------------------- |
| JD not approved                | Block scoring              |
| Missing criteria link          | Cannot find criteria       |
| Role mismatch                  | Wrong role family          |
| Seniority mismatch             | Too junior/senior          |
| Core skill missing             | Missing mandatory skill    |
| Language gap                   | Language below requirement |
| Salary over budget             | Exceeds budget             |
| Work mode mismatch             | Cannot meet work mode      |
| Already in pipeline            | Active recruitment stage   |
| Previous rejection still valid | Historical concern         |
| Insufficient evidence          | Need follow-up questions   |

---

# 9. Recommendation Thresholds

| Score  | Recommendation              |
| ------ | --------------------------- |
| 85-100 | Strong shortlist            |
| 75-84  | Shortlist                   |
| 60-74  | Medium / HM Review          |
| 40-59  | Low / Need More Information |
| <40    | Reject / Not Suitable       |

Flags may override recommendations without changing the numeric score.

---

# 10. Worked Mock Example

## Approved JD

* JD ID: JD-BE-SR-002
* Role: Senior Backend Developer
* Status: Approved

## Candidate

* Candidate ID: CAND-1001
* 6 YOE
* Senior Backend Engineer
* Python
* FastAPI
* PostgreSQL
* Redis
* Docker
* Kafka/RabbitMQ
* AWS
* English C1
* Banking API serving 2M transactions/day
* Microservices migration reducing latency by 40%

### Score

| Category                              | Score       |
| ------------------------------------- | ----------- |
| Must-have skills match                | 50/50       |
| Relevant experience / seniority match | 20/20       |
| Language match                        | 15/15       |
| Nice-to-have skills match             | 15/15       |
| **Total**                             | **100/100** |

### Final Result

```text
Final CV Fit Score: 100/100
Recommendation: Strong shortlist
Confidence: High
Flags: None
```

---

# 11. Contrast Example

## Same YOE, Different Role Context

| Approved JD            | Candidate Evidence                    | Interpretation           |
| ---------------------- | ------------------------------------- | ------------------------ |
| Java Backend Developer | 5 YOE, 3 years Auto QA, Java Selenium | Weak backend fit         |
| QA Automation Engineer | Same profile                          | Strong QA Automation fit |

---

# 12. Required Agent Output Format

```text
JD Status: Approved
Approved JD ID:
Screening Criteria ID:
Candidate ID:
Candidate Name:
Applied Position:

Final CV Fit Score: __ / 100
Recommendation:
Confidence: High / Medium / Low

Category Scores:
1. Must-have skills match: __ / 50

2. Relevant experience / seniority match: __ / 20
   - Total professional YOE: __ / 5
   - Role-relevant YOE: __ / 8
   - Key-skill YOE: __ / 5
   - Ownership evidence: __ / 2

3. Required language level match: __ / 15

4. Nice-to-have skills match: __ / 15

Matched evidence:
- ...

Missing / unclear evidence:
- ...

Flags:
- ...

Questions for recruiter/candidate:
- ...

Final decision reason:
...
```

---

# 13. Optional JSON Output Schema

```json
{
  "jd_status": "Approved",
  "approved_jd_id": "",
  "screening_criteria_id": "",
  "candidate_id": "",
  "candidate_name": "",
  "applied_position": "",
  "final_cv_fit_score": 0,
  "recommendation": "",
  "confidence": "High|Medium|Low",
  "category_scores": {
    "must_have_skills_match": {
      "score": 0,
      "max": 50,
      "evidence": []
    },
    "relevant_experience_seniority_match": {
      "score": 0,
      "max": 20,
      "breakdown": {
        "total_professional_yoe": {
          "score": 0,
          "max": 5
        },
        "role_relevant_yoe": {
          "score": 0,
          "max": 8
        },
        "key_skill_yoe": {
          "score": 0,
          "max": 5
        },
        "ownership_seniority_evidence": {
          "score": 0,
          "max": 2
        }
      }
    },
    "required_language_level_match": {
      "score": 0,
      "max": 15,
      "evidence": []
    },
    "nice_to_have_skills_match": {
      "score": 0,
      "max": 15,
      "evidence": []
    }
  },
  "matched_evidence": [],
  "missing_or_unclear_evidence": [],
  "flags": [],
  "questions_for_recruiter_or_candidate": [],
  "final_decision_reason": ""
}
```

---

# 14. Copy-Paste Prompt for Another Agent

```text
You are a CV Fit Scoring Agent.

Official CV scoring is allowed only when the linked JD status is Approved.

Build the full context bundle using:

DS-09_Job_Descriptions.jd_code
→ DS-07_Screening_Criteria.jd_id

DS-07_Screening_Criteria.criteria_id
→ DS-07b_Screening_Criteria_Skill.criteria_code

DS-06_Candidate_Database.candidate_id
→ DS-06b_Candidate_Skills.candidate_code

DS-06_Candidate_Database.candidate_id
→ DS-10_Candidate_Fit_View.candidate_code

DS-07_Screening_Criteria.criteria_id
→ DS-10_Candidate_Fit_View.criteria_code

Use the Approved JD as the scoring contract.

Score:
1. Must-have skills /50
2. Relevant experience /20
3. Required language /15
4. Nice-to-have skills /15

Do not invent evidence.
Return:
- Score
- Recommendation
- Confidence
- Evidence
- Missing evidence
- Flags
- Questions
- Final decision reason
```

---

# 15. Final Operating Rule

```text
Approved JD defines the scoring contract.

Candidate score measures fit against that contract.

Relevant experience is role-aware.

Required language is generic, not English-only.

Flags prevent risky automation decisions.
```
