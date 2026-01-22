/**
 * 会员状态检查 API
 * 
 * 使用 Service Role Key 绕过 RLS，准确检查用户是否为付费会员
 * 
 * 🔥 修复：支持多种用户 ID 格式查询订单
 * - Supabase UUID
 * - Authing 用户 ID
 * - 订单号中包含的用户 ID
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
    
    console.log('🔍 [会员检查] 用户 ID:', userId)
    console.log('🔍 [会员检查] 用户 ID 类型:', typeof userId)
    console.log('🔍 [会员检查] 是否 UUID:', isUUID(userId))
    
    const supabaseAdmin = getSupabaseAdmin()
    
    // 🔥 策略1: 直接用原始 userId 查询订单（支持 Authing ID）
    console.log('🔍 [会员检查] 策略1: 直接查询订单，用户 ID:', userId)
    
    let orders: any[] = []
    
    // 尝试直接用 userId 查询（支持多种格式）
    // Authing ID 可能是 24 位十六进制字符串
    const userIdVariants = [
      userId,
      userId?.toLowerCase?.(),
      userId?.toUpperCase?.()
    ].filter(Boolean)
    
    for (const tryId of userIdVariants) {
      if (orders.length > 0) break
      
      const { data: directOrders, error: directError } = await supabaseAdmin
        .from('orders')
        .select('id, status, amount, product_name, created_at, order_no, user_id')
        .eq('user_id', tryId)
        .eq('status', 'paid')
        .gt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (!directError && directOrders && directOrders.length > 0) {
        orders = directOrders
        console.log('🔍 [会员检查] 策略1成功，找到订单:', orders.length, '使用ID:', tryId)
        break
      }
    }
    
    if (orders.length === 0) {
      console.log('🔍 [会员检查] 策略1未找到订单，尝试策略2')
      
      // 🔥 策略2: 通过订单号模糊匹配（订单号格式: ORDER_时间戳_用户ID）
      const { data: ordersByNo, error: orderNoError } = await supabaseAdmin
        .from('orders')
        .select('id, status, amount, product_name, created_at, order_no, user_id')
        .like('order_no', `%_${userId}`)
        .eq('status', 'paid')
        .gt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (!orderNoError && ordersByNo && ordersByNo.length > 0) {
        orders = ordersByNo
        console.log('🔍 [会员检查] 策略2成功，通过订单号找到订单:', orders.length)
      } else {
        console.log('🔍 [会员检查] 策略2未找到订单，尝试策略3')
        
        // 🔥 策略3: 如果不是 UUID，尝试找到对应的 Supabase 用户
        if (!isUUID(userId)) {
          console.log('🔍 [会员检查] 策略3: 非 UUID，搜索 Supabase 用户')
          
          const searchTarget = getPureNumbers(userId)
          
          if (searchTarget.length >= 6) {
            const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
              perPage: 1000
            })
            
            if (!listError && users) {
              const targetUser = users.find((u: any) => {
                const dbPhone = getPureNumbers(u.phone)
                const dbEmail = getPureNumbers(u.email)
                const metaPhone = getPureNumbers(u.user_metadata?.phone || u.user_metadata?.mobile || "")
                
                if (dbPhone && (dbPhone.includes(searchTarget) || searchTarget.includes(dbPhone))) return true
                if (dbEmail && (dbEmail.includes(searchTarget) || searchTarget.includes(dbEmail))) return true
                if (metaPhone && metaPhone.includes(searchTarget)) return true
                
                return false
              })
              
              if (targetUser) {
                console.log('🔍 [会员检查] 策略3: 找到 Supabase 用户:', targetUser.id.slice(0, 8))
                
                const { data: supabaseOrders, error: supabaseError } = await supabaseAdmin
                  .from('orders')
                  .select('id, status, amount, product_name, created_at, order_no, user_id')
                  .eq('user_id', targetUser.id)
                  .eq('status', 'paid')
                  .gt('amount', 0)
                  .order('created_at', { ascending: false })
                  .limit(5)
                
                if (!supabaseError && supabaseOrders && supabaseOrders.length > 0) {
                  orders = supabaseOrders
                  console.log('🔍 [会员检查] 策略3成功，找到订单:', orders.length)
                }
              }
            }
          }
        }
      }
    }
    
    // 🔥 策略4: 查询所有已支付订单，检查订单号是否包含用户ID的任何部分
    if (orders.length === 0) {
      console.log('🔍 [会员检查] 策略4: 全量搜索订单')
      
      const { data: allPaidOrders, error: allError } = await supabaseAdmin
        .from('orders')
        .select('id, status, amount, product_name, created_at, order_no, user_id')
        .eq('status', 'paid')
        .gt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (!allError && allPaidOrders) {
        console.log('🔍 [会员检查] 策略4: 所有已支付订单数量:', allPaidOrders.length)
        
        // 检查订单号是否包含用户ID
        const matchedOrders = allPaidOrders.filter(order => {
          if (order.order_no && order.order_no.includes(userId)) return true
          if (order.user_id === userId) return true
          return false
        })
        
        if (matchedOrders.length > 0) {
          orders = matchedOrders.slice(0, 5)
          console.log('🔍 [会员检查] 策略4成功，找到订单:', orders.length)
        }
      }
    }
    
    // 🔥 策略5: 检查 user_credits 表（最重要：检查 is_pro 字段！）
    let isPro = false
    let hasHighCredits = false
    
    console.log('🔍 [会员检查] 策略5: 检查积分表和 is_pro 字段')
    
    const { data: creditsData, error: creditsError } = await supabaseAdmin
      .from('user_credits')
      .select('credits, is_pro, user_id')
      .eq('user_id', userId)
      .single()
    
    if (!creditsError && creditsData) {
      console.log('🔍 [会员检查] 策略5: 用户积分:', creditsData.credits, 'is_pro:', creditsData.is_pro)
      
      // 🔥 关键！is_pro = true 就是会员
      if (creditsData.is_pro === true) {
        isPro = true
        console.log('🔍 [会员检查] 策略5成功: is_pro=true，是会员！')
      }
      
      // 积分 >= 1000 也视为会员（备用判断）
      if (creditsData.credits >= 1000) {
        hasHighCredits = true
        console.log('🔍 [会员检查] 策略5: 用户积分充足，也视为会员')
      }
    } else {
      console.log('🔍 [会员检查] 策略5: 未找到积分记录或查询失败')
    }
    
    console.log('🔍 [会员检查] 最终订单数量:', orders.length)
    console.log('🔍 [会员检查] is_pro:', isPro, '高积分用户:', hasHighCredits)
    if (orders.length > 0) {
      console.log('🔍 [会员检查] 最近订单:', orders[0])
    }
    
    // 🔥 is_pro=true 或 有订单 或 高积分 都视为会员
    const isPaidMember = isPro || orders.length > 0 || hasHighCredits
    
    return NextResponse.json({
      isPaidMember,
      orderCount: orders.length,
      latestOrder: orders[0] || null
    })
    
  } catch (error: any) {
    console.error('🔍 [会员检查] 错误:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
