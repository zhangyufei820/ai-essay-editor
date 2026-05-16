import { useReducedMotion, type MotionProps } from "framer-motion"

export const buttonHover = {
  rest: {
    scale: 1,
    y: 0,
  },
  hover: {
    scale: 1.02,
    y: -2,
    transition: {
      duration: 0.15,
      ease: [0.33, 1, 0.68, 1],
    },
  },
  tap: {
    scale: 0.98,
    y: 0,
    transition: {
      duration: 0.1,
    },
  },
} as const

export function useSafeMotionProps<T extends MotionProps>(props: T): T | MotionProps {
  const reduced = useReducedMotion()

  if (reduced) {
    return {
      initial: false,
      animate: false,
      transition: { duration: 0 },
    }
  }

  return props
}
