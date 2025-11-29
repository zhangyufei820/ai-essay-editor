import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, LineChart, Award, Star, BookOpen, Target } from "lucide-react"

export function ParentGrowth() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container px-4">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="mb-6 text-3xl font-bold lg:text-4xl">学生成长追踪</h2>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              实时掌握孩子的学习动态和成长轨迹，通过数据化分析， 科学指导孩子的学习发展，见证每一个进步的瞬间。
            </p>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">学习进度可视化</h3>
                  <p className="text-sm text-muted-foreground">直观展示孩子在各学科的学习进度和掌握程度</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <LineChart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">能力发展分析</h3>
                  <p className="text-sm text-muted-foreground">分析孩子的思维能力、创造力和学习习惯的发展趋势</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">成就里程碑</h3>
                  <p className="text-sm text-muted-foreground">记录孩子的重要学习成就，留下珍贵的成长记忆</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-5 w-5 text-yellow-500" />
                  本周学习亮点
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">完成作业</span>
                    <span className="font-semibold">15/15</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">阅读时长</span>
                    <span className="font-semibold">8.5小时</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">学习专注度</span>
                    <span className="font-semibold text-green-600">优秀</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-5 w-5 text-blue-500" />
                  学科进步
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>语文</span>
                      <span className="text-green-600">+12%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: "85%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>数学</span>
                      <span className="text-green-600">+8%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: "78%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>英语</span>
                      <span className="text-green-600">+15%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-purple-500" style={{ width: "82%" }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-5 w-5 text-orange-500" />
                  下周学习目标
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    完成数学第三单元复习
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    阅读《西游记》前10章
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    练习英语口语对话
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
