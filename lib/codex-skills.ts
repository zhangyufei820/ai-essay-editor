export type CodexSkillCategory =
  | "论文与学术"
  | "教学与学习"
  | "图像与动画"

export type CodexSkill = {
  id: string
  name: string
  category: CodexSkillCategory
  description: string
  tags: string[]
}

export const CODEX_SKILL_CATEGORIES: CodexSkillCategory[] = [
  "论文与学术",
  "教学与学习",
  "图像与动画",
]

export const CODEX_SKILLS: CodexSkill[] = [
  {
    id: "paper_outline",
    name: "论文大纲",
    category: "论文与学术",
    description: "用于论文选题、开题框架、论文结构和章节写作重点生成，适合从题目到完整大纲的早期规划。",
    tags: ["论文结构", "开题", "章节大纲"],
  },
  {
    id: "paper_polish",
    name: "论文润色",
    category: "论文与学术",
    description: "用于论文段落润色，保留原意，降低口语化表达，让文字更符合学术写作规范。",
    tags: ["学术表达", "降口语化", "段落润色"],
  },
  {
    id: "literature_review",
    name: "文献综述",
    category: "论文与学术",
    description: "用于文献综述框架、研究现状整理、检索关键词和资料收集建议，帮助先搭好综述骨架。",
    tags: ["文献综述", "研究现状", "检索关键词"],
  },
  {
    id: "teacher_lesson_plan",
    name: "教案生成",
    category: "教学与学习",
    description: "用于教师教案、教学设计、课堂活动和作业设计，输出结构清晰、可落地的课堂方案。",
    tags: ["教案", "课堂活动", "作业设计"],
  },
  {
    id: "study_plan",
    name: "学习规划",
    category: "教学与学习",
    description: "用于学生学习计划、错题提升计划和阶段学习路径规划，适合制定可执行的每日/每周安排。",
    tags: ["学习计划", "错题提升", "阶段规划"],
  },
  {
    id: "image_prompt",
    name: "图片提示词",
    category: "图像与动画",
    description: "用于生成论文插图、公众号配图、封面图和英文图片提示词，把想法整理成可用的视觉提示。",
    tags: ["提示词", "公众号配图", "论文插图"],
  },
  {
    id: "shenxiang_image_gen",
    name: "沈翔图片与数学动画",
    category: "图像与动画",
    description: "用于图片生成和数学可视化动画，可处理图像创作、函数图像、几何过程和教学动画需求。",
    tags: ["图片生成", "数学动画", "可视化"],
  },
]

export function getCodexSkillById(id: string | null | undefined) {
  if (!id) return null
  return CODEX_SKILLS.find((skill) => skill.id === id) ?? null
}
