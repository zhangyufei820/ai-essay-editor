-- =============================================
-- 用户学习系统 - 数据表、索引、RLS 策略
-- 执行方式：Supabase Dashboard > SQL Editor > Run
-- 说明：
-- 1. 本脚本幂等，可重复执行。
-- 2. 原计划中的 idx_flashcards_review 使用 WHERE next_review <= NOW()，
--    PostgreSQL 不允许在 partial index 谓词中使用非 immutable 函数；
--    这里改为 (user_id, next_review) 普通索引，查询 WHERE next_review <= now()
--    仍可使用索引范围扫描。
-- =============================================

-- 1. 用户上传文件表（资料夹核心）
CREATE TABLE IF NOT EXISTS public.user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT DEFAULT 0,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100),
  extracted_text TEXT,
  summary TEXT,
  tags TEXT[] DEFAULT '{}',
  subject VARCHAR(50),
  status VARCHAR(20) DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 用户学习进度表（每用户一行，游戏化核心）
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp INT DEFAULT 0,
  level INT DEFAULT 1,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_study_date DATE,
  total_study_minutes INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_flashcards_reviewed INT DEFAULT 0,
  total_quizzes_completed INT DEFAULT 0,
  total_ai_generations INT DEFAULT 0,
  subject_mastery JSONB DEFAULT '{}',
  achievements TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 学习会话记录表（每次学习行为一条）
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type VARCHAR(50) NOT NULL,
  subject VARCHAR(50),
  topic VARCHAR(200),
  duration_seconds INT DEFAULT 0,
  items_completed INT DEFAULT 0,
  items_correct INT DEFAULT 0,
  xp_earned INT DEFAULT 0,
  details JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- 4. 闪卡表（SM-2 间隔重复）
CREATE TABLE IF NOT EXISTS public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_name VARCHAR(200) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  difficulty INT DEFAULT 3,
  tags TEXT[] DEFAULT '{}',
  card_type VARCHAR(20) DEFAULT 'fact',
  ease_factor FLOAT DEFAULT 2.5,
  interval_days INT DEFAULT 1,
  repetitions INT DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  times_correct INT DEFAULT 0,
  times_wrong INT DEFAULT 0,
  subject VARCHAR(50),
  source_file_id UUID REFERENCES public.user_files(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 错题本
CREATE TABLE IF NOT EXISTS public.mistake_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject VARCHAR(50) NOT NULL,
  topic VARCHAR(200),
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  explanation TEXT,
  difficulty INT DEFAULT 3,
  times_reviewed INT DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  mastered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 教师智能体表
CREATE TABLE IF NOT EXISTS public.teacher_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  subject VARCHAR(50),
  grade VARCHAR(20),
  template VARCHAR(50) NOT NULL,
  system_prompt TEXT NOT NULL,
  style VARCHAR(50) DEFAULT 'balanced',
  dify_app_id VARCHAR(100),
  dify_api_key TEXT,
  knowledge_base_id VARCHAR(100),
  reference_files UUID[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'draft',
  is_public BOOLEAN DEFAULT FALSE,
  share_code VARCHAR(20) UNIQUE,
  total_conversations INT DEFAULT 0,
  total_messages INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- 7. 教师-学生关系表
CREATE TABLE IF NOT EXISTS public.teacher_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  class_name VARCHAR(100),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, student_id)
);

-- =============================================
-- 索引（高频查询加速）
-- =============================================

CREATE INDEX IF NOT EXISTS idx_user_files_user ON public.user_files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user ON public.learning_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_review ON public.flashcards(user_id, next_review);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON public.flashcards(user_id, deck_name);
CREATE INDEX IF NOT EXISTS idx_mistake_book_active ON public.mistake_book(user_id) WHERE mastered = FALSE;
CREATE INDEX IF NOT EXISTS idx_teacher_agents_share ON public.teacher_agents(share_code) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_teacher_students_teacher ON public.teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_students_student ON public.teacher_students(student_id);

-- =============================================
-- RLS 策略（行级安全）
-- =============================================

ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistake_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_files' AND policyname = 'Users manage own files'
  ) THEN
    CREATE POLICY "Users manage own files" ON public.user_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_progress' AND policyname = 'Users manage own progress'
  ) THEN
    CREATE POLICY "Users manage own progress" ON public.user_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'learning_sessions' AND policyname = 'Users manage own sessions'
  ) THEN
    CREATE POLICY "Users manage own sessions" ON public.learning_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'flashcards' AND policyname = 'Users manage own flashcards'
  ) THEN
    CREATE POLICY "Users manage own flashcards" ON public.flashcards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mistake_book' AND policyname = 'Users manage own mistakes'
  ) THEN
    CREATE POLICY "Users manage own mistakes" ON public.mistake_book FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_agents' AND policyname = 'Teachers manage own agents'
  ) THEN
    CREATE POLICY "Teachers manage own agents" ON public.teacher_agents FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_agents' AND policyname = 'Anyone view published agents'
  ) THEN
    CREATE POLICY "Anyone view published agents" ON public.teacher_agents FOR SELECT USING (status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_students' AND policyname = 'Teachers manage own class'
  ) THEN
    CREATE POLICY "Teachers manage own class" ON public.teacher_students FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_students' AND policyname = 'Students see own binding'
  ) THEN
    CREATE POLICY "Students see own binding" ON public.teacher_students FOR SELECT USING (auth.uid() = student_id);
  END IF;
END
$$;

-- =============================================
-- 验证查询
-- =============================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_files','user_progress','learning_sessions','flashcards','mistake_book','teacher_agents','teacher_students')
ORDER BY table_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_files','user_progress','learning_sessions','flashcards','mistake_book','teacher_agents','teacher_students')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_files','user_progress','learning_sessions','flashcards','mistake_book','teacher_agents','teacher_students')
ORDER BY tablename;
