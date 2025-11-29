-- 创建触发器：用户注册时自动创建积分账户和推荐码

CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS TRIGGER AS $$
DECLARE
  random_code TEXT;
BEGIN
  -- 生成6位随机推荐码
  random_code := upper(substring(md5(random()::text || NEW.id::text) from 1 for 6));
  
  -- 创建积分账户（初始1000积分）
  INSERT INTO public.user_credits (user_id, credits, total_earned)
  VALUES (NEW.id, 1000, 1000);
  
  -- 创建推荐码
  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.id, random_code);
  
  -- 记录注册赠送积分
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 1000, 'register', '注册赠送');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();
