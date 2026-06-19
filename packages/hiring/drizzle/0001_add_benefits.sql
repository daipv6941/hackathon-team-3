-- Add benefits column to hiringRequests table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'hiring'
        AND table_name = 'requests'
        AND column_name = 'benefits'
    ) THEN
        ALTER TABLE "hiring"."requests" ADD COLUMN "benefits" text;
    END IF;
END $$;
