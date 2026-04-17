/**
 * 基于内存的滑动窗口限流器
 * 
 * 特性：
 * - 每个 IP 每分钟最多 30 次 API 请求
 * - 每个用户每分钟最多 60 次 AI 对话请求
 * - 使用滑动窗口算法
 * - 返回 429 状态码和重试提示
 */

interface RateLimitEntry {
  timestamps: number[];
}

class MemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每分钟清理一次过期的记录
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * 清理过期的记录（超过1分钟的）
   */
  private cleanup(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    for (const [key, entry] of this.store.entries()) {
      // 移除超过1分钟的时间戳
      entry.timestamps = entry.timestamps.filter(ts => ts > oneMinuteAgo);
      
      // 如果没有时间戳了，删除这个键
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * 检查并更新限流状态
   * @param key 限流键（IP或用户ID）
   * @param maxRequests 最大请求数
   * @param windowMs 时间窗口（毫秒）
   * @returns 是否允许请求，如果拒绝则包含重试信息
   */
  check(key: string, maxRequests: number, windowMs: number = 60000): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // 移除窗口外的时间戳
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    const currentCount = entry.timestamps.length;

    if (currentCount >= maxRequests) {
      // 计算最早的时间戳，确定何时可以重试
      const oldestTimestamp = Math.min(...entry.timestamps);
      const resetTime = oldestTimestamp + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.max(1, retryAfter), // 至少1秒
      };
    }

    // 添加新的时间戳
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      resetTime: now + windowMs,
    };
  }

  /**
   * 清理所有记录（用于测试或重置）
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 销毁限流器（清理定时器）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// 全局限流器实例
const rateLimiter = new MemoryRateLimiter();

/**
 * IP 限流：每分钟最多 30 次 API 请求
 */
export function checkIpRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
} {
  return rateLimiter.check(`ip:${ip}`, 30);
}

/**
 * 用户限流：每分钟最多 60 次 AI 对话请求
 */
export function checkUserRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
} {
  return rateLimiter.check(`user:${userId}`, 60);
}

/**
 * 获取客户端 IP 地址
 */
export function getClientIP(request: Request): string {
  // 优先从 x-forwarded-for 获取（代理环境）
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // 取第一个 IP（客户端真实 IP）
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // 从 x-real-ip 获取
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // 如果没有代理头，使用默认值
  // 注意：在 Next.js API 路由中，request.ip 可能不可用
  return 'unknown';
}

/**
 * 创建限流响应
 */
export function createRateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: '请求过于频繁',
      message: `请在 ${retryAfter} 秒后重试`,
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Date.now() + retryAfter * 1000),
      },
    }
  );
}

export default rateLimiter;