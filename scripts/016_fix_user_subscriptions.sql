-- 修复用户订阅问题 - 2026-01-20
-- 问题：用户支付成功但回调失败，导致积分和会员状态未同步

-- ==========================================
-- 1. 移除外键约束（永久修复，防止后续问题）
-- ==========================================
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;

-- ==========================================
-- 2. 修复用户 696d73392fc761bbc1c929e0
-- ==========================================
-- 将一个订单标记为已支付
UPDATE orders 
SET status = 'paid', updated_at = NOW()
WHERE user_id = '696d73392fc761bbc1c929e0' 
  AND status = 'pending'
  AND product_id = 'basic'
ORDER BY created_at DESC
LIMIT 1;

-- 更新用户积分和会员状态
UPDATE user_credits
SET 
  credits = credits + 2000,
  is_pro = true,
  updated_at = NOW()
WHERE user_id = '696d73392fc761bbc1c929e0';

-- ==========================================
-- 3. 验证修复结果
-- ==========================================
SELECT 
  uc.user_id,
  uc.credits,
  uc.is_pro,
  (SELECT COUNT(*) FROM orders WHERE user_id = uc.user_id AND status = 'paid') as paid_orders
FROM user_credits uc
WHERE uc.user_id IN (
  '696d73392fc761bbc1c929e0',
  '6968c52fee5fbd3da1da9f7c'
);

-- 查看用户订单状态
SELECT user_id, product_name, amount, status, created_at 
FROM orders 
WHERE user_id = '696d73392fc761bbc1c929e0'
ORDER BY created_at DESC;
