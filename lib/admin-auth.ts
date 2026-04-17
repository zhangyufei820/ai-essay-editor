/**
 * 管理后台认证工具
 * 用于验证管理员 token
 */

// 内存存储 token（生产环境应使用 Redis 或数据库）
const tokenStore = new Map<string, { expires: number }>();

// 清理过期 token
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenStore.entries()) {
    if (data.expires < now) {
      tokenStore.delete(token);
    }
  }
}, 5 * 60 * 1000); // 每5分钟清理一次

/**
 * 生成管理员 token
 * @param password 密码
 * @returns token 字符串或 null（如果密码错误）
 */
export function generateAdminToken(password: string): string | null {
  // 从环境变量读取密码，默认 "admin2026"
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin2026';
  
  if (password !== adminPassword) {
    return null;
  }
  
  // 生成 token：admin_<base64(timestamp + random)>
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const tokenData = `${timestamp}:${random}`;
  const token = `admin_${btoa(tokenData)}`;
  
  // 存储 token，有效期 24 小时
  tokenStore.set(token, {
    expires: timestamp + 24 * 60 * 60 * 1000
  });
  
  return token;
}

/**
 * 验证管理员 token
 * @param token token 字符串
 * @returns 是否有效
 */
export function verifyAdminToken(token: string): boolean {
  if (!token || !token.startsWith('admin_')) {
    return false;
  }
  
  const entry = tokenStore.get(token);
  if (!entry) {
    return false;
  }
  
  // 检查是否过期
  if (entry.expires < Date.now()) {
    tokenStore.delete(token);
    return false;
  }
  
  return true;
}

/**
 * 注销 token
 * @param token token 字符串
 */
export function revokeAdminToken(token: string): void {
  tokenStore.delete(token);
}