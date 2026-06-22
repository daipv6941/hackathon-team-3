-- Add new columns to capture more hiring request details from chat extraction
ALTER TABLE "hiring"."requests" ADD COLUMN "team_description" text;
ALTER TABLE "hiring"."requests" ADD COLUMN "responsibilities" jsonb;
ALTER TABLE "hiring"."requests" ADD COLUMN "max_yoe" integer;
ALTER TABLE "hiring"."requests" ADD COLUMN "preferred_tech_stack" jsonb;
ALTER TABLE "hiring"."requests" ADD COLUMN "required_skills" jsonb;
ALTER TABLE "hiring"."requests" ADD COLUMN "nice_to_have_skills" jsonb;
ALTER TABLE "hiring"."requests" ADD COLUMN "onboarding_timeline" varchar(100);
