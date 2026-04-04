/**
 * 💳 Loading State Card
 * 
 * Flat rectangular status card for AI processing states.
 * Features cycling mathematical symbols and linked English text.
 */

"use client"

import React, { useEffect, useState } from "react"
import { ArtisticThinkingIcon, type ModelIconKey } from "@/components/icons/ArtisticThinkingIcons"

// ============================================
// Cycling Symbols Configuration
// ============================================

const CYCLING_SYMBOLS = ["∫", "∑", "∞", "√", "[", "]", "{", ";", "}"]

const LINKED_TEXTS = [
  "Thinking...", 
  "Scheming...", 
  "Meandering...", 
  "Thinking..."
]

// ============================================
// LoadingStateCard Props
// ============================================

interface LoadingStateCardProps {
  modelKey?: ModelIconKey
  className?: string
}

// ============================================
// Cycling Symbol Component
// ============================================

function CyclingSymbol({ index }: { index: number }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % CYCLING_SYMBOLS.length)
    }, 400) // Change symbol every 400ms
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <span 
      className="code-loading-char inline-block min-w-[1.5ch] text-center"
      style={{ 
        animationDelay: `${index * 0.1}s`,
        color: "#10A37F",
        fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace",
        fontWeight: 600,
      }}
    >
      {CYCLING_SYMBOLS[(currentIndex + index) % CYCLING_SYMBOLS.length]}
    </span>
  )
}

// ============================================
// Linked Text Component
// ============================================

function LinkedText() {
  const [currentIndex, setCurrentIndex] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % LINKED_TEXTS.length)
    }, 2000) // Change text every 2 seconds
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <span className="text-sm text-gray-500 dark:text-gray-400 transition-opacity duration-300">
      {LINKED_TEXTS[currentIndex]}
    </span>
  )
}

// ============================================
// LoadingStateCard Component
// ============================================

/**
 * Flat rectangular status card with:
 * - Top: Dynamic code status block with cycling symbols
 * - Bottom: Linked English text cycling through thinking states
 * 
 * Uses bg-[#10A37F]/5 opacity (5% brand green), rounded-2xl, no border
 */
export function LoadingStateCard({ 
  modelKey = "standard",
  className 
}: LoadingStateCardProps) {
  return (
    <div
      className={`
        rounded-2xl bg-[#10A37F]/5 
        px-6 py-4 
        flex flex-col items-center justify-center gap-4
        ${className || ""}
      `}
      style={{
        backgroundColor: "rgba(16, 163, 127, 0.05)",
        minWidth: "200px",
        maxWidth: "320px",
      }}
    >
      {/* Top: Icon with cycling symbols */}
      <div className="flex items-center gap-3">
        <ArtisticThinkingIcon 
          modelKey={modelKey} 
          size={28}
        />
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <CyclingSymbol key={i} index={i} />
          ))}
        </div>
      </div>
      
      {/* Bottom: Linked English text */}
      <LinkedText />
    </div>
  )
}

// ============================================
// Compact Loading State (inline)
// ============================================

export function CompactLoadingState({ 
  modelKey = "standard",
  className 
}: LoadingStateCardProps) {
  return (
    <div 
      className={`inline-flex items-center gap-2 ${className || ""}`}
    >
      <ArtisticThinkingIcon 
        modelKey={modelKey} 
        size={16}
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">
        <LinkedText />
      </span>
    </div>
  )
}

export { CYCLING_SYMBOLS, LINKED_TEXTS }
