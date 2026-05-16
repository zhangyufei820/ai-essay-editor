-- =============================================
-- 创作广场 / Content Sharing Community
-- 数据表、索引、RLS 策略
-- 说明：幂等脚本，可重复执行。
-- =============================================

CREATE TABLE IF NOT EXISTS public.shared_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  content_data JSONB NOT NULL,
  thumbnail_url TEXT,
  preview_text TEXT,
  subject VARCHAR(50),
  tags TEXT[] DEFAULT '{}',
  ai_model_used VARCHAR(50),
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  view_count INT DEFAULT 0,
  share_out_count INT DEFAULT 0,
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
  share_code VARCHAR(12) UNIQUE NOT NULL,
  is_featured BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'under_review', 'hidden')),
  credits_earned INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.shared_contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.content_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.shared_contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL CHECK (char_length(comment_text) >= 2 AND char_length(comment_text) <= 500),
  like_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.share_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.shared_contents(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) NOT NULL,
  credits_awarded INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_shared_contents_browse ON public.shared_contents(content_type, created_at DESC) WHERE status = 'published' AND visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_shared_contents_popular ON public.shared_contents(like_count DESC, created_at DESC) WHERE status = 'published' AND visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_shared_contents_featured ON public.shared_contents(created_at DESC) WHERE is_featured = TRUE AND status = 'published';
CREATE INDEX IF NOT EXISTS idx_shared_contents_user ON public.shared_contents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_contents_code ON public.shared_contents(share_code);
CREATE INDEX IF NOT EXISTS idx_content_likes_content ON public.content_likes(content_id);
CREATE INDEX IF NOT EXISTS idx_content_likes_user_content ON public.content_likes(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_content_comments_content ON public.content_comments(content_id, created_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_share_rewards_user_content ON public.share_rewards(user_id, content_id);

ALTER TABLE public.shared_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_rewards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_contents' AND policyname = 'Anyone view public shared content'
  ) THEN
    CREATE POLICY "Anyone view public shared content" ON public.shared_contents
      FOR SELECT USING (status = 'published' AND (visibility = 'public' OR visibility = 'unlisted'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_contents' AND policyname = 'Users manage own shared content'
  ) THEN
    CREATE POLICY "Users manage own shared content" ON public.shared_contents
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_likes' AND policyname = 'Logged in users manage likes'
  ) THEN
    CREATE POLICY "Logged in users manage likes" ON public.content_likes
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_likes' AND policyname = 'Anyone view likes'
  ) THEN
    CREATE POLICY "Anyone view likes" ON public.content_likes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_comments' AND policyname = 'Anyone view published comments'
  ) THEN
    CREATE POLICY "Anyone view published comments" ON public.content_comments FOR SELECT USING (status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_comments' AND policyname = 'Logged in users create comments'
  ) THEN
    CREATE POLICY "Logged in users create comments" ON public.content_comments
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'content_comments' AND policyname = 'Users manage own comments'
  ) THEN
    CREATE POLICY "Users manage own comments" ON public.content_comments
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'share_rewards' AND policyname = 'Users view own rewards'
  ) THEN
    CREATE POLICY "Users view own rewards" ON public.share_rewards FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('shared_contents','content_likes','content_comments','share_rewards')
ORDER BY table_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('shared_contents','content_likes','content_comments','share_rewards')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('shared_contents','content_likes','content_comments','share_rewards')
ORDER BY tablename;
