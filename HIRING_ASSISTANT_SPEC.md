# HireAssist — Mô tả chi tiết tính năng

## Tổng quan

HireAssist là một AI Agent hỗ trợ Talent Acquisition (TA) trong quy trình tuyển dụng, gồm hai module chính:

1. **Module 1 — JD Creation**: Soạn Job Description từ dữ liệu nội bộ, chấm điểm chất lượng, và tự sửa nếu chưa đạt.
2. **Module 2 — CV Shortlist Review**: Đánh giá từng CV ứng viên so với JD đã duyệt, cho điểm phù hợp, xếp hạng, và tạo báo cáo shortlist cho TA.

TA là người dùng duy nhất tương tác trực tiếp với agent. Hiring Manager (HM) không sử dụng agent — HM gửi yêu cầu tuyển dụng và nhận feedback shortlist đều thông qua TA bên ngoài hệ thống.

---

## Dữ liệu đầu vào (Mock Data)

Hệ thống sử dụng 8 bảng dữ liệu (DS01–DS08), trong đó:

| Bảng | Vai trò | Số dòng |
|---|---|---|
| `business_context` (DS01) | Bối cảnh dự án, roadmap, độ ưu tiên | 23 |
| `headcount_plan` (DS02) | Vị trí được duyệt, mức lương, số headcount | 32 |
| `jd_template` (DS03) | Nội dung JD (must-have skills, full text, salary…) | 33 |
| `team_skills_matrix` (DS04) | Năng lực hiện tại của team (skill × member) | 104 |
| `scorecard` (DS05) | Tiêu chí đánh giá phỏng vấn theo vị trí | 35 |
| `hire_request` (DS06) | Yêu cầu tuyển dụng chính thức từ HM | 27 |
| `shortlist_cv` (DS07) | CV đã được TA sơ lọc, gửi cho agent đánh giá | 33 |
| `hm_feedback_tracker` (DS08) | Theo dõi feedback của HM và SLA 48 giờ | 32 |

Mỗi hire request (DS06) là điểm bắt đầu. Ví dụ `REQ-001` yêu cầu tuyển 3 Senior Backend Developer cho Project Alpha (microservices migration), có 6 CV shortlisted (CV-001 đến CV-006), JD là `JD-BE-SR-001` (đã có nội dung sẵn, status "In Draft").

Trong 33 JD, chỉ 13 có nội dung đầy đủ (`jd_full_text` có dữ liệu). 20 JD còn lại có `status = 'Not Started'` và toàn bộ nội dung là NULL — đây chính là các JD mà agent cần soạn từ đầu trong Module 1.

Toàn bộ 33 CV đều có cột `agent_recommendation`, `agent_fit_score`, `agent_fit_summary`… là NULL — đây là output mà agent cần điền trong Module 2.

---

## Module 1 — JD Creation

### Mục đích

Khi TA chọn một hire request, agent tự động:
- Thu thập ngữ cảnh từ nhiều nguồn (bối cảnh dự án, headcount plan, skill gap của team hiện tại)
- Soạn một bản JD hoàn chỉnh (hoặc đánh giá JD có sẵn)
- Chấm điểm chất lượng JD trên thang 0–100
- Nếu điểm dưới 70: tự sửa tối đa 2 lần
- Trình JD cho TA duyệt trước khi chuyển sang screening CV

### Input — Agent đọc gì?

Khi TA trigger agent cho một `request_id`, agent truy vấn:

**Từ `hire_request` (DS06)**:
- `team_skill_gap_summary` — điểm yếu hiện tại của team. Ví dụ REQ-001: *"No Kafka experience in team. No Redis production experience. Only 1 engineer (EMP-011) proficient in Python microservices; others are Java/Node.js."*
- `key_deliverables` — kỳ vọng đầu ra của vị trí. Ví dụ: *"Own microservices rewrite of payment and order modules; define API contracts; set up async messaging layer (Kafka/Redis)."*
- `business_justification` — lý do tuyển. Ví dụ: *"Monolith-to-microservices migration locked to Q3 2025…"*

**Từ `business_context` (DS01)** (join qua `context_id`):
- `business_roadmap_summary` — bức tranh chiến lược. Ví dụ CTX-001: *"Scale Backend team to support new microservices migration in Q3 2025"*
- `strategic_priority` — mức độ ưu tiên (High / Medium / Low)
- `additional_context` — ghi chú bổ sung. Ví dụ: *"Current monolith causes 40% latency on peak hours."*

> **Lưu ý**: 10 hire request (REQ-011 đến REQ-017, REQ-026, REQ-027) có `context_id = NULL` vì business context (CTX-024 trở đi) chưa được cung cấp. Agent phải xử lý fallback: dùng chính `business_justification` + `team_skill_gap_summary` + `key_deliverables` từ `hire_request` thay vì fail.

**Từ `headcount_plan` (DS02)** (join qua `hc_plan_id`):
- `salary_range` — khung lương đã duyệt. Ví dụ: *"$1500–$2500/month"*
- `seniority_level` — Junior / Mid / Senior
- `headcount` — số người cần tuyển
- `priority` — P1-Critical / P2-High

