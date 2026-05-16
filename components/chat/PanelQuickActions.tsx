"use client"

import { motion } from "framer-motion"
import { History, Home } from "lucide-react"

interface PanelQuickActionsProps {
  onClose: () => void
}

const quickActions = [
  { label: "返回主页", href: "/", Icon: Home },
  { label: "历史会话", href: "/history", Icon: History },
]

export function PanelQuickActions({ onClose }: PanelQuickActionsProps) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-3 px-5 pb-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      {quickActions.map(({ label, href, Icon }) => (
        <motion.a
          key={href}
          href={href}
          onClick={onClose}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/60 px-3 text-sm font-medium text-[#14532d] shadow-[0_4px_24px_rgba(14,58,31,0.04)] backdrop-blur-xl transition-colors hover:bg-white/80"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <Icon className="h-4 w-4" />
          {label}
        </motion.a>
      ))}
    </motion.div>
  )
}
