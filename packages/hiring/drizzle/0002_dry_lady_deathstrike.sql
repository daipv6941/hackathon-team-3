ALTER TABLE "hiring"."jobs" ALTER COLUMN "status" SET DEFAULT 'New';--> statement-breakpoint
ALTER TABLE "hiring"."requests" ALTER COLUMN "request_status" SET DEFAULT 'New';--> statement-breakpoint
ALTER TABLE "hiring"."requests" ADD COLUMN "seniority_level" varchar(20);--> statement-breakpoint
ALTER TABLE "hiring"."requests" ADD COLUMN "salary_range" varchar(50);--> statement-breakpoint
ALTER TABLE "hiring"."requests" ADD COLUMN "work_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "hiring"."requests" ADD COLUMN "min_yoe" integer;--> statement-breakpoint
ALTER TABLE "hiring"."requests" ADD COLUMN "english_level_required" varchar(5);