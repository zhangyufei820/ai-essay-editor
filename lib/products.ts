export interface Product {
  id: string
  name: string
  description: string
  priceInCents: number
  features: string[]
  popular?: boolean
}

// 产品目录 - 所有价格的唯一真实来源
export const PRODUCTS: Product[] = [
  {
    id: "trial",
    name: "体验版",
    description: "适合初次尝试的用户",
    priceInCents: 0, // 免费
    features: ["3次免费批改机会", "基础语法检查", "简单润色建议", "标准响应速度"],
  },
  {
    id: "standard",
    name: "标准版",
    description: "适合日常写作需求",
    priceInCents: 4900, // ¥49
    features: [
      "30次批改机会/月",
      "全面语法检查",
      "文学大师风格润色",
      "徐贲式论述文指导",
      "优先响应速度",
      "支持多种文件格式",
    ],
    popular: true,
  },
  {
    id: "professional",
    name: "专业版",
    description: "适合高频使用和专业需求",
    priceInCents: 9900, // ¥99
    features: [
      "无限次批改",
      "全面语法检查",
      "12位文学大师风格",
      "徐贲式论述文深度指导",
      "最快响应速度",
      "支持所有文件格式",
      "专属客服支持",
      "批改历史永久保存",
    ],
  },
]
