-- PhET 互动实验室：使用记录、学习事件和成就

CREATE TABLE IF NOT EXISTS public.phet_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  sim_id TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  duration_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phet_usage_user ON public.phet_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_phet_usage_sim ON public.phet_usage(sim_id);
CREATE INDEX IF NOT EXISTS idx_phet_usage_user_sim_completed ON public.phet_usage(user_id, sim_id, completed);
CREATE INDEX IF NOT EXISTS idx_phet_usage_created_at ON public.phet_usage(created_at);

CREATE TABLE IF NOT EXISTS public.phet_learning_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  sim_id TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phet_learning_events_user ON public.phet_learning_events(user_id);
CREATE INDEX IF NOT EXISTS idx_phet_learning_events_type ON public.phet_learning_events(event_type);

CREATE TABLE IF NOT EXISTS public.phet_user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_phet_user_achievements_user ON public.phet_user_achievements(user_id);

COMMENT ON TABLE public.phet_usage IS 'PhET 实验室使用记录';
COMMENT ON TABLE public.phet_learning_events IS 'PhET 实验室学习事件，用于游戏化和审计';
COMMENT ON TABLE public.phet_user_achievements IS 'PhET 实验室用户成就';
