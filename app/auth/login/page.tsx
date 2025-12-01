import { redirect } from 'next/navigation'

// 这里的逻辑是：
// 如果用户不小心访问了这个旧地址 (/auth/login)，
// 强制把他踢到新地址 (/login) 去。
export default function OldLoginPageRedirect() {
  redirect('/login')
}