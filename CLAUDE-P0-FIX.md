# P0 紧急修复任务 - Claude Code 执行指南

## 项目信息
- **项目路径**: `/Users/aixingren/ai-essay-editor/`
- **技术栈**: Next.js 16 + TypeScript + Tailwind CSS + Supabase
- **域名**: shenxiang.school
- **部署**: Docker 自托管 (服务器 root@43.154.111.156, 路径 /data/ai-essay-editor/)

## 执行须知
- 修改前先读取完整文件内容，不要凭猜测改代码
- 每改完一个任务，用 `npm run build` 验证构建通过
- 不要改动任何已正常工作的功能
- 保持代码风格与现有代码一致

---

## 任务 1: 去掉首页登录墙，做真正的落地页

### 背景
`app/page.tsx` 中 `Home` 组件在 `useEffect` 里检查 `localStorage.getItem('currentUser')`，未登录就 `router.replace('/login')`。这导致首次访问 shenxiang.school 的用户（包括搜索引擎爬虫）看到的是登录弹窗，而不是产品介绍。

但实际上这个页面已经有完整的落地页内容（HeroSection、OpenClawSection、CapabilitiesSection、ProcessSection、TestimonialsSection、StatsSection、CTASection、HomeFooter），只是被登录检查挡住了。

### 具体修改

**文件**: `app/page.tsx`

**修改方式**: 去掉 `useEffect` 中的登录重定向逻辑，改为：未登录用户直接看到落地页内容，已登录用户也看到同样的内容（但侧边栏可以保持登录状态的显示）。

```tsx
// 原代码 (第96-123行):
export default function Home() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const user = localStorage.getItem('currentUser')
    if (!user) {
      router.replace('/login')     // <-- 这就是登录墙
    } else {
      setIsAuthorized(true)
    }
    setIsLoading(false)
  }, [router])

  if (isLoading) { return <LoadingScreen /> }
  if (!isAuthorized) { return null }
  // ... 渲染落地页

// 改为:
export default function Home() {
  // 不再检查登录状态，所有用户都能看到落地页
  // 侧边栏 (AppSidebar) 会自动根据登录状态显示不同内容
  return (
    <main className="min-h-screen bg-white">
      <HeroSection />
      <OpenClawSection />
      // ... 保持所有原有内容不变
```

**关键点**:
- 删除 `useRouter`、`useState`、`useEffect` 的导入（如果没有其他地方使用）
- 删除 `LoadingScreen` 组件（如果没有其他地方使用）
- 删除 `isAuthorized`、`isLoading` 状态
- 直接 return JSX，不需要条件判断
- 侧边栏的登录/注册按钮由 `AppSidebar` 组件自己控制，不受影响

---

## 任务 2: 删除或修复 `/ai-writing` 和 `/payment` 死链接

### 背景
- 访问 `/ai-writing` 返回 404
- 访问 `/payment` 返回 404
- 但侧边栏有 "AI写作专区" 按钮指向这些页面
- 定价页面有 "选择基础版/专业版/豪华版" 按钮

### 具体修改

**2a. `/ai-writing` 路由**

先检查现有目录:
```
app/ai-writing/paper/     <-- 存在
app/ai-writing/success/   <-- 存在  
app/ai-writing/wechat/    <-- 存在
```

但 `app/ai-writing/page.tsx` 不存在（这就是404的原因）。

**方案**: 创建 `app/ai-writing/page.tsx`，重定向到实际的 AI 写作功能页面:

```tsx
import { redirect } from 'next/navigation'

export default function AIWritingPage() {
  // AI写作功能实际在 /chat/ai-writing-paper
  redirect('/chat/ai-writing-paper')
}
```

**2b. `/payment` 路由**

先检查:
```
app/payment/success/      <-- 存在（支付成功页）
app/checkout/page.tsx     <-- 可能是实际的支付入口
app/pricing/page.tsx      <-- 定价页
```

**方案A**: 如果 `/payment` 本来就是用来展示支付结果的，创建 `app/payment/page.tsx` 重定向到定价页:

```tsx
import { redirect } from 'next/navigation'

export default function PaymentPage() {
  redirect('/pricing')
}
```

