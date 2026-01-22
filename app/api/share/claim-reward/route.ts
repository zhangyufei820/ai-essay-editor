import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { addCredits } from '@/lib/credits'

export const dynamic = 'force-dynamic'

// 🎁 分享奖励配置
const SHARE_REWARD_CONFIG = {
  CREDITS_PER_VIEW: 1000,    // 访问者获得积分
  MAX_DAILY_CLAIMS: 5,       // 每天最多领取次数
}

export async function POST(request: NextRequest) {
  console.log('🎁 [Share Reward] 收到领取奖励请求')
  
  try {
    const body = await request.json()
    const { shareId, viewerId } = body
    
    if (!shareId || !viewerId) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    console.log('🎁 [Share Reward] 请求参数:', { shareId, viewerId: viewerId.slice(0, 8) + '...' })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '服务配置错误' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // 1. 获取分享内容信息
    const { data: shareData, error: shareError } = await supabaseAdmin
      .from('shared_content')
      .select('share_id, user_id')
      .eq('share_id', shareId)
      .single()

    if (shareError || !shareData) {
      console.log('🎁 [Share Reward] 分享不存在:', shareId)
      return NextResponse.json({ error: '分享不存在' }, { status: 404 })
    }

    // 2. 检查是否是自己的分享（不能自己领自己的）
    if (shareData.user_id === viewerId) {
      console.log('🎁 [Share Reward] 不能领取自己的分享奖励')
      return NextResponse.json({ 
        success: false, 
        message: '不能领取自己的分享奖励'
      })
    }

    // 3. 检查是否已经领取过这个分享的奖励
    const { data: existingClaim } = await supabaseAdmin
      .from('share_reward_claims')
      .select('id')
      .eq('share_id', shareId)
      .eq('viewer_id', viewerId)
      .single()

    if (existingClaim) {
      console.log('🎁 [Share Reward] 已经领取过该分享的奖励')
      return NextResponse.json({ 
        success: false, 
        message: '您已经领取过这个分享的奖励了'
      })
    }

    // 4. 检查今天已经领取的次数
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { data: todayClaims } = await supabaseAdmin
      .from('share_reward_claims')
      .select('id')
      .eq('viewer_id', viewerId)
      .gte('created_at', today.toISOString())

    const todayClaimCount = todayClaims?.length || 0
    
    if (todayClaimCount >= SHARE_REWARD_CONFIG.MAX_DAILY_CLAIMS) {
      console.log('🎁 [Share Reward] 今日领取次数已达上限:', todayClaimCount)
      return NextResponse.json({ 
        success: false, 
        message: `今日积分领取已达上限（${SHARE_REWARD_CONFIG.MAX_DAILY_CLAIMS}次）`
      })
    }

    // 5. 发放积分给访问者
    const viewerSuccess = await addCredits(
      viewerId,
      SHARE_REWARD_CONFIG.CREDITS_PER_VIEW,
      'share_view_reward',
      `📥 查看分享内容获得 ${SHARE_REWARD_CONFIG.CREDITS_PER_VIEW} 积分奖励`,
      shareId
    )

    if (!viewerSuccess) {
      console.error('🎁 [Share Reward] 发放访问者积分失败')
      return NextResponse.json({ error: '积分发放失败，请稍后重试' }, { status: 500 })
    }

    // 🔥 6. 发放积分给分享者（双方都获得积分！）
    if (shareData.user_id) {
      const sharerSuccess = await addCredits(
        shareData.user_id,
        SHARE_REWARD_CONFIG.CREDITS_PER_VIEW,
        'share_bonus',
        `🎉 您的分享被他人查看，获得 ${SHARE_REWARD_CONFIG.CREDITS_PER_VIEW} 积分奖励`,
        shareId
      )
      
      if (sharerSuccess) {
        console.log('🎁 [Share Reward] 分享者积分发放成功:', shareData.user_id.slice(0, 8) + '...')
      } else {
        console.error('🎁 [Share Reward] 分享者积分发放失败（不影响访问者）')
      }
    }

    // 7. 记录领取记录（防止重复领取）
    await supabaseAdmin.from('share_reward_claims').insert({
      share_id: shareId,
      viewer_id: viewerId,
      sharer_id: shareData.user_id,
      credits: SHARE_REWARD_CONFIG.CREDITS_PER_VIEW
    })

    console.log('🎁 [Share Reward] 奖励发放成功:', {
      viewerId: viewerId.slice(0, 8) + '...',
      credits: SHARE_REWARD_CONFIG.CREDITS_PER_VIEW
    })

    return NextResponse.json({
      success: true,
      credits: SHARE_REWARD_CONFIG.CREDITS_PER_VIEW,
      message: `🎉 恭喜获得 ${SHARE_REWARD_CONFIG.CREDITS_PER_VIEW} 积分！（今日 ${todayClaimCount + 1}/${SHARE_REWARD_CONFIG.MAX_DAILY_CLAIMS}）`
    })

  } catch (error) {
    console.error('[Share Reward Error]', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
