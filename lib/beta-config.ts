// 公测配置 - 控制哪些功能在公测期间可用
export const BETA_CONFIG = {
  // 认证功能
  auth: {
    email: true, // 邮箱登录 - 已配置
    phone: false, // 手机验证码 - 等待短信服务商审核
    wechat: false, // 微信登录 - 等待微信开放平台审核
  },
  // 支付功能
  payment: {
    stripe: true, // Stripe国际支付 - 已配置
    alipay: false, // 支付宝 - 等待支付宝开放平台审核
    wechatPay: false, // 微信支付 - 等待微信支付商户审核
    xunhupay: true, // 迅虎支付 - 已配置（支付宝+微信）
  },
  // 核心功能（始终可用）
  core: {
    aiChat: true, // AI聊天
    essayReview: true, // 作文批改
    fileUpload: true, // 文件上传
    history: true, // 历史记录
  },
}

// 获取功能状态文本
export function getFeatureStatus(enabled: boolean): {
  text: string
  color: string
  badge: string
} {
  if (enabled) {
    return {
      text: "可用",
      color: "text-green-600",
      badge: "bg-green-100 text-green-700",
    }
  }
  return {
    text: "即将上线",
    color: "text-orange-600",
    badge: "bg-orange-100 text-orange-700",
  }
}
