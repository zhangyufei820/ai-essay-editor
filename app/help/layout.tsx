import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '帮助中心 | 沈翔智学',
  description: '给初学者看的帮助页面，快速了解如何开始使用、查看积分和联系客服。',
  openGraph: {
    title: '沈翔智学 - 帮助中心',
    description: '给初学者看的帮助页面，快速了解如何开始使用、查看积分和联系客服。',
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
  'description': '给初学者看的帮助页面，快速了解如何开始使用、查看积分和联系客服。',
  'url': 'https://shenxiang.school/help',
  'mainEntity': [
    {
      '@type': 'Question',
      'name': '我第一次来，应该先做什么？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '先登录账号，再从首页选择你想用的功能。最常用的是作文批改、智能对话和图片生成。',
      },
    },
    {
      '@type': 'Question',
      'name': '我找不到功能入口怎么办？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '先回到首页，再看顶部菜单或底部导航。你也可以直接进入对应页面，比如作文批改、积分页或价格页。',
      },
    },
    {
      '@type': 'Question',
      'name': '怎么查看我的积分？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '登录后进入积分页或设置页，就能看到当前余额和使用记录。',
      },
    },
    {
      '@type': 'Question',
      'name': '付完钱以后，积分没到账怎么办？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '先刷新页面，等几分钟再看。如果还是没有到账，请保留订单号和支付时间，联系客服电话或邮箱。',
      },
    },
    {
      '@type': 'Question',
      'name': '可以上传哪些文件？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '常见的图片、PDF、Word 和 TXT 都可以。作文照片尽量拍清楚一点，效果会更好。',
      },
    },
    {
      '@type': 'Question',
      'name': 'AI 的结果不够好，怎么办？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '可以换一种说法，补充更多信息，再试一次。必要时也可以重新生成。',
      },
    },
    {
      '@type': 'Question',
      'name': '如何联系客服？',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': '微信：扫码下方二维码添加客服微信\\n电话：19132896773\\n邮件：support@shenxiang.school\\n工作时间：周一至周五 9:00-18:00',
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
