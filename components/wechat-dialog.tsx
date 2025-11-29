"use client"

import type React from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { Smartphone, QrCode } from "lucide-react"

interface WeChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WeChatDialog({ open, onOpenChange }: WeChatDialogProps) {
  const [method, setMethod] = useState<"qr" | "phone">("qr")
  const [phone, setPhone] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle phone registration
    console.log("Phone registration:", phone)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>微信注册</DialogTitle>
          <DialogDescription>选择您喜欢的注册方式</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-6">
          <Button
            variant={method === "qr" ? "default" : "outline"}
            className="flex-1 gap-2"
            onClick={() => setMethod("qr")}
          >
            <QrCode className="h-4 w-4" />
            扫码注册
          </Button>
          <Button
            variant={method === "phone" ? "default" : "outline"}
            className="flex-1 gap-2"
            onClick={() => setMethod("phone")}
          >
            <Smartphone className="h-4 w-4" />
            手机注册
          </Button>
        </div>

        {method === "qr" ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
              <div className="text-center">
                <QrCode className="h-16 w-16 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">微信扫码注册</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              使用微信扫描二维码
              <br />
              快速完成注册
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">手机号码</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="请输入手机号码"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <div className="flex gap-2">
                <Input id="code" type="text" placeholder="请输入验证码" required />
                <Button type="button" variant="outline" className="shrink-0 bg-transparent">
                  获取验证码
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full">
              注册并绑定微信
            </Button>
            <p className="text-xs text-muted-foreground text-center">注册即表示同意我们的服务条款和隐私政策</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
