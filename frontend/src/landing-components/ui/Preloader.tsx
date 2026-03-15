"use client";

import { motion } from "framer-motion";

export const Preloader = () => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
    >
      {/* Brand Logo/Name */}
      <div className="relative mb-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-6xl font-bold text-white tracking-tighter"
        >
          AURA<span className="text-[#f73100ff]">DESIGN</span>
        </motion.h1>
        
        {/* Progress Bar Container */}
        <div className="absolute -bottom-4 left-0 w-full h-[2px] bg-zinc-900 overflow-hidden rounded-full">
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "0%" }}
            transition={{ 
                duration: 2, 
                ease: "easeInOut",
                repeat: Infinity 
            }}
            className="w-full h-full bg-[#f73100ff]"
          />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-zinc-500 font-mono text-xs tracking-widest uppercase"
      >
        Initialising Design Engine...
      </motion.div>

      {/* Decorative Aura background during loading */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#f73100ff] rounded-full blur-[120px] animate-pulse" />
      </div>
    </motion.div>
  );
};
