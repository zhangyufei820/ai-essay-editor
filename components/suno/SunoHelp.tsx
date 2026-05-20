"use client"

import { BookOpen, ChevronDown, Lightbulb, Music4, ShieldAlert } from "lucide-react"
import {
  BadgeV2 as Badge,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
} from "@/components/ui/v2"

const quickExamples = [
  "写一首温柔治愈的中文流行歌，主题是夏天、回忆和重逢，适合女生演唱，编曲包含钢琴、弦乐和轻柔鼓点。",
  "为东方草本护肤品牌创作一首中文品牌歌，主题是艾草、温养、自然、安心，旋律温柔上口，适合短视频传播。",
  "生成一首适合护肤产品展示视频的背景音乐，不要人声，氛围干净、清透、自然，包含钢琴、古筝和轻柔弦乐。",
]

const styleIdeas = [
  "流行抒情、钢琴、女声、温暖、电影感",
  "民谣、木吉他、叙事感、温柔、自然",
  "国风流行、古筝、二胡、清澈女声、高级感",
  "电子流行、节奏明快、年轻、适合短视频",
  "纯音乐、轻柔、舒缓、适合直播间和门店播放",
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
      <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-900)]">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--ink-600)]">{children}</div>
    </section>
  )
}

export function SunoHelp() {
  return (
    <Card className="mb-6 overflow-hidden border-[var(--ink-200)] bg-[var(--paper-50)]">
      <CardHeader className="bg-[var(--ink-50)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="ink" className="mb-3">新手必看</Badge>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <BookOpen className="h-6 w-6" />
              智能音乐生成使用帮助
            </CardTitle>
            <CardDescription className="mt-2 text-[15px] leading-7">
              第一次使用也没关系。你只要说清楚歌曲主题、风格、情绪和使用场景，系统会自动生成歌曲，完成后可以直接试听和下载。
            </CardDescription>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-3 text-sm text-[var(--ink-600)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--ink-800)]">
              <Music4 className="h-4 w-4" />
              推荐一句话公式
            </div>
            <p>我要一首中文歌曲，主题是某件事，风格是某种音乐，情绪是某种感觉，适合某个场景。</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {quickExamples.map((example, index) => (
            <div key={example} className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink-800)]">
                <Lightbulb className="h-4 w-4" />
                示例 {index + 1}
              </div>
              <p className="text-sm leading-7 text-[var(--ink-600)]">{example}</p>
            </div>
          ))}
        </div>

        <details className="group rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-[var(--ink-900)]">
            展开完整使用帮助文档
            <ChevronDown className="h-5 w-5 transition group-open:rotate-180" />
          </summary>

          <div className="grid gap-4 border-t border-[var(--paper-200)] p-5">
            <Section title="一、它能帮你做什么">
              <p>你可以生成流行歌、民谣、说唱、电子音乐、摇滚、古风歌曲、儿歌、广告歌、品牌主题曲、纯音乐、背景音乐、短视频配乐，也可以基于已有音频做二次创作。</p>
            </Section>

            <Section title="二、第一次怎么用">
              <p>最简单的方式是直接在“歌词或提示词”里写一句完整需求，然后点击“生成歌曲”。系统会自动理解需求、生成旋律、编曲、人声和封面，并自动等待结果。</p>
              <p className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-3">例子：我想要一首温柔治愈的中文流行歌，主题是夏天、回忆和重逢，适合女生演唱。</p>
            </Section>

            <Section title="三、常用创作方式">
              <p><strong>灵感生成：</strong>适合还没有歌词，只知道主题和感觉的新手。</p>
              <p><strong>自定义歌曲：</strong>适合已经写好歌词，想更精确控制歌曲内容的人。</p>
              <p><strong>纯音乐：</strong>适合视频配乐、直播背景、门店播放、广告片、冥想音乐和产品展示。</p>
              <p><strong>上传音频二创：</strong>适合上传哼唱、伴奏、样曲或品牌旋律后继续创作。</p>
            </Section>

            <Section title="四、输入内容怎么写">
              <p>一个好的提示词通常包含：歌曲主题、音乐风格、情绪氛围、演唱语言、人声类型、使用场景、特别乐器。</p>
              <p className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-3">万能模板：我要一首中文歌曲，主题是毕业和告别，风格是流行民谣，情绪温暖又有一点伤感，适合毕业视频使用，女声演唱，编曲包含木吉他、钢琴和轻柔鼓点。</p>
            </Section>

            <Section title="五、歌曲名和风格怎么填">
              <p>歌曲名尽量简短、有记忆点，例如：旧日的海、晚风与你、一株艾草、回到夏天、不再回头。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {styleIdeas.map((item) => (
                  <div key={item} className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] px-3 py-2">{item}</div>
                ))}
              </div>
            </Section>

            <Section title="六、品牌歌怎么写">
              <p>为品牌创作时，建议说明品牌名称、产品特点、目标用户、核心卖点和希望用户记住的一句话。</p>
              <p className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-3">例子：为一个东方草本护肤品牌创作一首广告歌，品牌关键词是艾草、温养、自然、安心，目标用户是年轻女性，歌曲风格清新温柔，歌词要突出“一株艾草，温养日常”。</p>
            </Section>

            <Section title="七、歌词怎么写更容易好听">
              <p>如果你自己写歌词，建议分成主歌、副歌、第二段和桥段。副歌要简单、重复、好记；每句不要太长；歌词尽量有画面感；一首歌控制在二百到六百字之间更稳定。</p>
            </Section>

            <Section title="八、生成后怎么看结果">
              <p>点击生成后，歌曲通常需要几十秒到几分钟。你不需要手动查询，本页面会自动等待和刷新。完成后会显示播放器、封面图、试听按钮和下载按钮。</p>
            </Section>

            <Section title="九、常见问题">
              <p><strong>为什么没有马上出歌？</strong> 音乐生成需要排队、创作、合成和处理音频，请等待页面自动刷新。</p>
              <p><strong>为什么结果和想象不完全一样？</strong> 智能创作会根据描述发挥，提示词越清楚，结果越接近。</p>
              <p><strong>同一句提示为什么每次不同？</strong> 每次都会重新创作，这是正常现象，可以多生成几版挑选。</p>
            </Section>

            <Section title="十、版权和商用提醒">
              <div className="flex gap-3 rounded-[var(--radius-soft)] bg-[var(--seal-50)] p-3 text-[var(--seal-700)]">
                <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
                <p>请不要上传或生成侵犯他人版权、肖像权、声音权的内容。用于商业投放前，请确认歌词、上传素材和音乐使用权安全。</p>
              </div>
            </Section>

            <Section title="十一、提高成功率的技巧">
              <p>不要只写“帮我生成一首好听的歌”。请尽量写清主题、风格、情绪、人声、乐器和使用场景。</p>
              <p>风格不要互相矛盾，每次聚焦一到三个核心方向。品牌歌可以重复品牌记忆点，背景音乐则建议明确“不要人声”。</p>
              <p className="font-semibold text-[var(--ink-800)]">记住：主题越明确，风格越清楚，情绪越具体，生成结果越接近你想要的音乐。</p>
            </Section>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
