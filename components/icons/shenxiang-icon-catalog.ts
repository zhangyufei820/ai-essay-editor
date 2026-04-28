import type { ShenxiangIconName } from "./ShenxiangFeatureIcons"

export const SHENXIANG_ICON_CATALOG: Array<{
  name: ShenxiangIconName
  title: string
  group: "核心入口" | "教育智能体" | "写作场景" | "通用操作"
  note: string
}> = [
  { name: "essay-correction", title: "作文批改", group: "核心入口", note: "文稿雷达、批注光轨和评分徽章" },
  { name: "ai-writing", title: "AI 写作", group: "核心入口", note: "生成中的文本流与 AI 晶核" },
  { name: "image-generation", title: "图片生成", group: "核心入口", note: "被模型镜头重构的画面" },
  { name: "music-generation", title: "音乐生成", group: "核心入口", note: "声波种子长成旋律轨道" },
  { name: "credits", title: "积分", group: "核心入口", note: "学习能量币，不是普通金币" },
  { name: "membership", title: "会员", group: "核心入口", note: "守护型权益盾牌" },
  { name: "history", title: "历史记录", group: "核心入口", note: "时间回环里的对话切片" },
  { name: "upload-file", title: "上传文件", group: "核心入口", note: "文档升维进入云端" },
  { name: "voice-input", title: "语音输入", group: "核心入口", note: "拾音舱与对称声纹" },
  { name: "role-family", title: "教师/家长/学生", group: "核心入口", note: "三角色协同学习场" },
  { name: "teaching-pro", title: "教学评 Pro", group: "教育智能体", note: "双页教案和智慧星核" },
  { name: "math-agent", title: "数学智能体", group: "教育智能体", note: "公式面板与解题闪光" },
  { name: "english-agent", title: "英语智能体", group: "教育智能体", note: "对话气泡里的语言模块" },
  { name: "lesson-planning", title: "备课助手", group: "教育智能体", note: "教案板与生成笔触" },
  { name: "class-advisor", title: "班主任助手", group: "教育智能体", note: "学生画像与守护关系" },
  { name: "paper-writing", title: "论文写作", group: "写作场景", note: "学术文档与论证轨迹" },
  { name: "reading-report", title: "读书报告", group: "写作场景", note: "翻开的阅读洞察" },
  { name: "experiment-report", title: "实验报告", group: "写作场景", note: "试管数据沉淀为结论" },
  { name: "study-abroad", title: "留学文书", group: "写作场景", note: "全球路径和申请星标" },
  { name: "resume-optimize", title: "简历优化", group: "写作场景", note: "人物名片被智能打磨" },
  { name: "speech-defense", title: "演讲答辩", group: "写作场景", note: "观点气泡与舞台高光" },
  { name: "school-wechat", title: "公众号写作", group: "写作场景", note: "校园推文版式与发布光标" },
  { name: "share", title: "分享", group: "通用操作", note: "节点传播而非普通分享箭头" },
  { name: "download", title: "下载", group: "通用操作", note: "成果落地到本地托盘" },
  { name: "success", title: "成功", group: "通用操作", note: "完成徽章和确认轨迹" },
  { name: "warning", title: "警告", group: "通用操作", note: "柔和风险提示，不恐吓用户" },
  { name: "processing", title: "处理中", group: "通用操作", note: "模型核心正在迭代" },
]
