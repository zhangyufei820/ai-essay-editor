export interface Product {
  id: string
  name: string
  description: string
  priceInCents: number // 价格（单位：分）
  features: string[]
  popular?: boolean
}

// 产品目录 - 所有价格的唯一真实来源
// [!!!] 修复：这里的 ID 必须与 pricing.tsx 中的 ID 完全匹配 [!!!]
export const PRODUCTS: Product[] = [
  // --- 订阅方案 (来自 pricing.tsx) ---
  {
    id: "basic",
    name: "基础版",
    description: "适合入门体验",
    priceInCents: 2800, // 28 元 * 100
    features: ["每月 2,000 积分", "调用所有 AI 模型", "标准生成速度", "社区支持", "调用专业智能体"],
  },
  {
    id: "pro",
    name: "专业版",
    description: "适合高频学生",
    priceInCents: 6800, // 68 元 * 100
    features: [
      "每月 5,000 积分",
      "调用所有 AI 模型",
      "优先生成速度",
      "高级润色工具",
      "名师辅导 (1次/月)",
      "调用专业智能体",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "豪华版",
    description: "适合重度用户/教育者",
    priceInCents: 12800, // 128 元 * 100
    features: [
      "每月 12,000 积分",
      "调用三大顶尖模型",
      "最高优先速度",
      "高级润色工具",
      "名师辅导 (2次/月)",
      "无限次 AI 对话",
      "调用专业智能体",
    ],
  },

  // --- 积分充值包 (来自 pricing.tsx) ---
  {
    id: "credits-500",
    name: "500 积分充值包",
    description: "永久有效，适合轻度或测试用户",
    priceInCents: 500, // 5 元 * 100
    features: ["500 积分", "永久有效", "可用于生成作文或兑换辅导"],
  },
  {
    id: "credits-1000",
    name: "1000 积分充值包",
    description: "永久有效，适合轻度或测试用户",
    priceInCents: 1000, // 10 元 * 100
    features: ["1000 积分", "永久有效", "可用于生成作文或兑换辅导"],
  },
  {
    id: "credits-5000",
    name: "5000 积分充值包",
    description: "永久有效 (96折优惠)",
    priceInCents: 4800, // 48 元 * 100
    features: ["5000 积分", "永久有效", "可用于生成作文或兑换辅导"],
  },
  {
    id: "credits-10000",
    name: "10000 积分充值包",
    description: "永久有效 (9折优惠)",
    priceInCents: 9000, // 90 元 * 100
    features: ["10000 积分", "永久有效", "可用于生成作文或兑换辅导"],
  },
]