**Từ `team_skills_matrix` (DS04)** (lọc theo team liên quan):
- Danh sách skill hiện tại của team. Ví dụ Platform Team: EMP-011 có Python (Advanced), PostgreSQL (Advanced), Redis (Beginner); EMP-012 có Kafka (Beginner), Java (Advanced).
- Agent dùng dữ liệu này để xác nhận skill gap claim trong `hire_request` có đúng không, và đảm bảo JD must-have skills bổ sung đúng chỗ thiếu.

**Từ `jd_template` (DS03)** (join qua `target_jd_id`):
- Nếu `status = 'Not Started'` và `jd_full_text = NULL`: agent soạn JD từ đầu.
- Nếu `status = 'In Draft'` hoặc `'Ready'` và `jd_full_text` có dữ liệu: agent dùng nội dung hiện có làm bản nháp, chuyển thẳng sang chấm điểm.

### Luồng xử lý

```
TA chọn hire request (ví dụ REQ-001)
        │
        ▼
Step 1: Agent thu thập context
        (business_context + headcount_plan + team_skill_gap_summary + team_skills_matrix)
        │
        ▼
Step 2: Kiểm tra JD hiện tại
        ├── jd_full_text = NULL (status 'Not Started')
        │   └── Agent soạn JD từ đầu (draftJdTool)
        └── jd_full_text có nội dung
            └── Dùng nội dung hiện có làm bản nháp
        │
        ▼
Step 3: Chấm điểm JD (scoreJdTool)
        Đánh giá theo rubric: có đủ các section không?
        (title, responsibilities, must-have, nice-to-have, salary, work mode, English level)
        → Trả về clarity_score (0-100) + flagged_gaps (danh sách section thiếu/yếu)
        │
        ▼
Step 4: clarity_score < 70?
        ├── CÓ, revision_count < 2
        │   └── Agent tự sửa (reviseJdTool), quay lại Step 3
        └── KHÔNG, hoặc đã sửa 2 lần
            └── Trình cho TA review
        │
        ▼
Step 5: TA review JD [HITL gate]
        ├── Approve → JD status = 'Ready', chuyển sang Module 2
        ├── Edit → TA sửa nội dung, lưu lại, status = 'Ready'
        └── Request Revision → thêm feedback của TA vào flagged_gaps, quay lại Step 4
```

### Output — Agent ghi gì vào DB?

Cập nhật bảng `jd_template` (DS03):

| Cột | Mô tả | Ví dụ |
|---|---|---|
| `agent_jd_draft_text` | Bản nháp JD do agent soạn (trước khi TA duyệt) | `"## Senior Backend Developer – SETA International\n\n### Responsibilities\n- Design and implement..."` |
| `agent_clarity_score` | Điểm chất lượng 0-100 | `85.5` |
| `agent_flagged_gaps` | Danh sách section thiếu/yếu | `"Missing: English level requirement"` |
| `agent_revision_count` | Số lần agent đã tự sửa (tối đa 2) | `1` |
| `agent_last_run_at` | Timestamp lần chạy gần nhất | `2025-04-01 10:00:00` |
| `jd_full_text` | Nội dung JD chính thức (sau khi TA approve) | Markdown JD đầy đủ |
| `status` | Trạng thái JD | `'Ready'` (sau khi TA approve) |

### Ví dụ cụ thể với mock data

**Case 1 — JD đã có nội dung (REQ-001 → JD-BE-SR-001)**

JD-BE-SR-001 có `status = 'In Draft'`, `jd_full_text` đã có nội dung hoàn chỉnh (1500+ ký tự, bao gồm sections: About the Role, Responsibilities, Must-Have Requirements, Nice-to-Have, Offer). Agent không cần draft lại — chỉ chạy `scoreJdTool` để chấm điểm. Kỳ vọng `clarity_score` cao (>80) vì JD đã đầy đủ.

Context mà agent đọc để đánh giá:
- `team_skill_gap_summary`: "No Kafka, No Redis, chỉ 1 người Python microservices"
- `must_have_skills` trong JD: "Python (3+ yrs), PostgreSQL (advanced), RESTful API, Microservices"
- Agent xác nhận: JD must-have skills cover đúng skill gap → OK.
- `nice_to_have_skills`: "Docker, Redis, Kafka, Cloud, Kubernetes"
- Agent nhận ra: Redis và Kafka là skill gap quan trọng nhưng chỉ nằm ở nice-to-have, không phải must-have → có thể flag "Kafka should be must-have given team gap" → `agent_flagged_gaps`.

**Case 2 — JD cần soạn từ đầu (REQ-011 → JD-DE-SR-004)**

JD-DE-SR-004 có `status = 'Not Started'`, toàn bộ content là NULL. Agent phải draft hoàn toàn:
- Đọc `hire_request` REQ-011: *"Real-time analytics platform requires expansion"*, skill gap: *"No Kafka/Spark production ownership"*, deliverables: *"Build streaming data platform"*
- `business_context` = NULL (CTX-024 không tồn tại) → fallback dùng chính 3 field trên
- `headcount_plan` HC-2025-Q2-024: Data Engineer, Senior, $2800–$3600/month, 3 headcount
- Agent tổng hợp và draft JD với: title "Senior Data Engineer", must-have: Kafka, Spark, Python, SQL, Airflow; nice-to-have: dbt, BigQuery, GCP; salary: $2800–$3600/month; seniority: Senior; English: B2+; work mode: infer from similar JDs in DB.

