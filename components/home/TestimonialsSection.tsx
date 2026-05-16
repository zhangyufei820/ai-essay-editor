/**
 * 📝 沈翔智学 - 用户评价区域
 *
 * 使用少量高信号评价建立信任，避免首页信息过载。
 */

import { Quote, Star } from "lucide-react"
import { FadeIn } from "@/components/motion/FadeIn"
import { brandColors, slateColors } from "@/lib/design-tokens"

interface Testimonial {
  id: string
  content: string
  author: string
  roleLabel: string
}

const testimonials: Testimonial[] = [
  {
    id: "parent",
    content: "孩子以前写完作文只知道分数，现在能看到哪里要改、下一篇怎么练，家长沟通也轻松很多。",
    author: "王女士",
    roleLabel: "初中学生家长",
  },
  {
    id: "student",
    content: "AI 会把我的作文拆开讲，不只是说好不好，还告诉我哪些句子可以展开，修改起来有方向。",
    author: "刘同学",
    roleLabel: "初三学生",
  },
  {
    id: "teacher",
    content: "错题反馈适合课后复盘，能把共性问题先整理出来，老师再针对性讲解会更省时间。",
    author: "孙老师",
    roleLabel: "语文教师",
  },
] as const

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="sx-section bg-white">
      <div className="sx-container">
        <FadeIn className="mb-12 text-center">
          <span
            className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: brandColors[200],
              backgroundColor: brandColors[50],
              color: brandColors[700],
            }}
          >
            用户反馈
          </span>
          <h2 className="sx-section-title" style={{ color: slateColors[900] }}>
            先解决真实学习场景里的麻烦
          </h2>
          <p className="sx-section-copy mx-auto mt-4 max-w-2xl">
            评价区只保留三个代表性视角：学生、家长和老师。
          </p>
        </FadeIn>

        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <FadeIn
              key={testimonial.id}
              delay={index * 0.08}
              className="h-full"
            >
              <article className="sx-card flex min-h-[260px] flex-col p-6">
                <div className="mb-5 flex items-center justify-between">
                  <Quote className="size-6 text-primary" />
                  <div className="flex gap-1" aria-label="五星评价">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        className="size-4 text-primary"
                        fill={brandColors[600]}
                      />
                    ))}
                  </div>
                </div>

                <p className="flex-1 text-base leading-8" style={{ color: slateColors[700] }}>
                  &ldquo;{testimonial.content}&rdquo;
                </p>

                <div className="mt-6 border-t border-border pt-5">
                  <div className="text-sm font-bold" style={{ color: slateColors[900] }}>
                    {testimonial.author}
                  </div>
                  <div className="mt-1 text-sm" style={{ color: slateColors[500] }}>
                    {testimonial.roleLabel}
                  </div>
                </div>
              </article>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

export default TestimonialsSection
