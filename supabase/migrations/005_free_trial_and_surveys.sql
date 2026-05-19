-- =============================================
-- 沈翔智学 60 天共创体验计划 - 免费体验与问卷系统
-- 执行方式：Supabase Dashboard > SQL Editor > Run
-- 说明：
-- 1. 本脚本只新增体验计划相关表、索引、RLS、视图和初始问卷模板。
-- 2. 不修改 user_credits、orders、membership_status 或现有积分流水表结构。
-- 3. 体验额度消耗写入 trial_credit_usages，避免污染真实积分余额。
-- =============================================

-- 管理员识别：service_role 可天然绕过 RLS；这里额外兼容带 admin JWT claim 的后台会话。
CREATE OR REPLACE FUNCTION public.is_trial_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.role() = 'service_role'
    OR COALESCE(auth.jwt() ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR LOWER(COALESCE(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) IN ('true','1','yes');
$$;

COMMENT ON FUNCTION public.is_trial_admin() IS
  '共创体验计划 RLS 辅助函数：识别 service_role 或带 admin claim 的后台会话。';

-- 活动按中国用户的自然日统计，避免 Supabase 数据库默认 UTC 导致午夜前后问卷/额度跨天。
CREATE OR REPLACE FUNCTION public.trial_local_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
$$;

COMMENT ON FUNCTION public.trial_local_date() IS
  '共创体验计划本地日期函数：统一按 Asia/Shanghai 计算每日问卷和 trial 额度。';

-- 用户 ID 兼容：Supabase UUID 用户与 Authing 文本用户都按业务 user_id 字符串比较。
CREATE OR REPLACE FUNCTION public.trial_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), NULLIF(auth.uid()::TEXT, ''));
$$;

COMMENT ON FUNCTION public.trial_current_user_id() IS
  '共创体验计划 RLS 辅助函数：返回当前 JWT 用户 ID 字符串，兼容 Authing 文本 ID 和 Supabase UUID。';

-- =============================================
-- 1. 免费体验授权表
-- =============================================

CREATE TABLE IF NOT EXISTS public.free_trial_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  grant_type TEXT NOT NULL CHECK (grant_type IN ('campaign','paid_extension','referral','admin','streak_reward')),
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NOT NULL,
  daily_quota INTEGER NOT NULL DEFAULT 2000 CHECK (daily_quota >= 0),
  total_quota INTEGER CHECK (total_quota IS NULL OR total_quota >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired','revoked')),
  requires_daily_survey BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT free_trial_grants_time_range CHECK (end_at > start_at)
);

COMMENT ON TABLE public.free_trial_grants IS
  '60 天共创体验计划授权表，记录用户体验资格、每日额度、有效期和状态。';
COMMENT ON COLUMN public.free_trial_grants.user_id IS '业务用户 ID，保持 text 以兼容现有 Authing/Supabase 混合身份。';
COMMENT ON COLUMN public.free_trial_grants.grant_type IS '授权来源：campaign 活动、paid_extension 付费顺延、referral 邀请、admin 后台、streak_reward 连击奖励。';
COMMENT ON COLUMN public.free_trial_grants.daily_quota IS '每日可用 trial 积分额度，首期默认 2000。';
COMMENT ON COLUMN public.free_trial_grants.total_quota IS '可选总额度上限；为空表示只按每日额度控制。';
COMMENT ON COLUMN public.free_trial_grants.requires_daily_survey IS '是否需要每日问卷解锁当天免费额度；付费会员顺延可设为 false。';
COMMENT ON COLUMN public.free_trial_grants.metadata IS '扩展字段，存放活动批次、人工备注、异常风控标记等非结构化信息。';

-- =============================================
-- 2. 问卷模板表
-- =============================================

CREATE TABLE IF NOT EXISTS public.survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  cadence TEXT NOT NULL CHECK (cadence IN ('onboarding','daily','weekly','exit')),
  questions_json JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.survey_templates IS
  '共创体验计划问卷模板表，用于配置首次、每日、每周和退出问卷。';
COMMENT ON COLUMN public.survey_templates.template_key IS '稳定模板键，例如 onboarding_v1、daily_v1、weekly_v1。';
COMMENT ON COLUMN public.survey_templates.audience IS '目标人群，例如 all、student、parent、teacher、paid_user。';
COMMENT ON COLUMN public.survey_templates.questions_json IS '问卷题目 JSON 配置，前端按 type/options/required 渲染。';