---

## Module 2 — CV Shortlist Review

### Mục đích

Sau khi JD đã được TA duyệt (`status = 'Ready'`), agent đánh giá từng CV trong shortlist theo JD đó:
- So sánh kỹ năng, kinh nghiệm, trình độ tiếng Anh, mức lương kỳ vọng
- Cho điểm phù hợp (fit_score 0-100)
- Phân tích điểm mạnh (fit_summary) và điểm thiếu (gap_summary) của ứng viên
- Đưa ra khuyến nghị: Pass / Reject / Need More Info
- Gợi ý câu hỏi phỏng vấn dựa trên gap và scorecard
- Xếp hạng ứng viên trong shortlist (rank 1 = phù hợp nhất)
- Trình shortlist report cho TA duyệt

### Input — Agent đọc gì?

**Từ `jd_template` (DS03)** — JD đã duyệt:
- `must_have_skills` — tiêu chí bắt buộc. Ví dụ JD-BE-SR-001: *"Python (3+ yrs production), PostgreSQL/SQL (advanced), RESTful API design, Microservices architecture"*
- `nice_to_have_skills` — tiêu chí ưu tiên: *"Docker, Redis, Apache Kafka, Cloud (AWS or GCP), System design, Kubernetes"*
- `min_yoe` / `max_yoe` — yêu cầu kinh nghiệm. Ví dụ: min 4 năm
- `english_level_required` — Ví dụ: B2
- `salary_range` — Ví dụ: $1500–$2500/month
- `jd_full_text` — nội dung đầy đủ để agent hiểu ngữ cảnh sâu hơn

**Từ `shortlist_cv` (DS07)** — mỗi CV ứng viên:
- `cv_skills` — kỹ năng trên CV. Ví dụ CV-001: *"Python, FastAPI, PostgreSQL, Redis, Kafka, Docker, AWS"*
- `years_of_experience` — số năm kinh nghiệm. Ví dụ: 6
- `english_level` — trình độ Anh ngữ. Ví dụ: C1
- `salary_expectation` — mức lương kỳ vọng. Ví dụ: *"$1800–$2500"*
- `current_title`, `current_company`, `past_companies` — background
- `cv_summary_by_ta` — nhận xét sơ bộ của TA. Ví dụ CV-001: *"Strong fit. 6yr Python, Fintech background (Techcombank). Has Kafka production exp…"*

**Từ `scorecard` (DS05)** — tiêu chí phỏng vấn:
- Agent dùng `sample_questions` để generate `agent_suggested_questions`. Ví dụ SC-BE-SR-001 cung cấp: *"Design a URL shortener handling 1M req/day…"*, *"Write a Python function to flatten a nested dict…"*
- Agent chọn/adapt câu hỏi phù hợp với gap cụ thể của từng ứng viên (ví dụ ứng viên thiếu Kafka → hỏi về Kafka design; ứng viên thiếu system design → hỏi bài system design).

### Luồng xử lý

```
JD đã được duyệt (status = 'Ready')
        │
        ▼
Step 6: Lấy danh sách CV cho request_id
        (SELECT * FROM shortlist_cv WHERE request_id = :request_id)
        │
        ▼
Step 7: Với mỗi CV → screenCvTool
        ┌──────────────────────────────────────────────────────────┐
        │  So sánh cv_skills vs must_have_skills                   │
        │  So sánh years_of_experience vs min_yoe                  │
        │  So sánh english_level vs english_level_required         │
        │  So sánh salary_expectation vs salary_range              │
        │  Đọc cv_summary_by_ta để bổ sung context                │
        │  → fit_score (0-100)                                     │
        │  → fit_summary (điểm mạnh)                               │
        │  → gap_summary (điểm thiếu)                              │
        │  → recommendation (Pass / Reject / Need More Info)       │
        │  → suggested_questions (từ scorecard + gap cụ thể)       │
        └──────────────────────────────────────────────────────────┘
        │
        ▼
Step 8: Xếp hạng toàn bộ shortlist (generateReportTool)
        Sắp xếp theo fit_score giảm dần → agent_shortlist_rank (1 = cao nhất)
        │
        ▼
Step 9: TA review shortlist report [HITL gate]
        ├── Confirm → giữ nguyên kết quả agent
        └── Override → TA sửa recommendation/rank cho từng ứng viên cụ thể
```

### Output — Agent ghi gì vào DB?

Cập nhật bảng `shortlist_cv` (DS07) cho mỗi CV:

| Cột | Mô tả | Ví dụ (CV-001) |
|---|---|---|
| `agent_recommendation` | Pass / Reject / Need More Info | `'Pass'` |
| `agent_fit_score` | Điểm phù hợp 0-100. Dưới 60 → suggest Reject | `82` |
| `agent_fit_summary` | Phân tích điểm mạnh | *"Strong Python + Kafka production experience aligns with JD must-haves. Fintech background at Techcombank relevant to payment module rewrite."* |
| `agent_gap_summary` | Phân tích điểm thiếu | *"No Redis production experience (Beginner level per team matrix). Microservices project scope at VNG unclear."* |
| `agent_suggested_questions` | Câu hỏi phỏng vấn gợi ý | *"1. Walk through your Kafka migration project at VNG. What was the message throughput?\n2. How did you handle DB schema migration with zero downtime?"* |
| `agent_shortlist_rank` | Thứ hạng trong shortlist (1 = tốt nhất) | `2` |
| `agent_screened_at` | Timestamp lần đánh giá | `2025-04-01 11:00:00` |