**方案B**: 如果定价页的"选择xx版"按钮应该跳到支付流程，检查按钮的 `href` 或 `onClick`，确保它们指向正确的 checkout 路由（如 `/checkout?plan=basic`）。

**操作步骤**:
1. 先 `ls app/payment/` 确认目录结构
2. 读取 `app/pricing/page.tsx` 或相关组件，找到购买按钮的跳转逻辑
3. 根据实际路由结构选择方案 A 或 B
4. 如果创建 redirect 页面，内容简单即可

---

## 任务 3: 修复 HTML 中 robots meta 标签矛盾

### 背景
页面源码中同时出现:
```html
<meta name="robots" content="noindex"/>
<meta name="robots" content="index, follow"/>
```

分析发现:
- `app/layout.tsx` 第95-98行设置了 `robots: { index: true, follow: true }` — 这是正确的
- `noindex` 可能来自 Next.js 的 `_not-found` 默认行为，或 layout 中有其他地方设置了它

### 具体修改

**文件**: `app/layout.tsx`

1. 确认 metadata 对象中只有一处 robots 设置:

```tsx
// 确保这里存在且唯一 (约第95行):
robots: {
  index: true,
  follow: true,
},
```

2. 检查 `app/not-found.tsx` — 如果自定义了 404 页面，确认它没有在 layout 外层额外设置 noindex。

3. 如果在 `app/layout.tsx` 的 `<head>` 手动写了 `<meta name="robots" content="noindex"/>`，删除它。

**关键点**: Next.js 的 metadata API (`robots: { index: true, follow: true }`) 会自动生成 meta 标签。不要在 JSX `<head>` 中手动添加额外的 robots meta 标签，否则会产生重复/冲突。

---

## 任务 4: CORS 改为白名单模式

### 背景
两个 API 路由使用了 `Access-Control-Allow-Origin: *`（允许任意来源跨域调用）:

- `app/api/chat/route.ts` — 3 处 (第14、174、320行)
- `app/api/essay-grade/route.ts` — 2 处 (第253行，以及注释掉的第228行)

### 具体修改

**方案**: 创建一个共享的 CORS 配置文件，集中管理允许的来源。

**新建文件**: `lib/cors.ts`

```ts
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
```

**修改 `app/api/chat/route.ts`**:

```ts
// 在文件顶部添加:
import { getCorsHeaders, handleOptions } from '@/lib/cors'

// 替换原来的 OPTIONS 函数:
export async function OPTIONS(req: Request) {
  return handleOptions(req)
}

// 在 POST 函数中，所有返回 Response 的地方，把
// 'Access-Control-Allow-Origin': '*'
// 替换为:
// ...getCorsHeaders(req)
// 
// 例如:
// return new Response(..., {
//   headers: {
//     ...getCorsHeaders(req),
//     'Content-Type': 'application/json',
//   }
// })
```

**修改 `app/api/essay-grade/route.ts`**:

同样替换:
```ts
import { getCorsHeaders, handleOptions } from '@/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req)
}
```

**关键点**:
- `getCorsHeaders` 返回的对象 spread 到每个 Response 的 headers 中
- 对于不允许的来源，`Access-Control-Allow-Origin` 设为空字符串（浏览器会阻断跨域）
- 不要忘记 OPTIONS 预检请求也要返回正确的 CORS 头
- 如果 API 只需要从 shenxiang.school 自己调用，甚至可以考虑完全移除 CORS 头（同源请求不需要 CORS）

---

## 验证步骤

完成修改后，按以下顺序验证:

1. **构建验证**: `npm run build` — 确保无报错
2. **本地测试**: `npm run dev`，然后:
   - 访问 `http://localhost:3000/` — 应该看到落地页，不是登录弹窗
   - 访问 `http://localhost:3000/ai-writing` — 应该跳转到 /chat/ai-writing-paper
   - 访问 `http://localhost:3000/payment` — 应该跳转到 /pricing
   - 访问 `http://localhost:3000/this-does-not-exist` — 404页面应该只有一组 robots meta
3. **CORS 测试**: 用浏览器 DevTools 的 Network 面板，查看 `/api/chat` 的 OPTIONS 响应，确认 `Access-Control-Allow-Origin` 不再是 `*`
4. **提交部署**: 改完推送到服务器触发自动部署
