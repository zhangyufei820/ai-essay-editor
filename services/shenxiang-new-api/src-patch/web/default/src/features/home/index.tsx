/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Copy,
  KeyRound,
  MessageCircle,
  Play,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Markdown } from '@/components/ui/markdown'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'
import { useHomePageContent } from './hooks'

const cards = [
  {
    label: '先选入口',
    title: 'API 接入老师',
    text: '告诉它你要接 Codex、Claude Code、Dify 还是自己的系统，它会先判断该走哪条路径。',
    href: '/codex/',
  },
  {
    label: '拿到凭证',
    title: '令牌管理',
    text: '创建专用 API Key，按用途分开管理，后面排查权限和余额也更清楚。',
    href: '/keys/',
  },
  {
    label: '确认能跑',
    title: '模型广场',
    text: '先看模型、价格和权限，再决定把哪个模型写进客户端配置。',
    href: '/pricing/',
  },
]

const proofItems = [
  ['不先甩文档', '先问你用什么客户端，再给对应配置。'],
  ['不让新手猜入口', 'OpenAI 兼容、Claude Code、Codex 分开讲清楚。'],
  ['不碰危险动作', '创建、充值、删除和生成前都要用户确认。'],
]

const modelBadges = [
  'OpenAI',
  'Claude',
  'Gemini',
  'DeepSeek',
  'Qwen',
  'Grok',
  '30+',
]

function normalizeBaseUrl(value?: string | null) {
  const fallback =
    typeof window !== 'undefined' ? window.location.origin : 'https://api.aiphui.top'
  return (value || fallback).replace(/\/+$/, '')
}

