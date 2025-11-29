// 支付宝开放平台SDK配置
// 需要在支付宝开放平台申请应用：https://open.alipay.com/

import crypto from "crypto"

export const alipayConfig = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || "",
  gateway: "https://openapi.alipay.com/gateway.do",
  notifyUrl: process.env.NEXT_PUBLIC_APP_URL + "/api/payment/alipay/notify",
  returnUrl: process.env.NEXT_PUBLIC_APP_URL + "/payment/success",
}

// 生成签名
function sign(params: Record<string, any>): string {
  // 按照key排序
  const sortedKeys = Object.keys(params).sort()
  const signString = sortedKeys.map((key) => `${key}=${params[key]}`).join("&")

  // 使用RSA2签名
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(signString, "utf8")
  return sign.sign(alipayConfig.privateKey, "base64")
}

// 验证签名
export function verifySign(params: Record<string, any>, signature: string): boolean {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type")
    .sort()
  const signString = sortedKeys.map((key) => `${key}=${params[key]}`).join("&")

  const verify = crypto.createVerify("RSA-SHA256")
  verify.update(signString, "utf8")
  return verify.verify(alipayConfig.alipayPublicKey, signature, "base64")
}

// 创建支付订单
export function createAlipayOrder(params: {
  outTradeNo: string
  totalAmount: string
  subject: string
  body?: string
}) {
  const bizContent = {
    out_trade_no: params.outTradeNo,
    total_amount: params.totalAmount,
    subject: params.subject,
    body: params.body || params.subject,
    product_code: "FAST_INSTANT_TRADE_PAY",
  }

  const commonParams = {
    app_id: alipayConfig.appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
    version: "1.0",
    notify_url: alipayConfig.notifyUrl,
    return_url: alipayConfig.returnUrl,
    biz_content: JSON.stringify(bizContent),
  }

  const signature = sign(commonParams)

  const params_with_sign = {
    ...commonParams,
    sign: signature,
  }

  // 生成支付URL
  const queryString = Object.keys(params_with_sign)
    .map((key) => `${key}=${encodeURIComponent(params_with_sign[key as keyof typeof params_with_sign])}`)
    .join("&")

  return `${alipayConfig.gateway}?${queryString}`
}

// 查询订单状态
export async function queryAlipayOrder(outTradeNo: string) {
  const bizContent = {
    out_trade_no: outTradeNo,
  }

  const commonParams = {
    app_id: alipayConfig.appId,
    method: "alipay.trade.query",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  }

  const signature = sign(commonParams)

  const params_with_sign = {
    ...commonParams,
    sign: signature,
  }

  const queryString = Object.keys(params_with_sign)
    .map((key) => `${key}=${encodeURIComponent(params_with_sign[key as keyof typeof params_with_sign])}`)
    .join("&")

  const response = await fetch(`${alipayConfig.gateway}?${queryString}`)
  return response.json()
}
