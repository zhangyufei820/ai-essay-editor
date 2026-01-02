import { NextResponse } from "next/server";
import crypto from "crypto";
import { PRODUCTS } from "@/lib/products"; 
import { createClient } from '@supabase/supabase-js'

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
  
  return crypto.createHash("md5").update(stringSignTemp, "utf8").digest("hex");
}

// 获取当前请求的基础URL
function getBaseUrl(request: Request): string {
  // 优先使用环境变量中配置的URL
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
    // 确保URL包含www
    let url = process.env.NEXT_PUBLIC_APP_URL;
    if (!url.includes('www.') && url.includes('shenxiang.school')) {
      url = url.replace('https://', 'https://www.');
    }
    return url;
  }
  
  // 从请求头中获取host
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}

export async function GET(request: Request) {
  try {
    // 从环境变量读取支付配置
    const APP_ID = process.env.XUNHUPAY_APPID;
    const APP_SECRET = process.env.XUNHUPAY_APPSECRET;
    
    if (!APP_ID || !APP_SECRET) {
      console.error("❌ 支付配置缺失：XUNHUPAY_APPID 或 XUNHUPAY_APPSECRET 未设置");
      return NextResponse.json({ error: "支付服务未配置" }, { status: 503 });
    }

    // 动态获取基础URL
    const baseUrl = getBaseUrl(request);
    console.log("🌐 当前基础URL:", baseUrl);

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const userId = searchParams.get("userId");
    const billing = searchParams.get("billing") || "monthly";
    
    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }
    
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    
    const price = (product.priceInCents / 100).toFixed(2);
    const safeTitle = "VIP_Service"; 
    const tradeOrderId = `ORDER_${Date.now()}_${userId}`;

    // =========================================================
    // 1. 在数据库中创建订单记录（重要！回调时需要查询）
    // =========================================================
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_no: tradeOrderId,
        user_id: userId,
        product_id: productId,
        product_name: product.name,
        amount: product.priceInCents / 100, // 转换为元
        status: 'pending',
        payment_method: 'xunhupay',
      });

    if (orderError) {
      console.error("❌ 创建订单失败:", orderError);
      return NextResponse.json({ error: "创建订单失败" }, { status: 500 });
    }

    console.log("✅ 订单创建成功:", tradeOrderId);

    // =========================================================
    // 2. 构建迅虎支付参数
    // =========================================================
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

    // 计算签名
    params.hash = gen_sign(params, APP_SECRET);

    console.log("📤 [后端] 生成的支付参数:", params);

    // =========================================================
    // 3. 返回签名后的参数和URL，让前端直接跳转
    // =========================================================
    
    // 构建GET请求URL
    const queryString = new URLSearchParams(params).toString();
    const redirectUrl = `https://api.xunhupay.com/payment/do.html?${queryString}`;
    
    return NextResponse.json({ 
      success: true,
      orderNo: tradeOrderId,
      // 返回迅虎支付的API地址
      paymentUrl: "https://api.xunhupay.com/payment/do.html",
      // 返回签名后的参数（用于POST表单提交）
      params: params,
      // 返回直接跳转的URL（GET方式）
      url: redirectUrl
    });

  } catch (error: any) {
    console.error("❌ API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
