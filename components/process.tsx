import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2 } from "lucide-react"

const steps = [
  { number: "01", title: "原文呈现", description: "完整展示学生的原始作文" },
  { number: "02", title: "规范性分析", description: "检查年级、题目、字数、文体要求" },
  { number: "03", title: "结构诊断", description: "评估起承转合的布局合理性" },
  { number: "04", title: "风格选择", description: "智能匹配最适合的大师风格" },
  { number: "05", title: "搜索参考", description: "全网搜索相关作家的经典作品" },
  { number: "06", title: "第一层规范化", description: "确保符合考场作文基本要求" },
  { number: "07", title: "第二层结构优化", description: "重点改善起承转合布局" },
  { number: "08", title: "第三层风格提升", description: "融入大师风格的表达技巧" },
  { number: "09", title: "第四层精细打磨", description: "优化细节，提升文学美感" },
  { number: "10", title: "考场字数终检", description: "严格控制在年级字数红线内" },
  { number: "11", title: "对比展示", description: "完整呈现修改前后的对比" },
  { number: "12", title: "学习要点总结", description: "提炼写作技巧和改进方向" },
]

export function Process() {
  return (
    <section id="process" className="py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl mb-4">12步进阶润色流程</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            从基础规范到高级技巧，层层递进，让学生看到完整的蜕变过程
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <Card
              key={index}
              className="relative overflow-hidden border-border/50 hover:border-primary/50 transition-colors"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <span className="text-4xl font-bold text-primary/20">{step.number}</span>
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-border bg-card p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              !
            </span>
            考场字数红线要求
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">小学生考场作文</div>
              <div className="text-2xl font-bold text-foreground">≤ 650字</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">初中生考场作文</div>
              <div className="text-2xl font-bold text-foreground">890-900字</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">高中生考场作文</div>
              <div className="text-2xl font-bold text-foreground">800-1100字</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
