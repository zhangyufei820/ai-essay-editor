'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthingLoginComponent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // 从环境变量读取 Authing App ID
  const appId = process.env.NEXT_PUBLIC_AUTHING_APP_ID || ''
  const guardRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // 1. 检查是否已经登录
    // 如果已经有用户信息，直接跳转，不再显示登录框
    const user = localStorage.getItem('currentUser')
    if (user) {
      const redirectPath = searchParams.get('redirect')
      router.replace(redirectPath || '/')
      return
    }

    if (guardRef.current) return

    // 2. 动态加载 Authing 样式
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.authing.co/packages/guard/latest/guard.min.css'
    document.head.appendChild(link)

    // 3. 加载 Authing 组件
    import('@authing/guard').then((module) => {
      const Guard = module.Guard
      if (guardRef.current) return

      try {
        const guard = new Guard({
          appId,
          mode: 'normal', // 使用普通模式，不强制跳转
        })

      // ✅ 登录成功的处理逻辑
      guard.on('login', async (userInfo: any) => {
        console.log('登录成功:', userInfo)
        
        // [关键] 保存用户信息到浏览器，以便支付页面能看到
        const finalUser = userInfo.data || userInfo
        localStorage.setItem('currentUser', JSON.stringify(finalUser))

        // 可选：同步到你的后端数据库 (保留了你之前的逻辑)
        try {
          await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: finalUser.id || finalUser.sub,
              email: finalUser.email,
              nickname: finalUser.nickname || finalUser.username,
              avatar: finalUser.photo,
              // ✨ [新增] 同步手机号
              // Authing 返回的手机号字段可能是 phone 或 phone_number
              phone: finalUser.phone || finalUser.phone_number 
            })
          })
        } catch(e) {
          console.error('同步失败', e)
        }

        // [关键] 登录后跳转回刚才的页面（比如支付页）
        const redirectPath = searchParams.get('redirect')
        
        if (redirectPath) {
          console.log('正在返回之前的页面:', redirectPath)
          // 使用 decodeURIComponent 确保网址格式正确
          router.replace(decodeURIComponent(redirectPath))
        } else {
          router.replace('/')
        }
      })

        guard.start('#authing-guard-container')
        guardRef.current = guard
        setIsLoaded(true)
      } catch (error) {
        console.error('Authing Guard 初始化失败:', error)
        setIsLoaded(true) // 即使失败也标记为已加载，避免无限等待
      }
    }).catch((error) => {
      console.error('加载 Authing 模块失败:', error)
      setIsLoaded(true)
    })
  }, [appId, router, searchParams])

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor: '#f5f5f5' 
    }}>
      {/* 登录框容器 */}
      <div id="authing-guard-container" style={{ minHeight: '500px' }}></div>
      
      {!isLoaded && (
        <p style={{ color: '#666', marginTop: '20px' }}>
          正在加载安全登录组件...
        </p>
      )}
    </div>
  )
}

// 必须使用 Suspense 包裹，否则在 Next.js 新版本中可能会报错
export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>加载中...</div>}>
      <AuthingLoginComponent />
    </Suspense>
  )
}
