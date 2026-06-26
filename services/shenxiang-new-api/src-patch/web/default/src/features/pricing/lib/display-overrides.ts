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
import type { PricingModel } from '../types'

const OVERRIDES: Record<
  string,
  Partial<
    Pick<
      PricingModel,
      'display_name' | 'description' | 'fixed_price_label' | 'price_unit_label'
    >
  >
> = {
  'banana-2': {
    display_name: 'banana-2',
    description:
      '星人 Banana 2 图像生成，人民币 ¥0.085/张，按张计费，生成后请及时下载。',
    fixed_price_label: '¥0.085',
    price_unit_label: '张',
  },
  'ecommerce-banana-2': {
    display_name: '电商特价banana-2',
    description:
      '电商特价banana-2：仅支持 1K 输出，可编辑图像，人民币 ¥0.085/张。',
    fixed_price_label: '¥0.085',
    price_unit_label: '张',
  },
  'image 2电商商品图快速通道(1.5K)': {
    display_name: 'image 2电商商品图快速通道(1.5K)',
    description:
      'image 2电商商品图快速通道(1.5K)：电商商品图快速通道，实测约 1.5K 输出，人民币 ¥0.055/张。',
    fixed_price_label: '¥0.055',
    price_unit_label: '张',
  },
  'gpt-image-2-4K': {
    display_name: 'gpt-image-2-4K',
    description:
      '星人 OpenAI 图像生成，按 ¥0.108/张计费，支持 1K/2K/4K 输出。',
    fixed_price_label: '¥0.108',
    price_unit_label: '张',
  },
}

export function withPricingDisplayOverride(model: PricingModel): PricingModel {
  const override = OVERRIDES[model.model_name]
  if (!override) return model
  return {
    ...model,
    ...override,
  }
}

export function getModelDisplayName(model: PricingModel): string {
  return model.display_name || model.model_name
}

export function getFixedPriceDisplay(
  model: PricingModel,
  fallback: string
): string {
  return model.fixed_price_label || fallback
}

export function getRequestPriceUnitLabel(model: PricingModel): string {
  return model.price_unit_label || 'request'
}

export function getRequestBillingLabel(model: PricingModel): string | null {
  const unit = getRequestPriceUnitLabel(model)
  if (unit === 'request') return null
  return `按${unit}计费`
}