### Ví dụ cụ thể với mock data

**REQ-001 — 6 ứng viên cho Senior Backend Developer (JD-BE-SR-001)**

Agent nhận 6 CV và đánh giá dựa trên JD must-have: Python (3+ yrs production), PostgreSQL (advanced), RESTful API, Microservices; min_yoe = 4; english_level_required = B2.

| CV | Ứng viên | YOE | Skills chính | Kỳ vọng agent |
|---|---|---|---|---|
| CV-001 | Candidate A | 6 | Python, FastAPI, PostgreSQL, Redis, Kafka, Docker, AWS | **Pass** — cover toàn bộ must-have + Kafka/Redis nice-to-have. English C1 > B2. fit_score cao (~82-88). |
| CV-002 | Candidate B | 8 | Python, Django, FastAPI, PostgreSQL, Kafka, Redis, Kubernetes | **Pass** — lead-level, cover must-have + Kubernetes. Salary $2200-$3000 ở upper end budget ($2500 max). Rank #1 dự kiến. |
| CV-003 | Candidate C | 5 | Python, Flask, FastAPI, PostgreSQL, SQLAlchemy, Docker | **Need More Info** — no Kafka, no Redis (gap lớn vs team need). TA ghi "project ownership unclear". Cần probe thêm. |
| CV-004 | Candidate D | 6 | Java, Spring Boot, MySQL, Kafka, Docker | **Need More Info** — Java primary, không có Python trên CV. Kafka là plus nhưng Python gap là must-have miss. Agent không nên auto-reject (TA ghi "Guardrail"). |
| CV-005 | Candidate E | 3 | Python, Django, PostgreSQL, Docker, REST API | **Reject** — YOE 3 < min 4. English B1 < B2. TA ghi "too junior". fit_score thấp (<60). |
| CV-006 | Candidate F | 5 | Python, pandas, scikit-learn, SQL, Tableau | **Reject** — Data Scientist, không phải backend dev. Không có API/server experience. "Applied to wrong role." fit_score rất thấp. |

Validation: So sánh `agent_recommendation` với `hm_decision` trong `hm_feedback_tracker` (DS08), HM thực tế đã quyết định: FB-001 (Pass), FB-002 (Pass), FB-003 (Need More Info), FB-004 (Need More Info), FB-005 (Reject), FB-006 (Reject). Kết quả agent kỳ vọng khớp với HM decision — đây là cách đánh giá chất lượng screening của agent.

**REQ-006 — 5 ứng viên cho AI/ML Engineer (JD-AI-SR-001)**

JD must-have: Python, PyTorch/TensorFlow, Model training end-to-end, Statistical modeling; min_yoe = 3; english_level = B2.

| CV | Ứng viên | YOE | Kỳ vọng agent | HM decision (DS08) |
|---|---|---|---|---|
| CV-007 | Candidate G | 5 | **Pass** — VinAI Research, PyTorch, MLflow, LLM fine-tuning Vietnamese data. Rank #1. | Pass ✓ |
| CV-008 | Candidate H | 4 | **Pass** — LLM + deployment stack, chatbot 3M users. Rank #2. | Pass ✓ |
| CV-009 | Candidate I | 3 | **Need More Info** — scikit-learn only, no PyTorch/DL. Analytics, not ML engineering. | Overdue (SLA breach) |
| CV-010 | Candidate J | 2 | **Need More Info** — academic profile, 0 production projects. YOE 2 < 3. | Overdue (SLA breach) |
| CV-011 | Candidate K | 4 | **Reject** — Frontend dev, no Python, no ML. Screening error. | Reject ✓ |

**REQ-011 — 3 ứng viên cho Data Engineer (JD-DE-SR-004, JD chưa soạn)**

JD-DE-SR-004 có `status = 'Not Started'`, nội dung NULL. CV-017/018/019 có `jd_id = NULL`.

Luồng: Module 1 chạy trước (soạn JD từ đầu) → TA approve → Module 2 mới chạy được. Agent backfill `jd_id = 'JD-DE-SR-004'` cho 3 CV này trước khi screening.

---

## Quy tắc đánh giá (Scoring Logic)

### fit_score (0-100)

Agent tính fit_score dựa trên:

| Tiêu chí | Trọng số gợi ý | Logic |
|---|---|---|
| Must-have skills match | 40% | Đếm % must-have skills xuất hiện trong `cv_skills`. Ví dụ JD có 4 must-have, CV cover 3/4 → 75% × 40 = 30 điểm. |
| Years of experience | 15% | YOE >= min_yoe → full score. YOE < min_yoe → giảm tuyến tính. |
| Nice-to-have skills match | 15% | Bonus cho các nice-to-have có trong CV. |
| English level | 10% | eng_level >= required → full. eng_level < required → giảm. |
| Salary fit | 10% | salary_expectation nằm trong salary_range → full. Vượt → giảm. |
| Background relevance | 10% | Đánh giá từ `cv_summary_by_ta`, `current_company`, `domain_experience`. Agent dùng NLP để đánh giá. |

