import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  console.error("Usage: node scripts/seed-survey-templates.mjs")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const templates = [
  {
    template_key: "onboarding_v1",
    title: "首次共创问卷",
    description: "了解用户身份、学习场景和最想验证的 AI 学习反馈能力。",
    audience: "all",
    cadence: "onboarding",
    questions_json: [
      {
        id: "role",
        type: "single_choice",
        title: "你现在的身份是？",
        required: true,
        options: ["学生", "家长", "老师", "机构负责人", "其他"],
      },
      {
        id: "grade",
        type: "single_choice",
        title: "主要使用对象所在年级？",
        required: false,
        options: ["小学", "初中", "高中", "大学", "成人学习", "不适用"],
      },
      {
        id: "primary_goal",
        type: "multiple_choice",
        title: "你最想用沈翔智学解决什么问题？",
        required: true,
        options: ["作文批改", "试卷/错题诊断", "闪卡复习", "AI 对话答疑", "课堂/班级管理", "其他"],
      },
      {
        id: "current_pain",
        type: "text",
        title: "现在学习反馈中最困扰你的是什么？",
        required: false,
      },
      {
        id: "pmf_expectation",
        type: "single_choice",
        title: "如果这个工具足够好，你最可能如何使用？",
        required: true,
        options: ["每天使用", "每周使用", "考试/写作前使用", "只偶尔看看", "暂不确定"],
      },
    ],
    active: true,
    sort_order: 10,
  },
  {
    template_key: "daily_v1",
    title: "每日 90 秒反馈",
    description: "每天填写后解锁当天 AI 学习体验额度。",
    audience: "all",
    cadence: "daily",
    questions_json: [
      {
        id: "used_feature",
        type: "multiple_choice",
        title: "你今天主要体验了哪些功能？",
        required: true,
        options: ["作文批改", "拍卷诊断", "AI 对话", "闪卡复习", "互动实验室", "还没使用"],
      },
      {
        id: "satisfaction",
        type: "rating",
        title: "今天的结果对你有帮助吗？",
        required: true,
        min: 1,
        max: 5,
      },
      {
        id: "best_part",
        type: "text",
        title: "今天最有帮助的一点是什么？",
        required: false,
      },
      {
        id: "friction",
        type: "text",
        title: "今天哪里不顺手或不满意？",
        required: false,
      },
      {
        id: "tomorrow_intent",
        type: "single_choice",
        title: "你明天还愿意继续用吗？",
        required: true,
        options: ["愿意", "可能会", "不确定", "暂时不想"],
      },
    ],
    active: true,
    sort_order: 20,
  },
  {
    template_key: "weekly_v1",
    title: "每周深度反馈",
    description: "用于判断产品依赖度、付费意愿和下一阶段优先级。",
    audience: "all",
    cadence: "weekly",
    questions_json: [
      {
        id: "pmf_disappointment",
        type: "single_choice",
        title: "如果明天不能继续使用沈翔智学，你会有多失望？",
        required: true,
        options: ["非常失望", "有点失望", "不失望", "我还没真正使用"],
      },
      {
        id: "most_valuable_feature",
        type: "single_choice",
        title: "本周你觉得最有价值的功能是？",
        required: true,
        options: ["作文批改", "拍卷诊断", "AI 对话", "闪卡复习", "互动实验室", "还没有"],
      },
      {
        id: "willing_to_pay",
        type: "single_choice",
        title: "如果继续使用，你更能接受哪种方式？",
        required: true,
        options: ["按月订阅", "按积分付费", "学校/班级统一购买", "只想免费体验", "暂不确定"],
      },
      {
        id: "price_feedback",
        type: "text",
        title: "你觉得目前套餐价格和额度是否合理？为什么？",
        required: false,
      },
      {
        id: "top_request",
        type: "text",
        title: "下周你最希望我们改进什么？",
        required: false,
      },
    ],
    active: true,
    sort_order: 30,
  },
]

async function main() {
  console.log("================================================================================")
  console.log("Seed survey templates")
  console.log("================================================================================")
  console.log("This script is idempotent and uses upsert on survey_templates.template_key.")
  console.log("Usage: node scripts/seed-survey-templates.mjs\n")

  const now = new Date().toISOString()
  const rows = templates.map((template) => ({
    ...template,
    updated_at: now,
  }))

  const { data, error } = await supabase
    .from("survey_templates")
    .upsert(rows, { onConflict: "template_key" })
    .select("template_key, title, cadence, active, sort_order")
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("Failed to seed survey templates:", error.message)
    process.exit(1)
  }

  console.log(`Seeded ${data?.length || 0} survey templates:`)
  for (const template of data || []) {
    console.log(`- ${template.template_key} (${template.cadence}) ${template.active ? "active" : "inactive"}`)
  }
}

main().catch((error) => {
  console.error("Unexpected failure:", error)
  process.exit(1)
})
