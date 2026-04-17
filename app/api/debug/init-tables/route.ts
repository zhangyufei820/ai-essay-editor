/**
 * 初始化数据库表 API
 * 用于创建缺失的表（如 credit_transactions）
 * 
 * ⚠️ 仅供开发调试使用
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 延迟创建 Supabase Admin 客户端
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    console.log('🔧 [初始化表] 开始检查数据库表...')
    
    const results: any = {
      credit_transactions: { exists: false, created: false },
      user_credits: { exists: false },
      orders: { exists: false },
      admin_tokens: { exists: false, created: false },
      admin_actions: { exists: false, created: false },
    }
    
    // 1. 检查 credit_transactions 表
    const { error: checkError } = await supabaseAdmin
      .from('credit_transactions')
      .select('id')
      .limit(1)
    
    if (checkError && checkError.code === '42P01') {
      console.log('⚠️ credit_transactions 表不存在，尝试创建...')
      
      // 使用 SQL 创建表
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS credit_transactions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            reference_id TEXT,
            balance_before INTEGER,
            balance_after INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
          CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
        `
      })
      
      if (createError) {
        console.error('❌ 创建表失败:', createError)
        results.credit_transactions.error = createError.message
        
        // 如果 rpc 不存在，提示手动执行 SQL
        results.credit_transactions.manual_sql = `
请在 Supabase SQL Editor 中手动执行以下 SQL：

CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  reference_id TEXT,
  balance_before INTEGER,
  balance_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
        `
      } else {
        results.credit_transactions.created = true
        console.log('✅ credit_transactions 表创建成功')
      }
    } else if (checkError) {
      results.credit_transactions.error = checkError.message
    } else {
      results.credit_transactions.exists = true
      console.log('✅ credit_transactions 表已存在')
    }
    
    // 2. 检查 user_credits 表
    const { error: ucError } = await supabaseAdmin
      .from('user_credits')
      .select('user_id')
      .limit(1)
    
    results.user_credits.exists = !ucError
    if (ucError) {
      results.user_credits.error = ucError.message
    }
    
    // 3. 检查 orders 表
    const { error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .limit(1)
    
    results.orders.exists = !ordersError
    if (ordersError) {
      results.orders.error = ordersError.message
    }
    
    // 4. 统计各表记录数
    if (results.credit_transactions.exists || results.credit_transactions.created) {
      const { count } = await supabaseAdmin
        .from('credit_transactions')
        .select('*', { count: 'exact', head: true })
      results.credit_transactions.count = count
    }
    
    if (results.user_credits.exists) {
      const { count } = await supabaseAdmin
        .from('user_credits')
        .select('*', { count: 'exact', head: true })
      results.user_credits.count = count
    }
    
    if (results.orders.exists) {
      const { count } = await supabaseAdmin
        .from('orders')
        .select('*', { count: 'exact', head: true })
      results.orders.count = count
    }
    
    // 5. 检查/创建 admin_tokens 表
    const { error: atError } = await supabaseAdmin
      .from('admin_tokens')
      .select('id')
      .limit(1)
    
    if (atError && atError.code === '42P01') {
      console.log('⚠️ admin_tokens 表不存在，尝试创建...')
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS admin_tokens (
            id BIGSERIAL PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_admin_tokens_token ON admin_tokens(token);
          CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires_at ON admin_tokens(expires_at);
        `
      })
      if (createError) {
        results.admin_tokens.error = createError.message
      } else {
        results.admin_tokens.created = true
        console.log('✅ admin_tokens 表创建成功')
      }
    } else {
      results.admin_tokens.exists = !atError
    }
    
    // 6. 检查/创建 admin_actions 表
    const { error: aaError } = await supabaseAdmin
      .from('admin_actions')
      .select('id')
      .limit(1)
    
    if (aaError && aaError.code === '42P01') {
      console.log('⚠️ admin_actions 表不存在，尝试创建...')
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS admin_actions (
            id BIGSERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            admin_token_prefix TEXT,
            details JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON admin_actions(action);
        `
      })
      if (createError) {
        results.admin_actions.error = createError.message
      } else {
        results.admin_actions.created = true
        console.log('✅ admin_actions 表创建成功')
      }
    } else {
      results.admin_actions.exists = !aaError
    }
    
    return NextResponse.json({
      success: true,
      message: '数据库表检查完成',
      tables: results,
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    console.error('❌ [初始化表] 错误:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