### recommendation logic

- `fit_score >= 70` → **Pass** (recommend proceed to interview)
- `60 <= fit_score < 70` → **Need More Info** (có gap cần clarify, TA nên hỏi thêm)
- `fit_score < 60` → **Reject** (suggest reject, nhưng không tự quyết — TA review final)

### Guardrails

- Agent **không bao giờ auto-reject** mà không trình TA. Mọi recommendation đều là advisory.
- Nếu `cv_summary_by_ta` có ghi chú đặc biệt (ví dụ "Guardrail: cannot auto-reject") → agent phải tôn trọng, đưa vào `agent_fit_summary`.
- Nếu CV không match role (ví dụ Data Scientist apply Backend Developer) → agent ghi rõ trong `agent_gap_summary` nhưng vẫn để TA quyết.
- `agent_suggested_questions` phải gắn với gap cụ thể, không dùng câu hỏi generic. Ưu tiên lấy/adapt từ `scorecard.sample_questions` cho cùng role.

---

## SLA Tracking (phần bổ sung sau Module 2)

Sau khi TA xác nhận shortlist report và gửi cho HM bên ngoài hệ thống:

- Agent tạo record trong `hm_feedback_tracker` (DS08) cho mỗi CV đã confirm, với `feedback_deadline_48h = NOW() + 48 hours`.
- Một companion job chạy hàng giờ kiểm tra các record `feedback_status = 'Pending'`:
  - 24h trước deadline → gửi soft reminder cho TA
  - 12h trước deadline → gửi urgent reminder cho TA
  - Quá deadline → gửi escalation cho TA Lead, đánh dấu `sla_breach = 'Y'`, `feedback_status = 'Overdue'`
- Agent chỉ nhắc TA, không liên hệ trực tiếp HM.

Trong mock data, FB-009 và FB-010 (Candidate I và J, REQ-006) là 2 record đã breach SLA — có thể dùng để test logic escalation.

---

## Agent Architecture — BDI Model

HireAssist được thiết kế theo mô hình BDI (Belief–Desire–Intention), phù hợp với yêu cầu "Agent architecture accounts for 35% of total score" trong rubric.

### Beliefs (Trạng thái đã biết)

Agent duy trì beliefs từ dữ liệu truy vấn được ở mỗi thời điểm:

| Belief | Nguồn | Cập nhật khi |
|---|---|---|
| Business context, roadmap, priority | `business_context` (DS01) | Step 1 (fetch context) |
| Headcount plan, salary range, seniority | `headcount_plan` (DS02) | Step 1 |
| Team skill-gap summary, key deliverables | `hire_request` (DS06) | Step 1 |
| Team current skills & proficiency | `team_skills_matrix` (DS04) | Step 1 |
| JD content hiện tại, status, must-have/nice-to-have skills | `jd_template` (DS03) | Step 2, cập nhật sau mỗi lần draft/score/revise |
| JD clarity score, flagged gaps | `jd_template` agent output cols | Step 3-4, cập nhật mỗi scoring pass |
| CV data: skills, YOE, English, salary, TA summary | `shortlist_cv` (DS07) | Step 6 (load) |
| Interview criteria, weights, sample questions | `scorecard` (DS05) | Step 7 (load) |
| SLA timestamps, breach status, reminder status | `hm_feedback_tracker` (DS08) | Step 10-11 |

### Desires (Mục tiêu & ràng buộc)

- **Mục tiêu**: Hoàn thành JD + shortlist report + SLA tracking cho TA, trong một phiên chạy duy nhất.
- **Ràng buộc cứng**:
  - Không bias — đánh giá chỉ dựa trên tiêu chí JD, không phỏng đoán ngoài dữ liệu.
  - Không overstating fit — `agent_fit_summary` phải traceable về `cv_skills` / `cv_summary_by_ta` / `jd_template`, không fabricate.
  - TA confirms trước khi gửi cho HM — mọi output đều advisory, TA có quyền override.
  - Agent không liên hệ trực tiếp HM — chỉ remind TA.

### Intentions (Chuỗi tool calls)

```
fetchContextTool(request_id)
  → draftJdTool(context_bundle, jd_template)        [nếu JD chưa có]
  → scoreJdTool(draft_text, jd_template, context)
  → reviseJdTool(draft_text, flagged_gaps, context)  [nếu score < 70, max 2 lần]
  → updateJdTool(jd_id, final_text)                  [sau TA approve]
  → screenCvTool(cv, jd, scorecard)                  [lặp cho mỗi CV]
  → generateReportTool(all_screened_cvs)
  → startSlaTrackerTool(request_id)
  → sendReminderTool(level, feedback_row)             [companion job, hourly]
```

Mỗi intention là một tool call cụ thể. Agent re-plan khi gặp failure (xem phần Failure Handling bên dưới).

---

## Tool Definitions (Input/Output Contracts)

### fetchContextTool

```
fetchContextTool(request_id: VARCHAR)
→ ContextBundle {
    hire_request: {
      request_id, position_title, team_skill_gap_summary,
      key_deliverables, requesting_manager, hr_owner,
      business_justification, urgency_level
    },
    business_context: {
      project_name, business_roadmap_summary,
      strategic_priority, additional_context
    } | NULL,                                      ← NULL nếu context_id NULL
    headcount_plan: {
      position, seniority_level, headcount,
      salary_range, priority, target_start_date
    },
    team_skills: [
      { member_id, member_role, skill, proficiency_level }
    ]
  }
```

