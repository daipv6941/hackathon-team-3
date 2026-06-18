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
