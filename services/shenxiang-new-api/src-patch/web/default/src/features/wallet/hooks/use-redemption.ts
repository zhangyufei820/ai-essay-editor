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
import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { redeemTopupCode } from '../api'
import type { RedemptionResult } from '../types'

// ============================================================================
// Redemption Hook
// ============================================================================

export function useRedemption() {
  const [redeeming, setRedeeming] = useState(false)

  const redeemCode = useCallback(async (code: string): Promise<RedemptionResult | null> => {
    if (!code || code.trim() === '') {
      toast.error(i18next.t('Please enter a redemption code'))
      return null
    }

    try {
      setRedeeming(true)
      const response = await redeemTopupCode({ key: code })

      if (response.success && response.data) {
        const data =
          typeof response.data === 'number'
            ? ({ type: 'quota', quota: response.data } satisfies RedemptionResult)
            : response.data
        if (data.type === 'subscription') {
          toast.success(
            i18next.t('Redemption successful! Activated {{plan}}', {
              plan: data.plan_title || i18next.t('Subscription'),
            })
          )
        } else {
          toast.success(
            i18next.t('Redemption successful! Added: {{quota}}', {
              quota: formatQuota(Number(data.quota || 0)),
            })
          )
        }
        await getSelf()
        return data
      }

      toast.error(response.message || i18next.t('Redemption failed'))
      return null
    } catch (_error) {
      toast.error(i18next.t('Redemption failed'))
      return null
    } finally {
      setRedeeming(false)
    }
  }, [])

  return {
    redeeming,
    redeemCode,
  }
}
