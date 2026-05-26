-- Add last_active_at column to profiles table to track real-time user activity
ALTER TABLE public.profiles ADD COLUMN last_active_at timestamp with time zone;