**DB queries**:
```sql
SELECT * FROM ta03.hire_request WHERE request_id = :request_id;
SELECT * FROM ta03.business_context WHERE context_id = :context_id;  -- LEFT JOIN
SELECT * FROM ta03.headcount_plan WHERE hc_plan_id = :hc_plan_id;
SELECT * FROM ta03.team_skills_matrix
  WHERE team_name IN (SELECT team_name FROM ta03.team_skills_matrix
    WHERE member_role ILIKE '%' || :position_keyword || '%');
```

### draftJdTool

```
draftJdTool(context_bundle: ContextBundle, jd_template: JdTemplateRow)
→ TEXT (Markdown JD draft)
```

**Khi nào gọi**: `jd_template.status = 'Not Started'` AND `jd_full_text IS NULL`.

**LLM prompt strategy**: System prompt chứa template structure (sections: About the Role, Responsibilities, Must-Have, Nice-to-Have, Offer), injected với:
- `context_bundle.hire_request.team_skill_gap_summary` → shapes must-have skills
- `context_bundle.hire_request.key_deliverables` → shapes responsibilities
- `context_bundle.headcount_plan.salary_range` → salary section
- `context_bundle.headcount_plan.seniority_level` → YOE range & tone
- `context_bundle.team_skills` → cross-validate skill gaps (ví dụ: team có Python Advanced nhưng Kafka Beginner → Kafka nên là must-have)
- `context_bundle.business_context.business_roadmap_summary` → "About the Role" section context

**DB write**:
```sql
UPDATE ta03.jd_template
SET agent_jd_draft_text = :draft_text,
    agent_last_run_at = NOW()
WHERE jd_id = :jd_id;
```

### scoreJdTool

```
scoreJdTool(draft_text: TEXT, jd_template: JdTemplateRow, context_bundle: ContextBundle)
→ {
    clarity_score: NUMERIC(0-100),
    flagged_gaps: TEXT[]
  }
```

**Rubric kiểm tra** (mỗi mục tính trọng số vào clarity_score):

| Section | Trọng số | Kiểm tra gì |
|---|---|---|
| Title / Position | 5% | Có rõ tên vị trí không |
| Responsibilities | 20% | Có bullet list cụ thể không, có khớp với `key_deliverables` không |
| Must-have skills | 25% | Có liệt kê rõ ràng không, có cover `team_skill_gap_summary` không |
| Nice-to-have skills | 10% | Có phân biệt rõ với must-have không |
| YOE requirement | 10% | Có nêu min/max YOE không, có khớp `headcount_plan.seniority_level` không |
| Salary range | 10% | Có nêu salary không, có khớp `headcount_plan.salary_range` không |
| English level | 5% | Có nêu yêu cầu English không |
| Work mode | 5% | Hybrid / Remote / On-site có nêu rõ không |
| Benefits / Offer | 10% | Có section offer/benefits không |

**DB write**:
```sql
UPDATE ta03.jd_template
SET agent_clarity_score = :score,
    agent_flagged_gaps = :gaps,
    agent_last_run_at = NOW()
WHERE jd_id = :jd_id;
```

### reviseJdTool

```
reviseJdTool(draft_text: TEXT, flagged_gaps: TEXT[], context_bundle: ContextBundle)
→ TEXT (revised Markdown JD draft)
```

**Khi nào gọi**: `agent_clarity_score < 70` AND `agent_revision_count < 2`.

**LLM prompt strategy**: Gửi `draft_text` + `flagged_gaps` cụ thể (ví dụ: "Missing: English level requirement", "Must-have skills không cover Kafka mặc dù team thiếu Kafka") → LLM sửa đúng các section bị flag, giữ nguyên phần đã OK.

**DB write**:
```sql
UPDATE ta03.jd_template
SET agent_jd_draft_text = :revised_draft,
    agent_revision_count = agent_revision_count + 1,
    agent_last_run_at = NOW()
WHERE jd_id = :jd_id;
```

### updateJdTool

```
updateJdTool(jd_id: VARCHAR, final_text: TEXT)
→ { jd_id, status: 'Ready', updated_at: TIMESTAMP }
```

**Khi nào gọi**: Sau khi TA approve hoặc edit tại HITL gate (Step 5/6).

**DB write**:
```sql
UPDATE ta03.jd_template
SET jd_full_text = :final_text,
    status = 'Ready',
    agent_last_run_at = NOW()
WHERE jd_id = :jd_id;
```

### screenCvTool

```
screenCvTool(cv_row: ShortlistCvRow, jd_template_row: JdTemplateRow, scorecard_rows: ScoreCardRow[])
→ {
    fit_score: NUMERIC(0-100),
    fit_summary: TEXT,
    gap_summary: TEXT,
    recommendation: 'Pass' | 'Reject' | 'Need More Info',
    suggested_questions: TEXT
  }
```

**LLM prompt strategy**: System prompt chứa:
- JD must-have skills, nice-to-have skills, min_yoe, english_level_required, salary_range (structured)
- CV data: cv_skills, years_of_experience, english_level, salary_expectation, cv_summary_by_ta (structured)
- Scorecard sample_questions cho role này (ví dụ SC-BE-SR-001 cho Senior Backend Developer)

