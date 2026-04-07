/**
 * 全局模型状态 Store — 单例真源
 *
 * 解决历史会话、侧边栏、对话框三者模型状态不一致的问题。
 * 所有组件必须从本 store 读取和修改 selectedModel，禁止维护独立 localState。
 */

import { create } from "zustand"
import type { ModelType } from "@/lib/pricing"

interface SelectedModelState {
  // 当前选中的模型
  selectedModel: ModelType

  // 是否由用户手动点击历史会话触发（影响会话加载时的模型同步逻辑）
  isManualSessionSwitch: boolean

  // 设置模型（任何来源的模型变更）
  setSelectedModel: (model: ModelType) => void

  // 标记为手动会话切换（侧边栏/历史列表点击时调用）
  markManualSessionSwitch: () => void

  // 标记为由 URL/导航触发（非手动）
  markUrlNavigation: () => void
}

export const useSelectedModelStore = create<SelectedModelState>((set) => ({
  selectedModel: "standard",
  isManualSessionSwitch: false,

  setSelectedModel: (model) =>
    set({ selectedModel: model }),

  markManualSessionSwitch: () =>
    set({ isManualSessionSwitch: true }),

  markUrlNavigation: () =>
    set({ isManualSessionSwitch: false }),
}))
