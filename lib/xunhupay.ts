import crypto from "crypto"

export interface XunhupayConfig {
  appId: string
  appSecret: string
  gateway: string
  notifyUrl: string
  returnUrl: string
}

export const xunhupayConfig: XunhupayConfig = {
  appId: process.env.XUNHUPAY_APPID || "",
  appSecret: process.env.XUNHUPAY_APPSECRET || "",
  gateway: process.env.XUNHUPAY_API_URL || "https://api.xunhupay.com/payment/do.html",
  notifyUrl: (process.env.NEXT_PUBLIC_APP_URL || "") + "/api/payment/xunhupay/notify",
  returnUrl: (process.env.NEXT_PUBLIC_APP_URL || "") + "/payment/success",
}

// 生成签名 (MD5) - 迅虎支付标准格式
function generateSign(params: Record<string, any>, appSecret: string): string {
  // 按照key排序并拼接（排除空值和hash字段）
  const sortedKeys = Object.keys(params).sort()
  const kvPairs: string[] = []
  
  for (const key of sortedKeys) {
    if (params[key] !== "" && params[key] !== undefined && key !== "hash" && key !== "sign") {
      kvPairs.push(`${key}=${params[key]}`)
    }
  }
  
  const signString = kvPairs.join("&")
  // 迅虎支付签名格式：参数串 + appSecret（直接拼接）
  const stringWithSecret = signString + appSecret

  // MD5签名
  return crypto.createHash("md5").update(stringWithSecret, "utf8").digest("hex").toLowerCase()
}

// 验证签名 - 支持多种签名格式
export function verifyXunhupaySign(params: Record<string, any>): boolean {
  // 迅虎支付回调中的签名字段可能是 hash 或 sign
  const receivedSign = (params.hash || params.sign || "").toLowerCase()
  
  if (!receivedSign) {
    console.log("[迅虎支付签名验证] 未找到签名字段")
    return false
  }
  
  const paramsWithoutSign = { ...params }
  delete paramsWithoutSign.sign
  delete paramsWithoutSign.hash

  const calculatedSign = generateSign(paramsWithoutSign, xunhupayConfig.appSecret)
  
  console.log("[迅虎支付签名验证] 收到签名:", receivedSign)
  console.log("[迅虎支付签名验证] 计算签名:", calculatedSign)
  console.log("[迅虎支付签名验证] 验证结果:", receivedSign === calculatedSign)
  
  return receivedSign === calculatedSign
}

// 创建支付订单
export function createXunhupayOrder(params: {
  outTradeNo: string
  totalAmount: string
  subject: string
  body?: string
  paymentType?: "alipay" | "wechat"
}): string {
  const orderParams = {
    version: "1.1",
    appid: xunhupayConfig.appId,
    trade_order_id: params.outTradeNo,
    total_fee: params.totalAmount,
    title: params.subject,
    description: params.body || params.subject,
    time: Math.floor(Date.now() / 1000).toString(),
    notify_url: xunhupayConfig.notifyUrl,
    return_url: xunhupayConfig.returnUrl,
    type: params.paymentType || "alipay", // 默认支付宝
    nonce_str: crypto.randomBytes(16).toString("hex"),
  }

  // 生成签名
  const sign = generateSign(orderParams, xunhupayConfig.appSecret)

  const paramsWithSign = {
    ...orderParams,
    sign,
    hash: "md5",
  }

  // 生成支付URL
  const queryString = Object.keys(paramsWithSign)
    .map((key) => `${key}=${encodeURIComponent(paramsWithSign[key as keyof typeof paramsWithSign])}`)
    .join("&")

  return `${xunhupayConfig.gateway}?${queryString}`
}

// 查询订单状态
export async function queryXunhupayOrder(outTradeNo: string) {
  const queryParams = {
    appid: xunhupayConfig.appId,
    out_trade_order: outTradeNo,
    time: Math.floor(Date.now() / 1000).toString(),
    nonce_str: crypto.randomBytes(16).toString("hex"),
  }

  const sign = generateSign(queryParams, xunhupayConfig.appSecret)

  const paramsWithSign = {
    ...queryParams,
    sign,
    hash: "md5",
  }

  const queryString = Object.keys(paramsWithSign)
    .map((key) => `${key}=${encodeURIComponent(paramsWithSign[key as keyof typeof paramsWithSign])}`)
    .join("&")

  const response = await fetch(`https://api.xunhupay.com/payment/query?${queryString}`)
  return response.json()
}
