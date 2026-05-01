import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/login', '/auth', '/settings', '/credits', '/checkout'],
      },
    ],
    sitemap: 'https://shenxiang.school/sitemap.xml',
  }
}
