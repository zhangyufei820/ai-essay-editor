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
  const cards = [
    {
      label: '先登录',
      title: '工作台入口',
      text: '登录后进入文本对话、文件上传和模型选择的统一工作台。',
      href: props.isAuthenticated ? '/login' : '/login',
    },
    {
      label: '拿到凭证',
      title: '令牌管理',
      text: '创建并管理 API Key，按用途区分更方便排查权限、余额和调用记录。',
      href: '/keys/',
    },
    {
      label: '确认可用',
      title: '模型广场',
      text: '先看可用模型、价格和权限，再决定实际调用方案。',
      href: '/pricing/',
    },
  ]
  const proofItems = [
    ['入口更集中', '文本对话、文件上传、模型选择放在同一个工作台。'],
    ['配置更直接', '常用地址、模型和令牌入口放在同一屏就能找到。'],
    ['操作更稳妥', '创建、充值、删除和生成前都保留用户确认。'],
  ]

  const copyRows = [
    ['通用地址', `${baseUrl}/v1`],
    ['工作台入口', `${baseUrl}/`],
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
            文本对话 · 文件上传 · 模型广场
          </div>
          <h1 className='max-w-3xl text-4xl leading-tight font-black tracking-normal text-balance sm:text-5xl lg:text-[58px]'>
            一个入口，把对话和配置都放顺手
          </h1>
          <p className='mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg'>
            星人 API 把文本对话、文件上传、模型选择、Base URL 和 API Key
            收在同一个工作台里。你不用先翻很长的说明，就能先开始用，再按需要补配置。
          </p>

          <div className='mt-8 flex flex-wrap items-center gap-3'>
            <Button
              className='h-11 rounded-lg bg-blue-500 px-5 text-sm font-semibold text-white hover:bg-blue-400'
              render={<a href='/pricing/' />}
            >
              <Play className='size-4' aria-hidden />
              查看模型与定价
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
                AIPHUI 工作台
              </span>
              <strong className='mt-1 block text-xs tracking-wide text-emerald-200 uppercase'>
                Text Chat Workspace
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
                  可用：文本对话与文件上传
                </strong>
              </div>
              <div className='grid min-h-72 content-start gap-3 p-4'>
                <p className='ml-auto max-w-[88%] rounded-lg border border-blue-300/25 bg-blue-400/10 px-4 py-3 text-sm leading-7 text-slate-100'>
                  我上传了一份文件，先帮我整理重点。
                </p>
                <p className='max-w-[88%] rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm leading-7 text-slate-100'>
                  可以。先选择文本模型，我会结合文件内容继续对话，也可以顺手帮你梳理后续提问方向。
                </p>
                <p className='max-w-[88%] rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-7 text-slate-300'>
                  登录后还能继续管理令牌、模型、余额和使用记录。
                </p>
              </div>
              <div className='grid grid-cols-1 gap-2 border-t border-white/10 p-3 sm:grid-cols-3'>
                {['打开令牌管理', '复制 Base URL', '查看模型广场'].map((item) => (
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
                  文本对话 / API 配置
                </strong>
                <p className='mt-2 text-sm leading-6 text-slate-400'>
                  先开始对话，再按需要补齐地址、模型和 Key。
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
              ['文本对话', '先对话，再逐步收敛需求和材料'],
              ['文件上传', '纯文本、图片、PDF 等材料都能作为输入'],
              ['API 配置', '地址、模型、Key 在同一套入口里管理'],
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
            入口少一点，开始快一点
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
              常用场景只需要先确认地址、模型和 Key。页面把通用地址、工作台入口和推荐模型放在一起，减少来回跳转。
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
                render={<a href='/pricing/' />}
              >
                <Play className='size-4' aria-hidden />
                查看模型广场
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
            ['401 先查 Key', '确认复制的是完整 Key，地址和模型也是当前页面展示的那一组。'],
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
            在线支持会结合当前页面给出下一步建议，但不会绕过登录、不会替你确认危险动作，也不会要求你把完整 API Key 发到聊天里。
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
