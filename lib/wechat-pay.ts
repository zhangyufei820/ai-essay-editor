import crypto from "crypto"

export interface WeChatPayConfig {
  appId: string
  mchId: string
  apiKey: string
  notifyUrl: string
}

export class WeChatPay {
  private config: WeChatPayConfig

  constructor(config: WeChatPayConfig) {
    this.config = config
  }

  // 生成签名
  private generateSign(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort()
    const stringA = sortedKeys.map((key) => `${key}=${params[key]}`).join("&")
    const stringSignTemp = `${stringA}&key=${this.config.apiKey}`
    return crypto.createHash("md5").update(stringSignTemp).digest("hex").toUpperCase()
  }

  // 创建统一下单
  async createOrder(params: {
    outTradeNo: string
    totalFee: number
    body: string
    productId: string
  }) {
    const orderParams = {
      appid: this.config.appId,
      mch_id: this.config.mchId,
      nonce_str: crypto.randomBytes(16).toString("hex"),
      body: params.body,
      out_trade_no: params.outTradeNo,
      total_fee: params.totalFee,
      spbill_create_ip: "127.0.0.1",
      notify_url: this.config.notifyUrl,
      trade_type: "NATIVE",
      product_id: params.productId,
    }

    const sign = this.generateSign(orderParams)

    return {
      ...orderParams,
      sign,
    }
  }

  // 验证回调签名
  verifyNotify(params: Record<string, any>): boolean {
    const sign = params.sign
    delete params.sign
    const calculatedSign = this.generateSign(params)
    return sign === calculatedSign
  }
}

// 创建微信支付实例
export function createWeChatPay(): WeChatPay | null {
  const appId = process.env.WECHAT_PAY_APP_ID
  const mchId = process.env.WECHAT_PAY_MCH_ID
  const apiKey = process.env.WECHAT_PAY_API_KEY
  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/wechat/notify`

  if (!appId || !mchId || !apiKey) {
    console.warn("微信支付配置不完整，功能将被禁用")
    return null
  }

  return new WeChatPay({
    appId,
    mchId,
    apiKey,
    notifyUrl,
  })
}

export async function createWeChatPayOrder(params: {
  outTradeNo: string
  totalFee: number
  body: string
  attach: string
}): Promise<{ success: boolean; codeUrl?: string; error?: string }> {
  const wechatPay = createWeChatPay()

  if (!wechatPay) {
    return {
      success: false,
      error: "微信支付未配置",
    }
  }

  try {
    const orderData = await wechatPay.createOrder({
      outTradeNo: params.outTradeNo,
      totalFee: params.totalFee,
      body: params.body,
      productId: params.attach,
    })

    // 生成二维码URL（这里简化处理，实际应该调用微信API）
    const codeUrl = `weixin://wxpay/bizpayurl?pr=${orderData.out_trade_no}`

    return {
      success: true,
      codeUrl,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "创建订单失败",
    }
  }
}

export function verifyWeChatPaySign(params: Record<string, any>): boolean {
  const wechatPay = createWeChatPay()

  if (!wechatPay) {
    return false
  }

  return wechatPay.verifyNotify(params)
}
