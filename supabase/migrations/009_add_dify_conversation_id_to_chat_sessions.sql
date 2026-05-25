-- Store the upstream Dify memory conversation separately from the local chat
-- session UUID. This keeps local history grouping stable while allowing Dify
-- chat apps to reuse their memory window across turns.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS dify_conversation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_dify_conversation_id
  ON public.chat_sessions(dify_conversation_id)
  WHERE dify_conversation_id IS NOT NULL;

COMMENT ON COLUMN public.chat_sessions.dify_conversation_id
  IS 'Upstream Dify conversation_id used to preserve Dify memory across turns';
