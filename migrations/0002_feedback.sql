-- Feedback system schema.
--
-- App table (snake_case) for user-submitted feedback: bug reports, feature
-- requests, and general notes. Reads/writes go through the server functions in
-- src/lib/feedback/ (getSql() -> Neon in prod, PGLite in preview). This file is
-- the single source of truth for the table and applies to both backends.
--
-- No seed/sample rows: the admin view's empty state is driven by a genuinely
-- empty query result, never fabricated data.

create table if not exists feedback (
  id text not null primary key,
  type text not null check (type in ('bug', 'feature', 'general')),
  title text not null,
  category text,
  description text not null,
  steps_or_use_cases text,
  severity_or_priority text,
  rating integer,
  votes integer not null default 0,
  status text not null default 'under_review'
    check (status in ('under_review', 'planned', 'in_progress', 'completed', 'declined')),
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on feedback (created_at);
