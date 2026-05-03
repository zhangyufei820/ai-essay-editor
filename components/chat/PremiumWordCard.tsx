"use client"

import type React from "react"
import { BookOpen, CheckCircle2, Headphones, Lightbulb, RotateCcw, Sparkles, SpellCheck, Volume2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FrontendWordCard } from "@/lib/word-card-normalizer"

type PremiumWordCardProps = {
  data: FrontendWordCard
}

function list(value: any): any[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function text(value: any): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  return ""
}

function Section({
  icon,
  title,
  tone,
  children
}: {
  icon: React.ReactNode
  title: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("rounded-2xl border p-4 shadow-sm sm:p-5", tone)}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-700 shadow-sm">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null
  return (
    <span className={cn("inline-flex items-center rounded-full border bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm", className)}>
      {children}
    </span>
  )
}

function Field({ label, value }: { label: string; value: any }) {
  const display = text(value)
  if (!display) return null
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-slate-800">{display}</div>
    </div>
  )
}

export function PremiumWordCard({ data }: PremiumWordCardProps) {
  const hero = data.hero || {}
  const sections = data.sections || {}
  const pronunciation = sections.pronunciation || {}
  const spelling = sections.spelling || {}
  const memoryStory = sections.memory_story || sections.memoryStory || {}
  const examples = list(sections.examples?.items || sections.examples?.examples || sections.examples)
  const review = sections.review || {}
  const quickMemory = sections.quick_memory || sections.quickMemory || {}
  const quality = data.quality || {}
  const badges = data.ui?.badges || {}
  const ipa = hero.ipa || pronunciation.ipa || {}
  const audio = pronunciation.audio || {}
  const audioUrl = text(audio.audio_url || pronunciation.audio_url)
  const audioFailed = audio.status === "failed" || !audioUrl
  const partOfSpeech = list(hero.part_of_speech).map(text).filter(Boolean).join(" / ")
  const examTags = list(hero.exam_tags || hero.frequency?.exam_tags).map(text).filter(Boolean)
  const qualityPassed = Boolean(quality.passed)

  return (
    <article className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 text-3xl font-black shadow-inner backdrop-blur">
          {text(hero.icon) || "Aa"}
        </div>
        <div className="max-w-[calc(100%-5rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-4xl font-black leading-none tracking-normal sm:text-5xl">{data.word}</h2>
            {partOfSpeech && <Pill className="border-white/30 bg-white/20 text-white">{partOfSpeech}</Pill>}
          </div>
          <p className="mt-3 text-xl font-semibold leading-7">{text(hero.primary_cn)}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/90 sm:text-base">{text(hero.simple_en)}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {text(ipa.us) && <Pill className="border-white/30 bg-white/20 text-white">美 {text(ipa.us)}</Pill>}
          {text(ipa.uk) && <Pill className="border-white/30 bg-white/20 text-white">英 {text(ipa.uk)}</Pill>}
          {text(hero.frequency?.rank_label) && <Pill className="border-white/30 bg-white/20 text-white">{text(hero.frequency.rank_label)}</Pill>}
          {examTags.map((tag) => <Pill key={tag} className="border-white/30 bg-white/20 text-white">{tag}</Pill>)}
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
        <Section icon={<Headphones className="h-4 w-4" />} title="发音" tone="border-sky-100 bg-sky-50">
          <div className="grid gap-3">
            <Field label="跟读文本" value={pronunciation.tts_text} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="重音" value={pronunciation.stress} />
              <Field label="自然拼读" value={pronunciation.phonics_tip_cn} />
            </div>
            <Field label="口型提示" value={pronunciation.mouth_shape_tip_cn} />
            {list(pronunciation.common_mistakes).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list(pronunciation.common_mistakes).map((item, index) => <Pill key={index}>{text(item)}</Pill>)}
              </div>
            )}
            {audioUrl && !audioFailed ? (
              <audio className="mt-1 w-full" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            ) : (
              <div className="rounded-xl border border-sky-100 bg-white/75 p-3 text-sm text-slate-600">
                音频暂未生成，单词卡片仍可正常学习。
              </div>
            )}
          </div>
        </Section>

        <Section icon={<SpellCheck className="h-4 w-4" />} title="拼写记忆" tone="border-amber-100 bg-amber-50">
          <div className="grid gap-3">
            {list(spelling.chunks).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list(spelling.chunks).map((chunk, index) => <Pill key={index}>{text(chunk)}</Pill>)}
              </div>
            )}
            <Field label="拼写公式" value={spelling.formula} />
            <Field label="规则" value={spelling.rule_cn} />
            <Field label="防错提醒" value={spelling.anti_mistake_tip_cn} />
            {list(spelling.common_mistakes).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list(spelling.common_mistakes).map((item, index) => <Pill key={index}>{text(item)}</Pill>)}
              </div>
            )}
          </div>
        </Section>

        <Section icon={<Sparkles className="h-4 w-4" />} title="记忆故事" tone="border-fuchsia-100 bg-fuchsia-50">
          <div className="grid gap-3">
            <Field label="故事标题" value={memoryStory.story_title_cn} />
            <Field label="故事" value={memoryStory.story_cn} />
            <Field label="画面" value={memoryStory.visual_scene_cn} />
            {list(memoryStory.keywords).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list(memoryStory.keywords).map((keyword, index) => <Pill key={index}>{text(keyword)}</Pill>)}
              </div>
            )}
          </div>
        </Section>

        <Section icon={<BookOpen className="h-4 w-4" />} title="例句" tone="border-emerald-100 bg-emerald-50">
          <div className="grid gap-3">
            {examples.map((example, index) => (
              <div key={index} className="rounded-2xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
                <p className="text-sm font-semibold leading-6 text-slate-900">{text(example.en || example.english || example.sentence)}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{text(example.cn || example.zh || example.translation)}</p>
                {text(example.difficulty) && <Pill className="mt-2">{text(example.difficulty)}</Pill>}
              </div>
            ))}
          </div>
        </Section>

        <Section icon={<RotateCcw className="h-4 w-4" />} title="复习" tone="border-indigo-100 bg-indigo-50">
          <div className="grid gap-3">
            <Field label="正面问题" value={review.front_question_cn} />
            <Field label="背面答案" value={review.back_answer_cn} />
            <Field label="填空题" value={review.cloze_test?.question} />
            <Field label="填空答案" value={review.cloze_test?.answer} />
            {list(review.self_check_questions).length > 0 && (
              <div className="grid gap-2">
                {list(review.self_check_questions).map((question, index) => (
                  <div key={index} className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-6 text-slate-700">{text(question)}</div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section icon={<Lightbulb className="h-4 w-4" />} title="快速记忆" tone="border-rose-100 bg-rose-50">
          <div className="grid gap-3">
            <Field label="一句话" value={quickMemory.one_sentence_cn} />
            <Field label="口诀" value={quickMemory.chant_cn} />
            <Field label="三秒钩子" value={quickMemory.three_second_hook_cn} />
          </div>
        </Section>
      </div>

      <footer className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={qualityPassed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
            {qualityPassed ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
            {qualityPassed ? "最终复检通过，可以展示" : "需要继续核验"}
          </Pill>
          {text(quality.score) && <Pill>评分 {text(quality.score)}</Pill>}
          {text(badges.quality) && <Pill>{text(badges.quality)}</Pill>}
          {text(badges.tts) && <Pill><Volume2 className="mr-1 h-3.5 w-3.5" />{text(badges.tts)}</Pill>}
        </div>
        {text(quality.summary_cn) && <p className="mt-2 text-sm leading-6 text-slate-600">{text(quality.summary_cn)}</p>}
      </footer>
    </article>
  )
}