LLM phải trả về JSON:
```json
{
  "fit_score": 82,
  "recommendation": "Pass",
  "fit_summary": "Strong Python + Kafka production experience...",
  "gap_summary": "No Redis production experience...",
  "suggested_questions": "1. Walk through your Kafka migration...\n2. How did you handle..."
}
```

**Guardrail**: Nếu `fit_score < 60`, LLM mặc định `recommendation = 'Reject'` nhưng output vẫn phải qua TA review (Step 9). Agent không tự quyết reject cuối cùng.

**DB write** (per CV):
```sql
UPDATE ta03.shortlist_cv
SET jd_id = COALESCE(jd_id, :jd_id),    -- backfill nếu NULL
    agent_recommendation = :rec,
    agent_fit_score = :score,
    agent_fit_summary = :fit_summary,
    agent_gap_summary = :gap_summary,
    agent_suggested_questions = :questions,
    agent_screened_at = NOW()
WHERE cv_id = :cv_id;
```

### generateReportTool

```
generateReportTool(shortlist_cv_rows: ShortlistCvRow[])
→ {
    ranked_candidates: [
      { cv_id, full_name, agent_recommendation, agent_fit_score, agent_shortlist_rank }
    ]
  }
```

**Logic**: Sort `shortlist_cv_rows` by `agent_fit_score` DESC, assign `agent_shortlist_rank` = 1, 2, 3…

**DB write** (per CV):
```sql
UPDATE ta03.shortlist_cv
SET agent_shortlist_rank = :rank
WHERE cv_id = :cv_id;
```

### startSlaTrackerTool

```
startSlaTrackerTool(request_id: VARCHAR, confirmed_cv_ids: VARCHAR[])
→ { created_feedback_ids: VARCHAR[] }
```

**Khi nào gọi**: Sau khi TA confirm shortlist report (Step 9).

**DB write** (per CV):
```sql
INSERT INTO ta03.hm_feedback_tracker
  (feedback_id, cv_id, request_id, jd_id, candidate_name, position,
   hiring_manager, shortlisted_datetime, feedback_deadline_48h,
   sla_breach, feedback_status)
SELECT
  'FB-' || LPAD(nextval('ta03.fb_seq')::text, 3, '0'),
  cv.cv_id, :request_id, cv.jd_id, cv.full_name,
  jd.position, hr.requesting_manager,
  NOW(), NOW() + INTERVAL '48 hours', 'N', 'Pending'
FROM ta03.shortlist_cv cv
JOIN ta03.jd_template jd ON cv.jd_id = jd.jd_id
JOIN ta03.hire_request hr ON cv.request_id = hr.request_id
WHERE cv.cv_id = ANY(:confirmed_cv_ids);
```

### sendReminderTool

```
sendReminderTool(level: 'soft' | 'urgent' | 'escalation', feedback_row: HmFeedbackRow)
→ { sent: BOOLEAN, sent_at: TIMESTAMP, recipient: VARCHAR }
```

**Logic theo level**:
- `soft` (24h mark) → in-app notification cho `hire_request.hr_owner` (TA)
- `urgent` (36h mark) → in-app + email cho TA
- `escalation` (48h mark) → in-app + email cho TA + TA Lead, set `sla_breach = 'Y'`, `feedback_status = 'Overdue'`

**DB write**:
```sql
-- Ví dụ cho level 'soft':
UPDATE ta03.hm_feedback_tracker
SET reminder_24h_sent = NOW()
WHERE feedback_id = :feedback_id;

-- Ví dụ cho level 'escalation':
UPDATE ta03.hm_feedback_tracker
SET escalation_48h_sent = NOW(),
    sla_breach = 'Y',
    feedback_status = 'Overdue'
WHERE feedback_id = :feedback_id;
```

---

## Failure Handling & Re-planning

| Failure Scenario | Khi nào xảy ra | Agent xử lý thế nào |
|---|---|---|
| Ambiguous / out-of-scope input | Request thiếu role type, team, hoặc seniority; hoặc câu hỏi ngoài phạm vi | Hỏi 1 câu clarifying question; reject gracefully nếu vẫn không rõ |
| Hallucination risk | JD gen & CV analysis dựa trên LLM inference | HITL gate trước mọi submission; CV summaries đánh dấu "AI-generated"; TA có thể override |
| JD clarity score < 70 | `scoreJdTool` trả điểm thấp (thiếu section, skill gap không cover) | Tự revise (max 2 lần); nếu vẫn < 70 → trình TA với `flagged_gaps` hiển thị rõ, TA tự quyết |
| TA override JD | TA sửa hoặc viết lại JD tại HITL gate | Accept edits qua `updateJdTool`; lưu version; re-score nếu TA yêu cầu |
| 48h SLA breach | TA chưa log HM feedback trước `feedback_deadline_48h` | 24h soft → 36h urgent → 48h escalation đến TA Lead. Idempotent: không gửi lại nếu đã gửi |
| `business_context` NULL | `context_id` không tồn tại trong DS01 (10 hire requests) | Fallback: dùng `hire_request.business_justification` + `team_skill_gap_summary` + `key_deliverables`. Không crash |
| `shortlist_cv.jd_id` NULL | CV shortlisted trước khi JD tồn tại (13 CVs) | Backfill `jd_id` từ `hire_request.target_jd_id`. Nếu JD vẫn 'Not Started' → skip screening, thông báo TA "Draft JD trước" |
| LLM call fail / timeout | API error hoặc rate limit | Retry 3 lần (exponential backoff: 5s, 10s, 20s). Nếu exhausted → flag row "screening failed — retry manually", không block batch |
| Wrong-role CV | CV không liên quan đến vị trí (ví dụ Data Scientist apply Backend) | Agent vẫn chấm (fit_score rất thấp, ~10-20), ghi rõ "Applied to wrong role" trong `gap_summary`. Không auto-reject — TA quyết |

