'use client'

import { SplineScene } from "@/landing-components/ui/splite";
import { Card } from "@/landing-components/ui/card"
import { Spotlight } from "@/landing-components/ui/spotlight"
 
export function SplineSceneBasic() {
  return (
    <Card className="w-full h-[500px] bg-black/[0.96] relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      
     
      <div>          
        <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
          /></div>
    </Card>
  )
}