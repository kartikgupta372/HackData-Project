"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useState } from "react";
import { cn } from "@/lib/utils";

const caseStudies = [
  {
    company: "Airbnb",
    title: "Trust-Driven Booking UX",
    description:
      "Airbnb redesigned listing pages with larger imagery, host credibility indicators and clearer pricing breakdowns. The improved UX increased booking conversion rates by over 30% and strengthened user trust.",
    color: "bg-[#FF5A5F]",
    code: "CASE #001",
  },
  {
    company: "Spotify",
    title: "AI-Powered Music Discovery",
    description:
      "Spotify introduced Discover Weekly and AI recommendation interfaces that transformed music discovery. This UX innovation significantly boosted engagement and helped Spotify scale to 500M+ users globally.",
    color: "bg-[#1DB954]",
    code: "CASE #002",
  },
  {
    company: "Nike",
    title: "Mobile-First Commerce",
    description:
      "Nike redesigned their mobile shopping UX focusing on speed, personalization and storytelling product pages. The redesign contributed to a 40% increase in digital sales and stronger direct-to-consumer growth.",
    color: "bg-[#E6E6E6]",
    textColor: "text-black",
    code: "CASE #003",
  },
  {
    company: "Amazon",
    title: "One-Click Checkout",
    description:
      "Amazon simplified online purchasing with their one-click checkout system, removing friction from the buying process and dramatically increasing conversion rates across the platform.",
    color: "bg-[#FF9900]",
    code: "CASE #004",
  },
  {
    company: "Dropbox",
    title: "Landing Page Simplification",
    description:
      "Dropbox simplified their homepage design by focusing on a single call-to-action and clearer messaging. The UX change increased user sign-ups by more than 10%.",
    color: "bg-[#0061FF]",
    code: "CASE #005",
  },
  {
    company: "Apple",
    title: "Story-Driven Product Pages",
    description:
      "Apple introduced immersive product storytelling pages with interactive visuals and animations. This design strategy increased product engagement and strengthened Apple’s premium brand perception.",
    color: "bg-[#1a1a1a]",
    code: "CASE #006",
  },
];

const ReviewCrousel = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  return (
    <section
      id="case-studies"
      className="w-full bg-black py-24 overflow-hidden"
      data-theme="dark"
    >
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">
          CASE STUDIES
        </h2>

        <p className="text-zinc-500 max-w-xl text-lg">
          Real companies that transformed their UX and achieved massive growth
          in conversions, revenue and customer acquisition.
        </p>
      </div>

      <div className="flex h-[500px] w-full items-center justify-center">
        <div className="relative w-full max-w-7xl px-5">
          <div className="flex w-full items-center justify-center gap-3">
            {caseStudies.map((item, index) => (
              <motion.div
                key={index}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-[4rem] border border-white/10 transition-all duration-300",
                  item.color,
                  activeIndex === index
                    ? "shadow-2xl shadow-orange-500/20"
                    : "hover:border-white/20"
                )}
                initial={{ width: "6rem" }}
                animate={{
                  width: activeIndex === index ? "36rem" : "6rem",
                }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="h-[500px] w-full flex flex-col p-10 justify-between relative">
                  <div
                    className={cn(
                      "font-black tracking-tighter transition-all duration-500 whitespace-nowrap absolute",
                      item.textColor || "text-white",
                      activeIndex === index
                        ? "static rotate-0 text-6xl md:text-7xl mb-2"
                        : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-4xl md:text-5xl opacity-40 uppercase tracking-widest"
                    )}
                  >
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
                        <div className="h-1 w-12 bg-current opacity-20 rounded-full" />

                        <p className="text-orange-400 text-sm font-semibold">
                          UX Impact Report
                        </p>

                        <h3
                          className={cn(
                            "text-3xl md:text-4xl font-bold",
                            item.textColor || "text-white"
                          )}
                        >
                          {item.title}
                        </h3>

                        <p
                          className={cn(
                            "text-lg max-w-[320px] leading-relaxed opacity-80",
                            item.textColor || "text-white"
                          )}
                        >
                          {item.description}
                        </p>

                        <p
                          className={cn(
                            "text-xs font-mono tracking-[0.3em] mt-6 uppercase opacity-50",
                            item.textColor || "text-white"
                          )}
                        >
                          {item.code}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* grain overlay */}
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
