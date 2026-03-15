import LogoLoop from './LogoLoop';
import { SiReact, SiTypescript, SiTailwindcss, SiFramer, SiVite, SiSupabase, SiFastapi, SiGooglegemini } from 'react-icons/si';

const techLogos = [
  { node: <SiReact className="text-[#61DAFB]" />, title: "React", ariaLabel: "React" },
  { node: <SiTypescript className="text-[#3178C6]" />, title: "TypeScript", ariaLabel: "TypeScript" },
  { node: <SiTailwindcss className="text-[#06B6D4]" />, title: "Tailwind CSS", ariaLabel: "Tailwind CSS" },
  { node: <SiFramer className="text-black" />, title: "Framer Motion", ariaLabel: "Framer Motion" },
  { node: <SiVite className="text-[#646CFF]" />, title: "Vite", ariaLabel: "Vite" },
  { node: <SiFastapi className="text-[#05998b]" />, title: "FastAPI", ariaLabel: "FastAPI" },
  { node: <SiSupabase className="text-[#3ECF8E]" />, title: "Supabase", ariaLabel: "Supabase" },
  { node: <SiGooglegemini className="text-[#8E75C2]" />, title: "Gemini AI", ariaLabel: "Gemini AI" },
];

const Integrations = () => {
  return (
    <section className="py-20 bg-white border-t border-zinc-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 mb-12 text-center font-sans">
        <h1 className="font-bold text-black mb-4 text-2xl">
          Built With Your Favourite Tech Stack
        </h1>
      </div>

      <div className="relative h-24">
        <LogoLoop
          logos={techLogos}
          speed={40}
          direction="left"
          logoHeight={48}
          gap={80}
          pauseOnHover={true}
          scaleOnHover={true}
          fadeOut={true}
          fadeOutColor="#ffffff"
          ariaLabel="Technology partners"
        />
      </div>
    </section>
  );
};

export default Integrations;