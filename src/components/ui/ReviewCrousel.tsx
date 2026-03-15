"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useState } from "react";
import { cn } from "@/lib/utils";

const caseStudies = [
  {
    company: "Airbnb",
    title: "Eco-stays Revolution",
    description: "Reimagining the sustainable travel experience through AI-driven generative layout systems.",
    color: "bg-[#FF5A5F]",
    code: "CASE #001",
  },
  {
    company: "Spotify",
    title: "Musical Immersion",
    description: "Creating personalized 3D spatial interfaces for the next generation of listeners.",
    color: "bg-[#1DB954]",
    code: "CASE #002",
  },
  {
    company: "Nike",
    title: "Athletic Precision",
    description: "Designing high-performance product visualizers using real-time rendering engine.",
    color: "bg-[#E6E6E6]",
    textColor: "text-black",
    code: "CASE #003",
  },
  {
    company: "Tesla",
    title: "Future of Mobility",
    description: "Developing intelligent dashboard aesthetics for autonomous driving environments.",
    color: "bg-[#E82127]",
    code: "CASE #004",
  },
  {
    company: "Vercel",
    title: "Developer Experience",
    description: "Optimizing the workflow for the web with predictive UI component suggestions.",
    color: "bg-[#000000]",
    border: "border-zinc-800",
    code: "CASE #005",
  },
  {
    company: "Apple",
    title: "Visionary Design",
    description: "Pioneering the next era of spatial computing through seamless hardware-software integration.",
    color: "bg-[#1a1a1a]",
    code: "CASE #006",
  },
];

const ReviewCrousel = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  return (
    <section id="case-studies" className="w-full bg-black py-24 overflow-hidden" data-theme="dark">
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">
          CASE STUDIES
        </h2>
        <p className="text-zinc-500 max-w-xl text-lg">
          Exploring the limits of design through high-impact collaborations with world-class brands.
        </p>
      </div>

      <div className="flex h-[500px] w-full items-center justify-center">
        <div className="relative w-full max-w-7xl px-5">
          <div className="flex w-full items-center justify-center gap-3">
            {caseStudies.map((item, index) => (
              <motion.div
                key={index}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-[4rem] border border-white/5",
                  item.color,
                  item.border,
                  activeIndex === index ? "shadow-2xl shadow-orange-500/10" : ""
                )}
                initial={{ width: "6rem" }}
                animate={{
                  width: activeIndex === index ? "36rem" : "7rem",
                }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="h-[500px] w-full flex flex-col p-10 justify-between relative">
                  {/* Company Name */}
                  <div className={cn(
                    "font-black tracking-tighter transition-all duration-500 whitespace-nowrap absolute",
                    item.textColor || "text-white",
                    activeIndex === index 
                      ? "static rotate-0 text-7xl md:text-8xl" 
                      : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-5xl md:text-6xl"
                  )}>
                    {item.company}
                  </div>

                  <AnimatePresence>
                    {activeIndex === index && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        className="flex flex-col gap-6"
                      >
                        <div className="h-1.5 w-16 bg-current opacity-30 rounded-full" />
                        <h3 className={cn("text-3xl md:text-4xl font-bold", item.textColor || "text-white")}>
                          {item.title}
                        </h3>
                        <p className={cn("text-lg max-w-[320px] leading-relaxed opacity-80", item.textColor || "text-white")}>
                          {item.description}
                        </p>
                        <p className={cn("text-xs font-mono tracking-[0.3em] mt-6 uppercase opacity-50", item.textColor || "text-white")}>
                          {item.code}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Aesthetic Noise Overlay inside cards */}
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none mix-blend-overlay" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export { ReviewCrousel };
export const Skiper52 = ReviewCrousel;
export const HoverExpand_001 = ReviewCrousel;

