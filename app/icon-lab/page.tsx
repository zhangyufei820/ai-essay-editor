"use client"

import { EssayCorrectionVariantIcon } from "@/components/icons/IconStyleVariants"
import { ShenxiangFeatureIcon } from "@/components/icons/ShenxiangFeatureIcons"
import { ShenxiangInterfaceIcon } from "@/components/icons/ShenxiangInterfaceIcons"
import { SHENXIANG_ICON_CATALOG } from "@/components/icons/shenxiang-icon-catalog"
import { SHENXIANG_INTERFACE_ICON_CATALOG } from "@/components/icons/shenxiang-interface-icon-catalog"

const groups = ["核心入口", "教育智能体", "写作场景", "通用操作"] as const
const interfaceGroups = ["导航入口", "用户与账户", "通用操作", "状态反馈"] as const

export default function IconLabPage() {
  return (
    <main className="min-h-screen bg-[#F7FAF9] text-[#0D3A1F]">
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 border-b border-emerald-900/10 pb-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700/60">
            H direction selected
          </p>
          <div className="grid gap-6 lg:grid-cols-[1fr_220px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-3xl font-semibold tracking-normal text-emerald-950 sm:text-4xl">
                H 方案「高级极简」全套图标预览
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-emerald-950/62">
                我把全站业务图标先统一到 H 的视觉语言：白色柔面、薄荷描边、神象绿主笔画和少量青色高光。官方大模型 logo 不在本次重绘范围内，继续使用官方图标。
              </p>
            </div>
            <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
              <EssayCorrectionVariantIcon variant="quiet-premium" size={112} className="mx-auto" />
              <div className="mt-3 text-center text-xs font-medium text-emerald-950/55">选定母版</div>
            </div>
          </div>
        </header>

        <section className="mb-8 rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-emerald-950">全套展开</h2>
              <p className="mt-1 text-xs text-emerald-950/55">先看整体家族感，再看每个功能是否有自己的识别点。</p>
            </div>
            <span className="w-fit rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              {SHENXIANG_ICON_CATALOG.length} 个业务图标
            </span>
          </div>

          <div className="space-y-7">
            {groups.map((group) => (
              <section key={group}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/45">
                  {group}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  {SHENXIANG_ICON_CATALOG.filter((item) => item.group === group).map((item) => (
                    <article
                      key={item.name}
                      className="rounded-lg border border-emerald-900/10 bg-gradient-to-b from-white to-emerald-50/25 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:shadow-[0_18px_42px_rgba(14,165,233,0.12)]"
                    >
                      <div className="mb-4 flex h-28 items-center justify-center rounded-lg border border-emerald-900/8 bg-white/86">
                        <ShenxiangFeatureIcon name={item.name} size={82} />
                      </div>
                      <h4 className="text-sm font-semibold text-emerald-950">{item.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-emerald-950/55">{item.note}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-emerald-950">网站通用 SVG 图标</h2>
              <p className="mt-1 text-xs text-emerald-950/55">帮助、分享、用户头像、设置、邀请、上传下载和状态反馈一次性成套。</p>
            </div>
            <span className="w-fit rounded-md bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
              {SHENXIANG_INTERFACE_ICON_CATALOG.length} 个 UI 图标
            </span>
          </div>

          <div className="space-y-7">
            {interfaceGroups.map((group) => (
              <section key={group}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/45">
                  {group}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  {SHENXIANG_INTERFACE_ICON_CATALOG.filter((item) => item.group === group).map((item) => (
                    <article
                      key={item.name}
                      className="rounded-lg border border-emerald-900/10 bg-gradient-to-b from-white to-cyan-50/20 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:shadow-[0_18px_42px_rgba(14,165,233,0.12)]"
                    >
                      <div className="mb-4 flex h-24 items-center justify-center rounded-lg border border-emerald-900/8 bg-white/86">
                        <ShenxiangInterfaceIcon name={item.name} size={58} />
                      </div>
                      <h4 className="text-sm font-semibold text-emerald-950">{item.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-emerald-950/55">{item.note}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-emerald-900/10 bg-[#0B2318] p-5 text-white shadow-[0_20px_60px_rgba(13,58,31,0.12)]">
            <h2 className="text-base font-semibold">深色场景压力测试</h2>
            <p className="mt-1 text-xs text-emerald-100/65">看聊天页、弹层和深色推荐区里的清晰度。</p>
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-3">
              {SHENXIANG_ICON_CATALOG.slice(0, 12).map((item) => (
                <div key={item.name} className="rounded-lg border border-white/10 bg-white/[0.06] p-3 text-center">
                  <ShenxiangFeatureIcon name={item.name} size={58} className="mx-auto" />
                  <div className="mt-2 truncate text-[11px] text-emerald-50/72">{item.title}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-emerald-950">小尺寸可读性</h2>
            <p className="mt-1 text-xs text-emerald-950/55">侧边栏、按钮、移动端快捷入口常见尺寸。</p>
            <div className="mt-5 space-y-5">
              {[28, 36, 44].map((size) => (
                <div key={size} className="rounded-lg border border-emerald-900/10 p-4">
                  <div className="mb-3 text-xs font-semibold text-emerald-950/50">{size}px</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-3">
                    {SHENXIANG_INTERFACE_ICON_CATALOG.slice(0, 12).map((item) => (
                      <div key={item.name} className="flex min-w-24 items-center gap-2">
                        <ShenxiangInterfaceIcon name={item.name} size={size} />
                        <span className="truncate text-[11px] text-emerald-950/50">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
