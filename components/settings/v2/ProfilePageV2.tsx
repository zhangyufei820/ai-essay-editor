/**
 * 🖌 v2 个人中心（档案柜）
 *
 * 三栏：身份卡 / 学习档案 / 成就墙
 */

"use client"

import * as React from "react"
import { Calendar } from "lucide-react"
import { IconCredits, IconEssay, IconFlashcard, IconLogout, IconMember, IconSealStar } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { AvatarV2, AvatarV2Image, AvatarV2Fallback } from "@/components/ui/v2/avatar"
import { BadgeV2 } from "@/components/ui/v2/badge"
import { ProgressV2 } from "@/components/ui/v2/progress"
import { SealStamp } from "@/components/ui/v2/seal"
import { InkReveal, InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

export interface ProfilePageV2Props {
  user?: {
    name?: string
    email?: string
    avatar?: string
    credits?: number
    memberTier?: string
    memberDaysLeft?: number
  }
  stats?: {
    essaysReviewed?: number
    flashcardsMastered?: number
    mistakesArchived?: number
    experimentsCompleted?: number
    streakDays?: number
  }
  achievements?: Array<{ label: string; earned?: boolean }>
  onLogout?: () => void
  onAvatarClick?: () => void
  avatarInputId?: string
  avatarUploading?: boolean
  displayName?: string
  onDisplayNameChange?: (value: string) => void
  onSaveProfile?: () => void
  savingProfile?: boolean
  className?: string
}

export function ProfilePageV2({
  user,
  stats,
  achievements = [],
  onLogout,
  avatarInputId,
  avatarUploading = false,
  displayName,
  onDisplayNameChange,
  onSaveProfile,
  savingProfile = false,
  className,
}: ProfilePageV2Props) {
  return (
    <div
      data-slot="v2-profile-page"
      className={cn(
        "mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-16 font-[var(--font-sans-v2)]",
        className
      )}
    >
      <InkReveal as="div" className="grid gap-6 lg:grid-cols-[280px_1fr_240px]">
        {/* 左：身份卡 */}
        <CardV2 variant="paper" className="self-start">
          <CardV2Content className="flex flex-col items-center gap-4 py-8 text-center">
            <label
              htmlFor={avatarInputId}
              className={cn(
                "group relative rounded-full outline-none transition",
                avatarInputId && "cursor-pointer focus-visible:[box-shadow:var(--shadow-focus-ink)]",
                avatarUploading && "cursor-wait opacity-80",
                (avatarUploading || !avatarInputId) && "pointer-events-none opacity-80"
              )}
              aria-label={avatarUploading ? "头像上传中" : "更换头像"}
              title={avatarUploading ? "头像上传中" : "点击更换头像"}
              aria-disabled={avatarUploading || !avatarInputId}
            >
              <AvatarV2 className="size-20 transition group-hover:border-[var(--ink-300)] group-hover:bg-[var(--ink-50)]">
                {user?.avatar ? <AvatarV2Image src={user.avatar} alt={user.name ?? ""} /> : null}
                <AvatarV2Fallback>{(user?.name ?? "U").slice(0, 1)}</AvatarV2Fallback>
              </AvatarV2>
              {avatarInputId ? (
                <span className="absolute inset-x-1 bottom-1 rounded-[var(--radius-pill)] bg-[var(--ink-800)]/85 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  {avatarUploading ? "上传中" : "更换"}
                </span>
              ) : null}
            </label>

            <div>
              <h2 className="font-[var(--font-display)] text-[20px] font-bold text-[var(--ink-800)]">
                {user?.name ?? "学习用户"}
              </h2>
              {user?.email ? (
                <p className="mt-1 text-[12px] text-[var(--ink-500)]">{user.email}</p>
              ) : null}
            </div>

            {onDisplayNameChange || onSaveProfile ? (
              <div className="w-full space-y-2">
                {onDisplayNameChange ? (
                  <label className="block text-left">
                    <span className="mb-1 block text-[11px] font-medium text-[var(--ink-500)]">昵称</span>
                    <input
                      value={displayName ?? ""}
                      onChange={(event) => onDisplayNameChange(event.target.value)}
                      className="h-9 w-full rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-3 text-center text-[13px] text-[var(--ink-800)] outline-none transition focus:border-[var(--ink-500)] focus:ring-2 focus:ring-[var(--ink-100)]"
                      placeholder="设置昵称"
                    />
                  </label>
                ) : null}
                {onSaveProfile ? (
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSaveProfile}
                    disabled={savingProfile}
                    className="w-full"
                  >
                    {savingProfile ? "保存中..." : "保存资料"}
                  </ButtonV2>
                ) : null}
              </div>
            ) : null}

            {/* 会员状态 */}
            {user?.memberTier ? (
              <BadgeV2 variant="seal">
                <IconMember className="size-3" />
                {user.memberTier}
                {user.memberDaysLeft ? ` · ${user.memberDaysLeft}天` : ""}
              </BadgeV2>
            ) : null}

            {/* 积分 */}
            <div className="mt-2 flex items-center gap-2 text-[var(--ink-700)]">
              <IconCredits className="size-4" />
              <span className="font-[var(--font-mono-v2)] text-[18px] font-bold tabular-nums">
                {user?.credits?.toLocaleString() ?? 0}
              </span>
              <span className="text-[12px] text-[var(--ink-500)]">积分</span>
            </div>

            {/* 退出 */}
            <ButtonV2 variant="ghost" size="sm" onClick={onLogout} className="mt-4">
              <IconLogout className="size-3.5" />
              退出登录
            </ButtonV2>
          </CardV2Content>
        </CardV2>

        {/* 中：学习档案 */}
        <div className="space-y-6">
          <CardV2 variant="paper">
            <CardV2Content>
              <h3 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)] mb-4">
                学习档案
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ArchiveStat icon={<IconEssay className="size-4" />} label="已批改作文" value={stats?.essaysReviewed ?? 0} />
                <ArchiveStat icon={<IconFlashcard className="size-4" />} label="已掌握闪卡" value={stats?.flashcardsMastered ?? 0} />
                <ArchiveStat icon={<Calendar className="size-4" />} label="错题归档" value={stats?.mistakesArchived ?? 0} />
                <ArchiveStat icon={<IconSealStar className="size-4" />} label="实验完成" value={stats?.experimentsCompleted ?? 0} />
              </div>
            </CardV2Content>
          </CardV2>

          {/* 连续学习 */}
          <CardV2 variant="inset">
            <CardV2Content className="flex items-center gap-4">
              <SealStamp size="sm" rotate={-4}>
                {stats?.streakDays ?? 0}
              </SealStamp>
              <div>
                <div className="font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-800)]">
                  连续学习 {stats?.streakDays ?? 0} 天
                </div>
                <p className="text-[13px] text-[var(--ink-500)]">
                  坚持就是最好的学习方法。
                </p>
              </div>
            </CardV2Content>
          </CardV2>
        </div>

        {/* 右：成就墙 */}
        <div className="self-start">
          <h3 className="font-[var(--font-display)] text-[14px] font-bold text-[var(--ink-800)] mb-4">
            成就章
          </h3>
          <InkStagger stagger={0.06} className="grid grid-cols-3 gap-3 lg:grid-cols-2">
            {achievements.map((ach, idx) => (
              <InkStaggerItem key={idx}>
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 text-center",
                    !ach.earned && "opacity-30 grayscale"
                  )}
                >
                  <SealStamp size="sm" rotate={-2 + idx * 3}>
                    {ach.label.slice(0, 2)}
                  </SealStamp>
                  <span className="text-[10px] text-[var(--ink-600)]">{ach.label}</span>
                </div>
              </InkStaggerItem>
            ))}
          </InkStagger>
        </div>
      </InkReveal>
    </div>
  )
}

function ArchiveStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-[var(--ink-50)] text-[var(--ink-700)]">
        {icon}
      </div>
      <div className="font-[var(--font-mono-v2)] text-[20px] font-bold tabular-nums text-[var(--ink-800)]">
        {value}
      </div>
      <div className="text-[11px] text-[var(--ink-500)]">{label}</div>
    </div>
  )
}
