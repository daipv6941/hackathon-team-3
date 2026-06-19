CREATE SCHEMA "hiring";
--> statement-breakpoint
CREATE TABLE "hiring"."requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"position_title" varchar(255) NOT NULL,
	"team_name" varchar(100),
	"urgency_level" varchar(20) NOT NULL,
	"headcount_requested" integer DEFAULT 1 NOT NULL,
	"business_justification" text,
	"team_skill_gap_summary" text,
	"key_deliverables" text,
	"requesting_manager" varchar(255),
	"hr_owner" uuid NOT NULL,
	"approval_status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"request_status" varchar(30) DEFAULT 'Not Started' NOT NULL,
	"jd_id" varchar(50),
	"shortlist_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "hiring"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"jd_id" varchar(50) NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"position" varchar(100) NOT NULL,
	"seniority_level" varchar(10) NOT NULL,
	"min_yoe" integer,
	"max_yoe" integer,
	"must_have_skills" text,
	"nice_to_have_skills" text,
	"english_level_required" varchar(5),
	"work_mode" varchar(20),
	"salary_range" varchar(50),
	"key_responsibilities" text,
	"jd_full_text" text,
	"status" varchar(20) DEFAULT 'Not Started' NOT NULL,
	"agent_jd_draft_text" text,
	"agent_clarity_score" numeric(5, 2),
	"agent_flagged_gaps" text,
	"agent_revision_count" integer DEFAULT 0,
	"agent_last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_jd_id_unique" UNIQUE("jd_id")
);
--> statement-breakpoint
CREATE TABLE "hiring"."candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cv_id" varchar(50) NOT NULL,
	"candidate_id" varchar(50) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"current_title" varchar(100),
	"current_company" varchar(100),
	"past_companies" text,
	"years_of_experience" integer,
	"cv_skills" text,
	"english_level" varchar(5),
	"salary_expectation" varchar(50),
	"cv_summary_by_ta" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_cv_id_unique" UNIQUE("cv_id")
);
--> statement-breakpoint
CREATE TABLE "hiring"."shortlist_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"jd_id" varchar(50) NOT NULL,
	"cv_id" varchar(50) NOT NULL,
	"candidate_id" varchar(50) NOT NULL,
	"candidate_name" varchar(100) NOT NULL,
	"fit_score" numeric(5, 2) NOT NULL,
	"recommendation" varchar(20) NOT NULL,
	"confidence" varchar(10),
	"fit_summary" text,
	"gap_summary" text,
	"category_scores" jsonb,
	"matched_evidence" jsonb,
	"flags" jsonb,
	"interview_questions" jsonb,
	"follow_up_questions" jsonb,
	"reject_reason" text,
	"screened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cv_id" varchar(50) NOT NULL,
	"jd_id" varchar(50) NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"candidate_id" varchar(50) NOT NULL,
	"candidate_name" varchar(100) NOT NULL,
	"hiring_manager" uuid,
	"hm_decision" varchar(20),
	"hm_feedback" text,
	"feedback_submitted_at" timestamp with time zone,
	"feedback_deadline" timestamp with time zone,
	"sla_breach" boolean DEFAULT false,
	"interview_stage" varchar(50),
	"interview_date" timestamp with time zone,
	"interview_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."interview_prep" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cv_id" varchar(50) NOT NULL,
	"jd_id" varchar(50) NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"scorecard_id" varchar(50),
	"interview_stage" varchar(50),
	"suggested_questions" text,
	"evaluation_criteria" jsonb,
	"score" numeric(5, 2),
	"interviewer_feedback" text,
	"pass_fail" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."threads" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" varchar(50) NOT NULL,
	"title" varchar(255),
	"context" jsonb,
	"current_phase" varchar(30) DEFAULT 'initial',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" varchar(100) NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(30),
	"thinking_content" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
