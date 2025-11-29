-- 创建聊天会话表
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  processing_mode TEXT DEFAULT 'chat',
  ai_provider TEXT,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建聊天消息表
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建文件上传表
CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_url TEXT NOT NULL, -- Vercel Blob URL
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建作文批改记录表
CREATE TABLE IF NOT EXISTS public.essay_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  reviewed_text TEXT,
  writer_style TEXT, -- 文学大师风格
  feedback JSONB, -- 批改建议
  score INTEGER, -- 评分
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_reviews ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略 - chat_sessions
CREATE POLICY "chat_sessions_select_own"
  ON public.chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_sessions_insert_own"
  ON public.chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_sessions_update_own"
  ON public.chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "chat_sessions_delete_own"
  ON public.chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- 创建RLS策略 - chat_messages
CREATE POLICY "chat_messages_select_own"
  ON public.chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  ));

CREATE POLICY "chat_messages_insert_own"
  ON public.chat_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  ));

-- 创建RLS策略 - uploaded_files
CREATE POLICY "uploaded_files_select_own"
  ON public.uploaded_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "uploaded_files_insert_own"
  ON public.uploaded_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uploaded_files_delete_own"
  ON public.uploaded_files FOR DELETE
  USING (auth.uid() = user_id);

-- 创建RLS策略 - essay_reviews
CREATE POLICY "essay_reviews_select_own"
  ON public.essay_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "essay_reviews_insert_own"
  ON public.essay_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "essay_reviews_update_own"
  ON public.essay_reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON public.uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_session_id ON public.uploaded_files(session_id);
CREATE INDEX IF NOT EXISTS idx_essay_reviews_user_id ON public.essay_reviews(user_id);

-- 添加注释
COMMENT ON TABLE public.chat_sessions IS '聊天会话表';
COMMENT ON TABLE public.chat_messages IS '聊天消息表';
COMMENT ON TABLE public.uploaded_files IS '用户上传文件表';
COMMENT ON TABLE public.essay_reviews IS '作文批改记录表';
