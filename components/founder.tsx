import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function Founder() {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary hover:bg-primary/20">专家团队</Badge>
          <h2 className="text-4xl font-bold mb-4">创始导师介绍</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            29年教学经验，AI教育先行者，致力于用AI大模型赋能智慧教育
          </p>
        </div>

        <Card className="max-w-5xl mx-auto overflow-hidden">
          <div className="grid md:grid-cols-[300px_1fr] gap-8 p-8">
            {/* 照片部分 */}
            <div className="flex justify-center items-start">
              <div className="relative w-64 h-64 rounded-lg overflow-hidden shadow-xl">
                <Image
                  src="/images/design-mode/image.png"
                  alt="沈翔老师"
                  fill
                  className="object-cover grayscale"
                  priority
                />
              </div>
            </div>

            {/* 介绍部分 */}
            <div className="space-y-6">
              <div>
                <h3 className="text-3xl font-bold mb-2">沈翔</h3>
                <p className="text-xl text-primary font-medium mb-4">高级中学语文教师 · 瑞安市教坛中坚</p>
              </div>

              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  现任<span className="text-foreground font-medium">瑞安市玉海实验中学</span>高级中学语文教师，
                  <span className="text-foreground font-medium">从业29年</span>， 现任学校信息处主任。
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>温州市计算机学会AIGC专委会委员</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>温州市民办教育协会AI专委会委员</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>温州大学人文学院外聘教师</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>广东第二师范学院外聘教师</span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-foreground font-semibold mb-3">荣誉与成就</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span>2019年 温州市"互联网+教育"结对帮扶工作先进个人</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span>2021年 瑞安市教育信息化工作先进个人</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span>2021-2023年 华东师范大学、杭州师范大学信息技术2.0培训讲师</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span>杭州市钱学森学校、嵊州爱德小学AI写作项目指导师</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-foreground italic">
                    "以AI大模型赋能智慧教育，推动课堂革命与教研创新，躬身践行教育新生态变革。"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
