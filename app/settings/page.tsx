"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@supabase/supabase-js"
import { toast } from "sonner"
import { Loader2, Upload, Camera, AlertCircle } from "lucide-react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [debugError, setDebugError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 优先从本地读取，确保能拿到 ID (即使是手机号)
    const initUser = () => {
      if (typeof window !== 'undefined') {
        const localStr = localStorage.getItem('currentUser')
        if (localStr) {
          try {
            const localUser = JSON.parse(localStr)
            setUser(localUser)
            // 初始化表单数据
            setDisplayName(localUser.user_metadata?.name || "")
            setAvatarUrl(localUser.user_metadata?.avatar_url || "")
          } catch (e) {}
        }
      }
    }
    initUser()
  }, [])

  const handleUploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setDebugError(null) 
    try {
      setUploading(true)
      
      if (!event.target.files || event.target.files.length === 0) return

      const file = event.target.files[0]
      // 简单的文件名生成
      const fileExt = file.name.split('.').pop()
      const fileName = `avatar_${Date.now()}.${fileExt}`

      console.log("正在上传:", fileName)

      // 1. 上传 (依赖我们之前开启的万能权限)
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        const err = uploadError as any
        throw new Error(`Upload Error: ${err.message}`)
      }

      // 2. 获取链接
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // 加时间戳防缓存
      const finalUrl = `${publicUrl}?t=${Date.now()}`
      
      console.log("头像链接:", finalUrl)
      setAvatarUrl(finalUrl)
      toast.success("上传成功！请点击【保存修改】")

    } catch (error: any) {
      console.error(error)
      setDebugError(error.message || "未知错误")
      toast.error("上传失败，请看下方红字")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setDebugError(null)
    setLoading(true)

    try {
      // 1. 获取 ID (可能是手机号，也可能是 UUID)
      const userId = user.id || user.sub || user.userId
      
      // 2. 呼叫后端 API 强制更新 (核心修改：不走前端 SDK 了)
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          name: displayName,
          avatarUrl: avatarUrl
        })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "更新失败")
      }

      // 3. 更新本地缓存 (确保侧边栏同步)
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
      const updatedUser = {
        ...currentUser,
        user_metadata: {
          ...currentUser.user_metadata,
          name: displayName,
          avatar_url: avatarUrl
        }
      }
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))

      toast.success("保存成功！")
      
      // 4. 刷新页面
      setTimeout(() => {
        window.location.reload()
      }, 800)
      
    } catch (error: any) {
      console.error(error)
      setDebugError(`Save Error: ${error.message}`)
      toast.error("保存失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-8 bg-[#F9FAFB] min-h-screen">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">账号设置</h2>
          <p className="text-gray-500 mt-1">设置您的头像和昵称。</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 space-y-8">
            
            {/* 头像 */}
            <div className="space-y-4">
              <Label className="text-base">个人头像</Label>
              <div className="flex items-center gap-6 pb-6 border-b border-gray-100">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-gray-50 shadow-sm bg-gray-100 flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-gray-300">
                        {displayName?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                  {uploading && (
                    <div className="absolute inset-0 bg-white/80 rounded-full flex items-center justify-center opacity-100">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900">点击左侧圆形上传</h3>
                  <p className="text-sm text-gray-500">支持 JPG, PNG, GIF</p>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUploadAvatar} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? "上传中..." : "选择图片"}
                  </Button>
                </div>
              </div>
            </div>

            {/* 调试信息 */}
            {debugError && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800 break-all font-mono">{debugError}</div>
              </div>
            )}

            {/* 昵称 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>账号</Label>
                <Input value={user?.email || user?.phone || ""} disabled className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-2">
                <Label>昵称</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="请输入您的昵称" />
              </div>
            </div>

            <div className="pt-4">
              <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto bg-[#0F766E] hover:bg-[#0d655d]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                保存修改
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}