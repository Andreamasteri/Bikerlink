-- Add internal_note column to feedback_tickets table
-- This column stores private moderator notes on feedback tickets
ALTER TABLE "feedback_tickets" ADD COLUMN IF NOT EXISTS "internal_note" text;
