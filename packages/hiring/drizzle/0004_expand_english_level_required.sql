-- Expand english_level_required field to support longer values like TOEIC, IELTS, etc
ALTER TABLE hiring.requests ALTER COLUMN english_level_required TYPE varchar(50);
ALTER TABLE hiring.jobs ALTER COLUMN english_level_required TYPE varchar(50);