-- =============================================
-- 3. 问卷回复表
-- =============================================

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  template_id UUID REFERENCES public.survey_templates(id) ON DELETE SET NULL,
  survey_date DATE NOT NULL DEFAULT public.trial_local_date(),
  answers_json JSONB NOT NULL,
  quality_score INTEGER NOT NULL DEFAULT 100 CHECK (quality_score BETWEEN 0 AND 100),
  streak_day INTEGER NOT NULL DEFAULT 1 CHECK (streak_day >= 1),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, survey_date)
);

COMMENT ON TABLE public.survey_responses IS
  '用户问卷回复表；通过 unique(user_id, survey_date) 保证每天最多提交一次。';
COMMENT ON COLUMN public.survey_responses.answers_json IS '用户答案 JSON，保留原始结构以支持后续分析。';
COMMENT ON COLUMN public.survey_responses.quality_score IS '反馈质量评分，默认 100，可由后台风控或人工复核调整。';
COMMENT ON COLUMN public.survey_responses.streak_day IS '连续反馈天数快照，用于连击奖励和用户分层。';

-- 重复执行时也修正旧默认值，确保自然日口径始终是 Asia/Shanghai。
ALTER TABLE public.survey_responses
  ALTER COLUMN survey_date SET DEFAULT public.trial_local_date();

-- =============================================
-- 4. Trial 积分消耗表
-- =============================================

CREATE TABLE IF NOT EXISTS public.trial_credit_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  grant_id UUID REFERENCES public.free_trial_grants(id) ON DELETE SET NULL,
  usage_date DATE NOT NULL DEFAULT public.trial_local_date(),
  action_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.trial_credit_usages IS
  '体验额度消耗流水表，独立记录免费 trial 积分消耗，不影响真实积分余额。';
COMMENT ON COLUMN public.trial_credit_usages.action_type IS '消耗场景，例如 essay_review、chat、worksheet_diagnosis、flashcard_generation。';
COMMENT ON COLUMN public.trial_credit_usages.reference_id IS '业务关联 ID，例如报告 ID、会话 ID、任务 ID。';

-- 重复执行时也修正旧默认值，确保每日 trial 消耗按 Asia/Shanghai 归属。
ALTER TABLE public.trial_credit_usages
  ALTER COLUMN usage_date SET DEFAULT public.trial_local_date();

-- =============================================
-- 5. 奖励事件表
-- =============================================

CREATE TABLE IF NOT EXISTS public.trial_reward_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('daily_paid_user_bonus','streak_bonus','referral_bonus','discount_unlock','manual')),
  reward_value INTEGER,
  reason TEXT,
  related_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, reward_type, related_date)
);

COMMENT ON TABLE public.trial_reward_events IS
  '共创体验计划奖励事件表，记录付费用户每日奖励、连击奖励、邀请奖励、折扣解锁和人工奖励。';
COMMENT ON COLUMN public.trial_reward_events.reward_value IS '奖励值；积分奖励填积分数，折扣资格可在 metadata 中补充折扣规则。';
COMMENT ON COLUMN public.trial_reward_events.related_date IS '奖励归属日期，用于每日奖励幂等去重。';

-- =============================================
-- 索引（高频查询加速）
-- =============================================

