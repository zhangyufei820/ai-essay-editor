// SMS服务提供商配置
// 支持阿里云、腾讯云等主流短信服务商

export interface SMSProvider {
  sendVerificationCode(phone: string, code: string): Promise<boolean>
}

// 阿里云短信服务
class AliyunSMS implements SMSProvider {
  async sendVerificationCode(phone: string, code: string): Promise<boolean> {
    // 需要配置环境变量：
    // ALIYUN_ACCESS_KEY_ID
    // ALIYUN_ACCESS_KEY_SECRET
    // ALIYUN_SMS_SIGN_NAME
    // ALIYUN_SMS_TEMPLATE_CODE

    try {
      // 这里需要安装 @alicloud/pop-core
      // 实际实现需要调用阿里云SDK
      console.log(`[SMS] 发送验证码到 ${phone}: ${code}`)

      // 模拟发送（实际使用时需要替换为真实的阿里云SDK调用）
      if (process.env.NODE_ENV === "development") {
        console.log(`[开发模式] 验证码: ${code}`)
        return true
      }

      // 生产环境需要实现真实的短信发送
      return false
    } catch (error) {
      console.error("[SMS] 发送失败:", error)
      return false
    }
  }
}

// 腾讯云短信服务
class TencentSMS implements SMSProvider {
  async sendVerificationCode(phone: string, code: string): Promise<boolean> {
    // 需要配置环境变量：
    // TENCENT_SECRET_ID
    // TENCENT_SECRET_KEY
    // TENCENT_SMS_APP_ID
    // TENCENT_SMS_SIGN
    // TENCENT_SMS_TEMPLATE_ID

    try {
      console.log(`[SMS] 发送验证码到 ${phone}: ${code}`)

      if (process.env.NODE_ENV === "development") {
        console.log(`[开发模式] 验证码: ${code}`)
        return true
      }

      return false
    } catch (error) {
      console.error("[SMS] 发送失败:", error)
      return false
    }
  }
}

// 根据配置选择SMS提供商
export function getSMSProvider(): SMSProvider {
  const provider = process.env.SMS_PROVIDER || "aliyun"

  switch (provider) {
    case "tencent":
      return new TencentSMS()
    case "aliyun":
    default:
      return new AliyunSMS()
  }
}

// 生成6位数字验证码
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
