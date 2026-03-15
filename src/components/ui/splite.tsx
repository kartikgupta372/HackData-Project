'use client'

import { Suspense, lazy, useRef } from 'react'
import { useInView } from 'framer-motion'

const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: false, amount: 0.1 })

  return (
    <div ref={containerRef} className="w-full h-full">
      <Suspense 
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-black/50">
            <span className="loader"></span>
          </div>
        }
      >
        {isInView && (
          <Spline
            scene={scene}
            className={className}
          />
        )}
      </Suspense>
    </div>
  )
}
