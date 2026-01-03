/**
 * 会员状态检查 API
 * 
 * 使用 Service Role Key 绕过 RLS，准确检查用户是否为付费会员
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 使用 Service Role Key
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    throw new Error('缺少 Supabase 配置')
  }
  
  return createClient(url, key)
}

// 检查是否为 UUID
function isUUID(str: string) {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return regex.test(str)
}

// 提取纯数字
function getPureNumbers(str: any) {
  if (!str) return ""
  return String(str).replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  console.log('🔍 [会员检查] 收到请求')
  
  try {
    const { userId } = await req.json()
    
    if (!userId) {
      return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
    }
    
    console.log('🔍 [会员检查] 用户 ID:', userId?.slice(0, 10))
    
    const supabaseAdmin = getSupabaseAdmin()
    let realUserId = userId
    
    // 如果不是 UUID，需要先找到真实的 UUID
    if (!isUUID(userId)) {
      console.log('🔍 [会员检查] 非 UUID，开始搜索真实用户')
      
      const searchTarget = getPureNumbers(userId)
      
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000
      })
      
      if (listError) {
        console.error('🔍 [会员检查] 获取用户列表失败:', listError)
        throw listError
      }
      
      const targetUser = users.find((u: any) => {
        const dbPhone = getPureNumbers(u.phone)
        const dbEmail = getPureNumbers(u.email)
        const metaPhone = getPureNumbers(u.user_metadata?.phone || u.user_metadata?.mobile || "")
        
        if (dbPhone.includes(searchTarget) || searchTarget.includes(dbPhone)) return true
        if (dbEmail.includes(searchTarget) || searchTarget.includes(dbEmail)) return true
        if (metaPhone.includes(searchTarget)) return true
        
        return false
      })
      
      if (targetUser) {
        realUserId = targetUser.id
        console.log('🔍 [会员检查] 找到真实用户 ID:', realUserId.slice(0, 8))
      } else {
        console.log('🔍 [会员检查] 未找到用户')
        return NextResponse.json({ 
          isPaidMember: false, 
          reason: '未找到用户' 
        })
      }
    }
    
    // 查询订单表
    console.log('🔍 [会员检查] 查询订单，用户 ID:', realUserId.slice(0, 8))
    
    const { data: orders, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, product_name, created_at')
      .eq('user_id', realUserId)
      .eq('status', 'paid')
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (orderError) {
      console.error('🔍 [会员检查] 查询订单失败:', orderError)
      throw orderError
    }
    
    console.log('🔍 [会员检查] 订单数量:', orders?.length || 0)
    if (orders && orders.length > 0) {
      console.log('🔍 [会员检查] 最近订单:', orders[0])
    }
    
    const isPaidMember = !!(orders && orders.length > 0)
    
    return NextResponse.json({
      isPaidMember,
      orderCount: orders?.length || 0,
      latestOrder: orders?.[0] || null
    })
    
  } catch (error: any) {
    console.error('🔍 [会员检查] 错误:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
