'use client'

import { useEffect, useRef, useState, JSX } from 'react'
import { cn } from '@/lib/utils'

interface CharacterRiseProps {
  text: string
  className?: string
  delayPerChar?: number
  as?: keyof JSX.IntrinsicElements
}

export function CharacterRise({ 
  text, 
  className = '', 
  delayPerChar = 60,
  as: Component = 'span'
}: CharacterRiseProps) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    // @ts-expect-error - dynamic component ref
    <Component ref={ref} className={cn('character-rise-group', className)}>
      {text.split('').map((char, index) => (
        <span
          key={index}
          className={cn(
            'character-rise',
            isVisible ? 'animate-[characterRise_0.6s_cubic-bezier(0.34,1.56,0.64,1)_forwards]' : 'opacity-0'
          )}
          style={{
            animationDelay: `${index * delayPerChar}ms`,
            display: char === ' ' ? 'inline' : 'inline-block',
          }}
        >
          {char}
        </span>
      ))}
    </Component>
  )
}
