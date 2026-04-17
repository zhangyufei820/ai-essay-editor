// 允许的来源白名单
const ALLOWED_ORIGINS = [
  'https://shenxiang.school',
  'https://www.shenxiang.school',
  // 如果有其他域名也加这里
]

// 开发环境允许 localhost
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
]

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  const isDev = process.env.NODE_ENV === 'development'
  const allowedList = isDev ? [...ALLOWED_ORIGINS, ...DEV_ORIGINS] : ALLOWED_ORIGINS
  
  const isAllowed = allowedList.includes(origin)
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Provider, X-AI-Model',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(request),
  })
}