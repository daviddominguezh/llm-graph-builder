-- Add avatar support to tenants (column only — bucket and policies are in base migration)

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS avatar_url text;
