import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '帮助中心 | 沈翔智学',
  description: '常见问题解答、使用教程、账户管理帮助。快速找到您需要的问题答案。',
  openGraph: {
    title: '沈翔智学 - 帮助中心 | 常见问题解答',
    description: '常见问题解答、使用教程、账户管理帮助...',
    url: 'https://shenxiang.school/help',
  },
  alternates: {
    canonical: 'https://shenxiang.school/help',
  },
}

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'name': '沈翔智学帮助中心',
  'description': '常见问题解答、使用教程、账户管理帮助',
  'url': 'https://shenxiang.school/help',
  'mainEntity': [
    {
      '@type': 'Question',
      'name': '如何开始使用沈翔智学？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '1. 首先在首页登录或注册账号\n2. 登录后即可进入主界面\n3. 选择想要使用的 AI 功能（如作文批改、智能对话等）\n4. 开始你的 AI 学习之旅！',
      },
    },
    {
      '@type': 'Question',
      'name': '支持哪些登录方式？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '支持手机号+验证码登录、邮箱+验证码登录、微信一键登录。建议使用微信登录，最为便捷！',
      },
    },
    {
      '@type': 'Question',
      'name': '积分有什么用？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '积分是沈翔智学的虚拟货币，可以用于使用付费 AI 功能、兑换会员特权、参与平台活动。新用户注册即送积分，每日签到也可领取！',
      },
    },
    {
      '@type': 'Question',
      'name': '作文批改支持哪些格式？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '目前支持上传 JPG 图片、PNG 图片、PDF 文档、Word 文档 (.docx)、TXT 文本。建议上传清晰的作文图片，AI 识别更准确！',
      },
    },
    {
      '@type': 'Question',
      'name': '如何联系客服？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '微信：扫码下方二维码添加客服微信\\n电话：19132896773\\n邮件：support@shenxiang.school\\n工作时间为：周一至周五 9:00-18:00',
      },
    },
  ],
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      {children}
    </>
  )
}
