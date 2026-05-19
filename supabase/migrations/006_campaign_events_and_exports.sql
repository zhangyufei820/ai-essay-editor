-- =============================================
-- 沈翔智学 60 天共创体验计划 - 活动埋点事件
-- 执行方式：Supabase Dashboard > SQL Editor > Run
-- 说明：
-- 1. 本脚本只新增 campaign_events 表、索引和 RLS。
-- 2. 不修改 user_credits、orders、membership_status 或现有积分/会员逻辑。
-- 3. CSV 导出由后台 API 使用 service role 读取，不在数据库中暴露全量读取给普通用户。
-- =============================================

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  anonymous_id TEXT,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'free_trial_announcement_shown',
      'free_trial_announcement_dismissed',
      'free_trial_claim_clicked',
      'free_trial_claim_success',
      'daily_survey_auto_prompt_shown',
      'daily_survey_gate_shown',
      'daily_survey_later_clicked',
      'daily_survey_submit_success',
      'survey_required_block',
      'trial_billing_success',
      'trial_billing_real_credit_fallback'
    )
  ),
  event_date DATE NOT NULL DEFAULT public.trial_local_date(),
  page_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaign_events_actor_present CHECK (
    user_id IS NOT NULL OR anonymous_id IS NOT NULL
  )
);

COMMENT ON TABLE public.campaign_events IS
  '60 天共创体验计划活动埋点事件表，用于分析弹窗曝光、领取、问卷、阻断和 trial billing 漏斗。';
COMMENT ON COLUMN public.campaign_events.user_id IS
  '登录用户业务 ID；匿名访问时为空。';
COMMENT ON COLUMN public.campaign_events.anonymous_id IS
  '浏览器本地生成的匿名 ID；用于未登录活动弹窗曝光和点击分析。';
COMMENT ON COLUMN public.campaign_events.event_name IS
  '活动事件名，首期使用固定白名单，未来新增事件可通过 ALTER TABLE 调整 check constraint。';
COMMENT ON COLUMN public.campaign_events.event_date IS
  '事件归属日期，默认按 Asia/Shanghai 自然日统计。';
COMMENT ON COLUMN public.campaign_events.page_path IS
  '事件发生页面路径，不包含域名和敏感 query。';
COMMENT ON COLUMN public.campaign_events.metadata IS
  '事件扩展信息，API 层限制大小，禁止写入手机号、邮箱、支付信息等敏感字段。';

-- 重复执行时也修正旧默认值，确保活动漏斗按中国用户自然日统计。
ALTER TABLE public.campaign_events
  ALTER COLUMN event_date SET DEFAULT public.trial_local_date();

CREATE INDEX IF NOT EXISTS campaign_events_event_date_idx
  ON public.campaign_events(event_date);
CREATE INDEX IF NOT EXISTS campaign_events_user_id_idx
  ON public.campaign_events(user_id);
CREATE INDEX IF NOT EXISTS campaign_events_event_name_idx
  ON public.campaign_events(event_name);
CREATE INDEX IF NOT EXISTS campaign_events_created_at_idx
  ON public.campaign_events(created_at DESC);

-- =============================================
-- RLS 策略
-- =============================================

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own campaign events" ON public.campaign_events;
CREATE POLICY "Users can insert own campaign events" ON public.campaign_events
  FOR INSERT
  WITH CHECK (
    (
      user_id IS NOT NULL
      AND anonymous_id IS NULL
      AND public.trial_current_user_id() = user_id
    )
    OR (
      user_id IS NULL
      AND anonymous_id IS NOT NULL
      AND LENGTH(anonymous_id) BETWEEN 8 AND 128
    )
    OR public.is_trial_admin()
  );

DROP POLICY IF EXISTS "Admins can read campaign events" ON public.campaign_events;
CREATE POLICY "Admins can read campaign events" ON public.campaign_events
  FOR SELECT USING (public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage campaign events" ON public.campaign_events;
CREATE POLICY "Admins can manage campaign events" ON public.campaign_events
  FOR ALL USING (public.is_trial_admin()) WITH CHECK (public.is_trial_admin());

-- =============================================
-- 验证查询
-- =============================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'campaign_events';

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'campaign_events'
ORDER BY indexname;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'campaign_events';
