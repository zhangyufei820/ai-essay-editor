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
import type { ReactNode } from 'react'
import { Copy, Image, KeyRound, Link, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import type { ImageBenefit } from '../types'

interface ImageBenefitCardProps {
  benefit: ImageBenefit | null
  loading?: boolean
  onRefresh?: () => void | Promise<void>
}

function statusLabel(status: string | undefined, t: (key: string) => string) {
  switch (status) {
    case 'active':
      return { label: t('Active'), variant: 'success' as const }
    case 'expired':
      return { label: t('Expired'), variant: 'neutral' as const }
    case 'exhausted':
      return { label: t('Used Up'), variant: 'warning' as const }
    case 'disabled':
      return { label: t('Disabled'), variant: 'destructive' as const }
    default:
      return { label: t('Inactive'), variant: 'neutral' as const }
  }
}

function formatTime(timestamp?: number) {
  if (!timestamp || timestamp <= 0) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function CopyField({
  icon,
  label,
  value,
  onCopy,
}: {
  icon: ReactNode
  label: string
  value?: string
  onCopy: (value: string) => void
}) {
  return (
    <div className='bg-muted/40 min-w-0 rounded-md border p-3'>
      <div className='text-muted-foreground flex items-center justify-between gap-2 text-xs'>
        <div className='flex items-center gap-2'>
          {icon}
          <span>{label}</span>
        </div>
        {value ? (
          <Button
            variant='ghost'
            size='icon-xs'
            onClick={() => onCopy(value)}
            title={`Copy ${label}`}
          >
            <Copy className='h-3.5 w-3.5' />
          </Button>
        ) : null}
      </div>
      <div className='mt-2 break-all font-mono text-xs'>{value || '-'}</div>
    </div>
  )
}

export function ImageBenefitCard({
  benefit,
  loading,
  onRefresh,
}: ImageBenefitCardProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()

  if (loading) {
    return (
      <Card className='rounded-lg'>
        <CardContent className='space-y-3 p-4'>
          <Skeleton className='h-5 w-40' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-20 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (!benefit?.token_id || benefit.status === 'none') {
    return null
  }

  const used = Number(benefit.used_images || 0)
  const total = Number(benefit.total_images || 300)
  const remaining = Number(benefit.remaining_images || 0)
  const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 100))) : 0
  const status = statusLabel(benefit.status, t)

  return (
    <Card className='rounded-lg'>
      <CardContent className='space-y-4 p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 items-start gap-3'>
            <div className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
              <Image className='h-4 w-4' />
            </div>
            <div className='min-w-0'>
              <div className='font-medium'>{t('1.5K Image Benefit')}</div>
              <div className='text-muted-foreground mt-1 truncate text-xs'>
                {benefit.model || 'image 2电商商品图快速通道(1.5K)'}
              </div>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <StatusBadge
              label={status.label}
              variant={status.variant}
              copyable={false}
            />
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={onRefresh}
              title={t('Refresh')}
            >
              <RefreshCw className='h-3.5 w-3.5' />
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-3 gap-2'>
          <div className='bg-muted/40 rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>{t('Success')}</div>
            <div className='mt-1 text-xl font-semibold tabular-nums'>{used}</div>
          </div>
          <div className='bg-muted/40 rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>{t('Remaining')}</div>
            <div className='mt-1 text-xl font-semibold tabular-nums'>
              {remaining}
            </div>
          </div>
          <div className='bg-muted/40 min-w-0 rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>{t('Expires')}</div>
            <div className='mt-1 truncate text-xs font-medium'>
              {formatTime(benefit.expired_time)}
            </div>
          </div>
        </div>

        <div>
          <div className='text-muted-foreground mb-1 flex justify-between text-xs'>
            <span>{t('Usage')}</span>
            <span>
              {used}/{total}
            </span>
          </div>
          <Progress value={progress} className='h-1.5' />
        </div>

        <div className='grid gap-2 md:grid-cols-2'>
          <CopyField
            icon={<KeyRound className='h-3.5 w-3.5' />}
            label='API Key'
            value={benefit.key}
            onCopy={copyToClipboard}
          />
          <CopyField
            icon={<Link className='h-3.5 w-3.5' />}
            label='Base URL'
            value={benefit.base_url}
            onCopy={copyToClipboard}
          />
        </div>
      </CardContent>
    </Card>
  )
}