---

## Technical Approach

| Component | Proposed Stack |
|---|---|
| User Interface | React 19, TanStack Router, shadcn/ui, Tailwind 4. `assistant-ui` cho chat, Kanban board cho CV shortlist, HITL inbox cho TA approvals |
| App Server | Hono, better-auth, RBAC. Module APIs (Planner, Identity) xử lý domain logic; SSE streaming cho real-time agent responses |
| Agent Runtime | Mastra — orchestrator, tool calling, routing. Stateful, DB-persisted workflows (suspend/resume tại HITL gates). Memory: conversation history + vector recall |
| LLM Provider | OpenAI API. Dùng cho JD drafting, clarity scoring, CV fit/gap analysis, pass/reject reasoning |
| Data & Infra | Postgres + pgvector (Drizzle ORM). `graphile-worker` cho SLA reminder jobs. Event Bus (LISTEN/NOTIFY). S3 cho CV và JD file storage |
| Error & Failure Handling | HITL approval gate trên mọi write tools; Mastra workflow suspends cho đến khi TA hành động. SLA reminders qua graphile-worker. Maps to Failure Handling table ở trên |
| Output Format | JD với clarity score (chat UI, editable qua HITL inbox). Shortlist report (Kanban, fit/gap tags). SLA tracker (HITL inbox) |

### Mastra Workflow Integration

Agent flow (11 bước) được model thành một Mastra workflow definition:
- Steps 1-5 (JD creation) chạy tuần tự, với conditional loop (score → revise)
- Step 5/6 là **suspend point**: workflow suspends, chờ TA approve qua HITL inbox
- Steps 7-8 (CV screening) resume sau khi TA approve JD, chạy tuần tự per-CV
- Step 9 là **suspend point thứ hai**: chờ TA confirm shortlist
- Steps 10-11 (SLA tracking) resume sau khi TA confirm; Step 11 thực tế là companion scheduled job chạy qua `graphile-worker`

```
// Pseudocode Mastra workflow
const hireAssistWorkflow = createWorkflow({
  id: 'ta03.hireAssist.runJdAndShortlistAgent',
  triggerSchema: z.object({ request_id: z.string() }),
  steps: [
    fetchContext,      // Step 1-2
    checkJdStatus,     // Step 2 decision
    draftJd,           // Step 3 (conditional)
    scoreJd,           // Step 4
    reviseJdLoop,      // Step 5 (conditional loop, max 2)
    suspendForTaJdApproval,   // Step 6 [HITL suspend]
    screenCvsLoop,     // Step 7 (per-CV loop)
    generateReport,    // Step 8
    suspendForTaShortlistApproval, // Step 9 [HITL suspend]
    startSlaTracker,   // Step 10
  ]
});
```

### Database Connection

Tool functions connect trực tiếp tới Postgres (qua Drizzle ORM), query/update các bảng `ta03.*` đã định nghĩa trong `01_schema.sql`. Không qua REST API trung gian — tools là first-class DB accessors.

---

## Tóm tắt luồng end-to-end

```
TA chọn hire request
    │
    ▼
┌─────────────────────────────────┐
│  MODULE 1 — JD CREATION         │
│                                  │
│  Collect context (DS01+02+04+06)│
│  Draft JD (nếu chưa có)         │
│  Score clarity (0-100)           │
│  Revise nếu < 70 (max 2 lần)   │
│  TA review & approve [HITL]     │
└────────────┬────────────────────┘
             │ JD status = 'Ready'
             ▼
┌─────────────────────────────────┐
│  MODULE 2 — CV SHORTLIST REVIEW │
│                                  │
│  Screen từng CV vs JD (DS07)     │
│  Fit score + recommendation      │
│  Rank candidates                 │
│  TA review report [HITL]         │
└────────────┬────────────────────┘
             │ TA confirms
             ▼
┌─────────────────────────────────┐
│  SLA TRACKING                    │
│                                  │
│  Create tracker rows (DS08)      │
│  Hourly check: 24h/36h/48h      │
│  Remind TA if approaching/breach│
└─────────────────────────────────┘
```

---

## File đi kèm

| File | Nội dung |
|---|---|
| `01_schema.sql` | CREATE TABLE cho 8 bảng (ta03 schema), bao gồm các cột [AGENT OUTPUT] |
| `02_seed_data.sql` | INSERT toàn bộ mock data (319 dòng), thứ tự load đảm bảo FK integrity |
| `03_notes.md` | Ghi chú các caveat dữ liệu (17 JD placeholder, NULL context_id, NULL jd_id…) |

