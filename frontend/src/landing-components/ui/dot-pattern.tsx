"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  x?: number
  y?: number
  cx?: number
  cy?: number
  cr?: number
  className?: string
  glow?: boolean
  [key: string]: unknown
}


export function DotPattern({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId()
  const containerRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
      }
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    window.addEventListener("resize", updateDimensions)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateDimensions)
    }
  }, [])

  const glowDots = glow
    ? Array.from({ length: Math.min(80, Math.ceil(dimensions.width / width) * Math.ceil(dimensions.height / height)) }, () => ({
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        delay: Math.random() * 5,
        duration: Math.random() * 3 + 2,
      }))
    : []

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={`${id}-pattern`}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
        </pattern>
        {glow && (
          <radialGradient id={`${id}-gradient`}>
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {}
      <rect width="100%" height="100%" fill={`url(#${id}-pattern)`} />
      {}
      {glowDots.map((dot, i) => (
        <motion.circle
          key={`glow-${i}`}
          cx={dot.x}
          cy={dot.y}
          r={cr * 2}
          fill={`url(#${id}-gradient)`}
          initial={{ opacity: 0.3, scale: 1 }}
          animate={{
            opacity: [0.3, 0.8, 0.3],
            scale: [1, 1.8, 1],
          }}
          transition={{
            duration: dot.duration,
            repeat: Infinity,
            repeatType: "reverse",
            delay: dot.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  )
}
