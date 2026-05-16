import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import {
  canPurchaseProductWithMembership,
  getAllowedMemberships,
  getProductById,
  getProductCredits,
  getProductPriceInCents,
  isCreditsProduct,
  isMembershipProduct,
  isPurchasableProduct,
  requiresMembership,
  resolveMembershipStatus,
  validateProductPurchase,
} from "@/lib/products";
import { createClient } from '@supabase/supabase-js'
import { applyRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/verified-user";

// 签名算法
function gen_sign(params: any, appSecret: string) {
  const sortedKeys = Object.keys(params).sort();
  const kvPairs = [];
  
  for (const key of sortedKeys) {
    if (params[key] !== "" && params[key] !== undefined && key !== "hash") {
      kvPairs.push(`${key}=${params[key]}`);
    }
  }
  
  let stringA = kvPairs.join("&");
  let stringSignTemp = stringA + appSecret;
  
  return crypto.createHash("md5").update(stringSignTemp, "utf8").digest("hex").toLowerCase();
}

// 获取当前请求的基础URL
function getBaseUrl(request: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
    let url = process.env.NEXT_PUBLIC_APP_URL;
    if (!url.includes('www.') && url.includes('shenxiang.school')) {
      url = url.replace('https://', 'https://www.');
    }
    return url;
  }
  
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = applyRateLimit(request, { keyPrefix: 'xunhupay-create', maxRequests: 10 });
    if (rateLimited) return rateLimited;

    const auth = await requireUser(request)
    if (auth.response) return auth.response
    const verifiedUserId = auth.user!.id

    const APP_ID = process.env.XUNHUPAY_APPID;
    const APP_SECRET = process.env.XUNHUPAY_APPSECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!APP_ID || !APP_SECRET || !supabaseUrl || !serviceRoleKey) {
      console.error("❌ 支付配置缺失");
      return NextResponse.json({ error: "支付服务未配置" }, { status: 503 });
    }

    const baseUrl = getBaseUrl(request);
    console.log("🌐 当前基础URL:", baseUrl);

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const requestedUserId = searchParams.get("userId");
    const billing = searchParams.get("billing") || "monthly";

    if (requestedUserId && requestedUserId !== verifiedUserId) {
      return NextResponse.json({ error: "无权为该用户创建订单" }, { status: 403 });
    }
    const userId = verifiedUserId

    if (!productId) {
      return NextResponse.json({ error: "缺少产品ID" }, { status: 400 });
    }

    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    if (!isPurchasableProduct(productId) || (!isMembershipProduct(productId) && !isCreditsProduct(productId))) {
      return NextResponse.json({ error: "产品类型不支持在线购买" }, { status: 400 });
    }

    // 根据服务端产品目录计算价格，前端传参不能决定金额
    const finalPriceInCents = getProductPriceInCents(productId, billing);
    if (finalPriceInCents === null) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    const creditsAmount = getProductCredits(productId);

    // 初始化 Supabase 客户端
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    let membershipStatus: string | null = null

    // 检查产品是否需要会员资格
    if (requiresMembership(productId)) {
      // 查询用户会员状态
      const { data: userCredits, error: creditsError } = await supabaseAdmin
        .from('user_credits')
        .select('is_pro')
        .eq('user_id', userId)
        .maybeSingle();

      if (creditsError) {
        console.error("❌ 查询用户会员状态失败:", creditsError);
        return NextResponse.json({ 
          error: "无法验证会员状态",
          details: "请先登录后重试"
        }, { status: 500 });
      }

      const { data: latestMembershipOrder, error: membershipOrderError } = await supabaseAdmin
        .from('orders')
        .select('product_id')
        .eq('user_id', userId)
        .eq('status', 'paid')
        .in('product_id', ['basic', 'pro', 'premium', 'enterprise', 'campus'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (membershipOrderError) {
        console.error("❌ 查询会员订单失败:", membershipOrderError);
        return NextResponse.json({
          error: "无法验证会员等级",
          details: "请稍后重试或联系客服"
        }, { status: 500 });
      }

      membershipStatus = latestMembershipOrder?.product_id || resolveMembershipStatus(userCredits);
      if (!canPurchaseProductWithMembership(productId, membershipStatus)) {
        const allowedMemberships = getAllowedMemberships(productId)
        console.log("❌ 用户无会员资格，无法购买积分充值包");
        return NextResponse.json({ 
          error: allowedMemberships.includes('basic') ? "积分充值包仅限会员购买" : "当前会员等级暂不支持购买该充值包",
          details: allowedMemberships.includes('premium')
            ? "该充值包仅限豪华版、企业版或校园版会员购买。"
            : allowedMemberships.includes('pro')
              ? "该充值包仅限专业版、豪华版、企业版或校园版会员购买。"
              : "请先订阅会员套餐后再购买积分充值包。",
          requiresMembership: true,
          requiredMemberships: allowedMemberships,
          currentMembership: membershipStatus,
        }, { status: 403 });
      }

      console.log(`✅ 用户会员验证通过: ${membershipStatus}`);
    }

    const purchaseValidation = validateProductPurchase(productId, membershipStatus)
    if (!purchaseValidation.ok) {
      return NextResponse.json({ error: purchaseValidation.error }, { status: purchaseValidation.status })
    }
    
    const price = (finalPriceInCents / 100).toFixed(2);
    const safeTitle = "VIP_Service"; 
    const tradeOrderId = `ORDER_${Date.now()}_${userId}`;

    // 1. 在数据库中创建订单记录

    const orderPayload = {
      order_no: tradeOrderId,
      user_id: userId,
      product_id: productId,
      product_name: product.name,
      amount: finalPriceInCents / 100,
      credits_amount: creditsAmount,
      billing_cycle: billing,
      status: 'pending',
      payment_method: 'xunhupay',
    }

    let { error: orderError } = await supabaseAdmin
      .from('orders')
      .insert(orderPayload);

    if (orderError && String(orderError.message || "").includes("billing_cycle")) {
      const { billing_cycle, ...fallbackOrderPayload } = orderPayload
      const retry = await supabaseAdmin
        .from('orders')
        .insert(fallbackOrderPayload)
      orderError = retry.error
    }

    if (orderError) {
      console.error("❌ 创建订单失败:", orderError);
      return NextResponse.json({ error: "创建订单失败" }, { status: 500 });
    }

    console.log("✅ 订单创建成功:", tradeOrderId);

    // 2. 构建迅虎支付参数
    const params: any = {
      version: "1.1",
      appid: APP_ID,
      trade_order_id: tradeOrderId,
      total_fee: price,
      title: safeTitle,
      time: Math.floor(Date.now() / 1000).toString(),
      nonce_str: Math.floor(Math.random() * 1000000).toString(),
      type: "WAP", 
      wap_url: baseUrl, 
      notify_url: `${baseUrl}/api/payment/xunhupay/notify`, 
    };

    params.hash = gen_sign(params, APP_SECRET);

    console.log("📤 请求迅虎支付参数:", params);

    // 3. 调用迅虎支付API获取真正的支付链接
    const formData = new URLSearchParams(params);
    
    const response = await fetch("https://api.xunhupay.com/payment/do.html", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; ShenxiangSchool/1.0)",
        "Accept": "application/json",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ 迅虎返回错误:", response.status, errorText.slice(0, 300));
      return NextResponse.json({ 
        error: "迅虎支付请求失败"
      }, { status: 500 });
    }

    const data = await response.json();
    console.log("✅ 迅虎返回:", { errcode: data?.errcode, hasUrl: Boolean(data?.url || data?.url_qrcode) });

    // 4. 检查返回结果
    if (data.errcode !== 0) {
      console.error("❌ 迅虎支付错误:", data);
      return NextResponse.json({ 
        error: "支付创建失败",
        code: data.errcode
      }, { status: 500 });
    }

    // 5. 返回支付链接
    const payUrl = data.url || data.url_qrcode;
    
    if (!payUrl) {
      console.error("❌ 未获取到支付链接:", data);
      return NextResponse.json({ error: "未获取到支付链接" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      orderNo: tradeOrderId,
      url: payUrl
    });

  } catch (error: any) {
    console.error("❌ API Error:", error);
    return NextResponse.json({ error: "支付创建失败" }, { status: 500 });
  }
}
