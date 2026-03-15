import Noise from "./ui/footernoise";

const Footer = () => {
  return (
    <footer className="w-full bg-black py-16 px-4 md:px-8" data-theme="dark">
      <div className="max-w-7xl mx-auto h-[400px] relative bg-[#8a240a] rounded-[2.5rem] overflow-hidden border border-white/10 flex items-center justify-center">
        
        {/* Subtle Gradient Overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10 pointer-events-none" />

        {/* Text Overlay */}
        <h2 className="text-white/90 text-6xl md:text-9xl lg:text-[12rem] font-bold tracking-tighter relative z-0 select-none mix-blend-overlay">
          AuraDesign AI
        </h2>

        {/* Noise Background Overlay - Moved to top to blend with text */}
        <Noise 
          patternAlpha={15} 
          patternRefreshInterval={2} 
          className="opacity-60 pointer-events-none"
        />
      </div>
    </footer>
  );
};

export default Footer;
