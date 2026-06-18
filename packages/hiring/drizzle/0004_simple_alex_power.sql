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
ALTER TABLE "hiring"."candidates" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "jd_id";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "shortlisted_by";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "shortlisted_at";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_recommendation";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_fit_score";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_fit_summary";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_gap_summary";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_suggested_questions";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_shortlist_rank";--> statement-breakpoint
ALTER TABLE "hiring"."candidates" DROP COLUMN "agent_screened_at";