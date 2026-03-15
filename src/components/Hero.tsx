import { Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState, useRef } from "react";
import { FiArrowRight, FiChevronDown } from "react-icons/fi";
import { cn } from "@/lib/utils";
import { GridPattern } from "@/components/ui/grid-pattern";
import {
  useMotionTemplate,
  useMotionValue,
  motion,
  animate,
} from "framer-motion";

import { SparklesText } from "@/components/ui/sparkles-text";

const COLORS_TOP = ["#a20a0aff", "#ff5500ff", "#eb093aff", "#a20a0aff"];
const GENRES = ['Professional', 'Modern', 'Funky / Playful', 'Minimal', 'Futuristic', 'Luxury / Premium', 'Friendly'];

const Hero = () => {
  const color = useMotionValue(COLORS_TOP[0]);
  const [selectedGenre, setSelectedGenre] = useState(GENRES[0]);
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    animate(color, COLORS_TOP, {
      ease: "easeInOut",
      duration: 10,
      repeat: Infinity,
      repeatType: "mirror",
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGenreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const backgroundImage = useMotionTemplate`radial-gradient(125% 125% at 50% 0%, #faf4f1ff 50%, ${color})`;
  const border = useMotionTemplate`1px solid ${color}`;
  const boxShadow = useMotionTemplate`0px 4px 24px ${color}`;

  return (
    <motion.section
      style={{
        backgroundImage,
      }}
      className="relative grid min-h-screen place-content-center overflow-hidden bg-white px-4 py-24 text-black"
    >
      {/* Background Grid Pattern - Bottom gradient area */}
      <GridPattern
        width={30}
        height={30}
        x={-1}
        y={-1}
        strokeDasharray={"4 2"}
        className={cn(
          "[mask-image:linear-gradient(to_bottom,transparent_50%,white_80%)]",
          "opacity-50"
        )}
      />

      <div className="relative z-10 flex flex-col items-center">
        <span className="mb-1.5 inline-block rounded-full bg-white border-2 border-[#f04107ff] px-3 py-1.5 text-sm">
          Try the Beta Now!
        </span>
        <div className="flex flex-col items-center">
          <h1 className="max-w-4xl text-center text-3xl font-black leading-tight text-black sm:text-5xl sm:leading-tight md:text-7xl md:leading-tight tracking-tighter uppercase">
            Aura <SparklesText 
              text="Design" 
              className="inline-block text-[#f73100ff] font-black italic" 
              sparklesCount={12}
              colors={{ first: "#6b00f7ff", second: "#ffa600ff" }}
            /> AI
          </h1>
          <p className="mt-4 text-zinc-400 text-sm md:text-base font-normal tracking-widest text-center max-w-xl">
           AI Powered Website Design Optimization Toolkit.
          </p>
        </div>
        
        {/* AI Input Box */}
        <div className="mt-10 w-full max-w-2xl px-4">
          <div className="bg-white/50 backdrop-blur-md border-2 border-zinc-200 rounded-3xl p-1.5 shadow-sm transition-all hover:shadow-md">
            {/* Row 1: URL Input */}
            <input 
              type="text" 
              placeholder="Drop your website url here..." 
              className="w-full bg-transparent py-4 px-6 text-lg text-black outline-none placeholder:text-zinc-500"
            />
            
            {/* Row 2: Genre and Button */}
            <div className="flex items-center justify-between gap-4 px-4 pb-1.5 pt-1.5 border-t border-zinc-200/50">
              <div className="flex items-center gap-3 pl-2">
                <span className="text-zinc-500 font-medium text-sm">Website Genre:</span>
                
                {/* Custom Modern Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button 
                    onClick={() => setIsGenreOpen(!isGenreOpen)}
                    className="flex items-center gap-2 bg-zinc-100/80 hover:bg-zinc-200/80 rounded-xl py-1.5 px-3 text-sm font-semibold text-black transition-all outline-none"
                  >
                    {selectedGenre}
                    <FiChevronDown className={`transition-transform duration-300 ${isGenreOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isGenreOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="absolute bottom-full left-0 mb-2 w-48 bg-white backdrop-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden p-1.5"
                    >
                      {GENRES.map((genre) => (
                        <button
                          key={genre}
                          onClick={() => {
                            setSelectedGenre(genre);
                            setIsGenreOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm rounded-xl transition-colors ${
                            selectedGenre === genre 
                              ? 'bg-black text-white' 
                              : 'text-zinc-700 hover:bg-[#e69479ff]'
                          }`}
                        >
                          {genre}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <button className="bg-[#f04107ff] text-white px-4 py-2 pr-4 rounded-2xl font-bold transition-all">
                Try Now
              </button>
            </div>
          </div>
        </div>

        {/* <p className="mt-10 mb-6 max-w-xl text-center text-black leading-relaxed md:text-lg md:leading-relaxed">
          AI-Powered Website Design Optimization Toolkit On Web
        </p> */}
        {/* <motion.button
          style={{
            border,
            boxShadow,
          }}
          whileHover={{
            scale: 1.015,
          }}
          whileTap={{
            scale: 0.985,
          }}
          className="group relative flex w-fit items-center gap-1.5 rounded-full bg-black border-2 border-[#f04107ff] px-4 py-2 text-white transition-colors hover:bg-[#f04107ff] hover:text-white"
        >
          Get Started Now
          <FiArrowRight className="transition-transform group-hover:-rotate-45 group-active:-rotate-12" />
        </motion.button> */}
      </div>

      <div className="absolute inset-0 z-0">
        <Canvas>
          <Stars radius={50} count={2500} factor={4} fade speed={2} />
        </Canvas>
      </div>
    </motion.section>
  );
};

export default Hero;
