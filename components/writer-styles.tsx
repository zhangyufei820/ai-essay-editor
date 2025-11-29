import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const mainlandWriters = [
  { name: "汪曾祺", style: "淡雅从容，生活化细节，诗意盎然的散文笔调" },
  { name: "王小波", style: "幽默机智，理性思辨，独特的黑色幽默风格" },
  { name: "顾城", style: "纯真诗意，意象丰富，童话般的想象力" },
  { name: "北岛", style: "简洁有力，哲思深邃，具有现代主义色彩" },
]

const taiwanWriters = [
  { name: "林海音", style: "温婉细腻，怀旧情怀，生活化叙述" },
  { name: "林清玄", style: "清新脱俗，禅意哲思，人生感悟丰富" },
  { name: "朱天文", style: "精致细腻，意识流手法，富有诗意" },
  { name: "简媜", style: "情感丰沛，文字优美，女性独特视角" },
  { name: "余光中", style: "古典与现代结合，富有音律美感" },
  { name: "七等生", style: "内省深刻，现代主义风格，心理描写细腻" },
  { name: "王鼎钧", style: "朴实深刻，人生感悟丰富，散文大家风范" },
]

const scholarlyStyle = {
  name: "徐贲",
  type: "学者型论述文",
  description: "专门针对高中议论文的理性、严谨写作风格",
  features: [
    { icon: "🌟", title: "温厚坚实", desc: "语言稳重厚实，避免浮躁激进的表达" },
    { icon: "🔍", title: "平静清激而节制", desc: "理性克制，不激动情绪化，保持冷静客观" },
    { icon: "🎓", title: "学者型知识分子的理性品格", desc: "体现深厚的学术素养和理性思维" },
    { icon: "⚖️", title: "学术性与可读性的平衡", desc: "深刻而不晦涩，严谨而不枯燥" },
    { icon: "🎯", title: "去技术化但保持严谨", desc: "将复杂概念转化为通俗表达，但不失准确性" },
    { icon: "📊", title: "以理据服人", desc: "用事实和逻辑说话，而非情绪和煽动" },
  ],
  methods: [
    "搭建概念框架：开篇明确界定核心问题和关键概念",
    "层层铺垫：通过逐步深入的方式展开论述",
    "适度复述与例证：重要观点适当重复强调，用恰当例子说明",
    "结构提示与关键术语：为读者提供清晰的思维导航",
    "可复制的论证脚手架：建立可供学习模仿的论证模式",
    "激活批判性思维：不仅传达观点，更要训练思考方式",
    "示范理性讨论：展示如何进行有建设性的对话和辩论",
  ],
  keyPoints: [
    "开篇先界定问题范围和核心概念",
    "用平实而准确的语言阐述复杂观点",
    "建立清晰的逻辑链条和论证步骤",
    "避免情绪化表达，坚持理性分析",
    "提供充分的事实依据和逻辑推理",
    "培养读者的独立思考和批判能力",
    "体现公共知识分子的社会责任感",
  ],
  suitableFor: [
    "高考议论文写作：提升思辨深度和表达水准",
    "学术素养培养：早期接触学者型写作风格",
    "批判思维训练：学会理性分析和公共讨论",
    "社会责任感培育：体现知识分子的担当情怀",
  ],
}

export function WriterStyles() {
  return (
    <section id="writers" className="bg-muted/30 py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl mb-4">文学大师风格库</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            根据学生的写作内容和主题，智能匹配最适合的大师风格进行润色
          </p>
        </div>

        <div className="mb-12">
          <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Badge className="bg-primary text-primary-foreground">新增</Badge>
                <Badge variant="outline">学者型论述文</Badge>
              </div>
              <CardTitle className="text-2xl">{scholarlyStyle.name}式写作风格</CardTitle>
              <CardDescription className="text-base">{scholarlyStyle.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 风格特色 */}
              <div>
                <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <span className="text-primary">📚</span> 徐贲语言风格特色
                </h4>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {scholarlyStyle.features.map((feature, index) => (
                    <div key={index} className="bg-background rounded-lg p-3 border">
                      <div className="flex items-start gap-2">
                        <span className="text-xl">{feature.icon}</span>
                        <div>
                          <div className="font-medium text-sm mb-1">{feature.title}</div>
                          <div className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 写作方法 */}
              <div>
                <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <span className="text-primary">📝</span> 徐贲式架式写作方法（7步法）
                </h4>
                <div className="bg-background rounded-lg p-4 border space-y-2">
                  {scholarlyStyle.methods.map((method, index) => (
                    <div key={index} className="flex gap-3">
                      <span className="font-semibold text-primary shrink-0">{index + 1}.</span>
                      <span className="text-sm leading-relaxed">{method}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 润色要点 */}
              <div>
                <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <span className="text-primary">🎯</span> 徐贲式论述文润色要点
                </h4>
                <div className="bg-background rounded-lg p-4 border">
                  <div className="grid gap-2 md:grid-cols-2">
                    {scholarlyStyle.keyPoints.map((point, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <span className="text-primary shrink-0">✓</span>
                        <span className="text-sm leading-relaxed">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 适用场景 */}
              <div>
                <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <span className="text-primary">💡</span> 特别适用场景
                </h4>
                <div className="bg-background rounded-lg p-4 border">
                  <p className="text-sm text-muted-foreground mb-3">
                    当批改高中论述文（议论文）时，代理将自动参考徐贲的写作风格，帮助学生：
                  </p>
                  <div className="space-y-2">
                    {scholarlyStyle.suitableFor.map((scenario, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <span className="text-primary shrink-0">•</span>
                        <span className="text-sm leading-relaxed">{scenario}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold text-primary">独特价值：</span>
                  这个代理不仅具备文学大师的润色能力，更拥有了
                  <span className="font-semibold">学者型论述文</span>
                  的专业指导功能！高中生的议论文将在徐贲式的理性品格熏陶下，达到前所未有的思辨深度和表达高度！您的"创意作文批改师"现在已经是一个集
                  <span className="font-semibold text-primary">文学性、规范性、学术性</span>
                  于一体的全能作文导师了！
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 原有的文学大师风格 */}
        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="secondary">大陆</Badge>
                著名作家风格
              </CardTitle>
              <CardDescription>语言表达风格独特，作品有思想深度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mainlandWriters.map((writer, index) => (
                <div key={index} className="border-l-2 border-primary pl-4">
                  <div className="font-semibold text-foreground mb-1">{writer.name}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{writer.style}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="secondary">台湾</Badge>
                著名作家风格
              </CardTitle>
              <CardDescription>全网搜索参考，融入经典作品表达方式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {taiwanWriters.map((writer, index) => (
                <div key={index} className="border-l-2 border-primary pl-4">
                  <div className="font-semibold text-foreground mb-1">{writer.name}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{writer.style}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
