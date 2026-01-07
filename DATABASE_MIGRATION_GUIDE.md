# 数据库迁移执行指南

## 当前状态

✅ **用户积分已补发成功**
- 用户 xunhupay 已收到 10000 积分
- 当前积分余额：10980

⚠️ **数据库表结构需要手动执行SQL脚本**

## 执行步骤

### 方案一：快速修复（推荐先执行）

这个方案只修复现有表结构，不创建新表，风险最小。

1. **登录 Supabase Dashboard**
   - 访问：https://supabase.com/dashboard
   - 选择您的项目

2. **打开 SQL Editor**
   - 左侧菜单点击 "SQL Editor"
   - 点击 "New query"

3. **复制并执行以下SQL**

```sql
-- 快速修复现有表结构
-- 为 orders 表添加缺失字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS trade_no TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credits_amount INTEGER;

-- 为所有订单设置 credits_amount
UPDATE orders SET credits_amount = 2000 WHERE product_id = 'basic' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 5000 WHERE product_id = 'pro' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 12000 WHERE product_id = 'premium' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 500 WHERE product_id = 'credits-500' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 1000 WHERE product_id = 'credits-1000' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 5000 WHERE product_id = 'credits-5000' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 10000 WHERE product_id = 'credits-10000' AND credits_amount IS NULL;

-- 为 credit_transactions 表添加缺失字段
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);

-- 添加自动更新时间戳的触发器
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at_trigger ON orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- 验证修复结果
SELECT 
  'orders表字段' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'updated_at'
  ) THEN '✅ updated_at 已添加' ELSE '❌ updated_at 缺失' END as status
UNION ALL
SELECT 
  'orders表字段',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'trade_no'
  ) THEN '✅ trade_no 已添加' ELSE '❌ trade_no 缺失' END
UNION ALL
SELECT 
  'orders表字段',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'credits_amount'
  ) THEN '✅ credits_amount 已添加' ELSE '❌ credits_amount 缺失' END
UNION ALL
SELECT 
  '订单积分设置',
  COUNT(*)::TEXT || ' 个订单已设置 credits_amount'
FROM orders WHERE credits_amount IS NOT NULL;
```

4. **点击 "Run" 执行**

5. **查看执行结果**
   - 应该看到类似这样的输出：
   ```
   ✅ updated_at 已添加
   ✅ trade_no 已添加
   ✅ credits_amount 已添加
   37 个订单已设置 credits_amount
   ```

### 方案二：完整的企业级重构（可选）

如果您想要完全重构数据库为企业级标准，请执行：

1. 在 Supabase SQL Editor 中打开文件：
   `scripts/013_enterprise_database_migration.sql`

2. 复制全部内容并执行

**注意：** 这个方案会创建新表并迁移数据，建议先在测试环境验证。

## 验证修复

执行完SQL后，运行以下命令验证：

```bash
node scripts/query-orders.mjs
```

应该能看到订单的 `credits_amount` 字段已经有值了。

## 后续优化建议

### 1. 修复支付回调

编辑 `app/api/payment/xunhupay/create/route.ts`，在创建订单时添加 `credits_amount`：

```typescript
// 在第 73 行附近，添加积分映射
const PRODUCT_CREDITS: Record<string, number> = {
  "basic": 2000,
  "pro": 5000,
  "premium": 12000,
  "credits-500": 500,
  "credits-1000": 1000,
  "credits-5000": 5000,
  "credits-10000": 10000,
}

// 在第 82 行附近，插入订单时添加 credits_amount
const { error: orderError } = await supabaseAdmin
  .from('orders')
  .insert({
    order_no: tradeOrderId,
    user_id: userId,
    product_id: productId,
    product_name: product.name,
    amount: product.priceInCents / 100,
    credits_amount: PRODUCT_CREDITS[productId] || 0,  // ✅ 添加这一行
    status: 'pending',
    payment_method: 'xunhupay',
  });
```

### 2. 添加订单超时处理

创建定时任务，自动将超过30分钟未支付的订单标记为过期。

### 3. 监控支付回调

检查 Vercel 日志，确保支付回调正常工作：
- 访问：https://vercel.com/your-project/logs
- 搜索：`[迅虎支付]`

## 需要帮助？

如果执行过程中遇到任何问题，请提供：
1. 错误信息截图
2. Supabase SQL Editor 的执行结果
3. 具体哪一步出现问题

## 文件清单

- ✅ `scripts/fix-specific-order.mjs` - 已用于补发积分
- ✅ `scripts/012_fix_orders_table.sql` - 快速修复SQL（推荐）
- ✅ `scripts/013_enterprise_database_migration.sql` - 完整重构SQL（可选）
- ✅ `DATABASE_MIGRATION_GUIDE.md` - 本指南
