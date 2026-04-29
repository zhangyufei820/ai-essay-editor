-- AI task persistence and trace table.
-- Stores long-running Dify/OpenClaw/image task state so refreshes and disconnects
-- can recover the latest known status without relying on browser memory.

CREATE TABLE IF NOT EXISTS public.ai_task_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  message_id TEXT,
  model TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dify',
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  request_id TEXT UNIQUE NOT NULL,
  trace_id TEXT NOT NULL,
  conversation_id TEXT,
  workflow_run_id TEXT,
  upstream_task_id TEXT,
  current_tool TEXT,
  current_file TEXT,
  node_events JSONB NOT NULL DEFAULT '[]'::JSONB,
  artifacts JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  error_code TEXT,
  sanitized_error JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_task_runs_user_updated
  ON public.ai_task_runs(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_task_runs_session
  ON public.ai_task_runs(session_id, updated_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_task_runs_upstream_task
  ON public.ai_task_runs(upstream_task_id)
  WHERE upstream_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_task_runs_workflow
  ON public.ai_task_runs(workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

ALTER TABLE public.ai_task_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_task_runs_select_own" ON public.ai_task_runs;
CREATE POLICY "ai_task_runs_select_own"
  ON public.ai_task_runs FOR SELECT
  USING (auth.uid()::TEXT = user_id);

COMMENT ON TABLE public.ai_task_runs IS 'AI long-running task status and trace records';
COMMENT ON COLUMN public.ai_task_runs.request_id IS 'Client/server request correlation id';
COMMENT ON COLUMN public.ai_task_runs.trace_id IS 'Stable trace id returned to the frontend and logs';
COMMENT ON COLUMN public.ai_task_runs.node_events IS 'Sanitized Dify/OpenClaw workflow node events';
COMMENT ON COLUMN public.ai_task_runs.artifacts IS 'Sanitized generated files/images/slides detected from model output';
