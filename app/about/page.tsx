'use client'

import Link from "next/link"
import { ArrowLeft, Users, Award, Target, Lightbulb, Shield, Cpu, Rocket, Calendar, BookOpen, Zap } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

export default function AboutPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: creamColors[100] }}>
      {/* 顶部背景 */}
      <div 
        className="relative py-16 md:py-20"
        style={{ 
          background: `linear-gradient(135deg, ${brandColors[700]} 0%, ${brandColors[800]} 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-4">
          {/* 返回按钮 */}
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回首页</span>
          </Link>
          
          {/* 标题 */}
          <div className="flex items-center gap-4 mb-4">
            <Users className="w-10 h-10 text-white" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              关于我们
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl">
            致力于为用户提供最优质的 AI 教育服务
          </p>
        </div>
        
        {/* 波浪装饰 */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg 
            viewBox="0 0 1440 60" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
            preserveAspectRatio="none"
          >
            <path 
              d="M0 60 C240 30 480 0 720 0 C960 0 1200 30 1440 60 L1440 60 L0 60Z" 
              fill={creamColors[100]}
            />
          </svg>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        
        {/* 公司简介 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            公司简介
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg leading-relaxed" style={{ color: slateColors[600] }}>
              沈翔智学是一家专注于 AI 教育领域的创新型科技公司。我们致力于将最先进的人工智能技术应用于教育场景，为学生和教师提供智能化、个性化的学习与教学体验。
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: slateColors[600] }}>
              平台整合全球顶尖的 AI 大模型，为用户提供作文批改、智能对话、学习规划、图片生成、音乐创作等多种 AI 功能，让学习变得更加高效、有趣。
            </p>
          </div>
        </section>

        {/* 核心价值观 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            核心价值观
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 创新 */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: brandColors[100] }}>
                <Lightbulb className="w-6 h-6" style={{ color: brandColors[600] }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: slateColors[800] }}>创新</h3>
              <p style={{ color: slateColors[600] }}>持续探索 AI 技术在教育领域的应用，为用户带来前沿的学习体验。</p>
            </div>

            {/* 使命 */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: brandColors[100] }}>
                <Target className="w-6 h-6" style={{ color: brandColors[600] }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: slateColors[800] }}>使命</h3>
              <p style={{ color: slateColors[600] }}>让每个学生都能享受到 AI 带来的个性化教育，让学习更高效。</p>
            </div>

            {/* 用户至上 */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: brandColors[100] }}>
                <Users className="w-6 h-6" style={{ color: brandColors[600] }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: slateColors[800] }}>用户至上</h3>
              <p style={{ color: slateColors[600] }}>始终以用户需求为导向，不断优化产品体验，提供优质服务。</p>
            </div>

            {/* 卓越 */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: brandColors[100] }}>
                <Award className="w-6 h-6" style={{ color: brandColors[600] }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: slateColors[800] }}>卓越</h3>
              <p style={{ color: slateColors[600] }}>追求卓越的产品质量和服务水平，致力于成为 AI 教育领域的领导者。</p>
            </div>
          </div>
        </section>

        {/* 技术架构 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            技术架构
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: brandColors[100] }}>
                  <Cpu className="w-6 h-6" style={{ color: brandColors[600] }} />
                </div>
                <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>多模型协同</h3>
                <p className="text-sm" style={{ color: slateColors[500] }}>
                  整合 GPT-5.4、Claude Opus 4.6、Gemini 3.1、DeepSeek V3、Qwen 3.0 等全球顶尖 AI 模型，根据任务智能调度
                </p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: brandColors[100] }}>
                  <Zap className="w-6 h-6" style={{ color: brandColors[600] }} />
                </div>
                <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>多智能体引擎</h3>
                <p className="text-sm" style={{ color: slateColors[500] }}>
                  作文批改 Agent、数学解题 Agent、写作教练 Agent 等垂直领域专家，多轮博弈输出高精度解析
                </p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: brandColors[100] }}>
                  <Shield className="w-6 h-6" style={{ color: brandColors[600] }} />
                </div>
                <h3 className="font-semibold mb-1" style={{ color: slateColors[800] }}>数据安全保障</h3>
                <p className="text-sm" style={{ color: slateColors[500] }}>
                  企业级数据加密存储，用户数据严格隔离，符合国内数据安全法规要求
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 发展历程 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            发展历程
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: brandColors[100] }}>
                  <Calendar className="w-5 h-5" style={{ color: brandColors[600] }} />
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: slateColors[800] }}>2024年 — 产品启动</h3>
                  <p className="text-sm mt-1" style={{ color: slateColors[500] }}>
                    沈翔智学正式立项，基于 LLM 技术打造 AI 作文批改引擎，完成核心算法研发与原型验证
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: brandColors[100] }}>
                  <Rocket className="w-5 h-5" style={{ color: brandColors[600] }} />
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: slateColors[800] }}>2025年 — 正式上线</h3>
                  <p className="text-sm mt-1" style={{ color: slateColors[500] }}>
                    平台正式上线运营，接入多模态大模型矩阵，推出全学段数学、英语、作文批改等核心功能
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: brandColors[100] }}>
                  <BookOpen className="w-5 h-5" style={{ color: brandColors[600] }} />
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: slateColors[800] }}>2026年 — 生态扩展</h3>
                  <p className="text-sm mt-1" style={{ color: slateColors[500] }}>
                    推出 OpenClaw 通用助手、备课助手 Pro、班主任助手等垂直智能体，服务超过 10,000+ 学生用户
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 联系我们 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: slateColors[800] }}>
            联系我们
          </h2>
          <div className="bg-white rounded-2xl p-8" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-lg mb-4" style={{ color: slateColors[600] }}>
              如果您对我们有任何建议或合作意向，欢迎通过以下方式联系我们：
            </p>
            <ul className="space-y-3" style={{ color: slateColors[600] }}>
              <li>• 客服电话：19132896773</li>
              <li>• 客服邮箱：support@shenxiang.school</li>
              <li>• 工作时间：周一至周五 9:00-18:00</li>
            </ul>
          </div>
        </section>

        {/* 底部导航 */}
        <div className="border-t pt-8" style={{ borderColor: slateColors[100] }}>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/pricing" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              价格方案
            </Link>
            <Link href="/help" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              帮助中心
            </Link>
            <Link href="/privacy" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              隐私政策
            </Link>
            <Link href="/terms" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              服务条款
            </Link>
          </div>
          <p className="text-center text-sm mt-4" style={{ color: slateColors[400] }}>
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}
