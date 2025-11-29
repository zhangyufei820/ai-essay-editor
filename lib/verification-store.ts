// 验证码存储（使用内存存储，生产环境建议使用Redis）
interface VerificationRecord {
  code: string
  expiresAt: number
  attempts: number
}

const store = new Map<string, VerificationRecord>()

export const verificationStore = {
  // 保存验证码（5分钟有效期）
  set(phone: string, code: string) {
    store.set(phone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟
      attempts: 0,
    })
  },

  // 验证验证码
  verify(phone: string, code: string): boolean {
    const record = store.get(phone)

    if (!record) {
      return false
    }

    // 检查是否过期
    if (Date.now() > record.expiresAt) {
      store.delete(phone)
      return false
    }

    // 检查尝试次数（最多3次）
    if (record.attempts >= 3) {
      store.delete(phone)
      return false
    }

    // 验证码错误，增加尝试次数
    if (record.code !== code) {
      record.attempts++
      return false
    }

    // 验证成功，删除记录
    store.delete(phone)
    return true
  },

  // 检查是否可以发送（60秒内只能发送一次）
  canSend(phone: string): boolean {
    const record = store.get(phone)
    if (!record) {
      return true
    }

    // 如果已过期，可以发送
    if (Date.now() > record.expiresAt) {
      store.delete(phone)
      return true
    }

    // 检查是否距离上次发送超过60秒
    const timeSinceCreation = Date.now() - (record.expiresAt - 5 * 60 * 1000)
    return timeSinceCreation > 60 * 1000
  },
}
