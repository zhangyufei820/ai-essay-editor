"use client";

import { useEffect, useState } from "react";

export default function WxGuard() {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    // 确保仅在客户端执行
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent.toLowerCase();
    
    // 调试日志
    console.log("[WxGuard] User-Agent:", ua);
    
    // 排除 HeadlessChrome（Puppeteer）等自动化测试工具 - 这些不应该被阻止
    const isHeadless = ua.includes("headlesschrome") || ua.includes("puppeteer");
    if (isHeadless) {
      console.log("[WxGuard] 检测到自动化测试工具，跳过检测");
      return;
    }
    
    // 判断是否是微信 (micromessenger) - 必须包含完整的 micromessenger 字符串
    const isWeChat = ua.includes("micromessenger");
    
    // 判断是否是QQ内置浏览器 - 更精确的检测
    // QQ 内置浏览器的 UA 通常包含 "qq/" 后跟版本号，如 "qq/8.9.0"
    // 或者包含 "qqbrowser" 字符串
    const isQQ = /qq\/[\d.]+/.test(ua) || ua.includes("qqbrowser");

    console.log("[WxGuard] isWeChat:", isWeChat, "isQQ:", isQQ);

    if (isWeChat || isQQ) {
      setIsBlocked(true);
      // 禁止背景滚动，防止用户在遮罩下还能滑动页面
      document.body.style.overflow = "hidden";
    }
  }, []);

  // 如果不是微信/QQ，什么都不渲染
  if (!isBlocked) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#121212] px-4 text-center">
      {/* 遮罩层：层级 z-[99999] 确保覆盖所有 Sidebar 和弹窗 */}
      
      {/* 红色警告图标 */}
      <div className="mb-8 rounded-full bg-red-500/10 p-6">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="64" 
          height="64" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="#ef4444" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>

      <h2 className="mb-4 text-2xl font-bold text-white">
        已停止访问该网页
      </h2>
      
      <p className="mb-8 text-gray-400 max-w-md text-sm leading-relaxed">
        检测到您正在使用微信/QQ访问。
        <br />
        由于平台安全限制，请点击右上角菜单
        <br />
        选择 <span className="mx-1 inline-block rounded bg-white/10 px-2 py-0.5 font-bold text-white">在浏览器打开</span> 以继续使用。
      </p>

      {/* 指引箭头示意图 - 添加了动画效果 */}
      <div className="absolute right-6 top-4 flex animate-bounce flex-col items-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 19V5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M5 12L12 5L19 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="mt-1 text-xs font-medium text-white">点这里</span>
      </div>
    </div>
  );
}
