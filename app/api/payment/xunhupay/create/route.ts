import { NextResponse } from "next/server";
import crypto from "crypto";
import { PRODUCTS } from "@/lib/products"; 

// 1. 签名算法 (保持你验证成功的这个版本：直接拼接)
function gen_sign(params: any, appSecret: string) {
  const sortedKeys = Object.keys(params).sort();
  const kvPairs = [];
  
  for (const key of sortedKeys) {
    if (params[key] !== "" && params[key] !== undefined && key !== "hash") {
      kvPairs.push(`${key}=${params[key]}`);
    }
  }
  
  // 核心：直接拼接密钥，无连接符
  let stringA = kvPairs.join("&");
  let stringSignTemp = stringA + appSecret;
  
  return crypto.createHash("md5").update(stringSignTemp, "utf8").digest("hex");
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

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const product = PRODUCTS.find((p) => p.id === productId);
    const price = product ? (product.priceInCents / 100).toFixed(2) : "0.01";
    
    // 依然用英文标题，稳
    const safeTitle = "VIP_Service"; 
    const tradeOrderId = `ORDER_${Date.now()}`;

    const params: any = {
      version: "1.1",
      appid: APP_ID,
      trade_order_id: tradeOrderId,
      total_fee: price,
      title: safeTitle,
      time: Math.floor(Date.now() / 1000).toString(),
      nonce_str: Math.floor(Math.random() * 1000000).toString(),
      type: "WAP", 
      wap_url: "http://localhost:3000", 
      notify_url: "http://localhost:3000/api/payment/callback", 
    };

    // 计算签名
    params.hash = gen_sign(params, APP_SECRET);

    // =========================================================
    // 🚨 关键升级：后端自动帮你在迅虎拿“入场券”
    // =========================================================
    
    // 1. 组装请求参数
    const formData = new URLSearchParams(params);

    console.log("🚀 [后端] 正在请求迅虎接口获取支付页...");

    // 2. 发起请求 (这次签名对了，所以不会报错了)
    const response = await fetch("https://api.xunhupay.com/payment/do.html", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // 加上 Referer 防止被拦截
        "Referer": "http://localhost:3000",
      },
      body: formData,
    });

    // 3. 解析你刚才看到的那个 JSON
    const data = await response.json();
    console.log("✅ [后端] 迅虎返回成功:", data);

    // 4. 提取真正的支付链接
    // 优先用 url (通用)，如果没返回 url 则用 url_qrcode
    const finalPayUrl = data.url || data.url_qrcode;

    if (finalPayUrl) {
       // 返回给前端，让前端直接跳这个地址
       return NextResponse.json({ url: finalPayUrl });
    } else {
       throw new Error("未获取到支付链接: " + JSON.stringify(data));
    }

  } catch (error: any) {
    console.error("❌ API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
