import { NextResponse } from "next/server";
import crypto from "crypto";
import { PRODUCTS, requiresMembership, hasActiveMembership, resolveMembershipStatus, getProductCredits, getProductPriceInCents } from "@/lib/products"; 
import { createClient } from '@supabase/supabase-js'
import { applyRateLimit } from "@/lib/rate-limit";

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

export async function GET(request: Request) {
  try {
    const rateLimited = applyRateLimit(request, { keyPrefix: 'xunhupay-create', maxRequests: 10 });
    if (rateLimited) return rateLimited;

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
    const userId = searchParams.get("userId");
    const billing = searchParams.get("billing") || "monthly";

    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json({ error: "缺少产品ID" }, { status: 400 });
    }

    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
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

      // 检查用户是否有有效会员
      const membershipStatus = resolveMembershipStatus(userCredits);
      
      if (!hasActiveMembership(membershipStatus)) {
        console.log("❌ 用户无会员资格，无法购买积分充值包");
        return NextResponse.json({ 
          error: "积分充值包仅限会员购买",
          details: "请先订阅会员套餐（基础版/专业版/豪华版）后再购买积分充值包",
          requiresMembership: true
        }, { status: 403 });
      }

      console.log(`✅ 用户会员验证通过: ${membershipStatus}`);
    }
    
    const price = (finalPriceInCents / 100).toFixed(2);
    const safeTitle = "VIP_Service"; 
    const tradeOrderId = `ORDER_${Date.now()}_${userId}`;

    // 1. 在数据库中创建订单记录

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_no: tradeOrderId,
        user_id: userId,
        product_id: productId,
        product_name: product.name,
        amount: finalPriceInCents / 100,
        credits_amount: creditsAmount,
        billing_cycle: billing,
        status: 'pending',
        payment_method: 'xunhupay',
      });

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
