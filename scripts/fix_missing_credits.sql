-- 查询已支付订单但积分未到账的用户
-- 执行此脚本前请先备份数据库

-- 1. 首先查看所有已支付的订单
SELECT 
  o.id as order_id,
  o.order_no,
  o.user_id,
  o.amount,
  o.product_name,
  o.status,
  o.paid_at,
  p.email,
  p.phone,
  uc.credits as current_credits,
  COALESCE(ct.total_purchase_credits, 0) as credited_purchase_amount
FROM orders o
LEFT JOIN profiles p ON o.user_id = p.id
LEFT JOIN user_credits uc ON o.user_id = uc.user_id
LEFT JOIN (
  SELECT user_id, SUM(amount) as total_purchase_credits 
  FROM credit_transactions 
  WHERE type = 'purchase' 
  GROUP BY user_id
) ct ON o.user_id = ct.user_id
WHERE o.status = 'paid'
ORDER BY o.paid_at DESC;

-- 2. 查找已支付但没有对应积分交易记录的订单
SELECT 
  o.id as order_id,
  o.order_no,
  o.user_id,
  o.amount,
  o.product_name,
  o.paid_at,
  p.email,
  p.phone,
  FLOOR(o.amount * 100) as should_add_credits
FROM orders o
LEFT JOIN profiles p ON o.user_id = p.id
WHERE o.status = 'paid'
AND NOT EXISTS (
  SELECT 1 FROM credit_transactions ct 
  WHERE ct.user_id = o.user_id 
  AND ct.type = 'purchase' 
  AND ct.reference_id = o.id::text
)
ORDER BY o.paid_at DESC;

-- 3. 为缺失积分的用户创建积分记录（如果不存在）
INSERT INTO user_credits (user_id, credits, total_earned, total_spent)
SELECT DISTINCT o.user_id, 0, 0, 0
FROM orders o
WHERE o.status = 'paid'
AND NOT EXISTS (
  SELECT 1 FROM user_credits uc WHERE uc.user_id = o.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- 4. 补充缺失的积分交易记录
INSERT INTO credit_transactions (user_id, amount, type, description, reference_id, created_at)
SELECT 
  o.user_id,
  FLOOR(o.amount * 100),
  'purchase',
  '购买' || o.product_name || '获得积分（补发）',
  o.id::text,
  NOW()
FROM orders o
WHERE o.status = 'paid'
AND NOT EXISTS (
  SELECT 1 FROM credit_transactions ct 
  WHERE ct.user_id = o.user_id 
  AND ct.type = 'purchase' 
  AND ct.reference_id = o.id::text
);

-- 5. 更新用户积分余额
UPDATE user_credits uc
SET 
  credits = credits + missing.total_missing,
  total_earned = total_earned + missing.total_missing,
  updated_at = NOW()
FROM (
  SELECT 
    o.user_id,
    SUM(FLOOR(o.amount * 100)) as total_missing
  FROM orders o
  WHERE o.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct 
    WHERE ct.user_id = o.user_id 
    AND ct.type = 'purchase' 
    AND ct.reference_id = o.id::text
    AND ct.created_at < NOW() - INTERVAL '1 minute' -- 排除刚刚插入的记录
  )
  GROUP BY o.user_id
) missing
WHERE uc.user_id = missing.user_id;

-- 6. 验证修复结果
SELECT 
  o.user_id,
  p.email,
  p.phone,
  SUM(FLOOR(o.amount * 100)) as total_paid_credits,
  uc.credits as current_credits,
  uc.total_earned
FROM orders o
LEFT JOIN profiles p ON o.user_id = p.id
LEFT JOIN user_credits uc ON o.user_id = uc.user_id
WHERE o.status = 'paid'
GROUP BY o.user_id, p.email, p.phone, uc.credits, uc.total_earned
ORDER BY total_paid_credits DESC;