CREATE INDEX IF NOT EXISTS idx_free_trial_grants_user_status
  ON public.free_trial_grants(user_id, status, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_free_trial_grants_active_window
  ON public.free_trial_grants(user_id, start_at, end_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_free_trial_grants_end_at
  ON public.free_trial_grants(end_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_survey_templates_active_cadence
  ON public.survey_templates(active, cadence, sort_order);

CREATE INDEX IF NOT EXISTS idx_survey_responses_user_date
  ON public.survey_responses(user_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_template_date
  ON public.survey_responses(template_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at
  ON public.survey_responses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trial_credit_usages_user_date
  ON public.trial_credit_usages(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_trial_credit_usages_grant_date
  ON public.trial_credit_usages(grant_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_trial_credit_usages_action_date
  ON public.trial_credit_usages(action_type, usage_date);

CREATE INDEX IF NOT EXISTS idx_trial_reward_events_user_type_date
  ON public.trial_reward_events(user_id, reward_type, related_date DESC);
CREATE INDEX IF NOT EXISTS idx_trial_reward_events_created_at
  ON public.trial_reward_events(created_at DESC);

-- =============================================
-- updated_at 自动维护
-- =============================================

CREATE OR REPLACE FUNCTION public.set_trial_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_trial_updated_at() IS
  '共创体验计划表通用 updated_at 维护触发器函数。';

DROP TRIGGER IF EXISTS set_free_trial_grants_updated_at ON public.free_trial_grants;
CREATE TRIGGER set_free_trial_grants_updated_at
  BEFORE UPDATE ON public.free_trial_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_trial_updated_at();

DROP TRIGGER IF EXISTS set_survey_templates_updated_at ON public.survey_templates;
CREATE TRIGGER set_survey_templates_updated_at
  BEFORE UPDATE ON public.survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_trial_updated_at();

-- 普通用户只能更新自己的授权状态，不允许自行改额度、有效期、来源等核心字段。
CREATE OR REPLACE FUNCTION public.guard_free_trial_grant_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trial_admin() THEN
    RETURN NEW;
  END IF;

  IF public.trial_current_user_id() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'cannot update another user trial grant';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.grant_type IS DISTINCT FROM OLD.grant_type
    OR NEW.start_at IS DISTINCT FROM OLD.start_at
    OR NEW.end_at IS DISTINCT FROM OLD.end_at
    OR NEW.daily_quota IS DISTINCT FROM OLD.daily_quota
    OR NEW.total_quota IS DISTINCT FROM OLD.total_quota
    OR NEW.requires_daily_survey IS DISTINCT FROM OLD.requires_daily_survey
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'users may only update their own free_trial_grants.status';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_free_trial_grant_user_update() IS
  '保护免费体验授权核心字段：普通用户只能更新自己的 status，管理员/service role 可管理全部。';

DROP TRIGGER IF EXISTS guard_free_trial_grant_user_update ON public.free_trial_grants;
CREATE TRIGGER guard_free_trial_grant_user_update
  BEFORE UPDATE ON public.free_trial_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_free_trial_grant_user_update();

-- =============================================
-- RLS 策略
-- =============================================

ALTER TABLE public.free_trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_credit_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_reward_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own trial grants" ON public.free_trial_grants;
CREATE POLICY "Users can view own trial grants" ON public.free_trial_grants
  FOR SELECT USING (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Users can update own trial grant status" ON public.free_trial_grants;
CREATE POLICY "Users can update own trial grant status" ON public.free_trial_grants
  FOR UPDATE USING (public.trial_current_user_id() = user_id OR public.is_trial_admin())
  WITH CHECK (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage trial grants" ON public.free_trial_grants;
CREATE POLICY "Admins can manage trial grants" ON public.free_trial_grants
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Users can view active survey templates" ON public.survey_templates;
CREATE POLICY "Users can view active survey templates" ON public.survey_templates
  FOR SELECT USING (active = TRUE OR public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage survey templates" ON public.survey_templates;
CREATE POLICY "Admins can manage survey templates" ON public.survey_templates
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Users can view own survey responses" ON public.survey_responses;
CREATE POLICY "Users can view own survey responses" ON public.survey_responses
  FOR SELECT USING (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Users can insert own survey responses" ON public.survey_responses;
CREATE POLICY "Users can insert own survey responses" ON public.survey_responses
  FOR INSERT WITH CHECK (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Users can update own survey responses" ON public.survey_responses;
CREATE POLICY "Users can update own survey responses" ON public.survey_responses
  FOR UPDATE USING (public.trial_current_user_id() = user_id OR public.is_trial_admin())
  WITH CHECK (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage survey responses" ON public.survey_responses;
CREATE POLICY "Admins can manage survey responses" ON public.survey_responses
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Users can view own trial credit usages" ON public.trial_credit_usages;
CREATE POLICY "Users can view own trial credit usages" ON public.trial_credit_usages
  FOR SELECT USING (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage trial credit usages" ON public.trial_credit_usages;
CREATE POLICY "Admins can manage trial credit usages" ON public.trial_credit_usages
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Users can view own trial reward events" ON public.trial_reward_events;
CREATE POLICY "Users can view own trial reward events" ON public.trial_reward_events
  FOR SELECT USING (public.trial_current_user_id() = user_id OR public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage trial reward events" ON public.trial_reward_events;
CREATE POLICY "Admins can manage trial reward events" ON public.trial_reward_events
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

-- =============================================
-- 初始问卷模板 Seed
-- =============================================

INSERT INTO public.survey_templates (
  template_key,
  title,
  description,
  audience,
  cadence,
  questions_json,
  active,
  sort_order
)
VALUES
(
  'onboarding_v1',
  '首次共创问卷',
  '了解用户身份、学习场景和最想验证的 AI 学习反馈能力。',
  'all',
  'onboarding',
  '[
    {"id":"role","type":"single_choice","title":"你现在的身份是？","required":true,"options":["学生","家长","老师","机构负责人","其他"]},
    {"id":"grade","type":"single_choice","title":"主要使用对象所在年级？","required":false,"options":["小学","初中","高中","大学","成人学习","不适用"]},
    {"id":"primary_goal","type":"multiple_choice","title":"你最想用沈翔智学解决什么问题？","required":true,"options":["作文批改","试卷/错题诊断","闪卡复习","AI 对话答疑","课堂/班级管理","其他"]},
    {"id":"current_pain","type":"text","title":"现在学习反馈中最困扰你的是什么？","required":false},
    {"id":"pmf_expectation","type":"single_choice","title":"如果这个工具足够好，你最可能如何使用？","required":true,"options":["每天使用","每周使用","考试/写作前使用","只偶尔看看","暂不确定"]}
  ]'::jsonb,
  TRUE,
  10
),
(
  'daily_v1',
  '每日 90 秒反馈',
  '每天填写后解锁当天 AI 学习体验额度。',
  'all',
  'daily',
  '[
    {"id":"used_feature","type":"multiple_choice","title":"你今天主要体验了哪些功能？","required":true,"options":["作文批改","拍卷诊断","AI 对话","闪卡复习","互动实验室","还没使用"]},
    {"id":"satisfaction","type":"rating","title":"今天的结果对你有帮助吗？","required":true,"min":1,"max":5},
    {"id":"best_part","type":"text","title":"今天最有帮助的一点是什么？","required":false},
    {"id":"friction","type":"text","title":"今天哪里不顺手或不满意？","required":false},
    {"id":"tomorrow_intent","type":"single_choice","title":"你明天还愿意继续用吗？","required":true,"options":["愿意","可能会","不确定","暂时不想"]}
  ]'::jsonb,
  TRUE,
  20
),
(
  'weekly_v1',
  '每周深度反馈',
  '用于判断产品依赖度、付费意愿和下一阶段优先级。',
  'all',
  'weekly',
  '[
    {"id":"pmf_disappointment","type":"single_choice","title":"如果明天不能继续使用沈翔智学，你会有多失望？","required":true,"options":["非常失望","有点失望","不失望","我还没真正使用"]},
    {"id":"most_valuable_feature","type":"single_choice","title":"本周你觉得最有价值的功能是？","required":true,"options":["作文批改","拍卷诊断","AI 对话","闪卡复习","互动实验室","还没有"]},
    {"id":"willing_to_pay","type":"single_choice","title":"如果继续使用，你更能接受哪种方式？","required":true,"options":["按月订阅","按积分付费","学校/班级统一购买","只想免费体验","暂不确定"]},
    {"id":"price_feedback","type":"text","title":"你觉得目前套餐价格和额度是否合理？为什么？","required":false},
    {"id":"top_request","type":"text","title":"下周你最希望我们改进什么？","required":false}
  ]'::jsonb,
  TRUE,
  30
)
ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  audience = EXCLUDED.audience,
  cadence = EXCLUDED.cadence,
  questions_json = EXCLUDED.questions_json,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- =============================================
-- 视图：用户体验状态
-- =============================================

CREATE OR REPLACE VIEW public.user_trial_status
WITH (security_invoker = true)
AS
WITH active_grants AS (
  SELECT
    ftg.*,
    ROW_NUMBER() OVER (
      PARTITION BY ftg.user_id
      ORDER BY ftg.start_at DESC, ftg.created_at DESC
    ) AS rn
  FROM public.free_trial_grants ftg
  WHERE ftg.status = 'active'
    AND NOW() >= ftg.start_at
    AND NOW() < ftg.end_at
),
today_usage AS (
  SELECT
    user_id,
    SUM(amount)::INTEGER AS today_trial_used
  FROM public.trial_credit_usages
  WHERE usage_date = public.trial_local_date()
  GROUP BY user_id
),
today_surveys AS (
  SELECT DISTINCT user_id
  FROM public.survey_responses
  WHERE survey_date = public.trial_local_date()
),
latest_streak AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    streak_day AS current_streak_days
  FROM public.survey_responses
  ORDER BY user_id, survey_date DESC, created_at DESC
)
SELECT
  ag.user_id,
  ag.id AS active_grant_id,
  ag.start_at AS trial_start_at,
  ag.end_at AS trial_end_at,
  ag.daily_quota,
  ag.requires_daily_survey,
  (ts.user_id IS NOT NULL) AS today_survey_completed,
  COALESCE(tu.today_trial_used, 0) AS today_trial_used,
  GREATEST(ag.daily_quota - COALESCE(tu.today_trial_used, 0), 0) AS today_trial_remaining,
  (
    ag.status = 'active'
    AND NOW() >= ag.start_at
    AND NOW() < ag.end_at
    AND (ag.requires_daily_survey = FALSE OR ts.user_id IS NOT NULL)
  ) AS trial_active,
  COALESCE(ls.current_streak_days, 0) AS current_streak_days
FROM active_grants ag
LEFT JOIN today_usage tu ON tu.user_id = ag.user_id
LEFT JOIN today_surveys ts ON ts.user_id = ag.user_id
LEFT JOIN latest_streak ls ON ls.user_id = ag.user_id
WHERE ag.rn = 1;

COMMENT ON VIEW public.user_trial_status IS
  '用户今日共创体验状态视图：当前授权、问卷完成、今日 trial 消耗和剩余额度。';

-- =============================================
-- 视图：每日体验指标
-- =============================================

CREATE OR REPLACE VIEW public.daily_trial_metrics
WITH (security_invoker = true)
AS
WITH metric_dates AS (
  SELECT (start_at AT TIME ZONE 'Asia/Shanghai')::DATE AS metric_date FROM public.free_trial_grants
  UNION
  SELECT survey_date AS metric_date FROM public.survey_responses
  UNION
  SELECT usage_date AS metric_date FROM public.trial_credit_usages
),
active_users AS (
  SELECT
    md.metric_date,
    COUNT(DISTINCT ftg.user_id) AS active_trial_users
  FROM metric_dates md
  LEFT JOIN public.free_trial_grants ftg
    ON ftg.status = 'active'
   AND md.metric_date >= (ftg.start_at AT TIME ZONE 'Asia/Shanghai')::DATE
   AND md.metric_date < (ftg.end_at AT TIME ZONE 'Asia/Shanghai')::DATE
  GROUP BY md.metric_date
),
survey_stats AS (
  SELECT
    survey_date AS metric_date,
    COUNT(DISTINCT user_id) AS survey_submitters,
    AVG(quality_score)::NUMERIC(10,2) AS avg_quality_score
  FROM public.survey_responses
  GROUP BY survey_date
),
usage_stats AS (
  SELECT
    usage_date AS metric_date,
    COALESCE(SUM(amount), 0)::INTEGER AS trial_credit_used
  FROM public.trial_credit_usages
  GROUP BY usage_date
)
SELECT
  md.metric_date,
  COALESCE(au.active_trial_users, 0) AS active_trial_users,
  COALESCE(ss.survey_submitters, 0) AS survey_submitters,
  COALESCE(us.trial_credit_used, 0) AS trial_credit_used,
  ss.avg_quality_score
FROM metric_dates md
LEFT JOIN active_users au ON au.metric_date = md.metric_date
LEFT JOIN survey_stats ss ON ss.metric_date = md.metric_date
LEFT JOIN usage_stats us ON us.metric_date = md.metric_date
ORDER BY md.metric_date DESC;

COMMENT ON VIEW public.daily_trial_metrics IS
  '共创体验计划每日运营指标视图：活跃体验用户、问卷提交人数、trial 消耗和平均反馈质量。';

-- =============================================
-- 验证查询
-- =============================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'free_trial_grants',
    'survey_templates',
    'survey_responses',
    'trial_credit_usages',
    'trial_reward_events'
  )
ORDER BY table_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'free_trial_grants',
    'survey_templates',
    'survey_responses',
    'trial_credit_usages',
    'trial_reward_events'
  )
ORDER BY tablename, indexname;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'free_trial_grants',
    'survey_templates',
    'survey_responses',
    'trial_credit_usages',
    'trial_reward_events'
  )
ORDER BY tablename;
