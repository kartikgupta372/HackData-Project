"use client"

import { cn } from "@/lib/utils"
import { DotPattern } from "@/landing-components/ui/dot-pattern"
import { TextRevealByWord } from "@/landing-components/textreveal"

export function AboutSection() {
  return (
    <div data-theme="dark" className="relative w-full bg-black">
      {/* Dot pattern background across the entire section */}
      <DotPattern
        glow={true}
        width={24}
        height={24}
        cr={1.2}
        className={cn("text-white/30")}
      />

      {/* Text Reveal scroll effect */}
      <TextRevealByWord
        text="AuraDesign AI transforms your website into a high-converting masterpiece with the power of artificial intelligence. Design smarter, convert faster."
      />
    </div>
  )
}
