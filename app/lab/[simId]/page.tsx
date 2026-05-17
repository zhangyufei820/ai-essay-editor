import { BadgeV2 as Badge, ButtonV2 as Button } from "@/components/ui/v2"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, BookOpen, ClipboardList, Film, Target } from "lucide-react"
import { PhetSimEmbed } from "@/components/phet/PhetSimEmbed"
import { PhetCompleteButton } from "@/components/phet/PhetCompleteButton"
import {
  buildPhetChatHref,
  buildPhetLearningPlanTask,
  getDifficultyLabel,
  getPhetSim,
  getRelatedPhetSims,
  getSubjectLabel,
} from "@/lib/phet/phet-utils"

type PageProps = {
  params: Promise<{ simId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { simId } = await params
  const sim = getPhetSim(simId)
  if (!sim) return { title: "实验不存在 | 沈翔智学" }
  return {
    title: `${sim.name_zh} | 互动实验室`,
    description: sim.description_zh,
  }
}

export default async function PhetSimPage({ params }: PageProps) {
  const { simId } = await params
  const sim = getPhetSim(simId)
  if (!sim) notFound()

  const related = getRelatedPhetSims(sim, 4)
  const planTask = buildPhetLearningPlanTask(sim)

  return (
    <main className="min-h-screen bg-[#F7FAF9] text-emerald-950 dark:bg-slate-950 dark:text-emerald-50">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <Link href="/lab" className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300">互动实验室</Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600 dark:text-slate-300">{sim.name_zh}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <PhetSimEmbed simId={sim.id} height="min(72vh, 680px)" />
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>{getSubjectLabel(sim.subject)}</Badge>
                <Badge variant="ghost">{getDifficultyLabel(sim.difficulty)}</Badge>
                <Badge variant="paper">{sim.grade_range[0]}-{sim.grade_range[1]} 年级</Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal">{sim.name_zh}</h1>
              <p className="mt-1 text-sm text-slate-500">{sim.name_en}</p>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{sim.description_zh}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {sim.topics.map((topic) => (
                  <span key={topic} className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    {topic}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Target className="h-4 w-4 text-emerald-600" />
                学习目标
              </h2>
              <ul className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {sim.learning_goals.map((goal) => <li key={goal}>• {goal}</li>)}
              </ul>
            </section>

            <section className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900">
              <h2 className="mb-3 text-base font-semibold">交互方式</h2>
              <ul className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {sim.interactive_elements.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </section>

            <section className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900">
              <div className="grid gap-2">
                <Button asChild variant="outline" className="justify-between">
                  <Link href={buildPhetChatHref(sim, "flashcards")}>
                    <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" /> 生成闪卡</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between">
                  <Link href={buildPhetChatHref(sim, "quiz")}>
                    <span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" /> 相关测验</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-between">
                  <Link href={buildPhetChatHref(sim, "animation")}>
                    <span className="inline-flex items-center gap-2"><Film className="h-4 w-4" /> 相关动画</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-4">
                <PhetCompleteButton simId={sim.id} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                学习计划任务格式：{planTask.type} / {planTask.sim_id}
              </p>
            </section>
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-8 rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">相关实验</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <Link key={item.id} href={`/lab/${item.id}`} className="rounded-lg border border-emerald-900/10 p-3 transition hover:border-emerald-500/50 hover:bg-emerald-50 dark:border-emerald-200/10 dark:hover:bg-emerald-950/30">
                  <div className="text-sm font-semibold">{item.name_zh}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.topics.slice(0, 3).join("、")}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
