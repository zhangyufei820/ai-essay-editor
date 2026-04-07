/**
 * 环境感知日志模块
 * 仅在 development 模式下输出日志，生产环境自动静默
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev) {
      console.log('[INFO]', ...args)
    }
  },
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug('[DEBUG]', ...args)
    }
  },
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn('[WARN]', ...args)
    }
  },
  error: (...args: unknown[]) => {
    // error 级别在生产环境也保留，但可以后续扩展为上报服务
    console.error('[ERROR]', ...args)
  },
}
