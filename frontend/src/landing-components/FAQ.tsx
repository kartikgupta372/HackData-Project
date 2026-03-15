"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlus } from "react-icons/fi";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "What exactly is AuraDesign AI?",
    answer: "AuraDesign AI is a next-generation design platform that combines generative AI with professional 3D rendering. It allows creators to build cinematic-quality web interfaces and digital products in a fraction of the time using natural language and intelligent layout algorithms."
  },
  {
    question: "How does the AI design process work?",
    answer: "Our engine analyzes your brand identity and requirements to generate unique, functional design systems. It doesn't just copy templates; it understands spatial hierarchy, color theory, and user psychology to create bespoke experiences."
  },
  {
    question: "Can I export my designs to other tools?",
    answer: "Yes! AuraDesign supports seamless exports to industry standards including Figma, React/Next.js codebases, and Spline for 3D assets. Your assets are fully editable and ready for production."
  },
  {
    question: "Do you offer custom enterprise solutions?",
    answer: "Absolutely. For large teams, we offer dedicated infrastructure, custom-trained AI models based on your brand guidelines, and priority rendering queues for ultra-fast workflows."
  },
  {
    question: "Is there a free trial available?",
    answer: "We offer a 'Creative Starter' plan that's free forever, allowing you to explore the 3D scene builder and basic AI layout tools. Professional features and high-res exports are available under our premium tiers."
  }
];

const FAQItem = ({ question, answer, isOpen, onClick }: { question: string, answer: string, isOpen: boolean, onClick: () => void }) => {
  return (
    <div className="border-b border-zinc-900 overflow-hidden">
      <button
        onClick={onClick}
        className="w-full py-8 flex items-center justify-between text-left group transition-all duration-300"
      >
        <span className={cn(
          "text-xl md:text-2xl font-bold transition-colors duration-300",
          isOpen ? "text-[#f73100ff]" : "text-white group-hover:text-[#f73100ff]"
        )}>
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "p-2 rounded-full border transition-colors duration-300",
            isOpen ? "border-[#f73100ff] bg-[#f73100ff] text-white" : "border-zinc-800 text-zinc-500 group-hover:border-[#f73100ff] group-hover:text-white"
          )}
        >
          <FiPlus size={24} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="pb-8 text-zinc-400 text-lg max-w-3xl leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="w-full bg-black py-32 px-6" id="faqs" data-theme="dark">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
          <div className="max-w-2xl">
            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6">
              FREQUENTLY ASKED <span className="text-[#f73100ff]">QUESTIONS</span>
            </h2>
            <p className="text-zinc-500 text-xl leading-relaxed">
              Everything you need to know about building the future with AuraDesign.
            </p>
          </div>
          {/* <div className="text-zinc-800 font-mono text-sm hidden md:block">
            [ DATA_QUERY: FAQ_SYSTEM ]
          </div> */}
        </div>

        <div className="border-t border-zinc-900">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
