/**
 * 🎬 沈翔学校 - Framer Motion 动画变体 (Animation Variants)
 * 
 * 预定义常用的动画变体，用于组件动画。
 */

import type { Variants } from 'framer-motion'

// ============================================
// 基础动画变体
// ============================================

/** 淡入动画 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } }
}

/** 向上滑入动画 */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] } }
}

/** 向下滑入动画 */
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] } }
}

/** 缩放进入动画 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } }
}

// ============================================
// 容器动画变体
// ============================================

/** 交错容器动画 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

// ============================================
// 聊天相关动画变体
// ============================================

/** 消息进入动画 */
export const messageEnter: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      duration: 0.35,
      ease: [0.33, 1, 0.68, 1]
    }
  }
}

/** AI 思考动画 */
export const aiThinking: Variants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

// ============================================
// 交互动画变体
// ============================================

/** 按钮悬停动画 */
export const buttonHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -1, transition: { duration: 0.2 } },
  tap: { scale: 0.98, transition: { duration: 0.1 } }
}

// ============================================
// 导出所有变体
// ============================================

const motionVariants = {
  fadeIn,
  slideUp,
  slideDown,
  scaleIn,
  staggerContainer,
  messageEnter,
  aiThinking,
  buttonHover,
}

export default motionVariants