function HomeLanding(props: { isAuthenticated: boolean }) {
  const { status } = useStatus()
  const { copyToClipboard } = useCopyToClipboard({
    successMessage: '已复制',
    errorMessage: '复制失败',
  })
  const baseUrl = normalizeBaseUrl(status?.server_address as string | undefined)
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const isExternalDocs = docsUrl.startsWith('http')

  const copyRows = [
    ['普通客户端', `${baseUrl}/v1`],
    ['Claude Code', `${baseUrl}/claude`],
    ['推荐模型', 'gpt-5.5'],
  ]

  return (
    <main className='min-h-screen overflow-hidden bg-[#080d12] text-slate-50'>
      <div
        aria-hidden
        className='pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:72px_72px]'
      />

      <section className='relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pt-28 pb-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:pt-32 lg:pb-20'>
        <div className='min-w-0'>
          <div className='mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200'>
            <MessageCircle className='size-3.5' aria-hidden />
            低价 API · 接入老师 · Agent 客户端
          </div>
          <h1 className='max-w-3xl text-4xl leading-tight font-black tracking-normal text-balance sm:text-5xl lg:text-[58px]'>
            便宜的 API，不该只给会配置的人用
          </h1>
          <p className='mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg'>
            星人 API 把模型、价格、Base URL、API Key 和客户端接入放在同一个入口。
            你不用先读一长串教程，接入老师会带你把 Codex、Claude Code、Dify
            或自己的客户系统真正跑起来。
          </p>

          <div className='mt-8 flex flex-wrap items-center gap-3'>
            <Button
              className='h-11 rounded-lg bg-blue-500 px-5 text-sm font-semibold text-white hover:bg-blue-400'
              render={<a href='/codex/' />}
            >
              <Play className='size-4' aria-hidden />
              找 API 接入老师
            </Button>
            <Button
              variant='outline'
              className='h-11 rounded-lg border-white/20 bg-white/10 px-5 text-sm font-semibold text-slate-100 hover:bg-white/20'
              render={
                props.isAuthenticated ? <Link to='/keys/' /> : <Link to='/sign-up' />
              }
            >
              <KeyRound className='size-4' aria-hidden />
              创建 API Key
            </Button>
            <Button
              variant='ghost'
              className='h-11 rounded-lg px-5 text-sm font-semibold text-slate-200 hover:bg-white/10'
              onClick={() => copyToClipboard(`${baseUrl}/v1`)}
            >
              <Copy className='size-4' aria-hidden />
              复制 Base URL
            </Button>
          </div>

          <div className='mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3'>
            {proofItems.map(([title, text]) => (
              <div
                key={title}
                className='min-h-24 rounded-lg border border-white/10 bg-white/5 p-4'
              >
                <strong className='block text-sm text-white'>{title}</strong>
                <span className='mt-2 block text-xs leading-5 text-slate-400'>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className='min-w-0 rounded-lg border border-white/15 bg-slate-950/70 shadow-2xl shadow-black/40 backdrop-blur'>
          <div className='flex items-center justify-between border-b border-white/10 px-5 py-4'>
            <div>
              <span className='block text-lg font-bold text-white'>
                星人 API 接入老师
              </span>
              <strong className='mt-1 block text-xs tracking-wide text-emerald-200 uppercase'>
                API Onboarding Agent
              </strong>
            </div>
            <span className='rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200'>
              online
            </span>
          </div>

          <div className='grid gap-3 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]'>
            <div className='min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/25'>
              <div className='flex flex-col gap-1 border-b border-white/10 px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between'>
                <span>当前用户停在首页</span>
                <strong className='font-mono text-slate-100'>
                  已识别：Claude Code 接入
                </strong>
              </div>
              <div className='grid min-h-72 content-start gap-3 p-4'>
                <p className='ml-auto max-w-[88%] rounded-lg border border-blue-300/25 bg-blue-400/10 px-4 py-3 text-sm leading-7 text-slate-100'>
                  我想把 Claude Code 接到星人 API，应该填哪里？
                </p>
                <p className='max-w-[88%] rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm leading-7 text-slate-100'>
                  你用 Claude Code，先复制专用地址，不要填通用 /v1。下一步我带你创建 Key。
                </p>
                <p className='max-w-[88%] rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-7 text-slate-300'>
                  涉及创建、充值、生成和删除前，我会先让你确认。
                </p>
              </div>
              <div className='grid grid-cols-1 gap-2 border-t border-white/10 p-3 sm:grid-cols-3'>
                {['打开令牌管理', '复制 Claude 地址', '检查模型权限'].map((item) => (
                  <span
                    key={item}
                    className='grid min-h-10 place-items-center rounded-lg border border-emerald-300/20 bg-black/30 px-2 text-center text-xs font-semibold text-emerald-200'
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className='grid min-w-0 gap-3'>
              <div className='rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4'>
                <span className='text-xs font-semibold text-emerald-200'>
                  推荐路径
                </span>
                <strong className='mt-2 block text-xl leading-snug text-white'>
                  Claude Code / Codex
                </strong>
                <p className='mt-2 text-sm leading-6 text-slate-400'>
                  先建 Key，再把地址和模型填进客户端。
                </p>
              </div>
              {copyRows.map(([label, value]) => (
                <button
                  key={label}
                  type='button'
                  className='grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-300/40 hover:bg-emerald-300/10 focus-visible:border-emerald-300/60 focus-visible:outline-none'
                  onClick={() => copyToClipboard(value)}
                >
                  <span className='col-span-2 text-xs font-semibold text-emerald-200'>
                    {label}
                  </span>
                  <strong className='min-w-0 [overflow-wrap:anywhere] font-mono text-xs leading-5 text-slate-50'>
                    {value}
                  </strong>
                  <Copy className='size-4 text-emerald-200' aria-hidden />
                </button>
              ))}
              <div className='rounded-lg border border-white/10 bg-white/5 p-4 text-xs leading-5 text-slate-400'>
                不要把完整 API Key 发给网页聊天。贴过 Key 就建议重置。
              </div>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 border-t border-white/10 p-4 sm:grid-cols-3'>
            {[
              ['Codex', '模型、Key、Base URL 一起配好'],
              ['Claude Code', '专用入口直接复制'],
              ['Dify / 客户系统', '按真实业务场景落地'],
            ].map(([title, text]) => (
              <div
                key={title}
                className='min-h-20 rounded-lg border border-white/10 bg-black/30 p-3'
              >
                <span className='block text-sm font-bold text-white'>{title}</span>
                <em className='mt-2 block text-xs leading-5 text-slate-400 not-italic'>
                  {text}
                </em>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className='relative z-10 mx-auto max-w-6xl px-6 pb-16'>
        <div className='mb-6 max-w-2xl'>
          <span className='inline-flex rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200'>
            产品路径
          </span>
          <h2 className='mt-4 text-3xl leading-tight font-black tracking-normal text-white md:text-4xl'>
            入口少一点，接入快一点
          </h2>
        </div>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          {cards.map((card) => (
            <a
              key={card.title}
              href={card.href}
              className='group min-h-44 rounded-lg border border-white/10 bg-white/5 p-5 transition hover:border-emerald-300/40 hover:bg-white/10'
            >
              <span className='text-xs font-semibold text-emerald-200'>
                {card.label}
              </span>
              <strong className='mt-4 block text-xl text-white'>{card.title}</strong>
              <p className='mt-3 text-sm leading-7 text-slate-400'>{card.text}</p>
              <ArrowRight className='mt-5 size-4 text-emerald-200 transition group-hover:translate-x-1' />
            </a>
          ))}
        </div>
      </section>

      <section className='relative z-10 mx-auto max-w-6xl px-6 pb-20'>
        <div className='grid grid-cols-1 gap-6 rounded-lg border border-white/10 bg-white/5 p-5 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] md:p-6'>
          <div>
            <span className='inline-flex rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200'>
              可复制配置
            </span>
            <h2 className='mt-4 text-3xl leading-tight font-black tracking-normal text-white md:text-4xl'>
              少给一堆教程，多给能直接粘贴的配置
            </h2>
            <p className='mt-4 max-w-xl text-sm leading-7 text-slate-300 md:text-base'>
              常用客户端只需要确认入口、模型和 Key。页面把通用地址、Claude Code
              专用地址和推荐模型放在一起；接入老师负责把它们落到真实客户端里。
            </p>
            <div className='mt-6 flex flex-wrap gap-3'>
              {isExternalDocs ? (
                <Button
                  variant='outline'
                  className='h-10 rounded-lg border-white/20 bg-white/10 text-slate-100 hover:bg-white/20'
                  render={
                    <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
                  }
                >
                  <BookOpen className='size-4' aria-hidden />
                  打开文档中心
                </Button>
              ) : (
                <Button
                  variant='outline'
                  className='h-10 rounded-lg border-white/20 bg-white/10 text-slate-100 hover:bg-white/20'
                  render={<Link to={docsUrl} />}
                >
                  <BookOpen className='size-4' aria-hidden />
                  打开文档中心
                </Button>
              )}
              <Button
                className='h-10 rounded-lg bg-blue-500 text-white hover:bg-blue-400'
                render={<a href='/codex/' />}
              >
                <TerminalSquare className='size-4' aria-hidden />
                找接入老师
              </Button>
            </div>
          </div>

          <div className='grid min-w-0 gap-3'>
            {copyRows.map(([label, value]) => (
              <button
                key={label}
                type='button'
                className='grid min-h-[72px] grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-300/10 focus-visible:border-emerald-300/60 focus-visible:outline-none'
                onClick={() => copyToClipboard(value)}
              >
                <span className='text-xs font-semibold text-emerald-200'>
                  {label}
                </span>
                <strong className='min-w-0 [overflow-wrap:anywhere] font-mono text-sm leading-5 text-slate-50'>
                  {value}
                </strong>
                <Copy className='size-4 text-emerald-200' aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7'>
          {modelBadges.map((item) => (
            <div
              key={item}
              className='grid min-h-16 place-items-center rounded-lg border border-white/10 bg-white/5 px-3 text-center text-sm font-bold text-slate-100'
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className='relative z-10 mx-auto max-w-6xl px-6 pb-20'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          {[
            ['401 先查 Key', '确认复制的是完整 Key，且没有把 Claude 专用地址填到普通客户端。'],
            ['403 先查权限', '模型是否在令牌权限内，余额和分组是否允许调用。'],
            ['timeout 先查地址', 'Base URL、网络、代理和客户端协议先排查，不急着重置全部配置。'],
          ].map(([title, text]) => (
            <div
              key={title}
              className='rounded-lg border border-white/10 bg-white/5 p-5'
            >
              <CheckCircle2 className='size-5 text-emerald-200' aria-hidden />
              <strong className='mt-4 block text-lg text-white'>{title}</strong>
              <p className='mt-3 text-sm leading-7 text-slate-400'>{text}</p>
            </div>
          ))}
        </div>
        <div className='mt-6 flex items-start gap-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-7 text-emerald-50'>
          <ShieldCheck className='mt-1 size-5 shrink-0 text-emerald-200' aria-hidden />
          <p>
            接入老师可以读当前页面并指导下一步，但不会绕过登录、不会替你确认危险动作，也不会要求你把完整 API Key 发到聊天里。
          </p>
        </div>
      </section>

      <div className='relative z-10 border-t border-white/10 bg-[#080d12] text-slate-300'>
        <Footer className='bg-transparent text-slate-300 [&_a]:text-emerald-200 [&_a:hover]:text-white' />
      </div>
    </main>
  )
}

export function Home() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const { content, isLoaded, isUrl } = useHomePageContent()
  const isAuthenticated = !!auth.user

  if (!isLoaded) {
    return (
      <PublicLayout showMainContainer={false}>
        <main className='flex min-h-screen items-center justify-center bg-[#080d12] text-slate-300'>
          <div>{t('Loading...')}</div>
        </main>
      </PublicLayout>
    )
  }

  if (content) {
    return (
      <PublicLayout showMainContainer={false}>
        <main className='overflow-x-hidden'>
          {isUrl ? (
            <iframe
              src={content}
              className='h-screen w-full border-none'
              title={t('Custom Home Page')}
            />
          ) : (
            <div className='container mx-auto py-8'>
              <Markdown className='custom-home-content'>{content}</Markdown>
            </div>
          )}
        </main>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <HomeLanding isAuthenticated={isAuthenticated} />
    </PublicLayout>
  )
}
