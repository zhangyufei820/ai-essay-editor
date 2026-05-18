import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { IconDashboard, IconInkDot, IconProgress, IconSealCheck } from "@/components/icons/v2"

const CHECK_ITEMS = [
  "确认最新版本是否已经完成构建并正常启动",
  "检查环境变量是否齐全，尤其是 Supabase、支付回调和 AI 服务配置",
  "查看应用日志中是否有连续报错或支付回调失败记录",
  "确认 Supabase 服务、订单表、用户积分和会员状态是否可查询",
]

export default function HealthPage() {
  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-10 text-[var(--ink-900)]">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--ink-50)] px-3 py-1 text-sm font-medium text-[var(--ink-700)]">
                <IconProgress className="h-4 w-4" />
                运维状态页
              </div>
              <h1 className="text-3xl font-bold tracking-normal">健康检查</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">
                本页面用于站长快速确认站点是否在线，并提供人工排查入口。页面不会展示真实密钥、数据库连接串或完整环境变量。
              </p>
            </div>
            <Link
              href="/api/health"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-soft)] bg-[var(--ink-900)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ink-800)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-500)] focus:ring-offset-2"
            >
              查看 JSON 接口
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <IconDashboard className="h-5 w-5 text-[var(--ink-700)]" />
              <h2 className="text-lg font-semibold">接口说明</h2>
            </div>
            <p className="text-sm leading-6 text-[var(--ink-600)]">
              `/api/health` 返回轻量 JSON，包含 `status`、`timestamp`、`service` 和版本信息。外部监控可以每 1-5 分钟请求一次该接口。
            </p>
            <div className="mt-4 rounded-[var(--radius-soft)] bg-[var(--paper-100)] px-3 py-2 font-mono text-sm text-[var(--ink-700)]">
              GET /api/health
            </div>
          </div>

          <div className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <IconInkDot className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-semibold">异常时优先检查</h2>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-[var(--ink-600)]">
              {CHECK_ITEMS.map((item) => (
                <li key={item} className="flex gap-2">
                  <IconSealCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-700)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">人工排查建议</h2>
          <div className="mt-4 grid gap-4 text-sm leading-6 text-[var(--ink-600)] md:grid-cols-2">
            <p>部署状态：确认构建成功、应用进程在线、反向代理没有返回 502/504。</p>
            <p>环境变量：只检查变量是否存在和名称是否正确，不要把真实值粘贴进聊天、文档或代码。</p>
            <p>支付回调：核对订单号、支付平台回调记录、订单状态、积分和会员权益是否同步。</p>
            <p>Supabase：检查连接状态、权限策略、用户表、订单表和积分流水是否可读写。</p>
          </div>
        </section>
      </div>
    </main>
  )
}
