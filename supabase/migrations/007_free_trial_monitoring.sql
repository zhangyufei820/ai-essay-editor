-- =============================================
-- 沈翔智学 60 天共创体验计划 - 运行时开关与监控审计
-- 执行方式：Supabase Dashboard > SQL Editor > Run
-- 说明：
-- 1. 本脚本只新增运行时开关、监控 incident 和监控运行记录。
-- 2. 自动止损只允许更新 runtime_config，不删除用户数据、不修改真实积分、不修改订单。
-- 3. 普通用户不能读取监控表，也不能写运行时开关。
-- =============================================

-- 依赖 005 中的 RLS 辅助函数；若测试库单独执行本脚本，也提供幂等定义。
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

-- =============================================
-- 1. 数据库运行时开关
-- =============================================

CREATE TABLE IF NOT EXISTS public.free_trial_runtime_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.free_trial_runtime_config IS
  '共创体验计划数据库运行时开关。用于无需重新部署即可关闭活动领取、trial 消耗、自动问卷和监控自动止损。';
COMMENT ON COLUMN public.free_trial_runtime_config.config_key IS
  '稳定开关键，例如 free_trial_consumption_enabled。';
COMMENT ON COLUMN public.free_trial_runtime_config.config_value IS
  'JSON 配置，首期使用 {"enabled": boolean, "reason": string, "disabledAt": string}。';
COMMENT ON COLUMN public.free_trial_runtime_config.updated_by IS
  '更新来源：admin user_id、cron、monitor 或 system。';

CREATE INDEX IF NOT EXISTS free_trial_runtime_config_key_idx
  ON public.free_trial_runtime_config(config_key);
CREATE INDEX IF NOT EXISTS free_trial_runtime_config_updated_at_idx
  ON public.free_trial_runtime_config(updated_at DESC);

-- =============================================
-- 2. 监控事件 / incident
-- =============================================

CREATE TABLE IF NOT EXISTS public.monitor_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','p1','p0')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','resolved','ignored')),
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  auto_action_taken TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE public.monitor_incidents IS
  '共创体验计划监控事件表，记录 warning/P1/P0 和自动止损动作。';
COMMENT ON COLUMN public.monitor_incidents.auto_action_taken IS
  '自动动作摘要；仅允许记录关闭 runtime flag，禁止自动修改用户数据。';

CREATE INDEX IF NOT EXISTS monitor_incidents_severity_status_idx
  ON public.monitor_incidents(severity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_incidents_created_at_idx
  ON public.monitor_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_incidents_type_idx
  ON public.monitor_incidents(incident_type);

-- =============================================
-- 3. 监控运行记录
-- =============================================

CREATE TABLE IF NOT EXISTS public.monitor_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  checks_json JSONB NOT NULL DEFAULT '{}',
  actions_json JSONB NOT NULL DEFAULT '{}',
  error_message TEXT
);

COMMENT ON TABLE public.monitor_runs IS
  '共创体验计划监控任务运行记录，每 5 分钟一条，便于后台查看最近运行状态。';
COMMENT ON COLUMN public.monitor_runs.checks_json IS
  '本次监控所有检查项结果快照。';
COMMENT ON COLUMN public.monitor_runs.actions_json IS
  '本次监控自动止损动作快照。';

CREATE INDEX IF NOT EXISTS monitor_runs_started_at_idx
  ON public.monitor_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS monitor_runs_status_idx
  ON public.monitor_runs(status, started_at DESC);

-- =============================================
-- updated_at 自动维护
-- =============================================

CREATE OR REPLACE FUNCTION public.set_trial_monitor_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_free_trial_runtime_config_updated_at ON public.free_trial_runtime_config;
CREATE TRIGGER set_free_trial_runtime_config_updated_at
  BEFORE UPDATE ON public.free_trial_runtime_config
  FOR EACH ROW EXECUTE FUNCTION public.set_trial_monitor_updated_at();

DROP TRIGGER IF EXISTS set_monitor_incidents_updated_at ON public.monitor_incidents;
CREATE TRIGGER set_monitor_incidents_updated_at
  BEFORE UPDATE ON public.monitor_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_trial_monitor_updated_at();

-- =============================================
-- 初始运行时开关（可重复执行）
-- =============================================

INSERT INTO public.free_trial_runtime_config (config_key, config_value, description, updated_by)
VALUES
  (
    'free_trial_campaign_enabled',
    '{"enabled": true}'::jsonb,
    '是否展示/允许 60 天共创体验计划活动领取。',
    'migration_007'
  ),
  (
    'free_trial_consumption_enabled',
    '{"enabled": true}'::jsonb,
    '是否允许 trial 免费额度消耗；关闭后回到真实积分/会员逻辑。',
    'migration_007'
  ),
  (
    'free_trial_auto_prompt_enabled',
    '{"enabled": true}'::jsonb,
    '是否允许登录后每日问卷自动弹出；核心功能门禁仍由后端保护。',
    'migration_007'
  ),
  (
    'free_trial_monitor_enabled',
    '{"enabled": true}'::jsonb,
    '是否允许监控任务执行自动止损动作。',
    'migration_007'
  )
ON CONFLICT (config_key) DO UPDATE
SET
  description = EXCLUDED.description,
  updated_at = public.free_trial_runtime_config.updated_at;

-- =============================================
-- RLS 策略
-- =============================================

ALTER TABLE public.free_trial_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage free trial runtime config" ON public.free_trial_runtime_config;
CREATE POLICY "Admins can manage free trial runtime config" ON public.free_trial_runtime_config
  FOR ALL
  USING (public.is_trial_admin())
  WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage monitor incidents" ON public.monitor_incidents;
CREATE POLICY "Admins can manage monitor incidents" ON public.monitor_incidents
  FOR ALL
  USING (public.is_trial_admin())
  WITH CHECK (public.is_trial_admin());

DROP POLICY IF EXISTS "Admins can manage monitor runs" ON public.monitor_runs;
CREATE POLICY "Admins can manage monitor runs" ON public.monitor_runs
  FOR ALL
  USING (public.is_trial_admin())
  WITH CHECK (public.is_trial_admin());

-- =============================================
-- 验证查询
-- =============================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('free_trial_runtime_config', 'monitor_incidents', 'monitor_runs')
ORDER BY table_name;

SELECT config_key, config_value
FROM public.free_trial_runtime_config
ORDER BY config_key;
