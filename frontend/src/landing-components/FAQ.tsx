"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlus } from "react-icons/fi";
import { cn } from "@/lib/utils";

const faqs = [
  {
  question: "Does AuraDesign collect personal user data?",
  answer:
    "No. AuraDesign focuses on behavioral patterns and interface interactions rather than personal identity. The platform analyzes aggregated engagement signals like click patterns and scroll depth without collecting personally identifiable information."
},
{
  question: "How does AuraDesign protect user privacy?",
  answer:
    "AuraDesign is designed with a privacy-first architecture. All analytics are processed using anonymized and aggregated data so individual users cannot be identified. The platform follows modern data protection principles used in responsible analytics systems."
},
{
  question: "Is AuraDesign compliant with data protection standards?",
  answer:
    "AuraDesign is built with privacy regulations in mind, including principles aligned with GDPR and modern data protection frameworks. We minimize data collection, anonymize behavioral insights, and ensure data is used only for improving user experience."
},
{
  question: "Can website owners control what data AuraDesign analyzes?",
  answer:
    "Yes. Website owners have full control over what analytics AuraDesign processes. The platform allows teams to limit tracking scope, disable certain analytics modules, and ensure their UX analysis aligns with their privacy policies."
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
