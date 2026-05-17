"use client"

import type React from "react"
import { BookOpenCheck, Languages, Palette, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type VocabCardDifyInputs = {
  word: string
  level: string
  style: string
  language: string
}

type Option = {
  value: string
  label: string
  hint?: string
}

type OptionGroupProps = {
  icon: React.ReactNode
  title: string
  variable: keyof VocabCardDifyInputs
  value: string
  options: Option[]
  onChange: (key: keyof VocabCardDifyInputs, value: string) => void
  tone: string
}

const LEVEL_OPTIONS: Option[] = [
  { value: "primary", label: "小学", hint: "primary" },
  { value: "middle", label: "初中", hint: "middle" },
  { value: "high", label: "高中", hint: "high" },
  { value: "cet4", label: "四级", hint: "cet4" },
  { value: "cet6", label: "六级", hint: "cet6" },
  { value: "postgraduate", label: "考研", hint: "postgraduate" },
  { value: "ielts", label: "雅思", hint: "ielts" },
  { value: "toefl", label: "托福", hint: "toefl" },
  { value: "general", label: "通用", hint: "general" },
]

const STYLE_OPTIONS: Option[] = [
  { value: "minimal", label: "极简", hint: "minimal" },
  { value: "colorful", label: "彩色", hint: "colorful" },
  { value: "academic", label: "学术", hint: "academic" },
  { value: "comic", label: "漫画", hint: "comic" },
  { value: "exam", label: "考试", hint: "exam" },
  { value: "story", label: "故事", hint: "story" },
  { value: "root", label: "词根", hint: "root" },
]

const LANGUAGE_OPTIONS: Option[] = [
  { value: "zh-CN", label: "中文", hint: "zh-CN" },
  { value: "en", label: "英文", hint: "en" },
  { value: "bilingual", label: "双语", hint: "bilingual" },
]

function OptionGroup({ icon, title, variable, value, options, onChange, tone }: OptionGroupProps) {
  return (
    <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)]/85 p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-[var(--radius-sharp)]", tone)}>
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--ink-900)]">{title}</div>
            <div className="text-[11px] font-medium text-[var(--ink-400)]">{variable}</div>
          </div>
        </div>
        <span className="rounded-full bg-[var(--paper-100)] px-2 py-1 text-[11px] font-medium text-[var(--ink-500)]">
          string
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(variable, option.value)}
              className={cn(
                "rounded-[var(--radius-sharp)] border px-3 py-2 text-left transition-all",
                "min-w-[88px] flex-1 sm:min-w-[96px] sm:flex-none",
                selected
                  ? "border-emerald-500 bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm ring-2 ring-emerald-100"
                  : "border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-600)] hover:border-[var(--ink-200)] hover:bg-[var(--paper-50)]"
              )}
              aria-pressed={selected}
            >
              <span className="block text-sm font-semibold leading-5">{option.label}</span>
              <span className="block text-[11px] leading-4 text-[var(--ink-400)]">{option.hint}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function VocabCardDifyForm({
  value,
  onChange,
  disabled,
  currentWord,
  onClearCurrentWord,
}: {
  value: VocabCardDifyInputs
  onChange: (value: VocabCardDifyInputs) => void
  disabled?: boolean
  currentWord?: string
  onClearCurrentWord?: () => void
}) {
  const updateValue = (key: keyof VocabCardDifyInputs, nextValue: string) => {
    if (disabled) return
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <div className="mb-3 rounded-3xl border border-[var(--ink-100)] bg-gradient-to-br from-white via-emerald-50/70 to-sky-50/70 p-3 shadow-lg shadow-emerald-100/50 sm:mb-4 sm:p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--ink-900)]">单词卡片设置</h2>
          <p className="text-xs leading-5 text-[var(--ink-500)]">填写英文单词可直接生成卡片；也可以只在下方输入想说的话。</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-[var(--ink-700)]">
          {currentWord && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--paper-50)]/80 px-2 py-1">
              current_word: {currentWord}
              {onClearCurrentWord && (
                <button
                  type="button"
                  onClick={onClearCurrentWord}
                  className="ml-0.5 rounded-full p-0.5 text-[var(--ink-500)] transition hover:bg-[var(--ink-50)] hover:text-[var(--ink-800)]"
                  aria-label="清空当前学习词"
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )}
          <span className="rounded-full bg-[var(--paper-50)]/80 px-2 py-1">level: {value.level}</span>
          <span className="rounded-full bg-[var(--paper-50)]/80 px-2 py-1">style: {value.style}</span>
          <span className="rounded-full bg-[var(--paper-50)]/80 px-2 py-1">language: {value.language}</span>
        </div>
      </div>
      <div className="grid gap-3">
        <section className="rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-[var(--paper-50)]/85 p-3 shadow-sm sm:p-4">
          <label htmlFor="vocab-card-word" className="text-sm font-semibold text-[var(--ink-900)]">
            英文单词
          </label>
          <input
            id="vocab-card-word"
            value={value.word}
            onChange={(event) => updateValue("word", event.target.value)}
            placeholder="英文单词，例如 apple"
            disabled={disabled}
            className="mt-2 h-11 w-full rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-3 text-sm text-[var(--ink-900)] outline-none transition placeholder:text-[var(--ink-400)] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-[var(--paper-50)] disabled:text-[var(--ink-400)]"
          />
        </section>
        <OptionGroup
          icon={<BookOpenCheck className="h-4 w-4 text-[var(--ink-700)]" />}
          title="学习阶段"
          variable="level"
          value={value.level}
          options={LEVEL_OPTIONS}
          onChange={updateValue}
          tone="bg-[var(--ink-50)]"
        />
        <OptionGroup
          icon={<Palette className="h-4 w-4 text-fuchsia-700" />}
          title="卡片风格"
          variable="style"
          value={value.style}
          options={STYLE_OPTIONS}
          onChange={updateValue}
          tone="bg-fuchsia-50"
        />
        <OptionGroup
          icon={<Languages className="h-4 w-4 text-sky-700" />}
          title="输出语言"
          variable="language"
          value={value.language}
          options={LANGUAGE_OPTIONS}
          onChange={updateValue}
          tone="bg-sky-50"
        />
      </div>
    </div>
  )
}
