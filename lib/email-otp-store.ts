// 邮箱验证码内存存储
interface OTPData {
  code: string
  expiresAt: number
  attempts: number
  createdAt: number
}

declare global {
  var otpStoreInstance: Map<string, OTPData> | undefined
  var otpStoreCleanupInterval: NodeJS.Timeout | undefined
}

const otpStore = globalThis.otpStoreInstance ?? new Map<string, OTPData>()
globalThis.otpStoreInstance = otpStore

// 清理过期的验证码
function cleanExpiredOTPs() {
  const now = Date.now()
  for (const [email, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(email)
    }
  }
}

// 每分钟清理一次过期验证码
const cleanupInterval = globalThis.otpStoreCleanupInterval ?? setInterval(cleanExpiredOTPs, 60 * 1000)
cleanupInterval.unref?.()
globalThis.otpStoreCleanupInterval = cleanupInterval

export const emailOTPStore = {
  // 存储验证码
  set(email: string, code: string, expiresInMs: number = 5 * 60 * 1000) {
    const normalizedEmail = email.toLowerCase()
    const data = {
      code,
      expiresAt: Date.now() + expiresInMs,
      attempts: 0,
      createdAt: Date.now(),
    }
    otpStore.set(normalizedEmail, data)
  },

  // 获取验证码
  get(email: string): OTPData | undefined {
    const normalizedEmail = email.toLowerCase()

    const data = otpStore.get(normalizedEmail)

    if (!data) {
      return undefined
    }

    // 检查是否过期
    if (data.expiresAt < Date.now()) {
      otpStore.delete(normalizedEmail)
      return undefined
    }

    return data
  },

  // 增加尝试次数
  incrementAttempts(email: string): number {
    const normalizedEmail = email.toLowerCase()
    const data = otpStore.get(normalizedEmail)

    if (data) {
      data.attempts++
      otpStore.set(normalizedEmail, data)
      return data.attempts
    }

    return 0
  },

  // 删除验证码
  delete(email: string) {
    const normalizedEmail = email.toLowerCase()
    otpStore.delete(normalizedEmail)
  },

  // 检查是否可以发送（60秒内只能发送一次）
  canSend(email: string): boolean {
    const normalizedEmail = email.toLowerCase()
    const data = otpStore.get(normalizedEmail)

    if (!data) return true

    const timeSinceCreated = Date.now() - data.createdAt
    return timeSinceCreated >= 60 * 1000
  },
}
